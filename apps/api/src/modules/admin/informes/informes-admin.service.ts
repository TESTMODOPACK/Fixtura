import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AMARILLAS_PARA_SUSPENSION,
  type EnRiesgoAmarilla,
  type EstadoCuentaClub,
  type EstadoMultaInforme,
  type ExpulsadoFecha,
  type Moroso,
  type MultaPendiente,
  type RecaudacionConcepto,
  type SancionVigente,
} from '@fixtura/types';

import { Cobro } from '../../competition/entities/cobro.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';

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
  ) {}

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
      .createQueryBuilder()
      .from('incidencias_partido', 'i')
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
      .createQueryBuilder()
      .from('sanciones_activas', 's')
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
      .createQueryBuilder()
      .from('sanciones_activas', 's')
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
    const rows = await this.incidenciaRepo
      .createQueryBuilder()
      .from('incidencias_partido', 'i')
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
        umbral: AMARILLAS_PARA_SUSPENSION,
        resto: AMARILLAS_PARA_SUSPENSION - 1,
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
        faltanParaSuspension:
          AMARILLAS_PARA_SUSPENSION - (amarillas % AMARILLAS_PARA_SUSPENSION),
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
      .createQueryBuilder()
      .from('cobros', 'c')
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
      .createQueryBuilder()
      .from('cobros', 'c')
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
      .createQueryBuilder()
      .from('cobros', 'c')
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
      .createQueryBuilder()
      .from('cobros', 'c')
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
}
