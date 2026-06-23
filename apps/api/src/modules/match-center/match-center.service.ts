import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Propagation, runInTransaction } from 'typeorm-transactional';

import type { MatchCenterSnapshot } from '@fixtura/types';

import { Designacion } from '../competition/entities/designacion.entity';
import { Fecha } from '../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../competition/entities/incidencia-partido.entity';
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
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Partido) private readonly repo: Repository<Partido>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
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
   *
   * B4 — Riesgo cross-tenant ACEPTADO y documentado: corre bajo RLS en bypass
   * ('') y no filtra por tenant, así que un partidoId de OTRA liga devolvería su
   * marcador. Es tolerable porque (a) el id es un UUID v4 no enumerable, (b) el
   * dato es el marcador en vivo, pensado para ser público a los hinchas, y (c)
   * no expone campos sensibles. Si se quisiera aislamiento estricto, habría que
   * pasar el Host/slug y validar partido.tenantId contra el tenant del Host.
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

  /**
   * Igual que snapshotPublico, pero estableciendo el contexto RLS de
   * "sistema" (app.current_tenant_id = '') dentro de una transacción.
   *
   * Lo usa el GATEWAY WebSocket: el gateway NO pasa por el
   * TenantContextInterceptor (no hay request HTTP), así que la conexión del
   * pool no tiene seteado app.current_tenant_id. Con RLS habilitado en
   * `partidos`, current_setting(...) es NULL → la policy excluye TODAS las
   * filas y snapshotPublico tira "Partido no encontrado" de forma
   * intermitente (según qué conexión del pool toque). El bypass de sistema
   * es legítimo: el snapshot es público y cross-tenant por diseño (ver B4).
   */
  async snapshotPublicoSistema(partidoId: string): Promise<MatchCenterSnapshot> {
    // REQUIRES_NEW: broadcast() se dispara como `void` DENTRO de la
    // transacción del request admin (arrancar/pausar/…). Sin una tx propia,
    // este set_config('') pisaría el tenant de esa transacción. Con una tx
    // nueva queda aislado y el `true` (is_local) lo resetea al commit — no
    // filtra el bypass a la conexión del pool.
    return runInTransaction(
      async () => {
        await this.dataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);
        return this.snapshotPublico(partidoId);
      },
      { propagation: Propagation.REQUIRES_NEW },
    );
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
      partido.centroMinutosAgregados = 0;

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
        'Inicia el partido antes de cargar goles.',
      );
    }
    if (partido.centroEstado === 'FINALIZADO_CENTRO') {
      throw new BadRequestException('El partido en vivo ya finalizó.');
    }
    const inscripcionId =
      equipo === 'LOCAL' ? partido.inscripcionLocalId : partido.inscripcionVisitaId;
    if (!inscripcionId) {
      throw new BadRequestException('El partido no tiene equipo asignado en ese lado.');
    }
    // F46.6 — el marcador se DERIVA de las incidencias (fuente única). "+GOL"
    // crea una incidencia de gol "sin jugador" que se puede atribuir luego en
    // el detalle del acta. Así el botón y el registro de incidencias nunca
    // desincronizan el marcador.
    await this.incidenciaRepo.save(
      this.incidenciaRepo.create({
        tenantId,
        partidoId,
        inscripcionId,
        jugadorId: null,
        tipo: 'GOL',
        minuto: null,
        detalle: {},
      }),
    );
    await this.recomputarMarcador(partido);
    return this.toSnapshot(partido);
  }

  /**
   * Quita un gol del equipo (botón "−"). Borra la incidencia de gol más
   * reciente, priorizando las "sin jugador" (las del botón +GOL) para no
   * borrar goles ya atribuidos a un jugador.
   */
  async quitarGol(
    partidoId: string,
    tenantId: string,
    equipo: 'LOCAL' | 'VISITA',
  ): Promise<MatchCenterSnapshot> {
    const partido = await this.ensure(partidoId, tenantId);
    const inscripcionId =
      equipo === 'LOCAL' ? partido.inscripcionLocalId : partido.inscripcionVisitaId;
    if (!inscripcionId) return this.toSnapshot(partido);
    const goles = await this.incidenciaRepo.find({
      where: { partidoId, tenantId, inscripcionId, tipo: 'GOL' },
      order: { createdAt: 'DESC' },
    });
    if (goles.length === 0) return this.toSnapshot(partido);
    const target = goles.find((g) => !g.jugadorId) ?? goles[0];
    await this.incidenciaRepo.delete(target!.id);
    await this.recomputarMarcador(partido);
    return this.toSnapshot(partido);
  }

  /**
   * Recalcula golesLocal/Visita del partido contando las incidencias
   * GOL/AUTOGOL por inscripción (misma convención que el cierre de acta).
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
        'Inicia el partido antes de ajustar el marcador.',
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
    // Nuevo período → el tiempo agregado vuelve a 0.
    partido.centroMinutosAgregados = 0;
    await this.repo.save(partido);
    return this.toSnapshot(partido);
  }

  /**
   * Ajusta el tiempo agregado (en minutos) del período actual. Lo ingresa el
   * cronista en vivo; extiende el objetivo del período antes de auto-pausar.
   */
  async ajustarTiempoAgregado(
    partidoId: string,
    tenantId: string,
    minutos: number,
  ): Promise<MatchCenterSnapshot> {
    if (!Number.isFinite(minutos) || minutos < 0 || minutos > 30) {
      throw new BadRequestException(
        'El tiempo agregado debe estar entre 0 y 30 minutos.',
      );
    }
    const partido = await this.ensure(partidoId, tenantId);
    if (partido.centroEstado !== 'EN_VIVO' && partido.centroEstado !== 'PAUSADO') {
      throw new BadRequestException(
        'Solo se puede ajustar el tiempo agregado con el partido en juego.',
      );
    }
    partido.centroMinutosAgregados = Math.trunc(minutos);
    await this.repo.save(partido);
    return this.toSnapshot(partido);
  }

  /**
   * Llamado por el tick del gateway. Si el partido está EN_VIVO y el período
   * ya cumplió su objetivo (duración + tiempo agregado), lo auto-pausa
   * ("medio tiempo"): persiste PAUSADO con el cronómetro fijado en el límite.
   * El cronista pasa al siguiente período (reinicia en 0) o finaliza.
   *
   * Corre en contexto de sistema (bypass RLS) en su propia transacción —
   * igual que snapshotPublicoSistema; el gateway no tiene tenant.
   */
  async verificarYAutoPausar(partidoId: string): Promise<boolean> {
    return runInTransaction(
      async () => {
        await this.dataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);
        const partido = await this.repo.findOne({ where: { id: partidoId } });
        if (!partido || partido.centroEstado !== 'EN_VIVO') return false;
        if (this.calcularTranscurrido(partido) < this.objetivoSegundos(partido)) {
          return false;
        }
        partido.centroSegundosAcumulados = this.objetivoSegundos(partido);
        partido.centroEstado = 'PAUSADO';
        partido.centroPausadoAt = new Date();
        partido.centroArrancadoAt = null;
        await this.repo.save(partido);
        this.log.log(
          `[match-center] partido=${partidoId} auto-pausado: fin del período ${partido.centroPeriodo}`,
        );
        return true;
      },
      { propagation: Propagation.REQUIRES_NEW },
    );
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
          'Asigna el personal en "Designación de personal".',
      );
    }

    // F46.2 — debe iniciarse el día agendado (zona America/Santiago).
    const fecha = await this.fechaRepo.findOne({
      where: { id: partido.fechaId, tenantId },
    });
    const agendadaISO = this.fechaPartidoISO(partido, fecha);
    if (!agendadaISO) {
      throw new BadRequestException(
        'El partido no tiene fecha programada. Agenda fecha/hora antes de iniciar.',
      );
    }
    const hoyISO = this.hoySantiagoISO();
    let notaForzado: string | null = null;
    if (agendadaISO !== hoyISO) {
      if (!forzarDia) {
        throw new BadRequestException(
          `El partido está agendado para el ${agendadaISO}, no para hoy (${hoyISO}). ` +
            'Usa "Forzar inicio" para iniciarlo igual, o reprograma el partido.',
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

  /** Objetivo de segundos del período actual: (duración + agregado)·60. */
  private objetivoSegundos(partido: Partido): number {
    return (
      (partido.centroMinutosPorPeriodo + (partido.centroMinutosAgregados ?? 0)) * 60
    );
  }

  private calcularTranscurrido(partido: Partido): number {
    const objetivo = this.objetivoSegundos(partido);
    if (partido.centroEstado !== 'EN_VIVO' || !partido.centroArrancadoAt) {
      return Math.min(objetivo, partido.centroSegundosAcumulados);
    }
    const delta = Math.max(
      0,
      Math.floor((Date.now() - partido.centroArrancadoAt.getTime()) / 1000),
    );
    // Cap en el objetivo: el reloj nunca pasa el límite del período. El tick
    // del gateway auto-pausa al llegar (ver verificarYAutoPausar).
    return Math.min(objetivo, partido.centroSegundosAcumulados + delta);
  }

  private toSnapshot(partido: Partido): MatchCenterSnapshot {
    const transcurrido = this.calcularTranscurrido(partido);
    return {
      partidoId: partido.id,
      estado: partido.centroEstado,
      periodo: partido.centroPeriodo,
      minutosPorPeriodo: partido.centroMinutosPorPeriodo,
      minutosEntretiempo: partido.centroMinutosEntretiempo ?? 10,
      minutosAgregados: partido.centroMinutosAgregados ?? 0,
      segundosTranscurridos: transcurrido,
      vencido: transcurrido >= this.objetivoSegundos(partido),
      golesLocal: partido.golesLocal ?? 0,
      golesVisita: partido.golesVisita ?? 0,
      equipoLocalNombre: partido.inscripcionLocal?.club?.nombre ?? '?',
      equipoVisitaNombre: partido.inscripcionVisita?.club?.nombre ?? '?',
      ultimaActualizacion: new Date().toISOString(),
    };
  }
}
