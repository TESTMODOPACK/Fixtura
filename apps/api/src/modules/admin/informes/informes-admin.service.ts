import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AMARILLAS_PARA_SUSPENSION,
  type EnRiesgoAmarilla,
  type EstadoMultaInforme,
  type ExpulsadoFecha,
  type SancionVigente,
} from '@fixtura/types';

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
}
