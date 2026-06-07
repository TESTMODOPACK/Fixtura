import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { MatchCenterSnapshot } from '@fixtura/types';

import { Designacion } from '../competition/entities/designacion.entity';
import { Fecha } from '../competition/entities/fecha.entity';
import { Partido } from '../competition/entities/partido.entity';
import { PlanillaTorneo } from '../competition/entities/planilla-torneo.entity';
import { Torneo } from '../competition/entities/torneo.entity';

/**
 * Sprint 18 — RF-17. Lógica del cronómetro Match Center.
 *
 * El estado vive en la DB (sobrevive restarts del API). El gateway
 * websocket consulta el snapshot y lo emite cada segundo a la room.
 *
 * Cálculo del cronómetro:
 *   total = centroSegundosAcumulados +
 *           (estado === 'EN_VIVO' ? floor((now - centroArrancadoAt) / 1000) : 0)
 *
 * Al pausar: total se persiste en centroSegundosAcumulados y se limpia
 * centroArrancadoAt. Al reanudar: se setea nuevo centroArrancadoAt.
 */
@Injectable()
export class MatchCenterService {
  private readonly log = new Logger(MatchCenterService.name);

  constructor(
    @InjectRepository(Partido) private readonly repo: Repository<Partido>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
  ) {}

  /**
   * Snapshot actual del partido para emitir vía websocket.
   * Lectura sin lock — múltiples viewers concurrentes.
   */
  async snapshot(partidoId: string, tenantId: string): Promise<MatchCenterSnapshot> {
    const partido = await this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .where('p.id = :id AND p.tenant_id = :tenantId', { id: partidoId, tenantId })
      .getOne();
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado.`);
    return this.toSnapshot(partido);
  }

  /**
   * Variante sin chequeo de tenant — para la vista pública. El partido
   * se identifica por id (UUID); la respuesta es read-only y mínima.
   */
  async snapshotPublico(partidoId: string): Promise<MatchCenterSnapshot> {
    const partido = await this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .where('p.id = :id', { id: partidoId })
      .getOne();
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado.`);
    return this.toSnapshot(partido);
  }

  async arrancar(
    partidoId: string,
    tenantId: string,
    minutosPorPeriodo?: number,
    forzarDia = false,
  ): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new BadRequestException('El acta ya está cerrada — no se puede usar Match Center.');
    }
    if (partido.centroEstado === 'EN_VIVO') {
      // Idempotente: si ya está corriendo, devolvemos snapshot.
      return this.toSnapshot(partido);
    }
    if (partido.centroEstado === 'IDLE') {
      // F46.1–F46.3 — validaciones de inicio (bloquean el arranque). Solo
      // en la transición IDLE→EN_VIVO (primer arranque). Reanudar un
      // partido FINALIZADO_CENTRO/PAUSADO no re-valida.
      const notaForzado = await this.validarInicio(partido, tenantId, forzarDia);
      if (notaForzado) {
        partido.observaciones = partido.observaciones
          ? `${partido.observaciones}\n${notaForzado}`
          : notaForzado;
      }

      partido.centroPeriodo = 1;
      partido.centroSegundosAcumulados = 0;

      // Marcador en vivo arranca en 0-0 (no null). Sin esto, el equipo que
      // no convirtió queda con goles=null y la vista detalle muestra "—" en
      // un partido jugado (confuso). Solo inicializa si todavía no hay goles
      // cargados, para no pisar un marcador previo de un acta reabierta.
      partido.golesLocal = partido.golesLocal ?? 0;
      partido.golesVisita = partido.golesVisita ?? 0;

      // Sprint 29A — heredar duración del torneo si no viene override.
      // Esto asegura que el match-center respete lo configurado al crear
      // el torneo (40 min default amateur). El override por payload sigue
      // permitido para casos puntuales (partido de exhibición, etc.).
      const config = await this.cargarConfigTorneo(partido.id, tenantId);
      partido.centroMinutosPorPeriodo =
        minutosPorPeriodo ?? config.duracionPeriodoMinutos;
      partido.centroMinutosEntretiempo = config.duracionEntretiempoMinutos;
    }
    partido.centroEstado = 'EN_VIVO';
    partido.centroArrancadoAt = new Date();
    partido.centroPausadoAt = null;
    partido.estado = 'EN_CURSO';
    await this.repo.save(partido);
    this.log.log(`[match-center] partido=${partidoId} arrancado periodo=${partido.centroPeriodo}`);
    return this.toSnapshot(partido);
  }

  /**
   * Lee la duración del partido desde el torneo del partido.
   * Camino: partido.fecha_id → fechas.torneo_id → torneos.
   * Si falla (datos inconsistentes), devuelve defaults seguros.
   */
  private async cargarConfigTorneo(
    partidoId: string,
    tenantId: string,
  ): Promise<{ duracionPeriodoMinutos: number; duracionEntretiempoMinutos: number }> {
    type Row = {
      duracion_periodo_minutos: number | null;
      duracion_entretiempo_minutos: number | null;
    };
    const rows: Row[] = await this.repo.query(
      `SELECT t.duracion_periodo_minutos, t.duracion_entretiempo_minutos
         FROM partidos p
         JOIN fechas f ON f.id = p.fecha_id
         JOIN torneos t ON t.id = f.torneo_id
         WHERE p.id = $1 AND p.tenant_id = $2
         LIMIT 1`,
      [partidoId, tenantId],
    );
    const row = rows[0];
    return {
      duracionPeriodoMinutos: row?.duracion_periodo_minutos ?? 40,
      duracionEntretiempoMinutos: row?.duracion_entretiempo_minutos ?? 10,
    };
  }

  async pausar(partidoId: string, tenantId: string): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado !== 'EN_VIVO') {
      throw new BadRequestException('Solo se puede pausar un partido EN_VIVO.');
    }
    const transcurrido = this.calcularTranscurrido(partido);
    partido.centroSegundosAcumulados = transcurrido;
    partido.centroEstado = 'PAUSADO';
    partido.centroPausadoAt = new Date();
    partido.centroArrancadoAt = null;
    await this.repo.save(partido);
    this.log.log(
      `[match-center] partido=${partidoId} pausado en ${transcurrido}s acumulado`,
    );
    return this.toSnapshot(partido);
  }

  async reanudar(partidoId: string, tenantId: string): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado !== 'PAUSADO') {
      throw new BadRequestException('Solo se puede reanudar un partido PAUSADO.');
    }
    partido.centroEstado = 'EN_VIVO';
    partido.centroArrancadoAt = new Date();
    partido.centroPausadoAt = null;
    await this.repo.save(partido);
    return this.toSnapshot(partido);
  }

  async sumarGol(
    partidoId: string,
    tenantId: string,
    equipo: 'LOCAL' | 'VISITA',
  ): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado === 'IDLE') {
      throw new BadRequestException(
        'Iniciá el partido antes de cargar goles.',
      );
    }
    if (partido.centroEstado === 'FINALIZADO_CENTRO') {
      throw new BadRequestException('El partido en vivo ya finalizó.');
    }
    if (equipo === 'LOCAL') {
      partido.golesLocal = (partido.golesLocal ?? 0) + 1;
    } else {
      partido.golesVisita = (partido.golesVisita ?? 0) + 1;
    }
    await this.repo.save(partido);
    return this.toSnapshot(partido);
  }

  /**
   * Ajuste manual de goles. Útil para corregir errores del cronista en
   * caliente. Acepta valores >= 0.
   */
  async ajustarGoles(
    partidoId: string,
    tenantId: string,
    golesLocal: number,
    golesVisita: number,
  ): Promise<MatchCenterSnapshot> {
    if (golesLocal < 0 || golesVisita < 0) {
      throw new BadRequestException('Los goles no pueden ser negativos.');
    }
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado === 'IDLE') {
      throw new BadRequestException(
        'Iniciá el partido antes de ajustar el marcador.',
      );
    }
    partido.golesLocal = golesLocal;
    partido.golesVisita = golesVisita;
    await this.repo.save(partido);
    return this.toSnapshot(partido);
  }

  async siguientePeriodo(
    partidoId: string,
    tenantId: string,
  ): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado !== 'PAUSADO') {
      throw new BadRequestException(
        'Para pasar al siguiente período el partido debe estar PAUSADO (medio tiempo).',
      );
    }
    partido.centroPeriodo = partido.centroPeriodo + 1;
    partido.centroSegundosAcumulados = 0;
    await this.repo.save(partido);
    return this.toSnapshot(partido);
  }

  async finalizarCentro(
    partidoId: string,
    tenantId: string,
  ): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado === 'EN_VIVO') {
      partido.centroSegundosAcumulados = this.calcularTranscurrido(partido);
    }
    partido.centroEstado = 'FINALIZADO_CENTRO';
    partido.centroArrancadoAt = null;
    await this.repo.save(partido);
    this.log.log(`[match-center] partido=${partidoId} FINALIZADO_CENTRO`);
    return this.toSnapshot(partido);
  }

  /**
   * F46.1–F46.3 — Validaciones de inicio. Lanza BadRequestException con
   * mensaje claro si algo falta. Devuelve una nota para anexar a
   * observaciones cuando el inicio se forzó fuera de fecha, o null.
   */
  private async validarInicio(
    partido: Partido,
    tenantId: string,
    forzarDia: boolean,
  ): Promise<string | null> {
    // F46.1 — personal mínimo: árbitro principal + planillero designados
    // (ignorando designaciones rechazadas/ausentes).
    const desigs = await this.designacionRepo.find({
      where: { partidoId: partido.id, tenantId },
    });
    const activas = desigs.filter(
      (d) => d.estado !== 'RECHAZADA' && d.estado !== 'AUSENTE',
    );
    const faltaPersonal: string[] = [];
    if (!activas.some((d) => d.rolAsignado === 'ARBITRO_PRINCIPAL')) {
      faltaPersonal.push('árbitro principal');
    }
    if (!activas.some((d) => d.rolAsignado === 'PLANILLERO')) {
      faltaPersonal.push('planillero');
    }
    if (faltaPersonal.length > 0) {
      throw new BadRequestException(
        `No se puede iniciar: falta designar ${faltaPersonal.join(' y ')}. ` +
          'Asigná el personal en "Designación de personal".',
      );
    }

    // F46.2 — debe iniciarse el día agendado (zona America/Santiago).
    const fecha = await this.fechaRepo.findOne({
      where: { id: partido.fechaId, tenantId },
    });
    const agendadaISO = this.fechaPartidoISO(partido, fecha);
    if (!agendadaISO) {
      throw new BadRequestException(
        'El partido no tiene fecha programada. Agendá fecha/hora antes de iniciar.',
      );
    }
    const hoyISO = this.hoySantiagoISO();
    let notaForzado: string | null = null;
    if (agendadaISO !== hoyISO) {
      if (!forzarDia) {
        throw new BadRequestException(
          `El partido está agendado para el ${agendadaISO}, no para hoy (${hoyISO}). ` +
            'Usá "Forzar inicio" para iniciarlo igual, o reprogramá el partido.',
        );
      }
      notaForzado = `[INICIO FORZADO] Iniciado el ${hoyISO}; estaba agendado para ${agendadaISO}.`;
    }

    // F46.3 — plantel mínimo por equipo (configurable por torneo).
    const torneo = fecha
      ? await this.torneoRepo.findOne({ where: { id: fecha.torneoId, tenantId } })
      : null;
    const min = torneo?.minJugadoresParaIniciar ?? 7;
    const faltaPlantel: string[] = [];
    const lados: Array<['local' | 'visita', string | null]> = [
      ['local', partido.inscripcionLocalId],
      ['visita', partido.inscripcionVisitaId],
    ];
    for (const [lado, inscId] of lados) {
      if (!inscId) {
        faltaPlantel.push(`${lado}: sin inscripción`);
        continue;
      }
      const count = await this.contarPlantelActivo(inscId, tenantId);
      if (count < min) {
        faltaPlantel.push(`${lado}: ${count} de ${min}`);
      }
    }
    if (faltaPlantel.length > 0) {
      throw new BadRequestException(
        `Plantel insuficiente para iniciar (mínimo ${min} jugadores por equipo): ` +
          `${faltaPlantel.join('; ')}.`,
      );
    }

    return notaForzado;
  }

  private async contarPlantelActivo(
    inscripcionId: string,
    tenantId: string,
  ): Promise<number> {
    return this.planillaRepo
      .createQueryBuilder('pl')
      .innerJoin('pl.jugador', 'j')
      .where('pl.inscripcion_id = :inscripcionId', { inscripcionId })
      .andWhere('pl.tenant_id = :tenantId', { tenantId })
      .andWhere(`j.estado = 'ACTIVO'`)
      .getCount();
  }

  /** Fecha calendario (YYYY-MM-DD) del partido en zona Santiago. */
  private fechaPartidoISO(partido: Partido, fecha: Fecha | null): string | null {
    if (partido.fechaHora) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(partido.fechaHora);
    }
    return fecha?.fechaInicio ?? null;
  }

  private hoySantiagoISO(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private async ensure(partidoId: string, tenantId: string): Promise<Partido> {
    const partido = await this.repo.findOne({ where: { id: partidoId, tenantId } });
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado.`);
    return partido;
  }

  private calcularTranscurrido(partido: Partido): number {
    if (partido.centroEstado !== 'EN_VIVO' || !partido.centroArrancadoAt) {
      return partido.centroSegundosAcumulados;
    }
    const delta = Math.max(
      0,
      Math.floor((Date.now() - partido.centroArrancadoAt.getTime()) / 1000),
    );
    return partido.centroSegundosAcumulados + delta;
  }

  private toSnapshot(partido: Partido): MatchCenterSnapshot {
    return {
      partidoId: partido.id,
      estado: partido.centroEstado,
      periodo: partido.centroPeriodo,
      minutosPorPeriodo: partido.centroMinutosPorPeriodo,
      minutosEntretiempo: partido.centroMinutosEntretiempo ?? 10,
      segundosTranscurridos: this.calcularTranscurrido(partido),
      golesLocal: partido.golesLocal ?? 0,
      golesVisita: partido.golesVisita ?? 0,
      equipoLocalNombre: partido.inscripcionLocal?.club?.nombre ?? '?',
      equipoVisitaNombre: partido.inscripcionVisita?.club?.nombre ?? '?',
      ultimaActualizacion: new Date().toISOString(),
    };
  }
}
