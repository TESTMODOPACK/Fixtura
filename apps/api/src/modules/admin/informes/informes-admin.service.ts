import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { calcularTablaPosiciones } from '@fixtura/domain';
import {
  AMARILLAS_PARA_SUSPENSION,
  type CoberturaPartido,
  type DesignacionInforme,
  type EnRiesgoAmarilla,
  type EstadoCuentaClub,
  type EstadoDesignacionInforme,
  type EstadoMultaInforme,
  type ExpulsadoFecha,
  type FilaPosicionInforme,
  type GoleadorInforme,
  type Moroso,
  type MultaPendiente,
  type PagoPersonal,
  type RecaudacionConcepto,
  type ResultadoPartidoInforme,
  type SancionVigente,
} from '@fixtura/types';

import { Cobro } from '../../competition/entities/cobro.entity';
import { Designacion } from '../../competition/entities/designacion.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

/** Fila cruda de la multa asociada a una sanción. */
interface MultaRaw {
  multaMonto: number | null;
  multaPagadoAt: Date | null;
  multaVencimiento: string | null;
}

/**
 * Informes de disciplina (solo lectura). Las queries usan el repo
 * transaccional (createQueryBuilder) para respetar el contexto de RLS;
 * no usar un DataSource crudo o devolverían 0 filas.
 */
@Injectable()
export class InformesAdminService {
  constructor(
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(Cobro)
    private readonly cobroRepo: Repository<Cobro>,
    @InjectRepository(Torneo)
    private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Partido)
    private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
  ) {}

  /** Umbral de amarillas del torneo (default 5 si no se encuentra). */
  private async umbralAmarillas(
    tenantId: string,
    torneoId: string,
  ): Promise<number> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    return torneo?.amarillasParaSuspension ?? AMARILLAS_PARA_SUSPENSION;
  }

  private hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private estadoMulta(m: MultaRaw): EstadoMultaInforme | null {
    if (m.multaMonto == null) return null;
    if (m.multaPagadoAt) return 'PAGADO';
    if (m.multaVencimiento && m.multaVencimiento < this.hoy()) return 'VENCIDO';
    return 'PENDIENTE';
  }

  // ─── Informe 1: expulsados de una fecha ─────────────────────────────
  async expulsados(
    tenantId: string,
    torneoId: string,
    fechaNumero?: number,
  ): Promise<ExpulsadoFecha[]> {
    const qb = this.incidenciaRepo
      .createQueryBuilder('i')
      .innerJoin('partidos', 'p', 'p.id = i.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .innerJoin('jugadores', 'j', 'j.id = i.jugador_id')
      .leftJoin('clubes', 'c', 'c.id = j.club_id')
      .leftJoin('equipos', 'el', 'el.id = p.equipo_local_id')
      .leftJoin('equipos', 'ev', 'ev.id = p.equipo_visita_id')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`i.tipo IN ('ROJA','AMARILLA_ROJA')`);

    if (fechaNumero != null) {
      qb.andWhere('f.numero = :fechaNumero', { fechaNumero });
    }

    const rows = await qb
      .select('i.id', 'incidenciaId')
      .addSelect('f.numero', 'fechaNumero')
      .addSelect('i.partido_id', 'partidoId')
      .addSelect('i.tipo', 'tipo')
      .addSelect('i.minuto', 'minuto')
      .addSelect(`j.nombres || ' ' || j.apellidos`, 'jugadorNombre')
      .addSelect('j.rut', 'rut')
      .addSelect('j.id', 'jugadorId')
      .addSelect('c.nombre', 'clubNombre')
      .addSelect('el.nombre', 'localNombre')
      .addSelect('ev.nombre', 'visitaNombre')
      .orderBy('f.numero', 'ASC')
      .addOrderBy('c.nombre', 'ASC')
      .getRawMany<{
        incidenciaId: string;
        fechaNumero: number;
        partidoId: string;
        tipo: 'ROJA' | 'AMARILLA_ROJA';
        minuto: number | null;
        jugadorNombre: string;
        rut: string | null;
        jugadorId: string;
        clubNombre: string | null;
        localNombre: string | null;
        visitaNombre: string | null;
      }>();

    // Sanciones del torneo originadas por roja/doble-amarilla + su multa,
    // indexadas por (partido, rut|jugador) para cruzarlas en memoria sin
    // duplicar filas de la query principal.
    const sanciones = await this.sancionRepo
      .createQueryBuilder('s')
      .leftJoin(
        'cobros',
        'co',
        'co.sancion_id = s.id AND co.cancelado = false',
      )
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.torneo_id = :torneoId', { torneoId })
      .andWhere(`s.motivo IN ('ROJA_DIRECTA','DOBLE_AMARILLA')`)
      .andWhere('s.origen_incidencia_partido_id IS NOT NULL')
      .select('s.origen_incidencia_partido_id', 'partidoId')
      .addSelect('s.jugador_id', 'jugadorId')
      .addSelect('s.rut', 'rut')
      .addSelect('COALESCE(s.fechas_totales, s.fechas_pendientes)', 'fechasSancion')
      .addSelect('co.monto', 'multaMonto')
      .addSelect('co.pagado_at', 'multaPagadoAt')
      .addSelect('co.vencimiento', 'multaVencimiento')
      .getRawMany<{
        partidoId: string;
        jugadorId: string | null;
        rut: string | null;
        fechasSancion: number | null;
        multaMonto: number | null;
        multaPagadoAt: Date | null;
        multaVencimiento: string | null;
      }>();

    const sancionPorClave = new Map<string, (typeof sanciones)[number]>();
    for (const s of sanciones) {
      if (s.jugadorId) sancionPorClave.set(`${s.partidoId}|j:${s.jugadorId}`, s);
      if (s.rut) sancionPorClave.set(`${s.partidoId}|r:${s.rut}`, s);
    }

    return rows.map((r) => {
      const s =
        sancionPorClave.get(`${r.partidoId}|j:${r.jugadorId}`) ??
        (r.rut ? sancionPorClave.get(`${r.partidoId}|r:${r.rut}`) : undefined);
      return {
        incidenciaId: r.incidenciaId,
        fechaNumero: Number(r.fechaNumero),
        partidoId: r.partidoId,
        partidoLabel: `${r.localNombre ?? '—'} vs ${r.visitaNombre ?? '—'}`,
        jugadorNombre: r.jugadorNombre,
        rut: r.rut,
        clubNombre: r.clubNombre,
        tipo: r.tipo,
        minuto: r.minuto == null ? null : Number(r.minuto),
        fechasSancion: s?.fechasSancion != null ? Number(s.fechasSancion) : null,
        multaMonto: s?.multaMonto != null ? Number(s.multaMonto) : null,
        multaEstado: s
          ? this.estadoMulta({
              multaMonto: s.multaMonto,
              multaPagadoAt: s.multaPagadoAt,
              multaVencimiento: s.multaVencimiento,
            })
          : null,
      };
    });
  }

  // ─── Informe 2: sancionados vigentes ────────────────────────────────
  async sancionadosVigentes(
    tenantId: string,
    torneoId?: string,
    clubId?: string,
    incluirCumplidas = false,
  ): Promise<SancionVigente[]> {
    const qb = this.sancionRepo
      .createQueryBuilder('s')
      .innerJoin(
        'jugadores',
        'j',
        '(j.id = s.jugador_id OR j.rut = s.rut)',
      )
      .leftJoin('clubes', 'c', 'c.id = j.club_id')
      .leftJoin('torneos', 't', 't.id = s.torneo_id')
      .leftJoin('cobros', 'co', 'co.sancion_id = s.id AND co.cancelado = false')
      .where('s.tenant_id = :tenantId', { tenantId });

    if (torneoId) qb.andWhere('s.torneo_id = :torneoId', { torneoId });
    if (clubId) qb.andWhere('j.club_id = :clubId', { clubId });
    if (!incluirCumplidas) qb.andWhere('s.cumplida = false');

    const rows = await qb
      .select('s.id', 'sancionId')
      .addSelect(`j.nombres || ' ' || j.apellidos`, 'jugadorNombre')
      .addSelect('s.rut', 'rut')
      .addSelect('c.nombre', 'clubNombre')
      .addSelect('t.nombre', 'torneoNombre')
      .addSelect('s.motivo', 'motivo')
      .addSelect('COALESCE(s.fechas_totales, s.fechas_pendientes)', 'fechasTotales')
      .addSelect('s.fechas_pendientes', 'fechasPendientes')
      .addSelect('s.desde_fecha_numero', 'desdeFechaNumero')
      .addSelect('s.cumplida', 'cumplida')
      .addSelect('co.monto', 'multaMonto')
      .addSelect('co.pagado_at', 'multaPagadoAt')
      .addSelect('co.vencimiento', 'multaVencimiento')
      .orderBy('s.cumplida', 'ASC')
      .addOrderBy('c.nombre', 'ASC')
      .getRawMany<{
        sancionId: string;
        jugadorNombre: string;
        rut: string | null;
        clubNombre: string | null;
        torneoNombre: string | null;
        motivo: string;
        fechasTotales: number;
        fechasPendientes: number;
        desdeFechaNumero: number;
        cumplida: boolean;
        multaMonto: number | null;
        multaPagadoAt: Date | null;
        multaVencimiento: string | null;
      }>();

    // Dedupe por sancionId (el join de cobros podría duplicar si hubiera
    // más de un cobro por sanción).
    const vistos = new Set<string>();
    const out: SancionVigente[] = [];
    for (const r of rows) {
      if (vistos.has(r.sancionId)) continue;
      vistos.add(r.sancionId);
      const totales = Number(r.fechasTotales);
      const pendientes = Number(r.fechasPendientes);
      const desde = Number(r.desdeFechaNumero);
      out.push({
        sancionId: r.sancionId,
        jugadorNombre: r.jugadorNombre,
        rut: r.rut,
        clubNombre: r.clubNombre,
        torneoNombre: r.torneoNombre,
        motivo: r.motivo,
        fechasTotales: totales,
        fechasCumplidas: Math.max(0, totales - pendientes),
        fechasPendientes: pendientes,
        desdeFechaNumero: desde,
        vuelveEnFecha: desde + totales,
        cumplida: r.cumplida,
        multaMonto: r.multaMonto != null ? Number(r.multaMonto) : null,
        multaEstado: this.estadoMulta({
          multaMonto: r.multaMonto,
          multaPagadoAt: r.multaPagadoAt,
          multaVencimiento: r.multaVencimiento,
        }),
      });
    }
    return out;
  }

  // ─── Informe 3: en riesgo de suspensión por amarillas ───────────────
  async enRiesgo(
    tenantId: string,
    torneoId: string,
  ): Promise<EnRiesgoAmarilla[]> {
    const umbral = await this.umbralAmarillas(tenantId, torneoId);
    const rows = await this.incidenciaRepo
      .createQueryBuilder('i')
      .innerJoin('partidos', 'p', 'p.id = i.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .innerJoin('jugadores', 'j', 'j.id = i.jugador_id')
      .leftJoin('clubes', 'c', 'c.id = j.club_id')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`i.tipo = 'AMARILLA'`)
      .groupBy('j.id')
      .addGroupBy('j.nombres')
      .addGroupBy('j.apellidos')
      .addGroupBy('j.rut')
      .addGroupBy('c.nombre')
      .having(`COUNT(*) % :umbral = :resto`, {
        umbral,
        resto: umbral - 1,
      })
      .select('j.id', 'jugadorId')
      .addSelect(`j.nombres || ' ' || j.apellidos`, 'jugadorNombre')
      .addSelect('j.rut', 'rut')
      .addSelect('c.nombre', 'clubNombre')
      .addSelect('COUNT(*)', 'amarillas')
      .orderBy('c.nombre', 'ASC')
      .getRawMany<{
        jugadorId: string;
        jugadorNombre: string;
        rut: string | null;
        clubNombre: string | null;
        amarillas: string;
      }>();

    return rows.map((r) => {
      const amarillas = Number(r.amarillas);
      return {
        jugadorId: r.jugadorId,
        jugadorNombre: r.jugadorNombre,
        rut: r.rut,
        clubNombre: r.clubNombre,
        amarillas,
        faltanParaSuspension: umbral - (amarillas % umbral),
      };
    });
  }

  // ─── Fase 2: Finanzas (sobre tabla cobros) ──────────────────────────
  // Estado derivado igual que en /admin/finanzas:
  //   PAGADO    → pagado_at IS NOT NULL
  //   VENCIDO   → no pagado, no cancelado, vencimiento < hoy
  //   PENDIENTE → no pagado, no cancelado, sin vencer
  // CURRENT_DATE usa la TZ del proceso DB (America/Santiago).

  private readonly SQL_VENCIDO =
    "c.pagado_at IS NULL AND NOT c.cancelado AND c.vencimiento IS NOT NULL AND c.vencimiento < CURRENT_DATE";
  private readonly SQL_PENDIENTE =
    "c.pagado_at IS NULL AND NOT c.cancelado AND (c.vencimiento IS NULL OR c.vencimiento >= CURRENT_DATE)";

  /** Estado de cuenta agregado por club. */
  async estadoCuenta(
    tenantId: string,
    torneoId?: string,
  ): Promise<EstadoCuentaClub[]> {
    const qb = this.cobroRepo
      .createQueryBuilder('c')
      .leftJoin('inscripciones_torneo', 'i', 'i.id = c.inscripcion_id')
      .leftJoin('clubes', 'cl', 'cl.id = i.club_id')
      .where('c.tenant_id = :tenantId', { tenantId });
    if (torneoId) qb.andWhere('c.torneo_id = :torneoId', { torneoId });

    const rows = await qb
      .select('cl.id', 'clubId')
      .addSelect('cl.nombre', 'clubNombre')
      .addSelect('SUM(CASE WHEN NOT c.cancelado THEN c.monto ELSE 0 END)', 'total')
      .addSelect('SUM(CASE WHEN c.pagado_at IS NOT NULL THEN c.monto ELSE 0 END)', 'pagado')
      .addSelect(`SUM(CASE WHEN ${this.SQL_PENDIENTE} THEN c.monto ELSE 0 END)`, 'pendiente')
      .addSelect(`SUM(CASE WHEN ${this.SQL_VENCIDO} THEN c.monto ELSE 0 END)`, 'vencido')
      .groupBy('cl.id')
      .addGroupBy('cl.nombre')
      .orderBy('cl.nombre', 'ASC')
      .getRawMany<{
        clubId: string | null;
        clubNombre: string | null;
        total: string;
        pagado: string;
        pendiente: string;
        vencido: string;
      }>();

    return rows.map((r) => {
      const pendiente = Number(r.pendiente);
      const vencido = Number(r.vencido);
      return {
        clubId: r.clubId,
        clubNombre: r.clubNombre,
        total: Number(r.total),
        pagado: Number(r.pagado),
        pendiente,
        vencido,
        saldo: pendiente + vencido,
      };
    });
  }

  /** Multas pendientes de pago (disciplina × cobros). */
  async multasPendientes(
    tenantId: string,
    torneoId?: string,
    clubId?: string,
  ): Promise<MultaPendiente[]> {
    const qb = this.cobroRepo
      .createQueryBuilder('c')
      .leftJoin('inscripciones_torneo', 'i', 'i.id = c.inscripcion_id')
      .leftJoin('clubes', 'cl', 'cl.id = i.club_id')
      .leftJoin('torneos', 't', 't.id = c.torneo_id')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.pagado_at IS NULL')
      .andWhere('NOT c.cancelado')
      .andWhere(`(c.categoria = 'MULTA' OR c.sancion_id IS NOT NULL)`);
    if (torneoId) qb.andWhere('c.torneo_id = :torneoId', { torneoId });
    if (clubId) qb.andWhere('i.club_id = :clubId', { clubId });

    const rows = await qb
      .select('c.id', 'cobroId')
      .addSelect('c.concepto', 'concepto')
      .addSelect('cl.nombre', 'clubNombre')
      .addSelect('t.nombre', 'torneoNombre')
      .addSelect('c.monto', 'monto')
      .addSelect('c.vencimiento', 'vencimiento')
      .addSelect(`(${this.SQL_VENCIDO})`, 'estaVencido')
      .orderBy('cl.nombre', 'ASC')
      .addOrderBy('c.vencimiento', 'ASC')
      .getRawMany<{
        cobroId: string;
        concepto: string;
        clubNombre: string | null;
        torneoNombre: string | null;
        monto: string;
        vencimiento: string | null;
        estaVencido: boolean;
      }>();

    return rows.map((r) => ({
      cobroId: r.cobroId,
      concepto: r.concepto,
      clubNombre: r.clubNombre,
      torneoNombre: r.torneoNombre,
      monto: Number(r.monto),
      vencimiento: r.vencimiento,
      estado: r.estaVencido ? 'VENCIDO' : 'PENDIENTE',
    }));
  }

  /** Cobros vencidos (morosos), ordenados por días de mora. */
  async morosos(tenantId: string, torneoId?: string): Promise<Moroso[]> {
    const qb = this.cobroRepo
      .createQueryBuilder('c')
      .leftJoin('inscripciones_torneo', 'i', 'i.id = c.inscripcion_id')
      .leftJoin('clubes', 'cl', 'cl.id = i.club_id')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere(this.SQL_VENCIDO);
    if (torneoId) qb.andWhere('c.torneo_id = :torneoId', { torneoId });

    const rows = await qb
      .select('c.id', 'cobroId')
      .addSelect('cl.nombre', 'clubNombre')
      .addSelect('c.concepto', 'concepto')
      .addSelect('c.monto', 'monto')
      .addSelect('c.vencimiento', 'vencimiento')
      .addSelect('(CURRENT_DATE - c.vencimiento)', 'diasMora')
      .addSelect('c.estado_dunning', 'estadoDunning')
      .addSelect('c.dunning_avisos_enviados', 'avisos')
      .orderBy('"diasMora"', 'DESC')
      .getRawMany<{
        cobroId: string;
        clubNombre: string | null;
        concepto: string;
        monto: string;
        vencimiento: string | null;
        diasMora: string;
        estadoDunning: string;
        avisos: string;
      }>();

    return rows.map((r) => ({
      cobroId: r.cobroId,
      clubNombre: r.clubNombre,
      concepto: r.concepto,
      monto: Number(r.monto),
      vencimiento: r.vencimiento,
      diasMora: Number(r.diasMora),
      estadoDunning: r.estadoDunning,
      avisos: Number(r.avisos),
    }));
  }

  /** Recaudación por concepto: cobrado vs por cobrar. */
  async recaudacion(
    tenantId: string,
    torneoId?: string,
  ): Promise<RecaudacionConcepto[]> {
    const qb = this.cobroRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('NOT c.cancelado');
    if (torneoId) qb.andWhere('c.torneo_id = :torneoId', { torneoId });

    const rows = await qb
      .select('c.categoria', 'categoria')
      .addSelect('SUM(CASE WHEN c.pagado_at IS NOT NULL THEN c.monto ELSE 0 END)', 'cobrado')
      .addSelect('SUM(CASE WHEN c.pagado_at IS NULL THEN c.monto ELSE 0 END)', 'porCobrar')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('c.categoria')
      .orderBy('c.categoria', 'ASC')
      .getRawMany<{
        categoria: string;
        cobrado: string;
        porCobrar: string;
        cantidad: string;
      }>();

    return rows.map((r) => {
      const cobrado = Number(r.cobrado);
      const porCobrar = Number(r.porCobrar);
      return {
        categoria: r.categoria,
        cobrado,
        porCobrar,
        total: cobrado + porCobrar,
        cantidad: Number(r.cantidad),
      };
    });
  }

  // ─── Fase 3: Competición ────────────────────────────────────────────

  /**
   * Tabla de posiciones del torneo. Reusa el cálculo puro de
   * `calcularTablaPosiciones` (packages/domain) para que coincida exacto
   * con el portal público y el panel admin. Solo cuentan FINALIZADO y
   * WALKOVER (los walkover ya persisten 3-0).
   */
  async posiciones(
    tenantId: string,
    torneoId: string,
  ): Promise<FilaPosicionInforme[]> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!torneo) return [];

    const inscripciones = await this.inscRepo.find({
      where: { torneoId },
      relations: { club: true },
    });
    const equipos = inscripciones
      .filter((i) => i.estado !== 'RETIRADO')
      .map((i) => ({
        id: i.id,
        nombre: i.club?.nombre ?? '',
        slug: i.club?.slug ?? '',
        escudoUrl: i.club?.escudoUrl ?? null,
      }));

    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
      .getMany();
    const partidos = partidosRaw.map((p) => ({
      equipoLocalId: p.inscripcionLocalId ?? '',
      equipoVisitaId: p.inscripcionVisitaId ?? '',
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
    }));

    const filas = calcularTablaPosiciones(equipos, partidos, {
      puntosVictoria: torneo.puntosVictoria,
      puntosEmpate: torneo.puntosEmpate,
      puntosDerrota: torneo.puntosDerrota,
      tiebreakers: Array.isArray(torneo.tablaTiebreakers)
        ? torneo.tablaTiebreakers
        : [],
    });

    return filas.map((f) => ({
      posicion: f.posicion,
      clubNombre: f.equipoNombre,
      pj: f.pj,
      pg: f.pg,
      pe: f.pe,
      pp: f.pp,
      gf: f.gf,
      gc: f.gc,
      dg: f.dg,
      pts: f.pts,
    }));
  }

  /**
   * Goleadores acumulados del torneo. Cuenta incidencias tipo GOL por
   * jugador (no incluye AUTOGOL). El club sale de la inscripción de la
   * incidencia.
   */
  async goleadores(
    tenantId: string,
    torneoId: string,
  ): Promise<GoleadorInforme[]> {
    const rows = await this.incidenciaRepo
      .createQueryBuilder('i')
      .select('j.nombres', 'nombre')
      .addSelect('j.apellidos', 'apellido')
      .addSelect('j.rut', 'rut')
      .addSelect('c.nombre', 'clubNombre')
      .addSelect('COUNT(*)::int', 'goles')
      .innerJoin('jugadores', 'j', 'j.id = i.jugador_id')
      .leftJoin('inscripciones_torneo', 'it', 'it.id = i.inscripcion_id')
      .leftJoin('clubes', 'c', 'c.id = it.club_id')
      .innerJoin('partidos', 'p', 'p.id = i.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`i.tipo = 'GOL'`)
      .andWhere('i.jugador_id IS NOT NULL')
      .groupBy('i.jugador_id, j.nombres, j.apellidos, j.rut, c.nombre')
      .orderBy('goles', 'DESC')
      .addOrderBy('j.apellidos', 'ASC')
      .getRawMany<{
        nombre: string;
        apellido: string;
        rut: string | null;
        clubNombre: string | null;
        goles: number;
      }>();

    return rows.map((r, idx) => ({
      posicion: idx + 1,
      jugadorNombre: `${r.nombre} ${r.apellido}`,
      rut: r.rut,
      clubNombre: r.clubNombre,
      goles: Number(r.goles),
    }));
  }

  /**
   * Resultados de los partidos del torneo (opcionalmente de una fecha).
   * Útil para imprimir/compartir la programación o lo jugado.
   */
  async resultados(
    tenantId: string,
    torneoId: string,
    fechaNumero?: number,
  ): Promise<ResultadoPartidoInforme[]> {
    const qb = this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .leftJoin('inscripciones_torneo', 'il', 'il.id = p.inscripcion_local_id')
      .leftJoin('clubes', 'cl', 'cl.id = il.club_id')
      .leftJoin('inscripciones_torneo', 'iv', 'iv.id = p.inscripcion_visita_id')
      .leftJoin('clubes', 'cv', 'cv.id = iv.club_id')
      .leftJoin('canchas', 'ca', 'ca.id = p.cancha_id')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId });
    if (fechaNumero != null) {
      qb.andWhere('f.numero = :fechaNumero', { fechaNumero });
    }

    const rows = await qb
      .select('p.id', 'partidoId')
      .addSelect('f.numero', 'fechaNumero')
      .addSelect('cl.nombre', 'localNombre')
      .addSelect('cv.nombre', 'visitaNombre')
      .addSelect('p.goles_local', 'golesLocal')
      .addSelect('p.goles_visita', 'golesVisita')
      .addSelect('p.estado', 'estado')
      .addSelect('p.fecha_hora', 'fechaHora')
      .addSelect('ca.nombre', 'canchaNombre')
      .orderBy('f.numero', 'ASC')
      .addOrderBy('p.fecha_hora', 'ASC')
      .getRawMany<{
        partidoId: string;
        fechaNumero: number;
        localNombre: string | null;
        visitaNombre: string | null;
        golesLocal: number | null;
        golesVisita: number | null;
        estado: string;
        fechaHora: Date | null;
        canchaNombre: string | null;
      }>();

    return rows.map((r) => ({
      partidoId: r.partidoId,
      fechaNumero: Number(r.fechaNumero),
      localNombre: r.localNombre,
      visitaNombre: r.visitaNombre,
      golesLocal: r.golesLocal == null ? null : Number(r.golesLocal),
      golesVisita: r.golesVisita == null ? null : Number(r.golesVisita),
      estado: r.estado,
      fechaHora: r.fechaHora ? r.fechaHora.toISOString() : null,
      canchaNombre: r.canchaNombre,
    }));
  }

  // ─── Fase 4: Arbitraje / operación ──────────────────────────────────

  /**
   * Detalle de designaciones de un torneo (opcional por fecha): quién fue
   * designado a cada partido, en qué rol, con qué estado y monto.
   */
  async designaciones(
    tenantId: string,
    torneoId: string,
    fechaNumero?: number,
  ): Promise<DesignacionInforme[]> {
    const qb = this.designacionRepo
      .createQueryBuilder('d')
      .innerJoin('partidos', 'p', 'p.id = d.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .innerJoin('personal', 'pe', 'pe.id = d.personal_id')
      .leftJoin('inscripciones_torneo', 'il', 'il.id = p.inscripcion_local_id')
      .leftJoin('clubes', 'cl', 'cl.id = il.club_id')
      .leftJoin('inscripciones_torneo', 'iv', 'iv.id = p.inscripcion_visita_id')
      .leftJoin('clubes', 'cv', 'cv.id = iv.club_id')
      .leftJoin('canchas', 'ca', 'ca.id = p.cancha_id')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId });
    if (fechaNumero != null) {
      qb.andWhere('f.numero = :fechaNumero', { fechaNumero });
    }

    const rows = await qb
      .select('d.id', 'designacionId')
      .addSelect('f.numero', 'fechaNumero')
      .addSelect('p.id', 'partidoId')
      .addSelect('cl.nombre', 'localNombre')
      .addSelect('cv.nombre', 'visitaNombre')
      .addSelect('p.fecha_hora', 'fechaHora')
      .addSelect('ca.nombre', 'canchaNombre')
      .addSelect(`pe.nombre || ' ' || pe.apellido`, 'personalNombre')
      .addSelect('pe.rut', 'rut')
      .addSelect('d.rol_asignado', 'rol')
      .addSelect('d.estado', 'estado')
      .addSelect('d.monto_pago', 'monto')
      .orderBy('f.numero', 'ASC')
      .addOrderBy('p.fecha_hora', 'ASC')
      .addOrderBy('pe.apellido', 'ASC')
      .getRawMany<{
        designacionId: string;
        fechaNumero: number;
        partidoId: string;
        localNombre: string | null;
        visitaNombre: string | null;
        fechaHora: Date | null;
        canchaNombre: string | null;
        personalNombre: string;
        rut: string | null;
        rol: string;
        estado: EstadoDesignacionInforme;
        monto: number | null;
      }>();

    return rows.map((r) => ({
      designacionId: r.designacionId,
      fechaNumero: Number(r.fechaNumero),
      partidoId: r.partidoId,
      partidoLabel: `${r.localNombre ?? '—'} vs ${r.visitaNombre ?? '—'}`,
      fechaHora: r.fechaHora ? r.fechaHora.toISOString() : null,
      canchaNombre: r.canchaNombre,
      personalNombre: r.personalNombre,
      rut: r.rut,
      rol: r.rol,
      estado: r.estado,
      monto: r.monto == null ? null : Number(r.monto),
    }));
  }

  /**
   * Cobertura arbitral de los partidos que requieren designación
   * (PROGRAMADO / EN_CURSO / FINALIZADO). Cuenta designaciones vigentes
   * (no rechazadas ni ausentes) por rol y marca el gap crítico de no
   * tener árbitro principal.
   */
  async cobertura(
    tenantId: string,
    torneoId: string,
    fechaNumero?: number,
  ): Promise<CoberturaPartido[]> {
    const qb = this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .leftJoin('inscripciones_torneo', 'il', 'il.id = p.inscripcion_local_id')
      .leftJoin('clubes', 'cl', 'cl.id = il.club_id')
      .leftJoin('inscripciones_torneo', 'iv', 'iv.id = p.inscripcion_visita_id')
      .leftJoin('clubes', 'cv', 'cv.id = iv.club_id')
      .leftJoin('canchas', 'ca', 'ca.id = p.cancha_id')
      .leftJoin(
        'designaciones',
        'd',
        `d.partido_id = p.id AND d.estado NOT IN ('RECHAZADA','AUSENTE')`,
      )
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`p.estado IN ('PROGRAMADO','EN_CURSO','FINALIZADO')`);
    if (fechaNumero != null) {
      qb.andWhere('f.numero = :fechaNumero', { fechaNumero });
    }

    const rows = await qb
      .select('p.id', 'partidoId')
      .addSelect('f.numero', 'fechaNumero')
      .addSelect('cl.nombre', 'localNombre')
      .addSelect('cv.nombre', 'visitaNombre')
      .addSelect('p.fecha_hora', 'fechaHora')
      .addSelect('ca.nombre', 'canchaNombre')
      .addSelect('p.estado', 'estado')
      .addSelect(
        `COUNT(*) FILTER (WHERE d.rol_asignado = 'ARBITRO_PRINCIPAL')`,
        'arbitroPrincipal',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE d.rol_asignado = 'ARBITRO_ASISTENTE')`,
        'arbitroAsistente',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE d.rol_asignado = 'PLANILLERO')`,
        'planillero',
      )
      .groupBy('p.id')
      .addGroupBy('f.numero')
      .addGroupBy('cl.nombre')
      .addGroupBy('cv.nombre')
      .addGroupBy('p.fecha_hora')
      .addGroupBy('ca.nombre')
      .addGroupBy('p.estado')
      .orderBy('f.numero', 'ASC')
      .addOrderBy('p.fecha_hora', 'ASC')
      .getRawMany<{
        partidoId: string;
        fechaNumero: number;
        localNombre: string | null;
        visitaNombre: string | null;
        fechaHora: Date | null;
        canchaNombre: string | null;
        estado: string;
        arbitroPrincipal: string;
        arbitroAsistente: string;
        planillero: string;
      }>();

    return rows.map((r) => {
      const arbitroPrincipal = Number(r.arbitroPrincipal);
      return {
        partidoId: r.partidoId,
        fechaNumero: Number(r.fechaNumero),
        partidoLabel: `${r.localNombre ?? '—'} vs ${r.visitaNombre ?? '—'}`,
        fechaHora: r.fechaHora ? r.fechaHora.toISOString() : null,
        canchaNombre: r.canchaNombre,
        estado: r.estado,
        arbitroPrincipal,
        arbitroAsistente: Number(r.arbitroAsistente),
        planillero: Number(r.planillero),
        tieneArbitroPrincipal: arbitroPrincipal > 0,
      };
    });
  }

  /**
   * Pagos a personal (cuentas por pagar). Por miembro: devengado de las
   * designaciones con asistencia, cuánto ya se liquidó (liquidacion_id) y
   * cuánto queda pendiente. Opcionalmente acotado a un torneo.
   */
  async pagosPersonal(
    tenantId: string,
    torneoId?: string,
  ): Promise<PagoPersonal[]> {
    const qb = this.designacionRepo
      .createQueryBuilder('d')
      .innerJoin('personal', 'pe', 'pe.id = d.personal_id')
      .where('d.tenant_id = :tenantId', { tenantId });
    if (torneoId) {
      qb.innerJoin('partidos', 'p', 'p.id = d.partido_id')
        .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
        .andWhere('f.torneo_id = :torneoId', { torneoId });
    }

    const rows = await qb
      .select('pe.id', 'personalId')
      .addSelect(`pe.nombre || ' ' || pe.apellido`, 'personalNombre')
      .addSelect('pe.rut', 'rut')
      .addSelect('pe.rol', 'rol')
      .addSelect(`COUNT(*) FILTER (WHERE d.estado = 'ASISTIO')`, 'designaciones')
      .addSelect(
        `COALESCE(SUM(d.monto_pago) FILTER (WHERE d.estado = 'ASISTIO'), 0)`,
        'devengado',
      )
      .addSelect(
        `COALESCE(SUM(d.monto_pago) FILTER (WHERE d.estado = 'ASISTIO' AND d.liquidacion_id IS NOT NULL), 0)`,
        'pagado',
      )
      .addSelect(
        `COALESCE(SUM(d.monto_pago) FILTER (WHERE d.estado = 'ASISTIO' AND d.liquidacion_id IS NULL), 0)`,
        'pendiente',
      )
      .groupBy('pe.id')
      .addGroupBy('pe.nombre')
      .addGroupBy('pe.apellido')
      .addGroupBy('pe.rut')
      .addGroupBy('pe.rol')
      .having(`COUNT(*) FILTER (WHERE d.estado = 'ASISTIO') > 0`)
      .orderBy('"pendiente"', 'DESC')
      .addOrderBy('pe.apellido', 'ASC')
      .getRawMany<{
        personalId: string;
        personalNombre: string;
        rut: string | null;
        rol: string;
        designaciones: string;
        devengado: string;
        pagado: string;
        pendiente: string;
      }>();

    return rows.map((r) => ({
      personalId: r.personalId,
      personalNombre: r.personalNombre,
      rut: r.rut,
      rol: r.rol,
      designaciones: Number(r.designaciones),
      devengado: Number(r.devengado),
      pagado: Number(r.pagado),
      pendiente: Number(r.pendiente),
    }));
  }
}
