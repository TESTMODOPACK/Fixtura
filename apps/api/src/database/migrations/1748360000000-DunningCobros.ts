import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 7C — Dunning (cobranza automática).
 *
 * Agrega 3 columnas a `cobros` para soportar el flujo escalonado:
 *
 *   estado_dunning           AL_DIA / MOROSO / SUSPENDIDO
 *   dunning_avisos_enviados  contador de emails que ya se enviaron
 *   dunning_ultimo_aviso_at  timestamp del último email para throttling
 *
 * El cron diario `DunningCron` recalcula `estado_dunning` para cobros
 * pendientes en base al vencimiento:
 *   - vencimiento >= hoy             → AL_DIA
 *   - vencimiento < hoy y < 30 días  → MOROSO
 *   - vencimiento < hoy - 30 días    → SUSPENDIDO
 *
 * Las cuotas pagadas o canceladas se ignoran (estado_dunning solo es
 * relevante para PENDIENTE/VENCIDO).
 */
export class DunningCobros1748360000000 implements MigrationInterface {
  name = 'DunningCobros1748360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cobros
        ADD COLUMN IF NOT EXISTS estado_dunning VARCHAR(20)
          NOT NULL DEFAULT 'AL_DIA'
          CHECK (estado_dunning IN ('AL_DIA','MOROSO','SUSPENDIDO'))
    `);
    await queryRunner.query(`
      ALTER TABLE cobros
        ADD COLUMN IF NOT EXISTS dunning_avisos_enviados SMALLINT NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE cobros
        ADD COLUMN IF NOT EXISTS dunning_ultimo_aviso_at TIMESTAMPTZ
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cobros_dunning ON cobros(estado_dunning) WHERE estado_dunning <> 'AL_DIA'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cobros_dunning`);
    await queryRunner.query(`ALTER TABLE cobros DROP COLUMN IF EXISTS dunning_ultimo_aviso_at`);
    await queryRunner.query(`ALTER TABLE cobros DROP COLUMN IF EXISTS dunning_avisos_enviados`);
    await queryRunner.query(`ALTER TABLE cobros DROP COLUMN IF EXISTS estado_dunning`);
  }
}
