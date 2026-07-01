import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import {
  calcularSancionesPostPartido,
  type IncidenciaJugador,
  type SancionPropuesta,
} from '@fixtura/domain';
import type {
  ActaRoster,
  CerrarActaRequest,
  CertificarPresentesRequest,
  CreateIncidenciaRequest,
  FixtureAdminFull,
  IncidenciaAdmin,
  MotivoInhabilitacion,
  PartidoAdmin,
  PartidoDetalle,
  RosterEquipo,
  RosterJugador,
  UpdatePartidoRequest,
} from '@fixtura/types';

import { Cancha } from '../../competition/entities/cancha.entity';
import {
  Designacion,
  type EstadoDesignacion,
} from '../../competition/entities/designacion.entity';
import { DiaNoJugable } from '../../competition/entities/dia-no-jugable.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { TarifaAplicadorService } from '../tarifas/tarifa-aplicador.service';
import { AuditLogService } from '../../audit';
import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { PartidoJugador } from '../../competition/entities/partido-jugador.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { assertPartidoEstadoOperable } from '../../competition/partido-estado.util';
import { saveIncidenciaIdempotente } from '../../competition/incidencia-idempotente.util';
import { PushService } from '../push/push.service';
import { MatchCenterGateway } from '../../match-center/match-center.gateway';

@Injectable()
export class PartidosAdminService {
  constructor(
    @InjectRepository(Partido) private readonly repo: Repository<Partido>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    // ADR-0005 — roster del partido = planilla de la inscripción → jugadores.
    @InjectRepository(Jugador)
    private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(PartidoJugador)
    private readonly partidoJugadorRepo: Repository<PartidoJugador>,
    @InjectRepository(JugadorVetado)
    private readonly vetadoRepo: Repository<JugadorVetado>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(Cancha) private readonly canchaRepo: Repository<Cancha>,
    @InjectRepository(DiaNoJugable)
    private readonly diaNoJugableRepo: Repository<DiaNoJugable>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
    private readonly push: PushService,
    private readonly matchCenter: MatchCenterGateway,
    // Sprint 34D — hooks de multas automaticas al cerrar acta y walkover.
    private readonly tarifaAplicador: TarifaAplicadorService,
    // LOG-5 (auditoría) — dejar rastro cuando la generación best-effort de
    // multas falla, para poder regenerarlas después.
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Ventana mínima entre dos partidos en la misma cancha (en minutos).
   * 120 = 2h cubre 90min de partido + 30min de margen para preparación
   * de la siguiente cita. Si dos partidos del mismo tenant están a menos
   * de esto en la misma cancha, hay choque.
   */
  private static readonly VENTANA_OCUPACION_MIN = 120;

  // ─── Fixture completo de un torneo (admin) ─────────────────────────
  async getFixtureFull(torneoId: string, tenantId: string): Promise<FixtureAdminFull> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);

    const fechas = await this.fechaRepo.find({
      where: { torneoId },
      order: { numero: 'ASC' },
    });

    const partidos = await this.repo.find({
      where: fechas.map((f) => ({ fechaId: f.id })),
      relations: {
        inscripcionLocal: { club: true },
        inscripcionVisita: { club: true },
      },
      order: { fechaHora: 'ASC' },
    });

    const partidosPorFecha = new Map<string, Partido[]>();
    for (const p of partidos) {
      const arr = partidosPorFecha.get(p.fechaId) ?? [];
      arr.push(p);
      partidosPorFecha.set(p.fechaId, arr);
    }

    return {
      torneoId: torneo.id,
      torneoNombre: torneo.nombre,
      fechas: fechas.map((f) => ({
        id: f.id,
        numero: f.numero,
        etiqueta: f.etiqueta,
        fechaInicio: f.fechaInicio ?? null,
        estado: f.estado,
        motivoSuspension: f.motivoSuspension ?? null,
        suspendidoAt: f.suspendidoAt?.toISOString() ?? null,
        observacionesSuspension: f.observacionesSuspension ?? null,
        tipoReprogramacion: f.tipoReprogramacion,
        reemplazaFechaId: f.reemplazaFechaId,
        partidos: (partidosPorFecha.get(f.id) ?? []).map((p) =>
          this.toDto(p, f.numero, f.etiqueta, f.tipoReprogramacion === 'REPROGRAMADA'),
        ),
      })),
    };
  }

  // ─── Detalle de un partido ──────────────────────────────────────────
  async getDetalle(partidoId: string, tenantId: string): Promise<PartidoDetalle> {
    const partido = await this.findPartido(partidoId, tenantId);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const incidencias = await this.listIncidencias(partidoId);

    return {
      ...this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA'),
      incidencias,
    };
  }

  // ─── Update partido (cancha, hora, estado, observaciones, fecha) ──
  async update(
    partidoId: string,
    tenantId: string,
    input: UpdatePartidoRequest,
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);

    // Cambiar de fecha (reprogramación). Validamos:
    //   1) la fecha destino existe en este tenant
    //   2) pertenece al MISMO torneo (no se mueve un partido entre torneos)
    //   3) el acta del partido NO está cerrada (sería re-escribir historia)
    if (input.fechaId !== undefined && input.fechaId !== partido.fechaId) {
      if (partido.actaCerradaAt) {
        throw new ConflictException(
          'No se puede mover un partido con acta cerrada. Reabrir primero.',
        );
      }
      const fechaActual = await this.fechaRepo.findOneOrFail({
        where: { id: partido.fechaId },
      });
      const fechaDestino = await this.fechaRepo.findOne({
        where: { id: input.fechaId, tenantId },
      });
      if (!fechaDestino) {
        throw new NotFoundException(`Fecha destino ${input.fechaId} no encontrada`);
      }
      if (fechaDestino.torneoId !== fechaActual.torneoId) {
        throw new BadRequestException(
          'La fecha destino pertenece a un torneo distinto',
        );
      }
      partido.fechaId = input.fechaId;

      // Si el partido venía SUSPENDIDO_FUERZA_MAYOR (porque su fecha
      // original fue suspendida) y se mueve a una fecha PROGRAMADA o
      // REPROGRAMADA, lo reactivamos automáticamente. Sin esto el
      // partido queda invisible en la nueva fecha como "suspendido".
      if (
        partido.estado === 'SUSPENDIDO_FUERZA_MAYOR' &&
        fechaDestino.estado !== 'SUSPENDIDA'
      ) {
        partido.estado = 'PROGRAMADO';
        partido.motivoSuspension = null;
        // suspendidoAt y suspendidoByUserId los conservamos como
        // historial (el partido recuerda que estuvo suspendido).
      }
    }

    // canchaId tiene prioridad sobre canchaNombre. Si llega canchaId
    // poblamos el nombre desde el catálogo (cache). Si llega null, lo
    // limpiamos. canchaNombre solo aplica si NO se mandó canchaId (modo
    // legacy / cancha no catalogada).
    if (input.canchaId !== undefined) {
      if (input.canchaId) {
        const cancha = await this.canchaRepo.findOne({
          where: { id: input.canchaId, tenantId },
        });
        if (!cancha) {
          throw new BadRequestException(
            'La cancha no existe o no pertenece a esta liga',
          );
        }
        partido.canchaId = cancha.id;
        partido.canchaNombre = cancha.nombre;
      } else {
        partido.canchaId = null;
        // Mantenemos canchaNombre si el caller solo nulleó el id.
      }
    }
    if (input.canchaNombre !== undefined && input.canchaId === undefined) {
      partido.canchaNombre = input.canchaNombre;
    }
    if (input.fechaHora !== undefined) {
      partido.fechaHora = input.fechaHora ? new Date(input.fechaHora) : null;
    }

    // Sprint 16 — RF-13: si el partido queda agendado en un día no
    // jugable, dejamos un warning en el log. No bloqueamos: el admin
    // puede tener razones para programar excepcionalmente ese día
    // (ej. amistoso, recuperación pactada). El frontend valida y
    // muestra confirmación antes del submit.
    if (partido.fechaHora) {
      // TZ fix — el día calendario del partido se deriva de componentes
      // LOCALES, no de toISOString() (que da el día UTC). Sin esto, un
      // partido jugado de noche en Chile (ej. dom 21:00 CLT = lun 01:00
      // UTC) matcheaba contra el día no jugable equivocado.
      const fh = partido.fechaHora;
      const fechaIso = `${fh.getFullYear()}-${String(fh.getMonth() + 1).padStart(2, '0')}-${String(fh.getDate()).padStart(2, '0')}`;
      const fechaTorneo = await this.fechaRepo.findOneOrFail({
        where: { id: partido.fechaId },
      });
      const bloqueada = await this.diaNoJugableRepo
        .createQueryBuilder('d')
        .where('d.tenant_id = :tenantId', { tenantId })
        .andWhere('d.fecha = :fecha', { fecha: fechaIso })
        .andWhere(`(d.scope = 'GLOBAL' OR d.torneo_id = :torneoId)`, {
          torneoId: fechaTorneo.torneoId,
        })
        .getOne();
      if (bloqueada) {
        console.warn(
          `[partidos] partido ${partidoId} agendado en día no jugable ${fechaIso} (motivo: ${bloqueada.motivo}). Tenant: ${tenantId}.`,
        );
      }
    }
    // LOG-1 (auditoría) — el cambio de estado por PATCH solo se permite
    // entre PROGRAMADO y EN_CURSO (transiciones inocuas: sin acta, sin
    // marcador, no cuentan en la tabla). FINALIZADO / WALKOVER / NO_JUGADO
    // / SUSPENDIDO_FUERZA_MAYOR / REPROGRAMADO tienen endpoints dedicados
    // con sus validaciones, multas y reversibilidad. Sin este guard, un
    // PATCH podía inyectar un FINALIZADO 0-0 fantasma en la tabla o
    // resucitar un partido con acta cerrada dejándolo en estado incoherente.
    if (input.estado !== undefined && input.estado !== partido.estado) {
      if (partido.actaCerradaAt) {
        throw new ConflictException(
          'El acta de este partido está cerrada. Reábrela antes de cambiar el estado.',
        );
      }
      const PATCH_OK = ['PROGRAMADO', 'EN_CURSO'];
      if (!PATCH_OK.includes(partido.estado) || !PATCH_OK.includes(input.estado)) {
        throw new ConflictException(
          `No se puede cambiar el estado de ${partido.estado} a ${input.estado} por esta vía. ` +
            'Usá las acciones dedicadas: cerrar/reabrir acta, walkover, suspender, marcar no jugado o reactivar.',
        );
      }
      partido.estado = input.estado;
    }
    if (input.observaciones !== undefined) partido.observaciones = input.observaciones;

    // Detección de choque cancha+horario. Solo aplica si hay AMBOS
    // poblados después de aplicar los cambios. Si el partido ya estaba
    // suspendido / walkover, no validamos (no van a jugarse).
    if (
      partido.canchaId &&
      partido.fechaHora &&
      partido.estado !== 'SUSPENDIDO_FUERZA_MAYOR' &&
      partido.estado !== 'WALKOVER'
    ) {
      await this.validarChoqueCancha(partido);
    }

    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * Lanza ConflictException si existe OTRO partido del mismo tenant en
   * la misma cancha cuyo horario esté dentro de ±VENTANA_OCUPACION_MIN
   * del partido que se está guardando.
   *
   * No verificamos solapamiento de bloques porque no tenemos `duracion`
   * persistida en `partidos` — asumimos slots de 90+30=120min uniformes.
   * Cuando agreguemos duración variable (canchas con baby-fútbol vs F11),
   * aquí comparamos rangos `[a, a+90)` vs `[b, b+90)`.
   */
  private async validarChoqueCancha(partido: Partido): Promise<void> {
    if (!partido.canchaId || !partido.fechaHora) return;

    const ventanaMs = PartidosAdminService.VENTANA_OCUPACION_MIN * 60 * 1000;
    const desde = new Date(partido.fechaHora.getTime() - ventanaMs);
    const hasta = new Date(partido.fechaHora.getTime() + ventanaMs);

    const choque = await this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.cancha', 'cancha')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .where('p.tenant_id = :tenantId', { tenantId: partido.tenantId })
      .andWhere('p.id <> :id', { id: partido.id })
      .andWhere('p.cancha_id = :canchaId', { canchaId: partido.canchaId })
      .andWhere('p.fecha_hora IS NOT NULL')
      .andWhere('p.fecha_hora >= :desde', { desde })
      .andWhere('p.fecha_hora <= :hasta', { hasta })
      .andWhere(`p.estado NOT IN ('SUSPENDIDO_FUERZA_MAYOR','WALKOVER')`)
      .getOne();

    if (choque) {
      const nombreCancha = choque.cancha?.nombre ?? partido.canchaNombre ?? 'cancha';
      const local = choque.inscripcionLocal?.club?.nombre ?? '?';
      const visita = choque.inscripcionVisita?.club?.nombre ?? '?';
      const hora = choque.fechaHora
        ? new Date(choque.fechaHora).toLocaleString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '?';
      throw new ConflictException(
        `Choque de cancha: "${nombreCancha}" ya tiene "${local} vs ${visita}" el ${hora}. ` +
          `Las citas deben separarse al menos ${PartidosAdminService.VENTANA_OCUPACION_MIN} min.`,
      );
    }
  }

  // ─── Incidencias ────────────────────────────────────────────────────
  /**
   * SEC-3 — Un ARBITRO/PLANILLERO solo puede operar el acta de un partido
   * para el que está designado. `actorPersonalIds === null` ⇒ rol de liga
   * (admin/coordinador/super): sin restricción. RLS no ayuda acá: la
   * designación ajena pertenece al mismo tenant.
   */
  async assertActorPuedeOperarActa(
    partidoId: string,
    tenantId: string,
    actorPersonalIds: string[] | null,
  ): Promise<void> {
    if (actorPersonalIds === null) return;
    const designado =
      actorPersonalIds.length > 0 &&
      (await this.designacionRepo.count({
        where: {
          partidoId,
          tenantId,
          personalId: In(actorPersonalIds),
          estado: In(['PROPUESTA', 'CONFIRMADA', 'ASISTIO'] as EstadoDesignacion[]),
        },
      })) > 0;
    if (!designado) {
      throw new ForbiddenException(
        'Solo puedes operar el acta de un partido para el que estás designado.',
      );
    }
  }

  /** Igual que el anterior, resolviendo el partido desde la incidencia. */
  async assertActorPuedeOperarActaPorIncidencia(
    incidenciaId: string,
    tenantId: string,
    actorPersonalIds: string[] | null,
  ): Promise<void> {
    if (actorPersonalIds === null) return;
    const inc = await this.incidenciaRepo.findOne({
      where: { id: incidenciaId, tenantId },
      select: { id: true, partidoId: true },
    });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');
    await this.assertActorPuedeOperarActa(inc.partidoId, tenantId, actorPersonalIds);
  }

  async addIncidencia(
    partidoId: string,
    tenantId: string,
    input: CreateIncidenciaRequest,
  ): Promise<IncidenciaAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);

    // MOV-1 (auditoría) — idempotencia: si ya existe una incidencia con esta
    // clientKey en este partido, es un replay (cola offline / doble-tap /
    // reconexión). Devolvemos la existente sin re-validar ni duplicar. Va
    // ANTES de los checks de estado: un replay legítimo puede llegar cuando el
    // acta ya se cerró, y no queremos fallarlo con un 409 espurio.
    if (input.clientKey) {
      const existente = await this.incidenciaRepo.findOne({
        where: { partidoId, clientKey: input.clientKey },
      });
      if (existente) {
        const incidencias = await this.listIncidencias(partidoId);
        return incidencias.find((i) => i.id === existente.id)!;
      }
    }

    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'No se pueden agregar incidencias a un acta cerrada. Reabrir primero (Sprint 2C+).',
      );
    }
    assertPartidoEstadoOperable(partido.estado);

    // ADR-0005 — input.equipoId es el inscripcionId; jugadorInscritoId es
    // el jugadorId del modelo nuevo. Validamos contra la inscripción del
    // partido y la planilla del torneo.
    if (
      input.equipoId !== partido.inscripcionLocalId &&
      input.equipoId !== partido.inscripcionVisitaId
    ) {
      throw new BadRequestException('El equipo no pertenece a este partido');
    }

    // Regla de dominio: un gol siempre se atribuye al jugador exacto que lo
    // hizo. No se puede asignar un gol a un equipo "sin jugador". El único
    // camino con goles sin goleador es el walkover, que setea el marcador
    // 3-0 directo (sin incidencias) — ver declararWalkover().
    if (
      (input.tipo === 'GOL' || input.tipo === 'AUTOGOL') &&
      !input.jugadorInscritoId
    ) {
      throw new BadRequestException(
        'Un gol debe tener asignado el jugador que lo marcó. Solo el walkover registra goles sin goleador.',
      );
    }

    // Validar que el jugador está en la planilla de esa inscripción.
    if (input.jugadorInscritoId) {
      const enPlanilla = await this.planillaRepo.findOne({
        where: {
          inscripcionId: input.equipoId,
          jugadorId: input.jugadorInscritoId,
          tenantId,
        },
        relations: { jugador: true },
      });
      if (!enPlanilla) {
        throw new BadRequestException(
          'El jugador no está en la planilla del equipo indicado',
        );
      }
      // F46.4 — no se cargan incidencias de jugadores no habilitados
      // (sancionados esta fecha / vetados / inactivos).
      if (enPlanilla.jugador) {
        const fechaInc = await this.fechaRepo.findOneOrFail({
          where: { id: partido.fechaId },
        });
        const inh = await this.cargarInhabilitados(
          fechaInc.torneoId,
          fechaInc.numero,
          tenantId,
        );
        const motivo = this.motivoInhabilitacion(enPlanilla.jugador, inh);
        if (motivo) {
          const etiqueta =
            motivo === 'VETADO'
              ? 'está vetado'
              : motivo === 'SANCIONADO'
                ? 'tiene una sanción activa esta fecha'
                : 'está inactivo';
          throw new BadRequestException(
            `No se pueden cargar incidencias: el jugador ${etiqueta}.`,
          );
        }
      }
    }

    const created = await saveIncidenciaIdempotente(this.incidenciaRepo, {
      tenantId,
      partidoId,
      inscripcionId: input.equipoId,
      jugadorId: input.jugadorInscritoId,
      tipo: input.tipo,
      minuto: input.minuto ?? null,
      detalle: {},
      clientKey: input.clientKey ?? null,
    });

    // F46.6 — marcador derivado: recalcular goles desde las incidencias.
    if (input.tipo === 'GOL' || input.tipo === 'AUTOGOL') {
      await this.recomputarMarcador(partido);
      // El marcador del Match Center en vivo se sirve por WebSocket. Sin
      // este broadcast, registrar un gol por el panel de incidencias NO
      // refrescaba el marcador del cronista (solo el botón "+GOL" emitía).
      void this.matchCenter.broadcast(partidoId);
    }

    const incidencias = await this.listIncidencias(partidoId);
    return incidencias.find((i) => i.id === created.id)!;
  }

  /**
   * F46.6 — Recalcula golesLocal/Visita del partido contando las
   * incidencias GOL/AUTOGOL por inscripción. Las incidencias son la fuente
   * única de verdad del marcador (el botón +GOL del match-center también
   * crea incidencias). Misma convención que el sanity-check de cerrarActa.
   */
  private async recomputarMarcador(partido: Partido): Promise<void> {
    const incs = await this.incidenciaRepo.find({
      where: { partidoId: partido.id, tenantId: partido.tenantId },
    });
    const contar = (inscId: string | null): number =>
      inscId
        ? incs.filter(
            (i) =>
              i.inscripcionId === inscId &&
              (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
          ).length
        : 0;
    partido.golesLocal = contar(partido.inscripcionLocalId);
    partido.golesVisita = contar(partido.inscripcionVisitaId);
    await this.repo.save(partido);
  }

  async removeIncidencia(incidenciaId: string, tenantId: string): Promise<void> {
    const inc = await this.incidenciaRepo.findOne({
      where: { id: incidenciaId, tenantId },
      relations: { partido: true },
    });
    if (!inc) throw new NotFoundException(`Incidencia ${incidenciaId} no encontrada`);
    if (inc.partido?.actaCerradaAt) {
      throw new ConflictException('No se pueden borrar incidencias de un acta cerrada');
    }
    const eraGol = inc.tipo === 'GOL' || inc.tipo === 'AUTOGOL';
    await this.incidenciaRepo.delete(incidenciaId);
    // F46.6 — marcador derivado: recalcular goles tras borrar un gol.
    if (eraGol && inc.partido) {
      await this.recomputarMarcador(inc.partido);
      void this.matchCenter.broadcast(inc.partido.id);
    }
  }

  /**
   * Atribuye (o reasigna) el jugador de una incidencia ya cargada. Pensado
   * para los goles provisionales que crea el botón "+GOL" del match-center
   * (quedan "sin jugador") y deben quedar atribuidos antes de cerrar el acta.
   * Valida que el jugador pertenezca a la planilla de la inscripción de la
   * incidencia. No cambia el marcador (la cantidad de goles no varía).
   */
  async atribuirJugadorIncidencia(
    partidoId: string,
    incidenciaId: string,
    tenantId: string,
    jugadorInscritoId: string,
  ): Promise<IncidenciaAdmin> {
    const inc = await this.incidenciaRepo.findOne({
      where: { id: incidenciaId, partidoId, tenantId },
      relations: { partido: true },
    });
    if (!inc) throw new NotFoundException(`Incidencia ${incidenciaId} no encontrada`);
    if (inc.partido?.actaCerradaAt) {
      throw new ConflictException(
        'No se pueden modificar incidencias de un acta cerrada. Reabrir primero.',
      );
    }
    if (!inc.inscripcionId) {
      throw new BadRequestException('La incidencia no tiene equipo asociado.');
    }
    const enPlanilla = await this.planillaRepo.findOne({
      where: {
        inscripcionId: inc.inscripcionId,
        jugadorId: jugadorInscritoId,
        tenantId,
      },
    });
    if (!enPlanilla) {
      throw new BadRequestException(
        'El jugador no está en la planilla del equipo de esta incidencia.',
      );
    }
    inc.jugadorId = jugadorInscritoId;
    await this.incidenciaRepo.save(inc);
    const incidencias = await this.listIncidencias(partidoId);
    return incidencias.find((i) => i.id === incidenciaId)!;
  }

  // ─── Cierre de acta ─────────────────────────────────────────────────
  @Transactional()
  async cerrarActa(
    partidoId: string,
    tenantId: string,
    actorUserId: string,
    input: CerrarActaRequest,
  ): Promise<PartidoAdmin> {
    // Sprint 34G — lock pesimista sobre el partido para evitar que dos
    // requests simultáneos de cierre de acta generen multas auto
    // duplicadas. Con SELECT FOR UPDATE, si llega un 2do request mientras
    // el 1ro está dentro de su transacción, espera al COMMIT del 1ro y
    // luego ve actaCerradaAt seteado → el check de abajo lo rechaza con
    // 409. Sin el lock, ambos pasan el check antes del UPDATE y los dos
    // generan multas (duplicación pura).
    const partido = await this.repo.findOne({
      where: { id: partidoId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!partido) {
      throw new NotFoundException(`Partido ${partidoId} no encontrado`);
    }
    if (partido.actaCerradaAt) {
      throw new ConflictException('El acta ya está cerrada');
    }
    // No se cierra el acta de un partido que no se jugó/operó: forzaría
    // FINALIZADO + devengos a personal + multas sobre un no jugado/suspendido.
    assertPartidoEstadoOperable(partido.estado);

    // F46.4 — la certificación de jugadores presentes es requisito para
    // cerrar el acta (deja registro de quién jugó y bloquea inhabilitados).
    if (!partido.presentesCertificadosAt) {
      throw new BadRequestException(
        'Certifica los jugadores presentes de ambos equipos antes de cerrar el acta.',
      );
    }

    // Sanity check: los goles del acta deberían coincidir con la cantidad
    // de incidencias tipo GOL/AUTOGOL en la DB. Si no, devolvemos warning
    // pero igual cerramos (caller puede haber elegido cargar sólo el
    // marcador sin tracking por jugador).
    const incidencias = await this.incidenciaRepo.find({ where: { partidoId } });
    const golesLocalIncidencias = incidencias.filter(
      (i) =>
        i.inscripcionId === partido.inscripcionLocalId &&
        (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
    ).length;
    const golesVisitaIncidencias = incidencias.filter(
      (i) =>
        i.inscripcionId === partido.inscripcionVisitaId &&
        (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
    ).length;

    if (
      (golesLocalIncidencias > 0 || golesVisitaIncidencias > 0) &&
      (golesLocalIncidencias !== input.golesLocal ||
        golesVisitaIncidencias !== input.golesVisita)
    ) {
      throw new BadRequestException(
        `El marcador (${input.golesLocal}-${input.golesVisita}) no coincide con las incidencias cargadas (${golesLocalIncidencias}-${golesVisitaIncidencias}). Ajusta el detalle o el marcador.`,
      );
    }

    // Regla de dominio: el acta oficial no puede tener goles sin goleador.
    // Los goles provisionales del botón "+GOL" (match-center) quedan "sin
    // jugador" y deben atribuirse antes de cerrar. El walkover es el único
    // caso con goles sin jugador, pero no pasa por aquí (setea 3-0 directo).
    const golesSinJugador = incidencias.filter(
      (i) => (i.tipo === 'GOL' || i.tipo === 'AUTOGOL') && !i.jugadorId,
    );
    if (golesSinJugador.length > 0) {
      const enLocal = golesSinJugador.filter(
        (i) => i.inscripcionId === partido.inscripcionLocalId,
      ).length;
      const enVisita = golesSinJugador.filter(
        (i) => i.inscripcionId === partido.inscripcionVisitaId,
      ).length;
      const partes: string[] = [];
      if (enLocal > 0) partes.push(`${enLocal} del equipo local`);
      if (enVisita > 0) partes.push(`${enVisita} del visitante`);
      throw new BadRequestException(
        `Hay ${golesSinJugador.length} gol(es) sin goleador asignado (${partes.join(' y ')}). Asigna el jugador que marcó cada gol antes de cerrar el acta.`,
      );
    }

    partido.golesLocal = input.golesLocal;
    partido.golesVisita = input.golesVisita;
    partido.estado = 'FINALIZADO';
    partido.actaCerradaAt = new Date();
    partido.actaCerradaBy = actorUserId;
    if (input.observaciones !== undefined) partido.observaciones = input.observaciones;

    await this.repo.save(partido);

    // F51.2 — Devengo de pagos a personal: al cerrar el acta, el personal
    // designado en este partido que estaba PROPUESTA/CONFIRMADA queda
    // ASISTIO (el partido se jugó). Esto genera las cuentas por pagar
    // (ADR-0006). RECHAZADA/AUSENTE/ya-ASISTIO se respetan; el admin puede
    // corregir a AUSENTE a quien no se haya presentado. Best-effort: no
    // bloquea el cierre del acta.
    try {
      await this.designacionRepo
        .createQueryBuilder()
        .update(Designacion)
        .set({ estado: 'ASISTIO' })
        .where('partido_id = :partidoId', { partidoId: partido.id })
        .andWhere('tenant_id = :tenantId', { tenantId })
        .andWhere(`estado IN ('PROPUESTA', 'CONFIRMADA')`)
        .execute();
    } catch (err) {
      console.warn(
        `[partido] auto-ASISTIO designaciones falló partido=${partido.id}: ${(err as Error).message}`,
      );
    }

    // ─── CASCADA POST-ACTA ───────────────────────────────────────────
    // 1. Detectar sanciones automáticas por las incidencias de este
    //    partido (rojas, dobles amarillas, acumulación de amarillas).
    //    Persistir en sanciones_activas.
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    await this.aplicarSancionesAutomaticas(partido, fecha.numero, tenantId);

    // Sprint 34D — multas automaticas por tarjetas. Recorre las
    // incidencias del partido y por cada amarilla/roja genera un cobro
    // con el monto fijo del tarifario. Si no hay tarifa configurada,
    // queda audit log y no genera nada (silencioso).
    try {
      partido.fecha = fecha;
      const incidencias = await this.incidenciaRepo.find({
        where: { partidoId: partido.id, tenantId },
      });
      await this.tarifaAplicador.aplicarMultasDePartido(
        partido,
        incidencias,
        tenantId,
      );
    } catch (err) {
      // LOG-5 — No bloquear el cierre del acta si la generación de multas
      // falla, PERO dejar rastro auditable (antes solo iba a console.warn y
      // el fallo era invisible → multas silenciosamente ausentes). Con este
      // audit, el admin puede detectar el fallo y regenerar las multas con
      // POST /admin/partidos/:id/regenerar-multas (idempotente).
      const mensaje = (err as Error).message;
      console.warn(`[partido] multas auto fallaron partido=${partido.id}: ${mensaje}`);
      await this.audit.record({
        action: 'partido.multas_auto_fallidas',
        tenantId,
        userId: actorUserId,
        entityType: 'Partido',
        entityId: partido.id,
        metadata: { error: mensaje, contexto: 'cierre_acta' },
      });
    }

    // 2. Si todos los partidos de la fecha están FINALIZADO/WALKOVER,
    //    marcar la fecha como FINALIZADA + decrementar sanciones
    //    pendientes (regla "el jugador cumple su fecha de suspensión
    //    cuando la fecha completa termina").
    const partidosDeFecha = await this.repo.find({ where: { fechaId: partido.fechaId } });
    const todosFinalizados = partidosDeFecha.every(
      (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
    );
    if (todosFinalizados) {
      await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'FINALIZADA' });
      // Pasamos torneoId para que el decremento NO afecte sanciones de
      // OTROS torneos del mismo tenant. Si un tenant tiene dos torneos
      // activos en paralelo, no queremos que cerrar fecha 3 del torneo A
      // decremente sanciones del torneo B.
      await this.decrementarSancionesPendientes(partido.tenantId, fecha.torneoId, fecha.numero);
    }

    // Sprint 14: push notifications best-effort fire-and-forget.
    void this.push
      .notifyPartidoCerrado(partido.id)
      .catch((err) =>
        console.warn(
          `[push] partido ${partido.id} cerrado, error en notify: ${(err as Error).message}`,
        ),
      );

    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * LOG-5 (auditoría) — Regenera las multas automáticas de un partido con
   * acta cerrada. Idempotente: aplicarMultasDePartido borra los cobros auto
   * pendientes y respeta los ya saldados/cancelados (C1), así que invocarlo
   * N veces converge al mismo estado. Sirve para recuperar multas que la
   * generación best-effort del cierre de acta no alcanzó a crear (queda un
   * audit `partido.multas_auto_fallidas` cuando eso pasa).
   */
  async regenerarMultas(
    partidoId: string,
    tenantId: string,
    actorUserId: string | null,
  ): Promise<{ creados: number }> {
    const partido = await this.repo.findOne({
      where: { id: partidoId, tenantId },
      relations: { fecha: true },
    });
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado`);
    if (partido.estado !== 'FINALIZADO') {
      throw new BadRequestException(
        'Solo se regeneran multas de un partido con acta cerrada (FINALIZADO).',
      );
    }
    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId: partido.id, tenantId },
    });
    const res = await this.tarifaAplicador.aplicarMultasDePartido(
      partido,
      incidencias,
      tenantId,
    );
    await this.audit.record({
      action: 'partido.multas_regeneradas',
      tenantId,
      userId: actorUserId,
      entityType: 'Partido',
      entityId: partido.id,
      metadata: { creados: res.creados },
    });
    return res;
  }

  /**
   * Recorre las incidencias del partido recién cerrado, agrupa por
   * jugador (vía RUT o jugadorInscritoId si no hay RUT), trae el
   * historial previo del jugador en el torneo, calcula sanciones nuevas
   * con `calcularSancionesPostPartido` (motor en packages/domain) y las
   * persiste en `sanciones_activas`.
   *
   * REGLA CRÍTICA (anexo correcciones): la sanción se busca/aplica por
   * RUT × torneo, no por equipo. Un jugador que se cambia de club dentro
   * del mismo torneo no elude la sanción.
   */
  private async aplicarSancionesAutomaticas(
    partido: Partido,
    fechaNumero: number,
    tenantId: string,
  ): Promise<void> {
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const torneoId = fecha.torneoId;

    // Traer incidencias del partido con info del jugador (modelo nuevo)
    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId: partido.id },
      relations: { jugador: true },
    });

    // Agrupar incidencias por jugador (sólo las relevantes para sanción)
    const porJugador = new Map<
      string,
      {
        jugadorId: string;
        rut: string | null;
        incidencias: IncidenciaJugador[];
      }
    >();

    // Defensa anti-duplicado: si en la BD hay incidencias duplicadas de la
    // misma tarjeta (jugador+tipo+minuto) no queremos generar sanciones (ni
    // contar amarillas) por duplicado. Colapsamos solo duplicados exactos.
    const vistasIncidencia = new Set<string>();
    for (const inc of incidencias) {
      if (!inc.jugadorId) continue;
      if (
        inc.tipo !== 'AMARILLA' &&
        inc.tipo !== 'ROJA' &&
        inc.tipo !== 'AMARILLA_ROJA'
      )
        continue;

      const dedupKey = `${inc.jugadorId}|${inc.tipo}|${inc.minuto ?? ''}`;
      if (vistasIncidencia.has(dedupKey)) continue;
      vistasIncidencia.add(dedupKey);

      const key = inc.jugadorId;
      const bucket = porJugador.get(key) ?? {
        jugadorId: inc.jugadorId,
        rut: inc.jugador?.rut ?? null,
        incidencias: [],
      };
      bucket.incidencias.push({
        tipo: inc.tipo,
        partidoId: partido.id,
        fechaNumero,
      });
      porJugador.set(key, bucket);
    }

    // Umbral de amarillas configurable por torneo (default 5).
    const torneoCfg = await this.torneoRepo.findOne({ where: { id: torneoId } });
    const configDisc = {
      amarillasPorSuspension: torneoCfg?.amarillasParaSuspension ?? 5,
      fechasPorRoja: 1,
      fechasPorDobleAmarilla: 1,
    };

    // Para cada jugador, calcular sanciones contra historial
    for (const bucket of porJugador.values()) {
      const previas = await this.getIncidenciasPreviasEnTorneo(
        bucket.jugadorId,
        bucket.rut,
        torneoId,
        partido.id,
      );

      const propuestas = calcularSancionesPostPartido(
        previas,
        bucket.incidencias,
        configDisc,
      );
      await this.persistirPropuestas(
        propuestas,
        tenantId,
        torneoId,
        bucket.jugadorId,
        bucket.rut,
      );
    }
  }

  /**
   * Trae todas las incidencias previas del jugador en el torneo,
   * matcheando por jugador_inscrito_id O por RUT (para soportar el caso
   * de un jugador que se cambia de club).
   */
  private async getIncidenciasPreviasEnTorneo(
    jugadorId: string,
    rut: string | null,
    torneoId: string,
    partidoActualId: string,
  ): Promise<IncidenciaJugador[]> {
    const qb = this.incidenciaRepo
      .createQueryBuilder('i')
      .innerJoin('i.partido', 'p')
      .innerJoin('p.fecha', 'f')
      .innerJoin('i.jugador', 'j')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('i.partido_id <> :partidoActualId', { partidoActualId })
      .andWhere(`i.tipo IN ('AMARILLA','ROJA','AMARILLA_ROJA')`);

    // Match por jugadorId O por RUT (un jugador que cambia de club dentro
    // del torneo no elude la sanción — la clave real es el RUT).
    if (rut) {
      qb.andWhere('(j.id = :jId OR j.rut = :rut)', { jId: jugadorId, rut });
    } else {
      qb.andWhere('j.id = :jId', { jId: jugadorId });
    }

    const rows = await qb
      .select([
        'i.tipo AS tipo',
        'i.partido_id AS "partidoId"',
        'f.numero AS "fechaNumero"',
        'i.minuto AS minuto',
      ])
      .orderBy('f.numero', 'ASC')
      .getRawMany<{
        tipo: 'AMARILLA' | 'ROJA' | 'AMARILLA_ROJA';
        partidoId: string;
        fechaNumero: number;
        minuto: number | null;
      }>();

    // Defensa anti-duplicado: incidencias duplicadas en el historial
    // (mismo partido+tipo+minuto) inflarían el conteo de amarillas
    // acumuladas. Colapsamos solo duplicados exactos.
    const vistas = new Set<string>();
    const limpias: IncidenciaJugador[] = [];
    for (const r of rows) {
      const k = `${r.partidoId}|${r.tipo}|${r.minuto ?? ''}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      limpias.push({
        tipo: r.tipo,
        partidoId: r.partidoId,
        fechaNumero: r.fechaNumero,
      });
    }
    return limpias;
  }

  private async persistirPropuestas(
    propuestas: SancionPropuesta[],
    tenantId: string,
    torneoId: string,
    jugadorId: string,
    rut: string | null,
  ): Promise<void> {
    for (const p of propuestas) {
      // Idempotencia: si ya existe una sanción del mismo motivo originada
      // por la misma incidencia, no duplicar.
      const dup = await this.sancionRepo.findOne({
        where: {
          tenantId,
          torneoId,
          jugadorId,
          motivo: p.motivo,
          origenIncidenciaPartidoId: p.origenIncidenciaPartidoId,
        },
      });
      if (dup) continue;

      await this.sancionRepo.save(
        this.sancionRepo.create({
          tenantId,
          torneoId,
          rut,
          jugadorId,
          motivo: p.motivo,
          fechasPendientes: p.fechasSuspension,
          fechasTotales: p.fechasSuspension,
          desdeFechaNumero: p.desdeFechaNumero,
          origenIncidenciaPartidoId: p.origenIncidenciaPartidoId,
          descripcion: this.descripcionAuto(p.motivo),
          cumplida: false,
        }),
      );
    }
  }

  private descripcionAuto(motivo: SancionPropuesta['motivo']): string {
    switch (motivo) {
      case 'ROJA_DIRECTA':
        return 'Sanción automática por roja directa.';
      case 'DOBLE_AMARILLA':
        return 'Sanción automática por doble amarilla en el partido.';
      case 'ACUMULACION_AMARILLAS':
        return 'Sanción automática por acumulación de amarillas en el torneo.';
    }
  }

  /**
   * Decrementa en 1 el contador `fechas_pendientes` de las sanciones
   * DEL TORNEO ESPECÍFICO cuya fecha de inicio sea ≤ a la fecha recién
   * finalizada. Marca como cumplida cuando llega a 0.
   *
   * IMPORTANTE: filtrar por torneo_id evita que cerrar una fecha de un
   * torneo decremente sanciones de otros torneos paralelos del mismo
   * tenant.
   */
  private async decrementarSancionesPendientes(
    tenantId: string,
    torneoId: string,
    fechaNumeroFinalizada: number,
  ): Promise<void> {
    await this.sancionRepo
      .createQueryBuilder()
      .update()
      .set({ fechasPendientes: () => 'fechas_pendientes - 1' })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('torneo_id = :torneoId', { torneoId })
      .andWhere('cumplida = false')
      .andWhere('fechas_pendientes > 0')
      .andWhere('desde_fecha_numero <= :fechaNumero', { fechaNumero: fechaNumeroFinalizada })
      .execute();

    // Marcar cumplida las que llegaron a 0 (de este torneo)
    await this.sancionRepo
      .createQueryBuilder()
      .update()
      .set({ cumplida: true })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('torneo_id = :torneoId', { torneoId })
      .andWhere('cumplida = false')
      .andWhere('fechas_pendientes <= 0')
      .execute();
  }

  /**
   * Reabrir acta (sólo para corrección manual, requiere LIGA_ADMIN).
   *
   * Si la fecha estaba FINALIZADA (todos los partidos cerrados), se
   * revierte a EN_CURSO y se revierte el decremento de sanciones que
   * había disparado el cierre (AUDIT-9). Todo dentro de la misma
   * transacción para que no quede estado inconsistente.
   */
  @Transactional()
  async reabrirActa(partidoId: string, tenantId: string): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (!partido.actaCerradaAt) {
      throw new BadRequestException('El acta no está cerrada');
    }
    // LOG-4 (auditoría) — un WALKOVER también tiene acta cerrada, pero
    // reabrirlo lo dejaría EN_CURSO con el 3-0 intacto. Para deshacerlo va
    // por su flujo dedicado (anularWalkover), que limpia marcador y multa.
    if (partido.estado === 'WALKOVER') {
      throw new ConflictException(
        'Este partido es un WALKOVER. Para deshacerlo usá "Anular walkover", no reabrir el acta.',
      );
    }

    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const eraFechaFinalizada = fecha.estado === 'FINALIZADA';

    partido.actaCerradaAt = null;
    partido.actaCerradaBy = null;
    partido.estado = 'EN_CURSO';
    await this.repo.save(partido);

    // LOG-2 (auditoría) — borrar las sanciones AUTOMÁTICAS originadas por
    // este partido (roja directa / doble amarilla / acumulación). Si el
    // operador corrige/elimina una tarjeta mal cargada y re-cierra, se
    // regeneran desde las incidencias actuales. Las de TRIBUNAL (manuales)
    // nunca se tocan. Va antes del revert de contadores para no re-inflar
    // sanciones que ya no existen.
    await this.sancionRepo
      .createQueryBuilder()
      .delete()
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('origen_incidencia_partido_id = :partidoId', { partidoId: partido.id })
      .andWhere(`motivo IN ('ROJA_DIRECTA', 'DOBLE_AMARILLA', 'ACUMULACION_AMARILLAS')`)
      .execute();

    // Sprint 34D — al reabrir el acta, borrar los cobros auto del
    // partido (multas amarillas/rojas/walkover) que aun no fueron
    // pagados ni cancelados manualmente. Cuando se vuelva a cerrar,
    // se regeneran con las incidencias actualizadas.
    try {
      await this.tarifaAplicador.borrarCobrosAutoDelPartido(
        partido.id,
        tenantId,
      );
    } catch (err) {
      console.warn(
        `[partido] cleanup cobros auto fallo partido=${partido.id}: ${(err as Error).message}`,
      );
    }

    // Solo cambiar fecha a EN_CURSO si estaba FINALIZADA. Si estaba
    // PROGRAMADA / EN_CURSO, dejarla como estaba.
    if (eraFechaFinalizada) {
      await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'EN_CURSO' });
      fecha.estado = 'EN_CURSO';
    }

    // AUDIT-9 + LOG-3 (auditoría): la fecha vuelve a EN_CURSO, así que hay
    // que revertir el decremento de sanciones que había disparado su
    // cierre. El helper cappea contra fechas_totales para no inflar el
    // contador (fechas_pendientes > fechas_totales).
    if (eraFechaFinalizada) {
      await this.revertirDecrementoSanciones(tenantId, fecha.torneoId, fecha.numero);
    }

    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * Revierte el decremento de `fechas_pendientes` disparado al finalizar
   * una fecha (al reabrir un acta o anular un walkover). Suma +1 a las
   * sanciones del torneo que bajaban hasta esa fecha, **capeando contra
   * fechas_totales** (LOG-3) para no dejar `fechas_pendientes` por encima
   * del total original, y re-marca como no cumplidas las que vuelven a
   * tener pendientes. COALESCE cubre sanciones legacy sin fechas_totales.
   */
  private async revertirDecrementoSanciones(
    tenantId: string,
    torneoId: string,
    fechaNumero: number,
  ): Promise<void> {
    await this.sancionRepo
      .createQueryBuilder()
      .update()
      .set({
        fechasPendientes: () =>
          'LEAST(COALESCE(fechas_totales, fechas_pendientes + 1), fechas_pendientes + 1)',
      })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('torneo_id = :torneoId', { torneoId })
      .andWhere('desde_fecha_numero <= :fechaNumero', { fechaNumero })
      .execute();
    await this.sancionRepo
      .createQueryBuilder()
      .update()
      .set({ cumplida: false })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('torneo_id = :torneoId', { torneoId })
      .andWhere('cumplida = true')
      .andWhere('fechas_pendientes > 0')
      .execute();
  }

  // ─── Sprint 8: Suspensión y reprogramación ─────────────────────────
  /**
   * Suspende un partido individual. No puede tener acta cerrada — para
   * eso primero se reabre.
   */
  async suspenderPartido(
    partidoId: string,
    tenantId: string,
    actorUserId: string | null,
    input: { motivo: string; observaciones?: string | null },
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'No se puede suspender un partido con acta cerrada. Reabrir primero.',
      );
    }
    if (
      partido.estado === 'SUSPENDIDO_FUERZA_MAYOR' ||
      partido.estado === 'WALKOVER'
    ) {
      throw new BadRequestException(
        `El partido ya está en estado ${partido.estado}.`,
      );
    }
    partido.estado = 'SUSPENDIDO_FUERZA_MAYOR';
    partido.motivoSuspension = input.motivo as Partido['motivoSuspension'];
    partido.suspendidoAt = new Date();
    partido.suspendidoByUserId = actorUserId;
    partido.observacionesSuspension = input.observaciones?.trim() || null;
    // LOG-6: cortar el cronómetro del match-center — un partido suspendido
    // no debe seguir con reloj en vivo en la vista pública.
    partido.centroEstado = 'IDLE';
    partido.centroArrancadoAt = null;
    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * Marca un partido vencido como NO_JUGADO. Lo usa el admin cuando la fecha
   * pasó y nadie cargó el acta (no se jugó). No suma a la tabla de posiciones
   * ni cuenta como acta pendiente. Es reversible (reactivarPartido); la
   * reprogramación o el walkover los gestiona el admin por separado.
   */
  async marcarNoJugado(
    partidoId: string,
    tenantId: string,
    actorUserId: string | null,
    input: { observaciones?: string | null },
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'No se puede marcar como no jugado un partido con acta cerrada. Reabrir primero.',
      );
    }
    if (partido.estado !== 'PROGRAMADO' && partido.estado !== 'EN_CURSO') {
      throw new BadRequestException(
        `Solo un partido programado o en curso puede marcarse como no jugado (estado actual: ${partido.estado}).`,
      );
    }
    partido.estado = 'NO_JUGADO';
    partido.suspendidoAt = new Date();
    partido.suspendidoByUserId = actorUserId;
    partido.observacionesSuspension = input.observaciones?.trim() || null;
    // LOG-6: cortar el cronómetro del match-center (idem suspensión).
    partido.centroEstado = 'IDLE';
    partido.centroArrancadoAt = null;
    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * Reprograma un partido suspendido a una nueva fecha/hora/cancha.
   * Vuelve a estado PROGRAMADO. Valida choque de cancha en el nuevo
   * horario (reutiliza validarChoqueCancha).
   *
   * Si el partido NO estaba suspendido, igual permite cambiar
   * fecha/cancha (sirve para reprogramaciones rutinarias).
   */
  async reprogramarPartido(
    partidoId: string,
    tenantId: string,
    input: {
      fechaHora: string;
      canchaId?: string | null;
      canchaNombre?: string | null;
      mantieneDesignaciones?: boolean;
    },
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'No se puede reprogramar un partido con acta cerrada.',
      );
    }
    partido.fechaHora = new Date(input.fechaHora);
    if (input.canchaId !== undefined) {
      if (input.canchaId) {
        const cancha = await this.canchaRepo.findOne({
          where: { id: input.canchaId, tenantId },
        });
        if (!cancha) {
          throw new BadRequestException(
            'La cancha no existe o no pertenece a esta liga.',
          );
        }
        partido.canchaId = cancha.id;
        partido.canchaNombre = cancha.nombre;
      } else {
        partido.canchaId = null;
        if (input.canchaNombre !== undefined) {
          partido.canchaNombre = input.canchaNombre;
        }
      }
    } else if (input.canchaNombre !== undefined) {
      partido.canchaNombre = input.canchaNombre;
    }
    partido.estado = 'PROGRAMADO';

    // Si el partido estaba SUSPENDIDO, preservamos motivo y fecha de
    // suspensión como historia (no las limpiamos). El nuevo estado
    // PROGRAMADO indica que ya se reprogramó, pero el historial queda.
    // Si se vuelve a suspender, se sobrescriben.

    await this.validarChoqueCancha(partido);
    await this.repo.save(partido);

    // Limpieza opcional de designaciones (la idea es que las
    // designaciones viejas pueden no aplicar al nuevo horario).
    if (input.mantieneDesignaciones === false) {
      // TODO v2: borrar designaciones del partido. Por ahora dejamos las
      // designaciones intactas para que el admin las revise manualmente.
    }

    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * Declara un walkover (B-01). El equipo NO presentado pierde 3-0 sin
   * goleadores individuales. El acta queda cerrada automáticamente.
   *
   * Reglas estándar ANFA (Chile):
   *   - Marcador automático 3-0 al equipo presente.
   *   - El equipo perdedor recibe 0 puntos (los gana el ganador).
   *   - No se computan goleadores individuales (no hay incidencias GOL).
   *   - El partido queda como prueba de inasistencia para tribunal.
   *
   * Si ya estaba con acta cerrada o ya era WALKOVER, error 409. Si
   * estaba SUSPENDIDO, primero reactivar.
   */
  async declararWalkover(
    partidoId: string,
    tenantId: string,
    actorUserId: string | null,
    input: {
      equipoPerdedorId: string;
      observaciones?: string | null;
      // Sprint 44 — opt-out de la multa automática. Por default sigue
      // generando el cobro MULTA_WALKOVER (comportamiento histórico),
      // pero cuando el walkover viene de "suspender equipo" el operador
      // puede preferir no multar al club (especialmente si la suspensión
      // ES económica). EquiposAdminService.suspender() pasa este flag.
      aplicarMulta?: boolean;
    },
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);

    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'El partido ya tiene acta cerrada — no se puede declarar walkover.',
      );
    }
    if (partido.estado === 'WALKOVER') {
      throw new ConflictException('El partido ya es WALKOVER.');
    }
    if (partido.estado === 'SUSPENDIDO_FUERZA_MAYOR') {
      throw new BadRequestException(
        'El partido está suspendido. Reactívalo primero si quieres declarar walkover.',
      );
    }
    if (partido.estado === 'NO_JUGADO' || partido.estado === 'REPROGRAMADO') {
      throw new BadRequestException(
        'El partido figura como no jugado/reprogramado. Reactívalo primero si quieres declarar walkover.',
      );
    }

    // ADR-0005 — equipoPerdedorId es el inscripcionId.
    if (
      input.equipoPerdedorId !== partido.inscripcionLocalId &&
      input.equipoPerdedorId !== partido.inscripcionVisitaId
    ) {
      throw new BadRequestException(
        'El equipo indicado no pertenece a este partido.',
      );
    }

    const perdedorEsLocal = input.equipoPerdedorId === partido.inscripcionLocalId;
    partido.estado = 'WALKOVER';
    partido.golesLocal = perdedorEsLocal ? 0 : 3;
    partido.golesVisita = perdedorEsLocal ? 3 : 0;
    partido.actaCerradaAt = new Date();
    partido.actaCerradaBy = actorUserId;

    const obsBase = input.observaciones?.trim();
    const perdedorNombre = perdedorEsLocal
      ? partido.inscripcionLocal?.club?.nombre ?? 'local'
      : partido.inscripcionVisita?.club?.nombre ?? 'visita';
    partido.observaciones = obsBase
      ? `[WALKOVER] No se presentó ${perdedorNombre}. ${obsBase}`
      : `[WALKOVER] No se presentó ${perdedorNombre}.`;

    await this.repo.save(partido);

    // Sprint 34D — multa automatica al club ausente. Si el torneo tiene
    // tarifa MULTA_WALKOVER configurada, genera el cobro al club
    // perdedor. Silencioso si no hay tarifa.
    // Sprint 44 — opt-out via input.aplicarMulta = false (default true).
    if (input.aplicarMulta !== false) {
      try {
        const fechaWO = await this.fechaRepo.findOneOrFail({
          where: { id: partido.fechaId },
        });
        partido.fecha = fechaWO;
        await this.tarifaAplicador.aplicarMultaWalkover(
          partido,
          input.equipoPerdedorId,
          partido.tenantId,
        );
      } catch (err) {
        console.warn(
          `[partido] multa walkover fallo partido=${partido.id}: ${(err as Error).message}`,
        );
      }
    }

    // Si todos los partidos de la fecha quedaron FINALIZADO/WALKOVER,
    // marcamos la fecha como FINALIZADA y disparamos decremento de
    // sanciones (igual que en cerrarActa).
    const partidosDeFecha = await this.repo.find({ where: { fechaId: partido.fechaId } });
    const todosCerrados = partidosDeFecha.every(
      (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
    );
    if (todosCerrados) {
      const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
      if (fecha.estado !== 'FINALIZADA') {
        await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'FINALIZADA' });
        await this.decrementarSancionesPendientes(
          partido.tenantId,
          fecha.torneoId,
          fecha.numero,
        );
      }
    }

    // Sprint 14: push notif también para walkover.
    void this.push
      .notifyPartidoCerrado(partido.id)
      .catch((err) =>
        console.warn(
          `[push] walkover ${partido.id}, error en notify: ${(err as Error).message}`,
        ),
      );

    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  /**
   * LOG-4 (auditoría) — Anula un WALKOVER declarado por error. Resetea el
   * marcador y el estado a PROGRAMADO, limpia la observación auto, borra la
   * multa auto (cobro no pagado) y, si el walkover había finalizado la
   * fecha, la revierte a EN_CURSO deshaciendo el decremento de sanciones
   * (simétrico a reabrirActa). El partido queda listo para volver a jugarse
   * o declararse walkover de nuevo. Un WALKOVER no genera sanciones de
   * jugador (no hay incidencias), así que no hay sanciones que borrar.
   */
  @Transactional()
  async anularWalkover(partidoId: string, tenantId: string): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.estado !== 'WALKOVER') {
      throw new BadRequestException('El partido no es un WALKOVER.');
    }

    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const eraFechaFinalizada = fecha.estado === 'FINALIZADA';

    partido.estado = 'PROGRAMADO';
    partido.golesLocal = null;
    partido.golesVisita = null;
    partido.actaCerradaAt = null;
    partido.actaCerradaBy = null;
    partido.observaciones = null;
    await this.repo.save(partido);

    try {
      await this.tarifaAplicador.borrarCobrosAutoDelPartido(partido.id, tenantId);
    } catch (err) {
      console.warn(
        `[partido] cleanup multa walkover fallo partido=${partido.id}: ${(err as Error).message}`,
      );
    }

    if (eraFechaFinalizada) {
      await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'EN_CURSO' });
      await this.revertirDecrementoSanciones(tenantId, fecha.torneoId, fecha.numero);
    }

    return this.toDto(
      partido,
      fecha.numero,
      fecha.etiqueta,
      fecha.tipoReprogramacion === 'REPROGRAMADA',
    );
  }

  /**
   * Reactiva un partido SUSPENDIDO sin cambiar fecha/hora — útil cuando
   * la suspensión se canceló (mejoró el clima 2hs antes).
   */
  async reactivarPartido(partidoId: string, tenantId: string): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (
      partido.estado !== 'SUSPENDIDO_FUERZA_MAYOR' &&
      partido.estado !== 'NO_JUGADO'
    ) {
      throw new BadRequestException(
        `El partido no está suspendido ni marcado como no jugado (estado actual: ${partido.estado}).`,
      );
    }
    partido.estado = 'PROGRAMADO';
    partido.motivoSuspension = null;
    partido.suspendidoAt = null;
    partido.suspendidoByUserId = null;
    partido.observacionesSuspension = null;
    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta, fecha.tipoReprogramacion === 'REPROGRAMADA');
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async findPartido(id: string, tenantId: string): Promise<Partido> {
    const p = await this.repo.findOne({
      where: { id, tenantId },
      relations: {
        inscripcionLocal: { club: true },
        inscripcionVisita: { club: true },
      },
    });
    if (!p) throw new NotFoundException(`Partido ${id} no encontrado`);
    return p;
  }

  private async listIncidencias(partidoId: string): Promise<IncidenciaAdmin[]> {
    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId },
      relations: { inscripcion: { club: true }, jugador: true },
      order: { minuto: 'ASC', createdAt: 'ASC' },
    });
    // ADR-0005 — equipoId expone inscripcionId; jugadorInscritoId expone
    // jugadorId. El frontend los trata como ids opacos (rename en Fase 2).
    return incidencias.map((i) => ({
      id: i.id,
      equipoId: i.inscripcionId ?? '',
      equipoNombre: i.inscripcion?.club?.nombre ?? '',
      jugadorInscritoId: i.jugadorId,
      jugadorNombre: i.jugador
        ? `${i.jugador.nombres} ${i.jugador.apellidos}`
        : null,
      tipo: i.tipo,
      minuto: i.minuto,
    }));
  }

  private toDto(
    p: Partido,
    fechaNumero: number,
    fechaEtiqueta: string | null,
    fechaReprogramada: boolean,
  ): PartidoAdmin {
    return {
      id: p.id,
      fechaId: p.fechaId,
      fechaNumero,
      fechaEtiqueta,
      fechaReprogramada,
      // ADR-0005 — el campo equipoLocalId expone el inscripcionId (el id del
      // equipo en el torneo). El nombre sale del club de la inscripción.
      equipoLocalId: p.inscripcionLocalId ?? '',
      equipoLocalNombre: p.inscripcionLocal?.club?.nombre ?? '',
      equipoVisitaId: p.inscripcionVisitaId ?? '',
      equipoVisitaNombre: p.inscripcionVisita?.club?.nombre ?? '',
      canchaId: p.canchaId,
      canchaNombre: p.canchaNombre,
      fechaHora: p.fechaHora?.toISOString() ?? null,
      estado: p.estado,
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
      actaCerradaAt: p.actaCerradaAt?.toISOString() ?? null,
      observaciones: p.observaciones,
      motivoSuspension: p.motivoSuspension ?? null,
      suspendidoAt: p.suspendidoAt?.toISOString() ?? null,
      observacionesSuspension: p.observacionesSuspension ?? null,
      presentesCertificadosAt: p.presentesCertificadosAt?.toISOString() ?? null,
    };
  }

  // ─── F46.4 — Roster del acta + certificación de presentes ────────────
  /**
   * Conjunto de jugadores inhabilitados para jugar este partido:
   *   - sancionados: sanción activa del torneo que cubre esta fecha
   *     (por jugadorId o por RUT — cambiar de club no evade).
   *   - vetados: RUT en la lista negra del tenant.
   * (Los INACTIVO se derivan del estado del propio jugador.)
   */
  private async cargarInhabilitados(
    torneoId: string,
    fechaNumero: number,
    tenantId: string,
  ): Promise<{
    sancionadosJugadorIds: Set<string>;
    sancionadosRuts: Set<string>;
    vetadosRuts: Set<string>;
  }> {
    const sanc = await this.sancionRepo
      .createQueryBuilder('s')
      .select(['s.jugador_id AS "jugadorId"', 's.rut AS "rut"'])
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.torneo_id = :torneoId', { torneoId })
      .andWhere('s.cumplida = false')
      .andWhere('s.fechas_pendientes > 0')
      .andWhere('s.desde_fecha_numero <= :n', { n: fechaNumero })
      .getRawMany<{ jugadorId: string | null; rut: string | null }>();

    const vet = await this.vetadoRepo.find({
      where: { tenantId },
      select: { rut: true },
    });

    return {
      sancionadosJugadorIds: new Set(
        sanc.map((r) => r.jugadorId).filter((v): v is string => !!v),
      ),
      sancionadosRuts: new Set(
        sanc.map((r) => r.rut).filter((v): v is string => !!v),
      ),
      vetadosRuts: new Set(vet.map((v) => v.rut)),
    };
  }

  private motivoInhabilitacion(
    jugador: Jugador,
    inh: {
      sancionadosJugadorIds: Set<string>;
      sancionadosRuts: Set<string>;
      vetadosRuts: Set<string>;
    },
  ): MotivoInhabilitacion | null {
    if (jugador.rut && inh.vetadosRuts.has(jugador.rut)) return 'VETADO';
    if (jugador.estado !== 'ACTIVO') return 'INACTIVO';
    if (
      inh.sancionadosJugadorIds.has(jugador.id) ||
      (jugador.rut ? inh.sancionadosRuts.has(jugador.rut) : false)
    ) {
      return 'SANCIONADO';
    }
    return null;
  }

  async getRosterActa(partidoId: string, tenantId: string): Promise<ActaRoster> {
    const partido = await this.findPartido(partidoId, tenantId);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const inh = await this.cargarInhabilitados(fecha.torneoId, fecha.numero, tenantId);

    const presentes = await this.partidoJugadorRepo.find({
      where: { partidoId, tenantId },
    });
    const presenteSet = new Set(
      presentes.filter((p) => p.presente).map((p) => p.jugadorId),
    );

    const equipoRoster = async (
      inscripcionId: string | null,
      equipoNombre: string,
    ): Promise<RosterEquipo> => {
      if (!inscripcionId) return { inscripcionId: '', equipoNombre, jugadores: [] };
      const planilla = await this.planillaRepo.find({
        where: { inscripcionId, tenantId },
        relations: { jugador: true },
      });
      const jugadores: RosterJugador[] = planilla
        .filter((p) => p.jugador)
        .map((p) => {
          const j = p.jugador!;
          const motivo = this.motivoInhabilitacion(j, inh);
          return {
            jugadorId: j.id,
            nombre: j.nombres,
            apellido: j.apellidos,
            numeroCamiseta: j.numeroCamiseta,
            rut: j.rut,
            capitan: j.capitan,
            presente: presenteSet.has(j.id),
            habilitado: motivo === null,
            motivoInhabilitacion: motivo,
          };
        })
        .sort(
          (a, b) =>
            Number(b.capitan) - Number(a.capitan) ||
            (a.numeroCamiseta ?? 999) - (b.numeroCamiseta ?? 999) ||
            a.apellido.localeCompare(b.apellido, 'es'),
        );
      return { inscripcionId, equipoNombre, jugadores };
    };

    return {
      partidoId: partido.id,
      actaCerradaAt: partido.actaCerradaAt?.toISOString() ?? null,
      presentesCertificadosAt: partido.presentesCertificadosAt?.toISOString() ?? null,
      local: await equipoRoster(
        partido.inscripcionLocalId,
        partido.inscripcionLocal?.club?.nombre ?? 'Local',
      ),
      visita: await equipoRoster(
        partido.inscripcionVisitaId,
        partido.inscripcionVisita?.club?.nombre ?? 'Visita',
      ),
    };
  }

  /**
   * Certifica los jugadores presentes del partido (ambos equipos). Bloquea
   * si alguno no está habilitado (sancionado/vetado/inactivo). Reemplaza el
   * roster previo y marca la certificación (requisito para cerrar el acta).
   */
  @Transactional()
  async certificarPresentes(
    partidoId: string,
    tenantId: string,
    actorUserId: string,
    input: CertificarPresentesRequest,
  ): Promise<ActaRoster> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'El acta está cerrada. Reábrela para cambiar la certificación.',
      );
    }
    // Certificar presentes desbloquea el cierre del acta: no se hace sobre un
    // partido que ya no se juega.
    assertPartidoEstadoOperable(partido.estado);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const inscIds = [partido.inscripcionLocalId, partido.inscripcionVisitaId].filter(
      (v): v is string => !!v,
    );

    // Planilla de ambos equipos → mapa jugadorId → { inscripcionId, jugador }.
    const planilla = inscIds.length
      ? await this.planillaRepo.find({
          where: inscIds.map((inscripcionId) => ({ inscripcionId, tenantId })),
          relations: { jugador: true },
        })
      : [];
    const mapa = new Map<string, { inscripcionId: string; jugador: Jugador }>();
    for (const p of planilla) {
      if (p.jugador) mapa.set(p.jugador.id, { inscripcionId: p.inscripcionId, jugador: p.jugador });
    }

    const inh = await this.cargarInhabilitados(fecha.torneoId, fecha.numero, tenantId);
    const ids = Array.from(new Set(input.jugadorIds));
    const noEnPlanilla: string[] = [];
    const inhabilitados: string[] = [];
    for (const id of ids) {
      const entry = mapa.get(id);
      if (!entry) {
        noEnPlanilla.push(id);
        continue;
      }
      if (this.motivoInhabilitacion(entry.jugador, inh) !== null) {
        inhabilitados.push(`${entry.jugador.nombres} ${entry.jugador.apellidos}`);
      }
    }
    if (noEnPlanilla.length > 0) {
      throw new BadRequestException(
        'Hay jugadores que no pertenecen a la planilla de este partido.',
      );
    }
    if (inhabilitados.length > 0) {
      throw new BadRequestException(
        `No se puede certificar como presentes a jugadores inhabilitados ` +
          `(sancionados o vetados): ${inhabilitados.join(', ')}.`,
      );
    }

    // Reemplazar el roster: borrar el previo e insertar los presentes.
    await this.partidoJugadorRepo.delete({ partidoId, tenantId });
    if (ids.length > 0) {
      await this.partidoJugadorRepo.save(
        ids.map((jugadorId) =>
          this.partidoJugadorRepo.create({
            tenantId,
            partidoId,
            inscripcionId: mapa.get(jugadorId)!.inscripcionId,
            jugadorId,
            presente: true,
          }),
        ),
      );
    }

    partido.presentesCertificadosAt = new Date();
    partido.presentesCertificadosPor = actorUserId;
    await this.repo.save(partido);

    return this.getRosterActa(partidoId, tenantId);
  }
}
