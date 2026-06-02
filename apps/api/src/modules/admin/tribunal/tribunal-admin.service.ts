import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateSancionTribunalRequest, SancionAdmin } from '@fixtura/types';

import { Fecha } from '../../competition/entities/fecha.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { VetadosAdminService } from '../vetados/vetados-admin.service';

@Injectable()
export class TribunalAdminService {
  constructor(
    @InjectRepository(SancionActiva) private readonly repo: Repository<SancionActiva>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    // Sprint 26H (ADR-0004) — para vetar de por vida en sanciones
    // permanentes del Tribunal. addFromTribunal es idempotente.
    private readonly vetadosService: VetadosAdminService,
    // Sprint 26I — al vetar, marcar también como INACTIVO el registro
    // del jugador en el plantel nuevo del club (si existe).
    @InjectRepository(Jugador)
    private readonly jugadorNuevoRepo: Repository<Jugador>,
  ) {}

  /**
   * Lista sanciones de un torneo, primero las activas (pendientes > 0)
   * ordenadas por desde_fecha, después las cumplidas.
   */
  async list(torneoId: string, tenantId: string): Promise<SancionAdmin[]> {
    await this.ensureTorneo(torneoId, tenantId);

    const sanciones = await this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.torneo', 'torneo')
      .leftJoinAndSelect('s.jugadorInscrito', 'jugador')
      .leftJoinAndSelect('jugador.equipo', 'equipo')
      .where('s.torneo_id = :torneoId', { torneoId })
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .orderBy('s.cumplida', 'ASC')
      .addOrderBy('s.desde_fecha_numero', 'ASC')
      .getMany();

    return sanciones.map(this.toDto);
  }

  async create(
    torneoId: string,
    tenantId: string,
    input: CreateSancionTribunalRequest,
  ): Promise<SancionAdmin> {
    await this.ensureTorneo(torneoId, tenantId);

    const jugador = await this.jugadorRepo.findOne({
      where: { id: input.jugadorInscritoId, tenantId },
      relations: { equipo: true },
    });
    if (!jugador) {
      throw new NotFoundException(`Jugador ${input.jugadorInscritoId} no encontrado`);
    }
    if (jugador.equipo?.torneoId !== torneoId) {
      throw new BadRequestException('El jugador no pertenece al torneo indicado');
    }

    // Default desdeFechaNumero: la próxima fecha programada en el torneo
    const desdeFechaNumero =
      input.desdeFechaNumero ??
      (await this.proximaFechaNumero(torneoId)) ??
      1;

    const created = await this.repo.save(
      this.repo.create({
        tenantId,
        torneoId,
        rut: jugador.rut,
        jugadorInscritoId: input.jugadorInscritoId,
        motivo: 'TRIBUNAL',
        fechasPendientes: input.fechasSuspension,
        desdeFechaNumero,
        origenIncidenciaPartidoId: null,
        descripcion: input.descripcion,
        cumplida: false,
      }),
    );

    // Sprint 26H — Si la sanción es definitiva (vetoPermanente=true),
    // agregamos el RUT del jugador a la lista negra del tenant.
    // Idempotente: si ya estaba vetado, no hace nada.
    if (input.vetoPermanente && jugador.rut) {
      await this.vetadosService.addFromTribunal(
        tenantId,
        jugador.rut,
        `Sanción permanente del Tribunal: ${input.descripcion}`,
      );
      // Sprint 26I — Además de vetar el RUT, marcamos como INACTIVO
      // el registro del jugador en el plantel del club del modelo
      // nuevo (si lo encuentra por RUT). Esto evita que admins
      // distraídos sigan citándolo en futuros torneos del mismo club.
      // En el modelo viejo (jugadores_inscritos) NO lo desactivamos
      // porque no tiene campo de estado — el chequeo a futuro es via
      // jugadores_vetados.rut.
      await this.jugadorNuevoRepo.update(
        { tenantId, rut: jugador.rut },
        { estado: 'INACTIVO' },
      );
    }

    return this.findOne(created.id, tenantId);
  }

  async findOne(id: string, tenantId: string): Promise<SancionAdmin> {
    const s = await this.repo.findOne({
      where: { id, tenantId },
      relations: { torneo: true, jugadorInscrito: { equipo: true } },
    });
    if (!s) throw new NotFoundException(`Sanción ${id} no encontrada`);
    return this.toDto(s);
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    const s = await this.repo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Sanción ${id} no encontrada`);
    // Mejor marcar como cumplida que borrar (audit trail)
    s.fechasPendientes = 0;
    s.cumplida = true;
    s.descripcion =
      (s.descripcion ? `${s.descripcion}\n\n` : '') + '[Revocada por tribunal]';
    await this.repo.save(s);
  }

  /**
   * Devuelve los IDs de jugadores con sanción activa para una fecha
   * específica. Sirve al frontend para mostrar warning visual.
   */
  async jugadoresBloqueadosEnFecha(
    torneoId: string,
    tenantId: string,
    fechaNumero: number,
  ): Promise<Array<{ jugadorInscritoId: string; rut: string | null; motivo: string }>> {
    const rows = (await this.repo
      .createQueryBuilder('s')
      .select('s.jugador_inscrito_id', 'jugadorInscritoId')
      .addSelect('s.rut', 'rut')
      .addSelect('s.motivo', 'motivo')
      .where('s.torneo_id = :torneoId', { torneoId })
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.cumplida = false')
      .andWhere('s.fechas_pendientes > 0')
      .andWhere('s.desde_fecha_numero <= :fechaNumero', { fechaNumero })
      .getRawMany()) as Array<{
      jugadorInscritoId: string | null;
      rut: string | null;
      motivo: string;
    }>;

    return rows
      .filter((r): r is { jugadorInscritoId: string; rut: string | null; motivo: string } => !!r.jugadorInscritoId)
      .map((r) => ({ jugadorInscritoId: r.jugadorInscritoId, rut: r.rut, motivo: r.motivo }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  private async ensureTorneo(torneoId: string, tenantId: string): Promise<void> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
  }

  private async proximaFechaNumero(torneoId: string): Promise<number | null> {
    const f = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`f.estado IN ('PROGRAMADA', 'EN_CURSO')`)
      .orderBy('f.numero', 'ASC')
      .getOne();
    return f?.numero ?? null;
  }

  private toDto(s: SancionActiva): SancionAdmin {
    return {
      id: s.id,
      torneoId: s.torneoId,
      torneoNombre: s.torneo?.nombre ?? '',
      jugadorInscritoId: s.jugadorInscritoId,
      jugadorNombre: s.jugadorInscrito?.nombre ?? null,
      jugadorApellido: s.jugadorInscrito?.apellido ?? null,
      equipoNombre: s.jugadorInscrito?.equipo?.nombre ?? null,
      rut: s.rut,
      motivo: s.motivo,
      fechasPendientes: s.fechasPendientes,
      desdeFechaNumero: s.desdeFechaNumero,
      descripcion: s.descripcion,
      cumplida: s.cumplida,
      origenIncidenciaPartidoId: s.origenIncidenciaPartidoId,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
