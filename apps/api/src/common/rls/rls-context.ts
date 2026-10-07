import { DataSource } from 'typeorm';
import { Propagation, runInTransaction } from 'typeorm-transactional';

/**
 * Punto ÚNICO de entrada al contexto RLS (T10). Nadie más en la app debe
 * llamar set_config de app.* a mano: un contexto mal puesto no falla — se
 * nota recién cuando otra liga ve datos ajenos o un cron escribe en vacío.
 *
 * RLS v2 (ver cleanup-orphans): dos GUC, ambos con residuo inocuo.
 *   app.current_tenant_id  uuid del tenant ('' residual → NULL → 0 filas)
 *   app.rls_bypass         'on' = modo sistema ('' residual ≠ 'on')
 */

/** Tenant "nadie": usuario autenticado sin liga elegida — ve 0 filas. */
export const SIN_TENANT_UUID = '00000000-0000-0000-0000-000000000000';

/** Fija el tenant DENTRO de la transacción actual (is_local). */
export async function fijarTenantLocal(ds: DataSource, tenantId: string): Promise<void> {
  await ds.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
}

/** Activa el modo sistema DENTRO de la transacción actual (is_local). */
export async function fijarBypassLocal(ds: DataSource): Promise<void> {
  await ds.query(`SELECT set_config('app.rls_bypass', 'on', true)`);
}

/**
 * Transacción NUEVA acotada a UN tenant — para crons por tenant y efectos
 * post-commit (el manager del request ya no existe ahí). El SELECT 1 final
 * detona ANTES del COMMIT cualquier transacción envenenada por un catch
 * que tragó un error de Postgres (T13): sin él, ese COMMIT se convierte
 * en ROLLBACK silencioso con respuesta exitosa.
 */
export function runConTenant<T>(
  ds: DataSource,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return runInTransaction(
    async () => {
      await fijarTenantLocal(ds, tenantId);
      const resultado = await fn();
      await ds.query('SELECT 1');
      return resultado;
    },
    { propagation: Propagation.REQUIRES_NEW },
  );
}

/**
 * Transacción NUEVA en modo sistema (bypass explícito) — mantenimiento,
 * lecturas cross-tenant legítimas, snapshots públicos del gateway.
 */
export function runComoSistema<T>(ds: DataSource, fn: () => Promise<T>): Promise<T> {
  return runInTransaction(
    async () => {
      await fijarBypassLocal(ds);
      const resultado = await fn();
      await ds.query('SELECT 1');
      return resultado;
    },
    { propagation: Propagation.REQUIRES_NEW },
  );
}
