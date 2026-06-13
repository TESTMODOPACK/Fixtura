import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateJugadorRequest, JugadorAdmin } from '@fixtura/types';
import { calcularEdad, calcularEdadCalendario } from '@fixtura/domain';

import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';

/**
 * ADR-0005 — Jugadores de un "equipo del torneo" = planilla de la
 * inscripción. El `equipoId` que recibe este servicio es el inscripcionId.
 *
 * Crear un jugador desde aquí crea (o reutiliza) un Jugador del plantel del
 * club en la categoría de la inscripción y lo agrega a la planilla del
 * torneo. La regla "un jugador = un solo club" la enforza UNIQUE(tenant,rut)
 * en `jugadores`.
 */
@Injectable()
export class JugadoresAdminService {
  constructor(
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
  ) {}

  async listByEquipo(inscripcionId: string, tenantId: string): Promise<JugadorAdmin[]> {
    await this.ensureInscripcion(inscripcionId, tenantId);
    const planilla = await this.planillaRepo.find({
      where: { inscripcionId, tenantId },
      relations: { jugador: true },
    });
    return planilla
      .filter((p) => p.jugador)
      .map((p) => toDto(p.jugador!, inscripcionId))
      .sort(
        (a, b) =>
          Number(b.capitan) - Number(a.capitan) ||
          (a.numeroCamiseta ?? 999) - (b.numeroCamiseta ?? 999) ||
          a.apellido.localeCompare(b.apellido, 'es'),
      );
  }

  async create(
    inscripcionId: string,
    tenantId: string,
    input: CreateJugadorRequest,
  ): Promise<JugadorAdmin> {
    const insc = await this.ensureInscripcion(inscripcionId, tenantId);

    if (!input.rut || input.rut.trim().length === 0) {
      throw new BadRequestException(
        'El RUT es obligatorio para fichar un jugador en el modelo de clubes.',
      );
    }

    const jugador = await this.findOrCreateJugador(insc, tenantId, input);
    await this.addAPlanilla(inscripcionId, tenantId, jugador.id);
    return toDto(jugador, inscripcionId);
  }

  async bulkCreate(
    inscripcionId: string,
    tenantId: string,
    inputs: CreateJugadorRequest[],
  ): Promise<JugadorAdmin[]> {
    const insc = await this.ensureInscripcion(inscripcionId, tenantId);

    // Dedupe interno por RUT.
    const ruts = inputs.map((i) => i.rut).filter((r): r is string => !!r);
    const setRuts = new Set<string>();
    const dups: string[] = [];
    for (const r of ruts) {
      if (setRuts.has(r)) dups.push(r);
      else setRuts.add(r);
    }
    if (dups.length > 0) {
      throw new BadRequestException(
        `El archivo contiene RUTs duplicados: ${dups.join(', ')}. Revisa y reintenta.`,
      );
    }

    const sinRut = inputs.filter((i) => !i.rut || i.rut.trim().length === 0);
    if (sinRut.length > 0) {
      const nombres = sinRut.map((c) => `${c.nombre} ${c.apellido}`).join(', ');
      throw new BadRequestException(
        `El RUT es obligatorio para todos los jugadores. Faltan en: ${nombres}.`,
      );
    }

    const out: JugadorAdmin[] = [];
    for (const input of inputs) {
      const jugador = await this.findOrCreateJugador(insc, tenantId, input);
      await this.addAPlanilla(inscripcionId, tenantId, jugador.id);
      out.push(toDto(jugador, inscripcionId));
    }
    return out;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async findOrCreateJugador(
    insc: InscripcionTorneo,
    tenantId: string,
    input: CreateJugadorRequest,
  ): Promise<Jugador> {
    const rut = input.rut!.trim();
    const existente = await this.jugadorRepo.findOne({ where: { tenantId, rut } });
    if (existente) {
      if (
        existente.clubId !== insc.clubId ||
        existente.categoriaId !== insc.categoriaId
      ) {
        throw new ConflictException(
          `El RUT ${rut} ya está fichado en otro club o categoría de la liga. ` +
            'Un jugador solo puede pertenecer a un club (Plan §4.2).',
        );
      }
      return existente;
    }
    try {
      return await this.jugadorRepo.save(
        this.jugadorRepo.create({
          tenantId,
          clubId: insc.clubId,
          categoriaId: insc.categoriaId,
          rut,
          nombres: input.nombre,
          apellidos: input.apellido,
          apodo: input.apodo ?? null,
          numeroCamiseta: input.numeroCamiseta ?? null,
          posicion: input.posicion ?? null,
          pieHabil: input.pieHabil ?? null,
          fechaNac: input.fechaNac ?? null,
          capitan: input.capitan ?? false,
          estado: 'ACTIVO',
        }),
      );
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('uq_jugador_rut') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(
          `El RUT ${rut} ya está fichado en la liga.`,
        );
      }
      throw err;
    }
  }

  private async addAPlanilla(
    inscripcionId: string,
    tenantId: string,
    jugadorId: string,
  ): Promise<void> {
    await this.planillaRepo
      .createQueryBuilder()
      .insert()
      .into(PlanillaTorneo)
      .values({ tenantId, inscripcionId, jugadorId })
      .orIgnore()
      .execute();
  }

  private async ensureInscripcion(
    id: string,
    tenantId: string,
  ): Promise<InscripcionTorneo> {
    const insc = await this.inscRepo.findOne({ where: { id, tenantId } });
    if (!insc) throw new NotFoundException(`Equipo ${id} no encontrado`);
    return insc;
  }
}

function toDto(j: Jugador, inscripcionId: string): JugadorAdmin {
  return {
    id: j.id,
    equipoId: inscripcionId,
    nombre: j.nombres,
    apellido: j.apellidos,
    apodo: j.apodo,
    rut: j.rut,
    numeroCamiseta: j.numeroCamiseta,
    posicion: j.posicion,
    pieHabil: j.pieHabil,
    fechaNac: j.fechaNac,
    edad: calcularEdad(j.fechaNac),
    edadCalendario: calcularEdadCalendario(j.fechaNac),
    capitan: j.capitan,
    activo: j.estado === 'ACTIVO',
  };
}
