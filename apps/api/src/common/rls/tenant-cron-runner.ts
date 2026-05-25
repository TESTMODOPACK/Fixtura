import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTransaction } from 'typeorm-transactional';

/**
 * Helper para cron jobs.
 *
 * Los crons no pasan por el TenantContextInterceptor (no hay request HTTP).
 * Si una tabla tiene RLS y un cron tenant-scoped no setea el contexto, las
 * queries retornarán 0 filas — falla silenciosa.
 *
 *   runForEachTenant(label, cb): itera tenants activos, una tx por cada
 *     uno con app.current_tenant_id = tenantId. Errores aislados.
 *
 *   runAsSystem(label, cb): una tx con app.current_tenant_id = '' (marker
 *     "sistema"); las policies reconocen ese bypass para operaciones admin
 *     legítimas (cleanups, expiración de trials, dunning).
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
        const result = await runInTransaction(async () => {
          await this.dataSource.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
            tenant.id,
          ]);
          return callback(tenant.id);
        });
        results.push(result);
      } catch (err) {
        this.logger.error(`[${label}] tenant ${tenant.id} failed: ${(err as Error).message}`);
        results.push(undefined);
      }
    }
    return results;
  }

  async runAsSystem<T>(label: string, callback: () => Promise<T>): Promise<T> {
    return runInTransaction(async () => {
      await this.dataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);
      this.logger.log(`[${label}] running as system (bypass RLS)`);
      return callback();
    });
  }
}
