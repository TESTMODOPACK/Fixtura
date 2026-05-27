import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 6A-v2: relacionar partidos con canchas (FK formal).
 *
 * Antes guardábamos `partidos.cancha_nombre` como string suelto. Con
 * `canchas` ya viviendo en su propia tabla, podemos hacer un FK opcional
 * a `canchas.id`. ON DELETE SET NULL: si una cancha se borra (soft delete
 * es `activa=false`, así que esto es raro), el partido queda sin cancha
 * asignada pero no se destruye.
 *
 * Backfill: matchear `partidos.cancha_nombre` (case-insensitive) contra
 * `canchas.nombre` del mismo tenant. Si no hay match, queda NULL (admin
 * resuelve manualmente).
 *
 * `cancha_nombre` se mantiene por backwards-compat hasta v3 — algunos
 * lugares todavía lo leen y el cleanup-orphans lo seguía creando.
 */
export class PartidosCanchaId1748330000000 implements MigrationInterface {
  name = 'PartidosCanchaId1748330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partidos
        ADD COLUMN IF NOT EXISTS cancha_id UUID
          REFERENCES canchas(id) ON DELETE SET NULL
    `);

    // Backfill: matchear por nombre dentro del mismo tenant.
    await queryRunner.query(`
      UPDATE partidos p
         SET cancha_id = c.id
        FROM canchas c
       WHERE p.tenant_id = c.tenant_id
         AND p.cancha_id IS NULL
         AND p.cancha_nombre IS NOT NULL
         AND LOWER(TRIM(p.cancha_nombre)) = LOWER(TRIM(c.nombre))
    `);

    // Index parcial: solo partidos con cancha asignada se buscan para
    // detectar choques.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_cancha_horario
         ON partidos(cancha_id, fecha_hora)
         WHERE cancha_id IS NOT NULL AND fecha_hora IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_partidos_cancha_horario`);
    await queryRunner.query(`ALTER TABLE partidos DROP COLUMN IF EXISTS cancha_id`);
  }
}
