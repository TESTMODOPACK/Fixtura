import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type { MetricasPlataforma, SystemHealth } from '@fixtura/types';

/**
 * Sprint 23 — métricas agregadas + health cross-tenant.
 */
@Injectable()
export class SuperAdminMetricsService {
  private readonly log = new Logger(SuperAdminMetricsService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getMetricas(): Promise<MetricasPlataforma> {
    // Bypass RLS para ver todos los tenants.
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const tenantsRows: Array<{
      total: number;
      activos: number;
      trial: number;
      suspendidos: number;
      cancelados: number;
    }> = await this.ds.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado_suscripcion = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE estado_suscripcion = 'TRIAL')::int AS trial,
        COUNT(*) FILTER (WHERE estado_suscripcion = 'SUSPENDIDO')::int AS suspendidos,
        COUNT(*) FILTER (WHERE estado_suscripcion = 'CANCELADO')::int AS cancelados
      FROM tenants
    `);
    const tenants = tenantsRows[0] ?? {
      total: 0,
      activos: 0,
      trial: 0,
      suspendidos: 0,
      cancelados: 0,
    };

    const usuariosRows: Array<{ total: number; activos_ultimo_mes: number }> =
      await this.ds.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total,
        (SELECT COUNT(DISTINCT user_id)::int
           FROM audit_logs
          WHERE action = 'auth.login'
            AND created_at > NOW() - INTERVAL '30 days') AS activos_ultimo_mes
    `);
    const usuarios = usuariosRows[0] ?? { total: 0, activos_ultimo_mes: 0 };

    const competicionRows: Array<{
      torneos_activos: number;
      partidos_30d: number;
      actas_30d: number;
    }> = await this.ds.query(`
      SELECT
        (SELECT COUNT(*)::int FROM torneos WHERE estado = 'ACTIVO') AS torneos_activos,
        (SELECT COUNT(*)::int FROM partidos
          WHERE estado IN ('FINALIZADO','WALKOVER')
            AND updated_at > NOW() - INTERVAL '30 days') AS partidos_30d,
        (SELECT COUNT(*)::int FROM partidos
          WHERE acta_cerrada_at > NOW() - INTERVAL '30 days') AS actas_30d
    `);
    const competicion = competicionRows[0] ?? {
      torneos_activos: 0,
      partidos_30d: 0,
      actas_30d: 0,
    };

    // MRR = suma del precio mensual de tenants ACTIVOS con plan asociado.
    const ingresosRows: Array<{ mrr: number }> = await this.ds.query(`
      SELECT COALESCE(SUM(p.precio_mensual_clp), 0)::int AS mrr
        FROM tenants t
        JOIN planes_suscripcion p ON p.id = t.plan_id
       WHERE t.estado_suscripcion = 'ACTIVO'
    `);
    const mrr = ingresosRows[0]?.mrr ?? 0;

    return {
      tenants,
      usuarios: {
        total: usuarios.total,
        activosUltimoMes: usuarios.activos_ultimo_mes,
      },
      competicion: {
        torneosActivos: competicion.torneos_activos,
        partidosUltimo30d: competicion.partidos_30d,
        actasCerradasUltimo30d: competicion.actas_30d,
      },
      ingresos: {
        mrr,
        arr: mrr * 12,
      },
      ultimaActualizacion: new Date().toISOString(),
    };
  }

  async getHealth(): Promise<SystemHealth> {
    const dbStart = Date.now();
    let db: SystemHealth['db'] = { ok: false, latencyMs: null, error: null };
    try {
      await this.ds.query('SELECT 1');
      db = { ok: true, latencyMs: Date.now() - dbStart, error: null };
    } catch (err) {
      db = {
        ok: false,
        latencyMs: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Redis check — opcional, depende de si está configurado.
    const redis: SystemHealth['redis'] = {
      ok: true,
      latencyMs: 0,
      error: 'Redis health check not yet wired — TODO',
    };

    return {
      db,
      redis,
      uptimeSec: Math.floor(process.uptime()),
      nodeVersion: process.version,
      gitSha: process.env.GIT_SHA ?? null,
      timestamp: new Date().toISOString(),
    };
  }
}
