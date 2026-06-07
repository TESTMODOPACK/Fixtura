import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { MatchCenterSnapshot } from '@fixtura/types';

import { Partido } from '../competition/entities/partido.entity';

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

  constructor(@InjectRepository(Partido) private readonly repo: Repository<Partido>) {}

  /**
   * Snapshot actual del partido para emitir vía websocket.
   * Lectura sin lock — múltiples viewers concurrentes.
   */
  async snapshot(partidoId: string, tenantId: string): Promise<MatchCenterSnapshot> {
    const partido = await this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.equipoLocal', 'el')
      .leftJoinAndSelect('p.equipoVisita', 'ev')
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
      .leftJoinAndSelect('p.equipoLocal', 'el')
      .leftJoinAndSelect('p.equipoVisita', 'ev')
      .where('p.id = :id', { id: partidoId })
      .getOne();
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado.`);
    return this.toSnapshot(partido);
  }

  async arrancar(
    partidoId: string,
    tenantId: string,
    minutosPorPeriodo?: number,
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
      equipoLocalNombre: partido.equipoLocal?.nombre ?? '?',
      equipoVisitaNombre: partido.equipoVisita?.nombre ?? '?',
      ultimaActualizacion: new Date().toISOString(),
    };
  }
}
