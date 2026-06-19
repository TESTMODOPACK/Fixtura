/**
 * Crea el usuario SUPER_ADMIN de plataforma — el perfil que ve y administra
 * TODAS las ligas (tenants), planes y facturación.
 *
 * Credenciales por variables de entorno:
 *   SEED_SUPERADMIN_EMAIL     (default: super@ligaplus.cl)
 *   SEED_SUPERADMIN_PASSWORD  (en producción es OBLIGATORIA al crear, sin
 *                              default; en dev cae a un default local)
 *
 * SEC-6: idempotente y seguro de re-correr — si el usuario YA existe NO toca
 * su contraseña (un re-run no la degrada), solo asegura el rol SUPER_ADMIN
 * activo. Al crear, valida la fortaleza de la contraseña.
 *
 *   pnpm --filter @fixtura/api db:seed:superadmin       (prod, sobre dist)
 *   pnpm --filter @fixtura/api db:seed:superadmin:dev   (local, ts-node)
 */
import 'dotenv/config';
import { hash } from 'bcrypt';

import { validarPasswordSegura } from '@fixtura/domain';

import AppDataSource from './datasource';

async function main(): Promise<void> {
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? 'super@ligaplus.cl').toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  const envPassword = process.env.SEED_SUPERADMIN_PASSWORD;

  await AppDataSource.initialize();
  try {
    await AppDataSource.query('BEGIN');
    // user_roles tiene RLS; '' = bypass para operaciones de plataforma.
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    // ─── Upsert del usuario ───────────────────────────────────────────
    const existing = (await AppDataSource.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ])) as Array<{ id: string }>;

    let userId: string;
    let passwordDefinida = false;
    if (existing.length > 0) {
      // SEC-6 — NO reescribimos el hash de una cuenta ya creada: un re-run
      // del seed no debe degradar una contraseña fuerte ya configurada.
      userId = existing[0]!.id;
    } else {
      // Creación: en producción exigimos SEED_SUPERADMIN_PASSWORD (sin
      // default público) y validamos la fortaleza antes de hashear.
      if (isProd && !envPassword) {
        throw new Error(
          'En producción debes definir SEED_SUPERADMIN_PASSWORD para crear el super admin (sin default).',
        );
      }
      const password = envPassword ?? 'LigaPlus.Super2026!'; // default solo en dev
      const errPwd = validarPasswordSegura(password, {
        email,
        nombre: 'Super',
        apellido: 'Admin',
      });
      if (errPwd) {
        throw new Error(`La contraseña del super admin no cumple la política: ${errPwd}`);
      }
      const passwordHash = await hash(password, 12);
      const rows = (await AppDataSource.query(
        `INSERT INTO users (email, password_hash, nombre, apellido, idioma_pref)
         VALUES ($1, $2, 'Super', 'Admin', 'es') RETURNING id`,
        [email, passwordHash],
      )) as Array<{ id: string }>;
      userId = rows[0]!.id;
      passwordDefinida = true;
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
  Contraseña:  ${passwordDefinida ? 'definida desde SEED_SUPERADMIN_PASSWORD' : 'sin cambios (la cuenta ya existía)'}
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
