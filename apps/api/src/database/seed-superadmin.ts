/**
 * Crea (o actualiza) el usuario SUPER_ADMIN de plataforma — el perfil que
 * ve y administra TODAS las ligas (tenants), planes y facturación.
 *
 * Credenciales por variables de entorno (con default):
 *   SEED_SUPERADMIN_EMAIL     (default: super@ligaplus.cl)
 *   SEED_SUPERADMIN_PASSWORD  (default: LigaPlus.Super2026!)
 *
 * Idempotente: si el usuario ya existe, actualiza su contraseña y se
 * asegura de que tenga el rol SUPER_ADMIN activo (PLATFORM, sin tenant).
 *
 *   pnpm --filter @fixtura/api db:seed:superadmin       (prod, sobre dist)
 *   pnpm --filter @fixtura/api db:seed:superadmin:dev   (local, ts-node)
 */
import 'dotenv/config';
import { hash } from 'bcrypt';

import AppDataSource from './datasource';

async function main(): Promise<void> {
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? 'super@ligaplus.cl').toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'LigaPlus.Super2026!';

  await AppDataSource.initialize();
  try {
    await AppDataSource.query('BEGIN');
    // user_roles tiene RLS; '' = bypass para operaciones de plataforma.
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const passwordHash = await hash(password, 12);

    // ─── Upsert del usuario ───────────────────────────────────────────
    const existing = (await AppDataSource.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ])) as Array<{ id: string }>;

    let userId: string;
    if (existing.length > 0) {
      userId = existing[0]!.id;
      await AppDataSource.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
        passwordHash,
        userId,
      ]);
    } else {
      const rows = (await AppDataSource.query(
        `INSERT INTO users (email, password_hash, nombre, apellido, idioma_pref)
         VALUES ($1, $2, 'Super', 'Admin', 'es') RETURNING id`,
        [email, passwordHash],
      )) as Array<{ id: string }>;
      userId = rows[0]!.id;
    }

    // ─── Rol SUPER_ADMIN (PLATFORM, sin tenant) ───────────────────────
    const rol = (await AppDataSource.query(
      `SELECT id, revoked_at FROM user_roles WHERE user_id = $1 AND role = 'SUPER_ADMIN'`,
      [userId],
    )) as Array<{ id: string; revoked_at: string | null }>;

    if (rol.length === 0) {
      await AppDataSource.query(
        `INSERT INTO user_roles (tenant_id, user_id, role, scope_type, scope_id)
         VALUES (NULL, $1, 'SUPER_ADMIN', 'PLATFORM', NULL)`,
        [userId],
      );
    } else if (rol[0]!.revoked_at) {
      await AppDataSource.query(`UPDATE user_roles SET revoked_at = NULL WHERE id = $1`, [
        rol[0]!.id,
      ]);
    }

    await AppDataSource.query('COMMIT');

    // eslint-disable-next-line no-console
    console.log(`
════════════════════════════════════════════════════════════
  SUPER ADMIN listo
  Email:       ${email}
  Contraseña:  ${password}
  (cámbiala en producción seteando SEED_SUPERADMIN_PASSWORD)
════════════════════════════════════════════════════════════
`);
  } catch (err) {
    await AppDataSource.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-superadmin] ERROR:', err);
  process.exit(1);
});
