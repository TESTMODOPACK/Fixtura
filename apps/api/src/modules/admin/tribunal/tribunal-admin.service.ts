import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  AjustarSancionRequest,
  CreateSancionTribunalRequest,
  SancionAdmin,
} from '@fixtura/types';

import { AuditLogService } from '../../audit';
import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { VetadosAdminService } from '../vetados/vetados-admin.service';

/**
 * ADR-0005 — Tribunal sobre el modelo nuevo. Las sanciones se anclan al
 * Jugador (tabla `jugadores`); el `jugadorInscritoId` del request/DTO
 * transporta ahora el jugadorId (rename mecánico en Fase 2). El RUT sigue
 * siendo la clave que impide evadir la sanción cambiando de club.
 */
@Injectable()
export class TribunalAdminService {
  constructor(
    @InjectRepository(SancionActiva) private readonly repo: Repository<SancionActiva>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    private readonly vetadosService: VetadosAdminService,
    private readonly audit: AuditLogService,
  ) {}

  async list(torneoId: string, tenantId: string): Promise<SancionAdmin[]> {
    await this.ensureTorneo(torneoId, tenantId);

    const sanciones = await this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.torneo', 'torneo')
      .leftJoinAndSelect('s.jugador', 'jugador')
      .leftJoinAndSelect('jugador.club', 'club')
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
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    // DRAFT: el torneo no arrancó, no hay partidos ni disciplina que aplicar.
    // ACTIVO: operación normal. CERRADO: se permite (resolución de cierre).
    if (torneo.estado === 'DRAFT') {
      throw new BadRequestException(
        'El torneo está en DRAFT — el tribunal opera cuando el torneo arranca. ' +
          'Iniciá el torneo para imponer sanciones.',
      );
    }

    const jugador = await this.jugadorRepo.findOne({
      where: { id: input.jugadorInscritoId, tenantId },
    });
    if (!jugador) {
      throw new NotFoundException(`Jugador ${input.jugadorInscritoId} no encontrado`);
    }
    // El jugador pertenece al torneo si su club+categoría están inscritos.
    const inscrito = await this.inscRepo.findOne({
      where: { torneoId, tenantId, clubId: jugador.clubId, categoriaId: jugador.categoriaId },
    });
    if (!inscrito) {
      throw new BadRequestException('El jugador no pertenece al torneo indicado');
    }

    const desdeFechaNumero =
      input.desdeFechaNumero ??
      (await this.proximaFechaNumero(torneoId)) ??
      1;

    const created = await this.repo.save(
      this.repo.create({
        tenantId,
        torneoId,
        rut: jugador.rut,
        jugadorId: jugador.id,
        motivo: 'TRIBUNAL',
        fechasPendientes: input.fechasSuspension,
        desdeFechaNumero,
        origenIncidenciaPartidoId: null,
        descripcion: input.descripcion,
        cumplida: false,
      }),
    );

    if (input.vetoPermanente && jugador.rut) {
      await this.vetadosService.addFromTribunal(
        tenantId,
        jugador.rut,
        `Sanción permanente del Tribunal: ${input.descripcion}`,
      );
      // Marcar INACTIVO el registro del jugador en el plantel del club.
      await this.jugadorRepo.update(
        { tenantId, rut: jugador.rut },
        { estado: 'INACTIVO' },
      );
    }

    return this.findOne(created.id, tenantId);
  }

  async findOne(id: string, tenantId: string): Promise<SancionAdmin> {
    const s = await this.repo.findOne({
      where: { id, tenantId },
      relations: { torneo: true, jugador: { club: true } },
    });
    if (!s) throw new NotFoundException(`Sanción ${id} no encontrada`);
    return this.toDto(s);
  }

  /**
   * Ajusta (agrava o corrige) una sanción existente. Pensado para escalar una
   * sanción automática (p.ej. roja directa = 1 fecha) cuando hay incidencias
   * extra (agresión, insultos): sube `fechasPendientes` y documenta el motivo
   * en la descripción. `fechasPendientes` = 0 marca la sanción como cumplida;
   * > 0 la mantiene/reactiva activa.
   */
  async ajustar(
    id: string,
    tenantId: string,
    actorUserId: string | null,
    input: AjustarSancionRequest,
  ): Promise<SancionAdmin> {
    const s = await this.repo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Sanción ${id} no encontrada`);

    const previas = s.fechasPendientes;
    s.fechasPendientes = input.fechasPendientes;
    if (input.desdeFechaNumero != null) {
      s.desdeFechaNumero = input.desdeFechaNumero;
    }
    s.cumplida = input.fechasPendientes === 0;

    const stamp = `[Ajuste tribunal] ${previas} → ${input.fechasPendientes} fecha(s): ${input.motivoAjuste}`;
    s.descripcion = (s.descripcion ? `${s.descripcion}\n\n` : '') + stamp;
    await this.repo.save(s);

    try {
      await this.audit.record({
        action: 'tribunal.sancion_ajustada',
        tenantId,
        userId: actorUserId,
        entityType: 'SancionActiva',
        entityId: s.id,
        metadata: {
          torneoId: s.torneoId,
          rut: s.rut,
          motivoOriginal: s.motivo,
          fechasPendientesPrevias: previas,
          fechasPendientesNuevas: input.fechasPendientes,
          desdeFechaNumero: s.desdeFechaNumero,
          motivoAjuste: input.motivoAjuste,
        },
      });
    } catch {
      // best-effort
    }

    return this.findOne(id, tenantId);
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
   * Devuelve los jugadores con sanción activa para una fecha específica.
   * La key `jugadorInscritoId` transporta el jugadorId (modelo nuevo) para
   * que el frontend la matchee contra la planilla.
   */
  async jugadoresBloqueadosEnFecha(
    torneoId: string,
    tenantId: string,
    fechaNumero: number,
  ): Promise<Array<{ jugadorInscritoId: string; rut: string | null; motivo: string }>> {
    const rows = (await this.repo
      .createQueryBuilder('s')
      .select('s.jugador_id', 'jugadorId')
      .addSelect('s.rut', 'rut')
      .addSelect('s.motivo', 'motivo')
      .where('s.torneo_id = :torneoId', { torneoId })
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.cumplida = false')
      .andWhere('s.fechas_pendientes > 0')
      .andWhere('s.desde_fecha_numero <= :fechaNumero', { fechaNumero })
      .getRawMany()) as Array<{
      jugadorId: string | null;
      rut: string | null;
      motivo: string;
    }>;

    return rows
      .filter((r): r is { jugadorId: string; rut: string | null; motivo: string } => !!r.jugadorId)
      .map((r) => ({ jugadorInscritoId: r.jugadorId, rut: r.rut, motivo: r.motivo }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  private async ensureTorneo(torneoId: string, tenantId: string): Promise<Torneo> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    return t;
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
      jugadorInscritoId: s.jugadorId,
      jugadorNombre: s.jugador?.nombres ?? null,
      jugadorApellido: s.jugador?.apellidos ?? null,
      equipoNombre: s.jugador?.club?.nombre ?? null,
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
