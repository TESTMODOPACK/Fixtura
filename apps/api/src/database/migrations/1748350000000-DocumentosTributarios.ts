import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 7B — Tabla documentos_tributarios.
 *
 * Cada transacción APROBADA debe generar un documento tributario
 * (boleta o factura) ante el SII chileno. Esta tabla guarda el folio,
 * URLs del PDF y XML firmado, y el estado del trámite con el provider
 * (Open Factura / LibreDTE).
 *
 * Estados:
 *   PENDIENTE_EMISION → creado, esperando emisión
 *   EMITIDO           → SII aceptó, folio y URLs disponibles
 *   RECHAZADO_SII     → SII rechazó el documento (motivo en respuesta_sii)
 *   FALLIDO           → falló N veces, el admin debe intervenir
 *
 * El proceso es asíncrono: confirmarPago() devuelve OK al user
 * inmediatamente; un service separado dispara la emisión y un cron
 * reintenta los PENDIENTE_EMISION cada 30min.
 *
 * Retención legal: 6 años (Ley Chile). NO borrar nunca, archivar si es
 * necesario.
 */
export class DocumentosTributarios1748350000000 implements MigrationInterface {
  name = 'DocumentosTributarios1748350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE documentos_tributarios (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        transaccion_id      UUID REFERENCES transacciones(id) ON DELETE SET NULL,
        cobro_id            UUID REFERENCES cobros(id) ON DELETE SET NULL,
        tipo                VARCHAR(30) NOT NULL DEFAULT 'BOLETA'
                              CHECK (tipo IN ('BOLETA','FACTURA','NOTA_CREDITO','NOTA_DEBITO')),
        monto               INTEGER NOT NULL CHECK (monto >= 0),
        rut_receptor        VARCHAR(20),
        razon_social        VARCHAR(200),
        folio_sii           BIGINT,
        url_pdf             VARCHAR(500),
        url_xml             VARCHAR(500),
        estado              VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_EMISION'
                              CHECK (estado IN (
                                'PENDIENTE_EMISION','EMITIDO','RECHAZADO_SII','FALLIDO'
                              )),
        intentos            SMALLINT NOT NULL DEFAULT 0,
        respuesta_sii       JSONB,
        emitido_at          TIMESTAMPTZ,
        ultimo_error        TEXT,
        ultimo_intento_at   TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'documentos_tributarios');
    await queryRunner.query(
      `CREATE INDEX idx_doctrib_transaccion ON documentos_tributarios(transaccion_id) WHERE transaccion_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_doctrib_pendientes ON documentos_tributarios(estado, ultimo_intento_at) WHERE estado IN ('PENDIENTE_EMISION','RECHAZADO_SII')`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_doctrib_folio ON documentos_tributarios(folio_sii) WHERE folio_sii IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_doctrib_updated_at BEFORE UPDATE ON documentos_tributarios FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_doctrib_updated_at ON documentos_tributarios`);
    await queryRunner.query(`DROP TABLE IF EXISTS documentos_tributarios`);
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
