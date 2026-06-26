import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AnalyticsAdmin, DisciplinaTorneo, SeriePunto } from '@fixtura/types';

import { Club } from '../../competition/entities/club.entity';
import { Cobro } from '../../competition/entities/cobro.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { Partido } from '../../competition/entities/partido.entity';

/**
 * Analytics de la liga (módulo M5, etapa 1). Agrega datos que ya tenemos
 * para los gráficos del panel. Todo tenant-scoped; el RLS + el filtro
 * explícito por tenant_id garantizan aislamiento.
 *
 * Las queries crudas usan los mismos nombres de tabla que el dashboard
 * (jugadores, incidencias_partido, inscripciones_torneo, torneos, cobros).
 */
@Injectable()
export class AnalyticsAdminService {
  constructor(
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(Cobro) private readonly cobroRepo: Repository<Cobro>,
  ) {}

  async get(tenantId: string): Promise<AnalyticsAdmin> {
    const [
      clubesActivos,
      jugadoresActivos,
      partidosJugados,
      tarjetas,
      cobros,
      jugadoresPorMes,
      disciplinaPorTorneo,
      jugadoresPorCategoria,
    ] = await Promise.all([
      this.clubRepo.count({ where: { tenantId, estado: 'ACTIVO' } }),
      this.jugadorRepo.count({ where: { tenantId, estado: 'ACTIVO' } }),
      this.partidoRepo
        .createQueryBuilder('p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere(`p.estado IN ('FINALIZADO', 'WALKOVER')`)
        .getCount(),
      this.incidenciaRepo
        .createQueryBuilder('i')
        .where('i.tenant_id = :tenantId', { tenantId })
        // AMARILLA_ROJA (doble amarilla) es una tarjeta más; la convención del
        // resto del código la cuenta como roja (ver disciplinaPorTorneo).
        .andWhere(`i.tipo IN ('AMARILLA', 'ROJA', 'AMARILLA_ROJA')`)
        .getCount(),
      this.cobrosResumen(tenantId),
      this.jugadoresPorMes(tenantId),
      this.disciplinaPorTorneo(tenantId),
      this.jugadoresPorCategoria(tenantId),
    ]);

    return {
      resumen: {
        clubesActivos,
        jugadoresActivos,
        partidosJugados,
        recaudado: cobros.recaudado,
        // "Por cobrar" = todo lo no pagado (por vencer + vencido).
        pendiente: cobros.porVencer + cobros.vencido,
        tarjetas,
      },
      jugadoresPorMes,
      cobros,
      disciplinaPorTorneo,
      jugadoresPorCategoria,
    };
  }

  private async cobrosResumen(tenantId: string): Promise<AnalyticsAdmin['cobros']> {
    const rows = (await this.cobroRepo.query(
      `
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE pagado_at IS NOT NULL AND cancelado = false), 0)::int AS recaudado,
        COALESCE(SUM(monto) FILTER (
          WHERE pagado_at IS NULL AND cancelado = false
            AND (vencimiento IS NULL OR vencimiento >= CURRENT_DATE)
        ), 0)::int AS "porVencer",
        COALESCE(SUM(monto) FILTER (
          WHERE pagado_at IS NULL AND cancelado = false
            AND vencimiento IS NOT NULL AND vencimiento < CURRENT_DATE
        ), 0)::int AS vencido
      FROM cobros
      WHERE tenant_id = $1
      `,
      [tenantId],
    )) as Array<{ recaudado: number; porVencer: number; vencido: number }>;
    const r = rows[0] ?? { recaudado: 0, porVencer: 0, vencido: 0 };
    return {
      recaudado: Number(r.recaudado),
      porVencer: Number(r.porVencer),
      vencido: Number(r.vencido),
    };
  }

  private async jugadoresPorMes(tenantId: string): Promise<SeriePunto[]> {
    const rows = (await this.jugadorRepo.query(
      `
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
             COUNT(*)::int AS valor
      FROM jugadores
      WHERE tenant_id = $1
        AND created_at >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY 1
      ORDER BY 1
      `,
      [tenantId],
    )) as Array<{ mes: string; valor: number }>;
    return rows.map((r) => ({ etiqueta: r.mes, valor: Number(r.valor) }));
  }

  private async disciplinaPorTorneo(tenantId: string): Promise<DisciplinaTorneo[]> {
    const rows = (await this.incidenciaRepo.query(
      `
      SELECT t.nombre AS torneo,
             COUNT(*) FILTER (WHERE i.tipo = 'AMARILLA')::int AS amarillas,
             COUNT(*) FILTER (WHERE i.tipo IN ('ROJA', 'AMARILLA_ROJA'))::int AS rojas
      FROM incidencias_partido i
      JOIN inscripciones_torneo it ON it.id = i.inscripcion_id
      JOIN torneos t ON t.id = it.torneo_id
      WHERE i.tenant_id = $1
        AND i.tipo IN ('AMARILLA', 'ROJA', 'AMARILLA_ROJA')
      GROUP BY t.nombre
      ORDER BY COUNT(*) DESC
      LIMIT 8
      `,
      [tenantId],
    )) as Array<{ torneo: string; amarillas: number; rojas: number }>;
    return rows.map((r) => ({
      torneo: r.torneo,
      amarillas: Number(r.amarillas),
      rojas: Number(r.rojas),
    }));
  }

  private async jugadoresPorCategoria(tenantId: string): Promise<SeriePunto[]> {
    const rows = await this.jugadorRepo
      .createQueryBuilder('j')
      .leftJoin('j.categoria', 'cat')
      .select('cat.nombre', 'etiqueta')
      .addSelect('COUNT(*)', 'valor')
      .where('j.tenant_id = :tenantId', { tenantId })
      .andWhere(`j.estado = 'ACTIVO'`)
      .groupBy('cat.nombre')
      .orderBy('valor', 'DESC')
      .getRawMany<{ etiqueta: string | null; valor: string }>();
    return rows.map((r) => ({ etiqueta: r.etiqueta ?? '—', valor: Number(r.valor) }));
  }
}
