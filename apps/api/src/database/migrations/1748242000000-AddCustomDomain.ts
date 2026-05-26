import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenancy por hostname.
 *
 * Cada tenant tiene un dominio propio (ej. liganunoa.cl). El backend lee
 * el header Host y mapea a tenant via custom_domain. fixtura.cl se reserva
 * para la zona de marketing (sin tenant).
 *
 * El campo `slug` se mantiene como identificador interno (audit logs,
 * URLs administrativas, debugging). Pero el routing público pasa por
 * custom_domain.
 */
export class AddCustomDomain1748242000000 implements MigrationInterface {
  name = 'AddCustomDomain1748242000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
      ADD COLUMN custom_domain VARCHAR(255) UNIQUE
    `);

    // Para dev / staging permitimos que un tenant aún no tenga dominio
    // (siempre se accede por IP del VPS). En producción el admin lo setea
    // al provisionar.
    await queryRunner.query(`
      CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain)
      WHERE custom_domain IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_custom_domain`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN custom_domain`);
  }
}
