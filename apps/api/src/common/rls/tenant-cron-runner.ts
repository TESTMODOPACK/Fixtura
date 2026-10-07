import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { runComoSistema, runConTenant } from './rls-context';

/**
 * Helper para cron jobs.
 *
 * Los crons no pasan por el TenantContextInterceptor (no hay request HTTP).
 * Si una tabla tiene RLS y un cron tenant-scoped no setea el contexto, las
 * queries retornan 0 filas — falla silenciosa.
 *
 *   runForEachTenant(label, cb): itera tenants activos, una tx por cada
 *     uno con el contexto de ESE tenant. Errores aislados por tenant.
 *
 *   runAsSystem(label, cb): una tx en modo sistema (app.rls_bypass) para
 *     operaciones cross-tenant legítimas (cleanups, mora, trials).
 *
 * Ambos llevan la red de T13 (SELECT 1 pre-commit, dentro de los helpers
 * de rls-context): una tx envenenada por un catch tragado falla visible.
 */
@Injectable()
export class TenantCronRunner {
  private readonly logger = new Logger(TenantCronRunner.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async runForEachTenant<T>(
    label: string,
    callback: (tenantId: string) => Promise<T>,
  ): Promise<Array<T | undefined>> {
    const rows = (await this.dataSource.query(
      `SELECT id FROM tenants WHERE is_active = true ORDER BY created_at ASC`,
    )) as Array<{ id: string }>;

    this.logger.log(`[${label}] processing ${rows.length} active tenants`);

    const results: Array<T | undefined> = [];
    for (const tenant of rows) {
      try {
        results.push(
          await runConTenant(this.dataSource, tenant.id, () => callback(tenant.id)),
        );
      } catch (err) {
        this.logger.error(
          `[${label}] tenant ${tenant.id} failed: ${(err as Error).message}`,
          err instanceof Error ? err.stack : undefined,
        );
        results.push(undefined);
      }
    }
    return results;
  }

  async runAsSystem<T>(label: string, callback: () => Promise<T>): Promise<T> {
    this.logger.log(`[${label}] running as system (bypass RLS)`);
    return runComoSistema(this.dataSource, callback);
  }
}
