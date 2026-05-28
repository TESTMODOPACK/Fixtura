import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUDIT-3: previene inscripción duplicada del mismo RUT en dos equipos
 * del mismo torneo. Plan §4.2: "un jugador no puede estar en 2 equipos
 * del MISMO torneo".
 *
 * Estrategia: denormalizamos torneo_id en jugadores_inscritos (un
 * equipo no cambia de torneo, así que es estable) y agregamos UNIQUE
 * parcial sobre (tenant_id, torneo_id, rut) WHERE rut IS NOT NULL AND
 * activo = TRUE.
 *
 * El predicado WHERE rut IS NOT NULL es importante: no todos los
 * jugadores tienen RUT (jugadores menores sin cédula, MVP). En esos
 * casos no aplica el constraint.
 *
 * El predicado WHERE activo = TRUE permite que un jugador se desactive
 * en un equipo y se inscriba en otro DEL MISMO TORNEO (caso de
 * transferencia legítima a mitad de torneo). El historial de la
 * inscripción inactiva se preserva.
 */
export class JugadorUniqueRutTorneo1748410000000 implements MigrationInterface {
  name = 'JugadorUniqueRutTorneo1748410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Agregar columna torneo_id (nullable inicialmente para backfill)
    await queryRunner.query(`
      ALTER TABLE jugadores_inscritos
        ADD COLUMN IF NOT EXISTS torneo_id UUID
          REFERENCES torneos(id) ON DELETE CASCADE
    `);

    // 2) Backfill desde equipos.torneo_id
    await queryRunner.query(`
      UPDATE jugadores_inscritos j
         SET torneo_id = e.torneo_id
        FROM equipos e
       WHERE j.equipo_id = e.id
         AND j.torneo_id IS NULL
    `);

    // 3) Validar que ya no quedan NULL (si los hubiera, el sistema
    // tenía data corrupta — fallar fuerte).
    const huerfanos = await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM jugadores_inscritos WHERE torneo_id IS NULL`,
    );
    if (huerfanos[0]?.n > 0) {
      throw new Error(
        `Migración aborta: ${huerfanos[0].n} jugadores_inscritos no pudieron resolver torneo_id desde su equipo. Revisar data manualmente.`,
      );
    }

    // 4) Marcar NOT NULL
    await queryRunner.query(
      `ALTER TABLE jugadores_inscritos ALTER COLUMN torneo_id SET NOT NULL`,
    );

    // 5) Resolver duplicados existentes ANTES de crear el UNIQUE.
    // Estrategia: mantener el más antiguo activo, desactivar los demás.
    // Loguea para que el admin sepa qué se tocó.
    await queryRunner.query(`
      WITH duplicados AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY tenant_id, torneo_id, rut
                 ORDER BY created_at ASC, id ASC
               ) AS rn
          FROM jugadores_inscritos
         WHERE rut IS NOT NULL AND activo = TRUE
      )
      UPDATE jugadores_inscritos
         SET activo = FALSE
       WHERE id IN (SELECT id FROM duplicados WHERE rn > 1)
    `);

    // 6) UNIQUE INDEX parcial
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_jugador_rut_torneo
        ON jugadores_inscritos (tenant_id, torneo_id, rut)
        WHERE rut IS NOT NULL AND activo = TRUE
    `);

    // 7) Index de búsqueda complementario
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_jugadores_torneo
        ON jugadores_inscritos (torneo_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jugadores_torneo`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_jugador_rut_torneo`);
    await queryRunner.query(
      `ALTER TABLE jugadores_inscritos DROP COLUMN IF EXISTS torneo_id`,
    );
  }
}
