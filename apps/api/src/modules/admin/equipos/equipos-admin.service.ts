import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import {
  validarPlantelCategoria,
  type PlantelValidacionResult,
} from '@fixtura/domain';
import type {
  CreateEquipoRequest,
  EquipoAdmin,
  MotivoSuspensionEquipo,
  SuspenderEquipoResult,
  ValidarPlantelResult,
} from '@fixtura/types';

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { Club } from '../../competition/entities/club.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { InscripcionesAdminService } from '../inscripciones/inscripciones-admin.service';
import { PartidosAdminService } from '../partidos/partidos-admin.service';

/**
 * ADR-0005 — "Equipo del torneo" = InscripcionTorneo. Este servicio expone
 * la misma API que antes (EquipoAdmin shape) pero respaldada por el modelo
 * nuevo: el `id` de un equipo es el inscripcionId, el nombre/escudo salen
 * del club, y la planilla son los jugadores del torneo. La creación y la
 * baja delegan en InscripcionesAdminService para no duplicar la lógica de
 * inscripción/desinscripción (validación de combo, cupo, equipo sombra).
 */
@Injectable()
export class EquiposAdminService {
  private readonly logger = new Logger(EquiposAdminService.name);

  constructor(
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
    @InjectRepository(Partido)
    private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Fecha)
    private readonly fechaRepo: Repository<Fecha>,
    @Inject(forwardRef(() => PartidosAdminService))
    private readonly partidosSvc: PartidosAdminService,
    private readonly inscripcionesSvc: InscripcionesAdminService,
  ) {}

  async listByTorneo(torneoId: string, tenantId: string): Promise<EquipoAdmin[]> {
    await this.ensureTorneo(torneoId, tenantId);
    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true, categoria: true },
      order: { createdAt: 'ASC' },
    });
    if (inscripciones.length === 0) return [];

    const ids = inscripciones.map((i) => i.id);
    const counts = await this.planillaRepo
      .createQueryBuilder('p')
      .select('p.inscripcion_id', 'inscripcionId')
      .addSelect('COUNT(*)', 'cnt')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.inscripcion_id IN (:...ids)', { ids })
      .groupBy('p.inscripcion_id')
      .getRawMany<{ inscripcionId: string; cnt: string }>();
    const byInsc = new Map<string, number>();
    for (const c of counts) byInsc.set(c.inscripcionId, Number(c.cnt));

    return inscripciones.map((i) => this.toDto(i, byInsc.get(i.id) ?? 0));
  }

  async findOne(id: string, tenantId: string): Promise<EquipoAdmin> {
    const insc = await this.inscRepo.findOne({
      where: { id, tenantId },
      relations: { club: true, categoria: true },
    });
    if (!insc) throw new NotFoundException(`Equipo ${id} no encontrado`);
    const cnt = await this.planillaRepo.count({
      where: { inscripcionId: id, tenantId },
    });
    return this.toDto(insc, cnt);
  }

  /**
   * Inscribir un club al torneo (lo que antes era "crear equipo"). El form
   * manda los datos del club (nombre/slug/colores); resolvemos el club por
   * slug y delegamos en InscripcionesAdminService.inscribir, que crea la
   * inscripción + equipo sombra + precarga de planilla.
   */
  async create(
    torneoId: string,
    tenantId: string,
    input: CreateEquipoRequest,
  ): Promise<EquipoAdmin> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    if (torneo.estado !== 'DRAFT') {
      throw new ConflictException(
        `No se pueden inscribir equipos en un torneo ${torneo.estado}. ` +
          'Para agregar equipos, el torneo debe estar en DRAFT.',
      );
    }
    // La categoría y la serie las define el torneo, no el form de
    // inscripción (que manda serieSlug = null). Las tomamos de
    // categoriasSeries (Sprint 26D/42); torneo.categoriaId es solo fallback
    // legacy. Sin esto, un torneo con serie (ej. "Honor") nunca matchea.
    const combos = Array.isArray(torneo.categoriasSeries)
      ? torneo.categoriasSeries
      : [];
    let categoriaId: string | null = torneo.categoriaId ?? null;
    let serieSlug: string | null = input.serieSlug ?? null;
    if (combos.length === 1) {
      categoriaId = combos[0]!.categoriaId;
      serieSlug = combos[0]!.serieSlug ?? null;
    } else if (combos.length > 1 && categoriaId) {
      const deLaCategoria = combos.filter((c) => c.categoriaId === categoriaId);
      if (deLaCategoria.length === 1) {
        serieSlug = deLaCategoria[0]!.serieSlug ?? null;
      }
    }

    if (!categoriaId) {
      throw new BadRequestException(
        'El torneo no tiene una categoría asignada. Edita el torneo y asigna ' +
          'una categoría antes de inscribir clubes desde aquí.',
      );
    }

    const club = await this.clubRepo.findOne({
      where: { slug: input.slug, tenantId },
    });
    if (!club) {
      throw new BadRequestException(
        `No existe un club con slug "${input.slug}". Crea el club en /admin/clubes primero.`,
      );
    }

    const dto = await this.inscripcionesSvc.inscribir(torneoId, tenantId, {
      clubId: club.id,
      categoriaId,
      serieSlug,
    });
    return this.findOne(dto.id, tenantId);
  }

  /**
   * Eliminar un equipo del torneo = desinscribir el club. Solo en DRAFT
   * (lo enforza InscripcionesAdminService.desinscribir).
   */
  async delete(id: string, tenantId: string): Promise<void> {
    // Resolvemos el torneo ANTES de desinscribir, para poder limpiar las
    // fechas huérfanas si el torneo queda con <2 equipos.
    const insc = await this.inscRepo.findOne({
      where: { id, tenantId },
      select: ['id', 'torneoId'],
    });
    const torneoId = insc?.torneoId ?? null;

    await this.inscripcionesSvc.desinscribir(id, tenantId);

    // Si el torneo quedó con menos de 2 inscripciones, el fixture deja de
    // tener sentido — limpiamos las fechas (cascade borra sus partidos).
    if (torneoId) {
      const restantes = await this.inscRepo.count({ where: { torneoId, tenantId } });
      if (restantes < 2) {
        await this.fechaRepo.delete({ torneoId, tenantId });
      }
    }
  }

  /**
   * Valida la planilla del equipo (inscripción) contra su categoría.
   */
  async validarPlantel(
    inscripcionId: string,
    tenantId: string,
  ): Promise<ValidarPlantelResult> {
    const insc = await this.inscRepo.findOne({
      where: { id: inscripcionId, tenantId },
    });
    if (!insc) {
      throw new NotFoundException(`Equipo ${inscripcionId} no encontrado`);
    }

    const planilla = await this.planillaRepo.find({
      where: { inscripcionId, tenantId },
      relations: { jugador: true },
    });
    const jugadores = planilla
      .map((p) => p.jugador)
      .filter((j): j is Jugador => !!j);

    const categoria = await this.categoriaRepo.findOne({
      where: { id: insc.categoriaId, tenantId },
    });
    if (!categoria) {
      // Sin categoría no hay regla de edad que aplicar.
      return {
        validos: jugadores.length,
        enExcepcion: 0,
        bloqueados: 0,
        sinFecha: 0,
        totalJugadores: jugadores.length,
        cupoExcepcionesDisponibles: 0,
        cupoExcepcionesUsado: 0,
        apto: true,
        motivosRechazo: [],
        sinCategoria: true,
      };
    }

    const resultado: PlantelValidacionResult = validarPlantelCategoria(
      jugadores.map((j) => ({
        id: j.id,
        nombre: j.nombres ?? '',
        apellido: j.apellidos ?? '',
        fechaNac: j.fechaNac,
      })),
      {
        edadMinimaGeneral: categoria.edadMinimaGeneral,
        cupoExcepcionesPorEquipo: categoria.cupoExcepcionesPorEquipo,
        edadMinimaExcepcion: categoria.edadMinimaExcepcion,
      },
    );

    return {
      validos: resultado.validos,
      enExcepcion: resultado.enExcepcion,
      bloqueados: resultado.bloqueados,
      sinFecha: resultado.sinFecha,
      totalJugadores: resultado.totalJugadores,
      cupoExcepcionesDisponibles: resultado.cupoExcepcionesDisponibles,
      cupoExcepcionesUsado: resultado.cupoExcepcionesUsado,
      apto: resultado.apto,
      motivosRechazo: resultado.motivosRechazo,
      sinCategoria: false,
    };
  }

  /**
   * Suspender un equipo del torneo (Sprint 44, ADR-0005). Solo con torneo
   * ACTIVO. Dispara walkover 3-0 en partidos pendientes contra rivales no
   * suspendidos; si el rival también está suspendido, marca el partido
   * SUSPENDIDO_FUERZA_MAYOR. El estado/motivo viven ahora en la inscripción.
   */
  // DB-4 (auditoría) — batch de walkovers todo-o-nada. El request ya corre
  // dentro de una tx (TenantContextInterceptor), pero @Transactional deja la
  // intención explícita y protege a un eventual llamador no-HTTP. La clave del
  // fix está abajo: un walkover que falla re-lanza (no se traga) para que la
  // tx revierta y no quede el equipo suspendido con partidos pendientes sueltos.
  @Transactional()
  async suspender(
    inscripcionId: string,
    tenantId: string,
    actorUserId: string | null,
    input: {
      motivo: MotivoSuspensionEquipo;
      observaciones?: string | null;
      aplicarMultaWalkover?: boolean;
    },
  ): Promise<SuspenderEquipoResult> {
    const insc = await this.inscRepo.findOne({
      where: { id: inscripcionId, tenantId },
    });
    if (!insc) throw new NotFoundException(`Equipo ${inscripcionId} no encontrado`);
    if (insc.estado === 'SUSPENDIDO') {
      throw new ConflictException(
        'El equipo ya está suspendido. Reactívalo primero si quieres cambiar el motivo.',
      );
    }

    const torneo = await this.torneoRepo.findOne({
      where: { id: insc.torneoId, tenantId },
    });
    if (!torneo) throw new NotFoundException('Torneo del equipo no encontrado');
    if (torneo.estado === 'DRAFT') {
      throw new BadRequestException(
        'El torneo está en DRAFT — no hay fixture activo. Para sacar el ' +
          'equipo, elimínalo directamente desde la lista.',
      );
    }
    if (torneo.estado === 'CERRADO') {
      throw new BadRequestException(
        'El torneo ya está cerrado — no se puede suspender un equipo en esta etapa.',
      );
    }

    const pendientes = await this.partidoRepo.find({
      where: [
        {
          tenantId,
          inscripcionLocalId: inscripcionId,
          estado: In(['PROGRAMADO', 'EN_CURSO']),
        },
        {
          tenantId,
          inscripcionVisitaId: inscripcionId,
          estado: In(['PROGRAMADO', 'EN_CURSO']),
        },
      ],
    });

    const obsRaw = input.observaciones?.trim() ?? '';
    const obsTxt = obsRaw.length > 0 ? obsRaw : null;
    const walkoverObs = obsTxt
      ? `[Equipo suspendido del torneo: ${input.motivo}] ${obsTxt}`
      : `[Equipo suspendido del torneo: ${input.motivo}]`;

    let partidosWalkover = 0;
    let partidosCancelados = 0;
    const aplicarMulta = input.aplicarMultaWalkover === true;
    const ahora = new Date();

    for (const partido of pendientes) {
      const rivalId =
        partido.inscripcionLocalId === inscripcionId
          ? partido.inscripcionVisitaId
          : partido.inscripcionLocalId;
      const rival = rivalId
        ? await this.inscRepo.findOne({
            where: { id: rivalId, tenantId },
            select: ['id', 'estado'],
          })
        : null;

      if (rival && rival.estado === 'SUSPENDIDO') {
        partido.estado = 'SUSPENDIDO_FUERZA_MAYOR';
        partido.motivoSuspension = 'DECISION_LIGA';
        partido.suspendidoAt = ahora;
        partido.suspendidoByUserId = actorUserId;
        partido.observaciones = walkoverObs.replace(
          'Equipo suspendido',
          'Ambos equipos suspendidos',
        );
        await this.partidoRepo.save(partido);
        partidosCancelados++;
      } else {
        try {
          await this.partidosSvc.declararWalkover(
            partido.id,
            tenantId,
            actorUserId,
            {
              equipoPerdedorId: inscripcionId,
              observaciones: walkoverObs,
              aplicarMulta,
            },
          );
          partidosWalkover++;
        } catch (err) {
          this.logger.warn(
            `[suspender] no se pudo declarar walkover partido=${partido.id}: ${
              (err as Error).message
            } — se aborta la suspensión (rollback).`,
          );
          // DB-4 — re-lanzar: aborta la tx del request y revierte los
          // walkovers ya aplicados. Antes se tragaba el error y la suspensión
          // committeaba con walkovers parciales.
          throw err;
        }
      }
    }

    insc.estado = 'SUSPENDIDO';
    insc.motivoSuspension = input.motivo;
    insc.observacionesSuspension = obsTxt;
    insc.suspendidoEn = new Date();
    insc.suspendidoPor = actorUserId;
    await this.inscRepo.save(insc);

    return { equipoId: inscripcionId, partidosWalkover, partidosCancelados };
  }

  /**
   * Reactivar un equipo suspendido. Vuelve a INSCRITO. Los walkovers ya
   * disparados quedan como historia (no se revierten automáticamente).
   */
  async reactivar(inscripcionId: string, tenantId: string): Promise<EquipoAdmin> {
    const insc = await this.inscRepo.findOne({
      where: { id: inscripcionId, tenantId },
    });
    if (!insc) throw new NotFoundException(`Equipo ${inscripcionId} no encontrado`);
    if (insc.estado !== 'SUSPENDIDO') {
      throw new ConflictException(
        'El equipo no está suspendido — no hay nada que reactivar.',
      );
    }
    insc.estado = 'INSCRITO';
    insc.motivoSuspension = null;
    insc.observacionesSuspension = null;
    insc.suspendidoEn = null;
    insc.suspendidoPor = null;
    await this.inscRepo.save(insc);
    return this.findOne(inscripcionId, tenantId);
  }

  private async ensureTorneo(torneoId: string, tenantId: string): Promise<Torneo> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    return torneo;
  }

  private toDto(insc: InscripcionTorneo, jugadoresCount: number): EquipoAdmin {
    const series = Array.isArray(insc.categoria?.series) ? insc.categoria!.series : [];
    const serie = insc.serieSlug ? series.find((s) => s.slug === insc.serieSlug) : null;
    return {
      id: insc.id,
      torneoId: insc.torneoId,
      nombre: insc.club?.nombre ?? '',
      slug: insc.club?.slug ?? '',
      escudoUrl: insc.club?.escudoUrl ?? null,
      colorPrimario: insc.club?.colorPrimario ?? null,
      colorSecundario: insc.club?.colorSecundario ?? null,
      delegadoUserId: null,
      estado: insc.estado,
      jugadoresCount,
      serieSlug: insc.serieSlug,
      serieNombre: serie?.nombre ?? null,
      motivoSuspension: insc.motivoSuspension,
      observacionesSuspension: insc.observacionesSuspension,
      suspendidoEn: insc.suspendidoEn ? insc.suspendidoEn.toISOString() : null,
      createdAt: insc.createdAt.toISOString(),
    };
  }
}
