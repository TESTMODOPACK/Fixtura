import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla sponsors: banners del cliente que aparecen en el portal público.
 *
 * Posiciones soportadas:
 *   - HOME_HERO: dentro del hero principal de la home pública.
 *   - HEADER: banner en el header de todas las páginas públicas.
 *   - SIDEBAR: barra lateral (en páginas con layout 2 columnas).
 *   - FOOTER: pie de página.
 *
 * Vigencia: combina activo (toggle manual) con vigente_desde/hasta
 * (fechas opcionales). El endpoint público filtra por ambos.
 *
 * Tracking básico: impresiones_count y clicks_count se incrementan
 * desde endpoints específicos. Para v1 quedan en 0; se activan cuando
 * agregamos los endpoints de tracking público (Sprint posterior).
 */
export class Sponsors1748280000000 implements MigrationInterface {
  name = 'Sponsors1748280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sponsors (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        nombre              VARCHAR(150) NOT NULL,
        imagen_url          VARCHAR(500) NOT NULL,
        link_url            VARCHAR(500),
        posicion            VARCHAR(20) NOT NULL
                              CHECK (posicion IN ('HOME_HERO','HEADER','SIDEBAR','FOOTER')),
        prioridad           SMALLINT NOT NULL DEFAULT 0,
        vigente_desde       DATE,
        vigente_hasta       DATE,
        activo              BOOLEAN NOT NULL DEFAULT TRUE,
        impresiones_count   INTEGER NOT NULL DEFAULT 0,
        clicks_count        INTEGER NOT NULL DEFAULT 0,
        notas               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'sponsors');
    await queryRunner.query(`CREATE INDEX idx_sponsors_posicion ON sponsors(posicion)`);
    await queryRunner.query(
      `CREATE INDEX idx_sponsors_activos ON sponsors(activo) WHERE activo = TRUE`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_sponsors_updated_at BEFORE UPDATE ON sponsors FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_sponsors_updated_at ON sponsors`);
    await queryRunner.query(`DROP TABLE IF EXISTS sponsors`);
  }

  private async applyRlsAndIndex(queryRunner: QueryRunner, table: string): Promise<void> {
    await queryRunner.query(`CREATE INDEX idx_${table}_tenant ON ${table}(tenant_id)`);
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON ${table}
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
          tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
    `);
  }
}
