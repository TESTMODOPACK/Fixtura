import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 8 — Trazabilidad de suspensiones y reprogramaciones.
 *
 * Agrega columnas a `partidos` y `fechas` para registrar quién, cuándo
 * y por qué se suspendió cada uno. El estado ya existía en ambas tablas
 * (SUSPENDIDO_FUERZA_MAYOR / SUSPENDIDA) — esto agrega contexto y
 * auditoría.
 *
 * Motivos enumerados:
 *   LLUVIA              → mal tiempo, escenario más común
 *   CANCHA_NO_DISPONIBLE → recinto cerrado / doble booking
 *   FUERZA_MAYOR        → caso fortuito (incidente seguridad, paro, etc)
 *   DECISION_LIGA       → orden de la liga (no jugar por X razón)
 *   OTRO                → otros casos, requiere observaciones
 */
export class Suspensiones1748370000000 implements MigrationInterface {
  name = 'Suspensiones1748370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Partidos ────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE partidos
        ADD COLUMN IF NOT EXISTS motivo_suspension VARCHAR(30)
          CHECK (motivo_suspension IS NULL OR motivo_suspension IN (
            'LLUVIA','CANCHA_NO_DISPONIBLE','FUERZA_MAYOR','DECISION_LIGA','OTRO'
          ))
    `);
    await queryRunner.query(
      `ALTER TABLE partidos ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE partidos ADD COLUMN IF NOT EXISTS suspendido_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE partidos ADD COLUMN IF NOT EXISTS observaciones_suspension TEXT`,
    );

    // ── Fechas ──────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE fechas
        ADD COLUMN IF NOT EXISTS motivo_suspension VARCHAR(30)
          CHECK (motivo_suspension IS NULL OR motivo_suspension IN (
            'LLUVIA','CANCHA_NO_DISPONIBLE','FUERZA_MAYOR','DECISION_LIGA','OTRO'
          ))
    `);
    await queryRunner.query(
      `ALTER TABLE fechas ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE fechas ADD COLUMN IF NOT EXISTS suspendido_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE fechas ADD COLUMN IF NOT EXISTS observaciones_suspension TEXT`,
    );

    // Index para queries del dashboard ("suspensiones activas")
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_suspendido ON partidos(estado, suspendido_at) WHERE estado IN ('SUSPENDIDO_FUERZA_MAYOR','REPROGRAMADO')`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_fechas_suspendida ON fechas(estado) WHERE estado IN ('SUSPENDIDA','REPROGRAMADA')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_partidos_suspendido`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fechas_suspendida`);
    for (const tbl of ['partidos', 'fechas']) {
      await queryRunner.query(`ALTER TABLE ${tbl} DROP COLUMN IF EXISTS observaciones_suspension`);
      await queryRunner.query(`ALTER TABLE ${tbl} DROP COLUMN IF EXISTS suspendido_by_user_id`);
      await queryRunner.query(`ALTER TABLE ${tbl} DROP COLUMN IF EXISTS suspendido_at`);
      await queryRunner.query(`ALTER TABLE ${tbl} DROP COLUMN IF EXISTS motivo_suspension`);
    }
  }
}
