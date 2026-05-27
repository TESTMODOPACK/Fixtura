import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Designaciones de RECINTO: personal que cubre toda la jornada de una
 * cancha, no un partido específico. Típicamente paramédicos, utilería,
 * personal de seguridad.
 *
 * Diferencia con `designaciones` (que es por partido):
 *   - Esta tabla referencia una FECHA (no un partido).
 *   - Tiene campo `cancha_nombre` opcional para distinguir entre
 *     canchas cuando la liga juega en múltiples sedes el mismo día.
 *   - El catálogo de personal puede incluir paramédicos que NO son
 *     elegibles para partido pero sí para recinto.
 */
export class DesignacionesRecinto1748290000000 implements MigrationInterface {
  name = 'DesignacionesRecinto1748290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE designaciones_recinto (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        fecha_id            UUID NOT NULL REFERENCES fechas(id) ON DELETE CASCADE,
        personal_id         UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
        rol_asignado        VARCHAR(30) NOT NULL
                              CHECK (rol_asignado IN ('PARAMEDICO','OTRO')),
        cancha_nombre       VARCHAR(100),
        estado              VARCHAR(20) NOT NULL DEFAULT 'PROPUESTA'
                              CHECK (estado IN (
                                'PROPUESTA','CONFIRMADA','RECHAZADA',
                                'ASISTIO','AUSENTE'
                              )),
        monto_pago          INTEGER,
        confirmado_at       TIMESTAMPTZ,
        notas               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (fecha_id, personal_id, rol_asignado, cancha_nombre)
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'designaciones_recinto');
    await queryRunner.query(
      `CREATE INDEX idx_designaciones_recinto_fecha ON designaciones_recinto(fecha_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_designaciones_recinto_personal ON designaciones_recinto(personal_id)`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_designaciones_recinto_updated_at BEFORE UPDATE ON designaciones_recinto FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_designaciones_recinto_updated_at ON designaciones_recinto`);
    await queryRunner.query(`DROP TABLE IF EXISTS designaciones_recinto`);
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
