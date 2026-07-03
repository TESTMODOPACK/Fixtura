import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';

import type {
  CarnetJugador,
  CarnetJugadorDatos,
  VerificacionCarnet,
} from '@fixtura/types';

import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Carnet digital del jugador (QR firmado) + verificación en cancha.
 *
 * El jugador muestra su carnet desde /jugador (QR con token HMAC de vida
 * corta); el árbitro/planillero lo escanea desde /personal y ve el semáforo
 * de habilitación: ficha activa, sin veto, sin sanción vigente, y en qué
 * planillas de torneos activos figura. El objetivo es matar el "jugador
 * fantasma" del paso de jugadores pre-partido.
 *
 * El token NO es un JWT de sesión: solo identifica (jugadorId, tenantId) con
 * expiración. La autorización la da el endpoint de verificación (roles de
 * personal/admin del MISMO tenant). El TTL corto evita que un pantallazo
 * viejo del QR sirva de credencial.
 */
const TTL_CARNET_MS = 48 * 60 * 60 * 1000;
const PREFIJO_CARNET = 'LP1';

interface CarnetPayload {
  j: string; // jugadorId
  t: string; // tenantId
  e: number; // expiración epoch ms
}

@Injectable()
export class CarnetService {
  constructor(
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(JugadorVetado)
    private readonly vetadoRepo: Repository<JugadorVetado>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // ─── Emisión (portal del jugador) ────────────────────────────────────
  async emitir(jugadorId: string, tenantId: string): Promise<CarnetJugador> {
    const jugador = await this.jugadorRepo.findOne({
      where: { id: jugadorId, tenantId },
      relations: { club: true, categoria: true },
    });
    if (!jugador) throw new NotFoundException('No encontramos tu ficha de jugador.');

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const exp = Date.now() + TTL_CARNET_MS;
    const payload = Buffer.from(
      JSON.stringify({ j: jugadorId, t: tenantId, e: exp } satisfies CarnetPayload),
    ).toString('base64url');
    const qr = `${PREFIJO_CARNET}.${payload}.${this.firmar(payload)}`;

    return {
      qr,
      expiraAt: new Date(exp).toISOString(),
      ligaNombre: tenant?.nombre ?? 'LigaPlus',
      jugador: this.datosDe(jugador),
    };
  }

  // ─── Verificación (árbitro / planillero / admin) ─────────────────────
  async verificar(
    tenantId: string,
    input: { qr?: string; rut?: string; torneoId?: string },
  ): Promise<VerificacionCarnet> {
    let jugadorId: string | null = null;
    let qrValido: boolean | null = null;

    if (input.qr?.trim()) {
      const parsed = this.parsearToken(input.qr.trim());
      if (!parsed) {
        return this.noEncontrado('El QR no es un carnet válido de LigaPlus.', false);
      }
      if (parsed.e < Date.now()) {
        return this.noEncontrado(
          'El carnet está vencido — pídele al jugador abrir su portal para renovarlo.',
          false,
        );
      }
      if (parsed.t !== tenantId) {
        return this.noEncontrado('El carnet pertenece a otra liga.', false);
      }
      qrValido = true;
      jugadorId = parsed.j;
    } else if (input.rut?.trim()) {
      qrValido = null;
    } else {
      throw new BadRequestException('Escanea un QR o ingresa un RUT para verificar.');
    }

    const jugador = jugadorId
      ? await this.jugadorRepo.findOne({
          where: { id: jugadorId, tenantId },
          relations: { club: true, categoria: true },
        })
      : await this.buscarPorRut(tenantId, input.rut as string);

    if (!jugador) {
      return this.noEncontrado('Jugador no encontrado en esta liga.', qrValido);
    }

    const motivos: string[] = [];
    if (jugador.estado === 'INACTIVO') {
      motivos.push('Ficha INACTIVA — fue dado de baja del plantel del club.');
    }

    const veto = await this.vetadoRepo.findOne({
      where: { tenantId, rut: jugador.rut },
    });
    if (veto) {
      motivos.push(`VETADO de la liga${veto.motivo ? `: ${veto.motivo}` : ''}.`);
    }

    // Sanciones vigentes — por jugador_id (modelo nuevo) o rut (legacy),
    // igual criterio que delegado/jugadores-global.
    const sanciones = await this.sancionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.torneo', 't')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('(s.jugador_id = :jid OR s.rut = :rut)', {
        jid: jugador.id,
        rut: jugador.rut,
      })
      .andWhere('s.cumplida = false')
      .andWhere('s.fechas_pendientes > 0')
      .getMany();
    const sancionesScope = input.torneoId
      ? sanciones.filter((s) => s.torneoId === input.torneoId)
      : sanciones;
    for (const s of sancionesScope) {
      motivos.push(
        `Sanción vigente: ${s.fechasPendientes} fecha(s) pendiente(s)${
          s.torneo?.nombre ? ` en ${s.torneo.nombre}` : ''
        }.`,
      );
    }

    // Planillas donde figura, con estado del torneo. Muestra contexto al
    // verificador aunque no haya torneoId (¿en qué serie juega este RUT?).
    const filas = await this.planillaRepo
      .createQueryBuilder('p')
      .innerJoin('inscripciones_torneo', 'i', 'i.id = p.inscripcion_id')
      .innerJoin('torneos', 't', 't.id = i.torneo_id')
      .select('t.id', 'torneoId')
      .addSelect('t.nombre', 'nombre')
      .addSelect('t.estado', 'estado')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.jugador_id = :jid', { jid: jugador.id })
      .getRawMany<{ torneoId: string; nombre: string; estado: string }>();

    const torneosEnPlanilla = [
      ...new Set(filas.filter((f) => f.estado === 'ACTIVO').map((f) => f.nombre)),
    ];
    if (input.torneoId && !filas.some((f) => f.torneoId === input.torneoId)) {
      motivos.push('NO está en la planilla de este torneo.');
    }

    return {
      encontrado: true,
      qrValido,
      habilitado: motivos.length === 0,
      motivos,
      jugador: this.datosDe(jugador),
      torneosEnPlanilla,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  private secreto(): string {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET requerido para firmar carnets.');
    return s;
  }

  /** HMAC-SHA256 con propósito dedicado (no confundible con otros tokens). */
  private firmar(payloadB64: string): string {
    return createHmac('sha256', this.secreto())
      .update(`carnet.${payloadB64}`)
      .digest('base64url');
  }

  private parsearToken(token: string): CarnetPayload | null {
    const partes = token.split('.');
    if (partes.length !== 3 || partes[0] !== PREFIJO_CARNET) return null;
    const [, payloadB64, sig] = partes as [string, string, string];
    const esperada = this.firmar(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as Partial<CarnetPayload>;
      if (!payload.j || !payload.t || typeof payload.e !== 'number') return null;
      return payload as CarnetPayload;
    } catch {
      return null;
    }
  }

  /** Búsqueda por RUT tolerante a puntos/guión/mayúsculas. */
  private async buscarPorRut(tenantId: string, rut: string): Promise<Jugador | null> {
    const normalizado = rut.toUpperCase().replace(/[.\-\s]/g, '');
    return this.jugadorRepo
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.club', 'club')
      .leftJoinAndSelect('j.categoria', 'categoria')
      .where('j.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `REPLACE(REPLACE(REPLACE(UPPER(j.rut), '.', ''), '-', ''), ' ', '') = :rut`,
        { rut: normalizado },
      )
      .getOne();
  }

  private datosDe(j: Jugador): CarnetJugadorDatos {
    return {
      id: j.id,
      nombres: j.nombres,
      apellidos: j.apellidos,
      rut: j.rut,
      clubNombre: j.club?.nombre ?? '',
      clubEscudoUrl: j.club?.escudoUrl ?? null,
      categoriaNombre: j.categoria?.nombre ?? '',
      numeroCamiseta: j.numeroCamiseta,
    };
  }

  private noEncontrado(motivo: string, qrValido: boolean | null): VerificacionCarnet {
    return {
      encontrado: false,
      qrValido,
      habilitado: false,
      motivos: [motivo],
      jugador: null,
      torneosEnPlanilla: [],
    };
  }
}
