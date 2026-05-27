import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flag por tenant: ¿esta liga está afiliada a ANFA y por lo tanto exige
 * carnet ANFA vigente a sus árbitros?
 *
 * Default FALSE — la mayoría de las ligas amateur en Chile son LIBRES
 * (corporativas, barriales, sénior) y no requieren carnet ANFA. Solo
 * las ligas federadas a ANFA (Asociación Nacional de Fútbol Amateur)
 * tienen esa obligación.
 *
 * Si está TRUE:
 *   - Auto-asignación excluye árbitros con carnet vencido.
 *   - Dashboard muestra alerta de carnet vencido / por vencer.
 *   - UI marca warning rojo en árbitros sin carnet o con carnet vencido.
 *
 * Si está FALSE:
 *   - El campo carnet sigue disponible (algunas ligas igual lo registran),
 *     pero no bloquea ni genera alertas.
 */
export class RequiereCarnetAnfa1748300000000 implements MigrationInterface {
  name = 'RequiereCarnetAnfa1748300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS requiere_carnet_anfa BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS requiere_carnet_anfa`);
  }
}
