import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import {
  calcularSancionesPostPartido,
  type IncidenciaJugador,
  type SancionPropuesta,
} from '@fixtura/domain';
import type {
  CerrarActaRequest,
  CreateIncidenciaRequest,
  FixtureAdminFull,
  IncidenciaAdmin,
  PartidoAdmin,
  PartidoDetalle,
  UpdatePartidoRequest,
} from '@fixtura/types';

import { Cancha } from '../../competition/entities/cancha.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class PartidosAdminService {
  constructor(
    @InjectRepository(Partido) private readonly repo: Repository<Partido>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(Cancha) private readonly canchaRepo: Repository<Cancha>,
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
      relations: { equipoLocal: true, equipoVisita: true },
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
        estado: f.estado,
        motivoSuspension: f.motivoSuspension ?? null,
        suspendidoAt: f.suspendidoAt?.toISOString() ?? null,
        observacionesSuspension: f.observacionesSuspension ?? null,
        partidos: (partidosPorFecha.get(f.id) ?? []).map((p) => this.toDto(p, f.numero, f.etiqueta)),
      })),
    };
  }

  // ─── Detalle de un partido ──────────────────────────────────────────
  async getDetalle(partidoId: string, tenantId: string): Promise<PartidoDetalle> {
    const partido = await this.findPartido(partidoId, tenantId);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const incidencias = await this.listIncidencias(partidoId);

    return {
      ...this.toDto(partido, fecha.numero, fecha.etiqueta),
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
    if (input.estado !== undefined) partido.estado = input.estado;
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
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
  }

  /**
   * Lanza ConflictException si existe OTRO partido del mismo tenant en
   * la misma cancha cuyo horario esté dentro de ±VENTANA_OCUPACION_MIN
   * del partido que se está guardando.
   *
   * No verificamos solapamiento de bloques porque no tenemos `duracion`
   * persistida en `partidos` — asumimos slots de 90+30=120min uniformes.
   * Cuando agreguemos duración variable (canchas con baby-fútbol vs F11),
   * acá comparamos rangos `[a, a+90)` vs `[b, b+90)`.
   */
  private async validarChoqueCancha(partido: Partido): Promise<void> {
    if (!partido.canchaId || !partido.fechaHora) return;

    const ventanaMs = PartidosAdminService.VENTANA_OCUPACION_MIN * 60 * 1000;
    const desde = new Date(partido.fechaHora.getTime() - ventanaMs);
    const hasta = new Date(partido.fechaHora.getTime() + ventanaMs);

    const choque = await this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.cancha', 'cancha')
      .leftJoinAndSelect('p.equipoLocal', 'el')
      .leftJoinAndSelect('p.equipoVisita', 'ev')
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
      const local = choque.equipoLocal?.nombre ?? '?';
      const visita = choque.equipoVisita?.nombre ?? '?';
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
  async addIncidencia(
    partidoId: string,
    tenantId: string,
    input: CreateIncidenciaRequest,
  ): Promise<IncidenciaAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'No se pueden agregar incidencias a un acta cerrada. Reabrir primero (Sprint 2C+).',
      );
    }

    // Validar que el equipo pertenece a este partido
    if (input.equipoId !== partido.equipoLocalId && input.equipoId !== partido.equipoVisitaId) {
      throw new BadRequestException('El equipo no pertenece a este partido');
    }

    // Validar que el jugador pertenece al equipo si se proporciona
    if (input.jugadorInscritoId) {
      const jugador = await this.jugadorRepo.findOne({
        where: { id: input.jugadorInscritoId, equipoId: input.equipoId },
      });
      if (!jugador) {
        throw new BadRequestException('El jugador no pertenece al equipo indicado');
      }
    }

    const created = await this.incidenciaRepo.save(
      this.incidenciaRepo.create({
        tenantId,
        partidoId,
        equipoId: input.equipoId,
        jugadorInscritoId: input.jugadorInscritoId,
        tipo: input.tipo,
        minuto: input.minuto ?? null,
        detalle: {},
      }),
    );

    const incidencias = await this.listIncidencias(partidoId);
    return incidencias.find((i) => i.id === created.id)!;
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
    await this.incidenciaRepo.delete(incidenciaId);
  }

  // ─── Cierre de acta ─────────────────────────────────────────────────
  @Transactional()
  async cerrarActa(
    partidoId: string,
    tenantId: string,
    actorUserId: string,
    input: CerrarActaRequest,
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException('El acta ya está cerrada');
    }

    // Sanity check: los goles del acta deberían coincidir con la cantidad
    // de incidencias tipo GOL/AUTOGOL en la DB. Si no, devolvemos warning
    // pero igual cerramos (caller puede haber elegido cargar sólo el
    // marcador sin tracking por jugador).
    const incidencias = await this.incidenciaRepo.find({ where: { partidoId } });
    const golesLocalIncidencias = incidencias.filter(
      (i) => i.equipoId === partido.equipoLocalId && (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
    ).length;
    const golesVisitaIncidencias = incidencias.filter(
      (i) => i.equipoId === partido.equipoVisitaId && (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
    ).length;

    if (
      (golesLocalIncidencias > 0 || golesVisitaIncidencias > 0) &&
      (golesLocalIncidencias !== input.golesLocal ||
        golesVisitaIncidencias !== input.golesVisita)
    ) {
      throw new BadRequestException(
        `El marcador (${input.golesLocal}-${input.golesVisita}) no coincide con las incidencias cargadas (${golesLocalIncidencias}-${golesVisitaIncidencias}). Ajustá el detalle o el marcador.`,
      );
    }

    partido.golesLocal = input.golesLocal;
    partido.golesVisita = input.golesVisita;
    partido.estado = 'FINALIZADO';
    partido.actaCerradaAt = new Date();
    partido.actaCerradaBy = actorUserId;
    if (input.observaciones !== undefined) partido.observaciones = input.observaciones;

    await this.repo.save(partido);

    // ─── CASCADA POST-ACTA ───────────────────────────────────────────
    // 1. Detectar sanciones automáticas por las incidencias de este
    //    partido (rojas, dobles amarillas, acumulación de amarillas).
    //    Persistir en sanciones_activas.
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    await this.aplicarSancionesAutomaticas(partido, fecha.numero, tenantId);

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

    return this.toDto(partido, fecha.numero, fecha.etiqueta);
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

    // Traer incidencias del partido con info del jugador
    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId: partido.id },
      relations: { jugadorInscrito: true },
    });

    // Agrupar incidencias por jugador (sólo las relevantes para sanción)
    const porJugador = new Map<
      string,
      {
        jugadorInscritoId: string;
        rut: string | null;
        incidencias: IncidenciaJugador[];
      }
    >();

    for (const inc of incidencias) {
      if (!inc.jugadorInscritoId) continue;
      if (
        inc.tipo !== 'AMARILLA' &&
        inc.tipo !== 'ROJA' &&
        inc.tipo !== 'AMARILLA_ROJA'
      )
        continue;

      const key = inc.jugadorInscritoId;
      const bucket = porJugador.get(key) ?? {
        jugadorInscritoId: inc.jugadorInscritoId,
        rut: inc.jugadorInscrito?.rut ?? null,
        incidencias: [],
      };
      bucket.incidencias.push({
        tipo: inc.tipo,
        partidoId: partido.id,
        fechaNumero,
      });
      porJugador.set(key, bucket);
    }

    // Para cada jugador, calcular sanciones contra historial
    for (const bucket of porJugador.values()) {
      const previas = await this.getIncidenciasPreviasEnTorneo(
        bucket.jugadorInscritoId,
        bucket.rut,
        torneoId,
        partido.id,
      );

      const propuestas = calcularSancionesPostPartido(previas, bucket.incidencias);
      await this.persistirPropuestas(
        propuestas,
        tenantId,
        torneoId,
        bucket.jugadorInscritoId,
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
    jugadorInscritoId: string,
    rut: string | null,
    torneoId: string,
    partidoActualId: string,
  ): Promise<IncidenciaJugador[]> {
    const qb = this.incidenciaRepo
      .createQueryBuilder('i')
      .innerJoin('i.partido', 'p')
      .innerJoin('p.fecha', 'f')
      .innerJoin('i.jugadorInscrito', 'j')
      .leftJoin('j.equipo', 'e')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('i.partido_id <> :partidoActualId', { partidoActualId })
      .andWhere(`i.tipo IN ('AMARILLA','ROJA','AMARILLA_ROJA')`);

    if (rut) {
      qb.andWhere('(j.id = :jId OR j.rut = :rut)', { jId: jugadorInscritoId, rut });
    } else {
      qb.andWhere('j.id = :jId', { jId: jugadorInscritoId });
    }

    const rows = await qb
      .select(['i.tipo AS tipo', 'i.partido_id AS "partidoId"', 'f.numero AS "fechaNumero"'])
      .orderBy('f.numero', 'ASC')
      .getRawMany<{
        tipo: 'AMARILLA' | 'ROJA' | 'AMARILLA_ROJA';
        partidoId: string;
        fechaNumero: number;
      }>();

    return rows;
  }

  private async persistirPropuestas(
    propuestas: SancionPropuesta[],
    tenantId: string,
    torneoId: string,
    jugadorInscritoId: string,
    rut: string | null,
  ): Promise<void> {
    for (const p of propuestas) {
      // Idempotencia: si ya existe una sanción del mismo motivo originada
      // por la misma incidencia, no duplicar.
      const dup = await this.sancionRepo.findOne({
        where: {
          tenantId,
          torneoId,
          jugadorInscritoId,
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
          jugadorInscritoId,
          motivo: p.motivo,
          fechasPendientes: p.fechasSuspension,
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
        return 'Sanción automática por acumulación de 5 amarillas en el torneo.';
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
   * revierte a EN_CURSO. No tocamos las sanciones decrementadas — eso
   * sería complejo de revertir limpiamente. El operador puede ajustarlas
   * manualmente desde Tribunal si es necesario.
   */
  async reabrirActa(partidoId: string, tenantId: string): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (!partido.actaCerradaAt) {
      throw new BadRequestException('El acta no está cerrada');
    }
    partido.actaCerradaAt = null;
    partido.actaCerradaBy = null;
    partido.estado = 'EN_CURSO';
    await this.repo.save(partido);

    // Solo cambiar fecha a EN_CURSO si estaba FINALIZADA. Si estaba
    // PROGRAMADA / EN_CURSO, dejarla como estaba.
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    if (fecha.estado === 'FINALIZADA') {
      await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'EN_CURSO' });
      fecha.estado = 'EN_CURSO';
    }

    return this.toDto(partido, fecha.numero, fecha.etiqueta);
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
    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
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
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
  }

  /**
   * Reactiva un partido SUSPENDIDO sin cambiar fecha/hora — útil cuando
   * la suspensión se canceló (mejoró el clima 2hs antes).
   */
  async reactivarPartido(partidoId: string, tenantId: string): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.estado !== 'SUSPENDIDO_FUERZA_MAYOR') {
      throw new BadRequestException(
        `El partido no está suspendido (estado actual: ${partido.estado}).`,
      );
    }
    partido.estado = 'PROGRAMADO';
    partido.motivoSuspension = null;
    partido.suspendidoAt = null;
    partido.suspendidoByUserId = null;
    partido.observacionesSuspension = null;
    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async findPartido(id: string, tenantId: string): Promise<Partido> {
    const p = await this.repo.findOne({
      where: { id, tenantId },
      relations: { equipoLocal: true, equipoVisita: true },
    });
    if (!p) throw new NotFoundException(`Partido ${id} no encontrado`);
    return p;
  }

  private async listIncidencias(partidoId: string): Promise<IncidenciaAdmin[]> {
    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId },
      relations: { equipo: true, jugadorInscrito: true },
      order: { minuto: 'ASC', createdAt: 'ASC' },
    });
    return incidencias.map((i) => ({
      id: i.id,
      equipoId: i.equipoId,
      equipoNombre: i.equipo?.nombre ?? '',
      jugadorInscritoId: i.jugadorInscritoId,
      jugadorNombre: i.jugadorInscrito
        ? `${i.jugadorInscrito.nombre} ${i.jugadorInscrito.apellido}`
        : null,
      tipo: i.tipo,
      minuto: i.minuto,
    }));
  }

  private toDto(p: Partido, fechaNumero: number, fechaEtiqueta: string | null): PartidoAdmin {
    return {
      id: p.id,
      fechaId: p.fechaId,
      fechaNumero,
      fechaEtiqueta,
      equipoLocalId: p.equipoLocalId,
      equipoLocalNombre: p.equipoLocal?.nombre ?? '',
      equipoVisitaId: p.equipoVisitaId,
      equipoVisitaNombre: p.equipoVisita?.nombre ?? '',
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
    };
  }
}
