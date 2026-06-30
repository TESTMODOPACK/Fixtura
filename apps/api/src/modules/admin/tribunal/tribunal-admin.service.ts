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
  MotivoSuspensionEquipo,
  SancionAdmin,
  SancionarEquipoTribunalRequest,
  SancionEquipoItem,
  SancionEquipoResult,
} from '@fixtura/types';

import { AuditLogService } from '../../audit';
import { Club } from '../../competition/entities/club.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { EquiposAdminService } from '../equipos/equipos-admin.service';
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
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    private readonly vetadosService: VetadosAdminService,
    private readonly equiposService: EquiposAdminService,
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
          'Inicia el torneo para imponer sanciones.',
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
        fechasTotales: input.fechasSuspension,
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

  /**
   * Sprint TRI — sanción a un EQUIPO. Suspende del torneo actual (walkover 3-0
   * batch, reusa EquiposAdminService) y/o veta al club de por vida en la liga
   * (no podrá inscribirse en torneos). Al menos una acción (lo valida el DTO).
   */
  async sancionarEquipo(
    torneoId: string,
    tenantId: string,
    actorUserId: string,
    input: SancionarEquipoTribunalRequest,
  ): Promise<SancionEquipoResult> {
    await this.ensureTorneo(torneoId, tenantId);

    const insc = await this.inscRepo.findOne({
      where: { id: input.inscripcionId, torneoId, tenantId },
    });
    if (!insc) {
      throw new NotFoundException('Equipo (inscripción) no encontrado en este torneo');
    }
    const club = await this.clubRepo.findOne({
      where: { id: insc.clubId, tenantId },
    });
    if (!club) throw new NotFoundException('Club del equipo no encontrado');

    let suspendidoDelTorneo = false;
    if (input.suspenderDelTorneo) {
      await this.equiposService.suspender(input.inscripcionId, tenantId, actorUserId, {
        motivo: 'DEPORTIVA' as MotivoSuspensionEquipo,
        observaciones:
          `[Tribunal] ${input.motivo}` +
          (input.observaciones ? ` — ${input.observaciones}` : ''),
      });
      suspendidoDelTorneo = true;
    }

    let clubVetado = false;
    if (input.vetarClubPermanente) {
      await this.clubRepo.update(
        { id: club.id, tenantId },
        {
          vetadoAt: new Date(),
          vetadoMotivo: input.motivo,
          vetadoPorUserId: actorUserId,
        },
      );
      clubVetado = true;
    }

    try {
      await this.audit.record({
        action: 'tribunal.sancion_equipo',
        tenantId,
        userId: actorUserId,
        entityType: 'Club',
        entityId: club.id,
        metadata: {
          torneoId,
          inscripcionId: input.inscripcionId,
          suspendidoDelTorneo,
          clubVetado,
          motivo: input.motivo,
        },
      });
    } catch {
      // best-effort
    }

    return { clubNombre: club.nombre, suspendidoDelTorneo, clubVetado };
  }

  /**
   * Sprint TRI — sanciones a EQUIPO vigentes del torneo para el Tribunal:
   * inscripciones SUSPENDIDAS + clubes vetados (entre los inscritos al torneo).
   * No se almacenan en `sanciones_activas` (esas son por jugador/RUT), por eso
   * el tribunal no las veía: se derivan del estado de inscripción/club.
   */
  async sancionesEquipoDelTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<SancionEquipoItem[]> {
    await this.ensureTorneo(torneoId, tenantId);
    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true },
    });
    const items: SancionEquipoItem[] = [];
    for (const i of inscripciones) {
      if (i.estado === 'SUSPENDIDO') {
        items.push({
          tipo: 'SUSPENSION_TORNEO',
          clubId: i.clubId,
          clubNombre: i.club?.nombre ?? 'Club',
          inscripcionId: i.id,
          motivo: i.motivoSuspension,
          observaciones: i.observacionesSuspension,
          fecha: i.suspendidoEn ? i.suspendidoEn.toISOString() : null,
        });
      }
    }
    // Veto de club: a nivel club (cross-torneo). Dedup por club y solo para los
    // clubes que participan de este torneo.
    const vetados = new Set<string>();
    for (const i of inscripciones) {
      if (i.club?.vetadoAt && !vetados.has(i.clubId)) {
        vetados.add(i.clubId);
        items.push({
          tipo: 'VETO_CLUB',
          clubId: i.clubId,
          clubNombre: i.club.nombre,
          inscripcionId: null,
          motivo: i.club.vetadoMotivo,
          observaciones: null,
          fecha: i.club.vetadoAt.toISOString(),
        });
      }
    }
    // Más recientes primero.
    return items.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
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
