/**
 * Seed de prueba: crea (o actualiza) un usuario DELEGADO_EQUIPO con
 * contraseña conocida y lo vincula a un club, para poder probar el portal
 * del delegado sin pasar por el flujo de invitación por email.
 *
 * Uso (en el contenedor api, tras deployar):
 *   docker compose exec \
 *     -e DELEGADO_EMAIL=delegado@demo.cl \
 *     -e DELEGADO_PASSWORD=Delegado123 \
 *     api node dist/database/seed-delegado.js
 *
 * Variables opcionales:
 *   DELEGADO_EMAIL     (default delegado@demo.cl)
 *   DELEGADO_PASSWORD  (default Delegado123)
 *   CLUB_ID            (si no se pasa, toma el primer club ACTIVO)
 *
 * NO es para producción real — es una utilidad de QA. La cuenta queda
 * con login normal (email + password) y rol DELEGADO_EQUIPO scope TEAM.
 */
import { hash } from 'bcrypt';

import AppDataSource from './datasource';

async function main(): Promise<void> {
  const email = (process.env.DELEGADO_EMAIL ?? 'delegado@demo.cl').toLowerCase();
  const password = process.env.DELEGADO_PASSWORD ?? 'Delegado123';
  const clubIdEnv = process.env.CLUB_ID ?? null;

  await AppDataSource.initialize();
  try {
    await AppDataSource.query('BEGIN');
    // Bypass RLS (modo sistema) para poder leer clubes/users de cualquier tenant.
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    // 1. Elegir el club (el indicado o el primero activo).
    const clubRows = (await AppDataSource.query(
      clubIdEnv
        ? `SELECT id, tenant_id, nombre FROM clubes WHERE id = $1 LIMIT 1`
        : `SELECT id, tenant_id, nombre FROM clubes WHERE estado = 'ACTIVO' ORDER BY created_at ASC LIMIT 1`,
      clubIdEnv ? [clubIdEnv] : [],
    )) as Array<{ id: string; tenant_id: string; nombre: string }>;

    if (clubRows.length === 0) {
      throw new Error(
        clubIdEnv
          ? `No existe el club ${clubIdEnv}.`
          : 'No hay clubes ACTIVOS en la base. Crea un club primero.',
      );
    }
    const club = clubRows[0]!;

    // 2. Upsert del usuario con la contraseña dada.
    const passwordHash = await hash(password, 12);
    const existing = (await AppDataSource.query(`SELECT id FROM users WHERE email = $1`, [
      email,
    ])) as Array<{ id: string }>;

    let userId: string;
    if (existing.length > 0) {
      userId = existing[0]!.id;
      await AppDataSource.query(
        `UPDATE users SET password_hash = $1, is_active = true WHERE id = $2`,
        [passwordHash, userId],
      );
    } else {
      const ins = (await AppDataSource.query(
        `INSERT INTO users (email, password_hash, nombre, apellido, idioma_pref, is_active)
         VALUES ($1, $2, 'Delegado', 'Demo', 'es', true) RETURNING id`,
        [email, passwordHash],
      )) as Array<{ id: string }>;
      userId = ins[0]!.id;
    }

    // 3. Rol DELEGADO_EQUIPO scope TEAM scopeId=clubId, tenant del club.
    await AppDataSource.query(
      `INSERT INTO user_roles (tenant_id, user_id, role, scope_type, scope_id)
       VALUES ($1, $2, 'DELEGADO_EQUIPO', 'TEAM', $3)
       ON CONFLICT (user_id, role, scope_type, scope_id)
       DO UPDATE SET revoked_at = NULL`,
      [club.tenant_id, userId, club.id],
    );

    await AppDataSource.query('COMMIT');

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '✅ Delegado de prueba listo.',
        `   Club:     ${club.nombre} (${club.id})`,
        `   Email:    ${email}`,
        `   Password: ${password}`,
        '',
        '   Inicia sesión con ese email/clave y deberías aterrizar en /club.',
        '',
      ].join('\n'),
    );
  } catch (err) {
    await AppDataSource.query('ROLLBACK');
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed delegado falló:', err);
  process.exit(1);
});
