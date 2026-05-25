/**
 * Script idempotente que corre ANTES de `node dist/main` en cada arranque
 * del API (ver `start:prod` en package.json).
 *
 * Responsabilidades:
 *   1. Asegurar usuario de aplicación NON-superuser (`fixtura_app`).
 *   2. Aplicar cambios aditivos seguros que no justifican una migración
 *      formal: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
 *      CREATE EXTENSION, etc.
 *   3. NO borra datos. Cualquier DROP/DELETE/TRUNCATE va en migración
 *      formal con down().
 *
 * Patrón heredado de Eva360 (`apps/api/src/database/cleanup-orphans.ts`).
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main(): Promise<void> {
  const log = (msg: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[cleanup-orphans] ${msg}`);
  };

  const dbUser = process.env.DB_USER ?? 'fixtura';
  const dbPassword = process.env.DB_PASSWORD ?? 'fixtura';
  const dbHost = process.env.DB_HOST ?? 'localhost';
  const dbPort = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? 'fixtura';

  // Conectamos como el usuario superuser para poder ejecutar DDL y crear el
  // usuario de app si no existe.
  const url =
    process.env.DATABASE_URL_SUPERUSER ??
    `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  // ─── Skip explícito ──────────────────────────────────────────────────
  // En dev local con Postgres nativo solemos usar un solo rol (el dueño
  // de la DB) tanto para migrations como para runtime. En ese caso no hay
  // necesidad de crear `fixtura_app` separado — y el CREATE ROLE puede
  // fallar si el usuario no tiene CREATEROLE.
  // En prod, sí queremos el rol separado (FORCE RLS muerde sobre dueños),
  // y este script corre antes de `node dist/main`.
  if (process.env.SKIP_CLEANUP_ORPHANS === 'true') {
    log('SKIP_CLEANUP_ORPHANS=true — saltando.');
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  log('Connected to PostgreSQL');

  try {
    // ─── Extensiones requeridas ─────────────────────────────────────────
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    log('Extensions ensured (pgcrypto, uuid-ossp)');

    // ─── Usuario de aplicación NON-superuser ────────────────────────────
    // Solo intentamos crearlo si está configurado distinto al user dueño
    // de la DB. Si DB_APP_USER == DB_USER, no hay separación → no crear.
    const appUser = process.env.DB_APP_USER;
    const appPassword = process.env.DB_APP_PASSWORD;
    const dbOwnerUser = process.env.DB_USER;

    if (appUser && appPassword && appUser !== dbOwnerUser) {
      const exists = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [appUser],
      );
      if (exists.rowCount === 0) {
        const safeUser = appUser.replace(/"/g, '""');
        const safePass = appPassword.replace(/'/g, "''");
        try {
          await client.query(
            `CREATE ROLE "${safeUser}" LOGIN PASSWORD '${safePass}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
          );
          await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${safeUser}"`);
          await client.query(`GRANT USAGE ON SCHEMA public TO "${safeUser}"`);
          await client.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${safeUser}"`,
          );
          await client.query(
            `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${safeUser}"`,
          );
          await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${safeUser}"`,
          );
          await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${safeUser}"`,
          );
          log(`App user "${appUser}" created and granted permissions`);
        } catch (err) {
          log(`WARN: no pude crear "${appUser}": ${(err as Error).message}. Continuo.`);
        }
      } else {
        log(`App user "${appUser}" already exists`);
      }
    } else {
      log('DB_APP_USER no separado (dev local). Salteando creación de rol app.');
    }

    // ─── Hooks para cambios aditivos futuros ─────────────────────────────
    // Cuando agreguemos tablas y columnas en sprints posteriores, este es
    // el lugar para ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
    // ALTER TYPE ... ADD VALUE IF NOT EXISTS, etc. Por ahora vacío.

    log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[cleanup-orphans] FATAL', err);
  process.exit(1);
});
