import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema de operaciones (Sprint 2E):
 *
 *  - `personal`: catálogo de árbitros, planilleros, paramédicos y
 *    cualquier otro perfil operativo de la liga. user_id es nullable
 *    porque muchos están dados de alta sin cuenta (importados desde
 *    planilla del responsable de designaciones).
 *
 *  - `designaciones`: relación N:N partido × personal con un rol
 *    específico. Un partido puede tener 1 árbitro principal, 2
 *    asistentes, 1 planillero, 1 paramédico, etc. Estado refleja el
 *    ciclo PROPUESTA → CONFIRMADA → ASISTIO/AUSENTE.
 *
 * Ambas tablas son tenant-scoped con RLS FORCE.
 */
export class PersonalDesignaciones1748260000000 implements MigrationInterface {
  name = 'PersonalDesignaciones1748260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── personal ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE personal (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
        nombre              VARCHAR(100) NOT NULL,
        apellido            VARCHAR(100) NOT NULL,
        rut                 VARCHAR(20),
        rol                 VARCHAR(30) NOT NULL
                              CHECK (rol IN (
                                'ARBITRO_PRINCIPAL','ARBITRO_ASISTENTE',
                                'PLANILLERO','PARAMEDICO','OTRO'
                              )),
        telefono            VARCHAR(30),
        email               VARCHAR(150),
        tarifa_base         INTEGER,
        carnet_anfa_numero  VARCHAR(50),
        carnet_anfa_vence   DATE,
        activo              BOOLEAN NOT NULL DEFAULT TRUE,
        notas               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'personal');
    await queryRunner.query(`CREATE INDEX idx_personal_rol ON personal(rol)`);
    await queryRunner.query(
      `CREATE INDEX idx_personal_activo ON personal(activo) WHERE activo = TRUE`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_personal_rut ON personal(rut) WHERE rut IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_personal_updated_at BEFORE UPDATE ON personal FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );

    // ─── designaciones ────────────────────────────────────────────────
    // Una persona puede tener varias asignaciones en partidos distintos.
    // UNIQUE (partido_id, personal_id, rol_asignado) evita duplicar la
    // misma asignación. Sin embargo no impedimos a nivel DB que la misma
    // persona tenga dos roles en el mismo partido (ej. ARBITRO_PRINCIPAL
    // y luego también PLANILLERO si la liga es chica) — el conflicto se
    // detecta en service y se muestra como warning, pero no se bloquea.
    await queryRunner.query(`
      CREATE TABLE designaciones (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        partido_id          UUID NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
        personal_id         UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
        rol_asignado        VARCHAR(30) NOT NULL
                              CHECK (rol_asignado IN (
                                'ARBITRO_PRINCIPAL','ARBITRO_ASISTENTE',
                                'PLANILLERO','PARAMEDICO','OTRO'
                              )),
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
        UNIQUE (partido_id, personal_id, rol_asignado)
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'designaciones');
    await queryRunner.query(
      `CREATE INDEX idx_designaciones_partido ON designaciones(partido_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_designaciones_personal ON designaciones(personal_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_designaciones_estado ON designaciones(estado)`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_designaciones_updated_at BEFORE UPDATE ON designaciones FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_designaciones_updated_at ON designaciones`);
    await queryRunner.query(`DROP TABLE IF EXISTS designaciones`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_personal_updated_at ON personal`);
    await queryRunner.query(`DROP TABLE IF EXISTS personal`);
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
