import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla canchas: catálogo físico de espacios donde se juega.
 *
 * Por ahora `partidos.cancha_nombre` sigue siendo string libre — esta
 * tabla es paralela y opcional. En sprint posterior se enlazará
 * partido.cancha_id → canchas.id para validar disponibilidad cruzada y
 * detectar choques de horario en la misma cancha.
 */
export class Canchas1748310000000 implements MigrationInterface {
  name = 'Canchas1748310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE canchas (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        nombre          VARCHAR(150) NOT NULL,
        direccion       VARCHAR(500),
        lat             NUMERIC(10, 7),
        lng             NUMERIC(10, 7),
        capacidad       INTEGER,
        superficie      VARCHAR(30) NOT NULL DEFAULT 'PASTO_NATURAL'
                          CHECK (superficie IN (
                            'PASTO_NATURAL','PASTO_SINTETICO','CEMENTO','TIERRA','OTRA'
                          )),
        iluminacion     BOOLEAN NOT NULL DEFAULT FALSE,
        tiene_camarines BOOLEAN NOT NULL DEFAULT FALSE,
        observaciones   TEXT,
        activa          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'canchas');
    await queryRunner.query(
      `CREATE INDEX idx_canchas_activa ON canchas(activa) WHERE activa = TRUE`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_canchas_updated_at BEFORE UPDATE ON canchas FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_canchas_updated_at ON canchas`);
    await queryRunner.query(`DROP TABLE IF EXISTS canchas`);
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
