import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUDIT-7: índices faltantes detectados en auditoría.
 *
 *   - partidos(fecha_id, estado): acelera el JOIN del getTabla() que
 *     filtra por fecha + estado IN ('FINALIZADO','WALKOVER').
 *   - partidos(estado, fecha_id) WHERE estado IN ('FINALIZADO','WALKOVER'):
 *     index parcial específico para tabla pública (lecturas masivas
 *     desde el portal).
 *   - sanciones_activas(torneo_id, rut, cumplida): historial por RUT
 *     en torneo (consulta al cargar jugador bloqueado).
 *
 * Todos son IF NOT EXISTS — idempotentes vs cleanup-orphans.
 */
export class PerformanceIndexes1748420000000 implements MigrationInterface {
  name = 'PerformanceIndexes1748420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_fecha_estado
         ON partidos(fecha_id, estado)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_tabla
         ON partidos(estado, fecha_id)
         WHERE estado IN ('FINALIZADO','WALKOVER')`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_sanciones_rut_torneo
         ON sanciones_activas(torneo_id, rut, cumplida)
         WHERE rut IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_partidos_fecha_estado`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_partidos_tabla`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sanciones_rut_torneo`);
  }
}
