/**
 * Seed inicial — crea tenant demo + admin para que dev local arranque
 * con login funcional. Idempotente: si el tenant ya existe, no rompe.
 */
import 'dotenv/config';
import { hash } from 'bcrypt';

import AppDataSource from './datasource';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  // eslint-disable-next-line no-console
  console.log('[seed] Connected');

  const slug = process.env.SEED_TENANT_SLUG ?? 'liga-demo';
  const nombre = process.env.SEED_TENANT_NAME ?? 'Liga Demo';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@fixtura.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Fixtura2026!';

  try {
    await AppDataSource.query('BEGIN');
    // Bypass RLS para el seed.
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const existingTenant = (await AppDataSource.query(`SELECT id FROM tenants WHERE slug = $1`, [
      slug,
    ])) as Array<{ id: string }>;
    let tenantId: string;
    if (existingTenant.length > 0) {
      tenantId = existingTenant[0]!.id;
      // eslint-disable-next-line no-console
      console.log(`[seed] Tenant "${slug}" ya existe (${tenantId})`);
    } else {
      const inserted = (await AppDataSource.query(
        `INSERT INTO tenants (slug, nombre, tipo, plan) VALUES ($1, $2, $3, $4) RETURNING id`,
        [slug, nombre, 'LIGA', 'STARTER'],
      )) as Array<{ id: string }>;
      tenantId = inserted[0]!.id;
      // eslint-disable-next-line no-console
      console.log(`[seed] Tenant creado: ${slug} (${tenantId})`);
    }

    const existingUser = (await AppDataSource.query(`SELECT id FROM users WHERE email = $1`, [
      adminEmail,
    ])) as Array<{ id: string }>;
    let userId: string;
    if (existingUser.length > 0) {
      userId = existingUser[0]!.id;
      // eslint-disable-next-line no-console
      console.log(`[seed] User "${adminEmail}" ya existe (${userId})`);
    } else {
      const passwordHash = await hash(adminPassword, 12);
      const inserted = (await AppDataSource.query(
        `INSERT INTO users (email, password_hash, nombre, apellido, idioma_pref) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [adminEmail, passwordHash, 'Admin', 'Demo', 'es'],
      )) as Array<{ id: string }>;
      userId = inserted[0]!.id;
      // eslint-disable-next-line no-console
      console.log(`[seed] User creado: ${adminEmail} (${userId})`);
    }

    // Asignar rol LIGA_ADMIN al user en el tenant
    await AppDataSource.query(
      `INSERT INTO user_roles (tenant_id, user_id, role, scope_type, scope_id)
       VALUES ($1, $2, $3, $4, $1)
       ON CONFLICT DO NOTHING`,
      [tenantId, userId, 'LIGA_ADMIN', 'TENANT'],
    );

    await AppDataSource.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log(`[seed] Listo. Login: ${adminEmail} / ${adminPassword}`);
  } catch (err) {
    await AppDataSource.query('ROLLBACK');
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] FATAL', err);
  process.exit(1);
});
