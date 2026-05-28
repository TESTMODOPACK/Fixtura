import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 12 — Tiebreakers configurables por torneo (B-06).
 *
 * Agrega columna JSONB `tabla_tiebreakers` a torneos con el orden de
 * criterios para desempate. Default: ["pts","dg","gf","nombre"].
 *
 * Criterios soportados (string keys):
 *   pts     → puntos totales (siempre primero — no es opcional)
 *   dg      → diferencia de gol (gf - gc)
 *   gf      → goles a favor
 *   gc      → goles en contra (ASC, menos goles = mejor)
 *   pg      → partidos ganados
 *   ed      → enfrentamiento directo entre los equipos empatados (v3)
 *   nombre  → orden alfabético (último recurso, determinístico)
 *
 * "ed" no se implementa todavía (requiere grafo de partidos cabeza-
 * a-cabeza) — está en el enum para forward-compat.
 */
export class TorneosTiebreakers1748390000000 implements MigrationInterface {
  name = 'TorneosTiebreakers1748390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS tabla_tiebreakers JSONB
          NOT NULL DEFAULT '["pts","dg","gf","nombre"]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE torneos DROP COLUMN IF EXISTS tabla_tiebreakers`,
    );
  }
}
