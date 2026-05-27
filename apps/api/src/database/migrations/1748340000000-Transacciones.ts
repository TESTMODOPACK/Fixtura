import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 7A — Tabla transacciones: registro inmutable de intentos de pago.
 *
 * Una `transaccion` representa UN intento de pagar UN cobro a través de
 * una pasarela. Si Webpay rechaza, queda como RECHAZADO; si el usuario no
 * vuelve, EXPIRADO. Si aprueba, APROBADO y se sincroniza el `cobro`.
 *
 * `idempotency_key` UNIQUE protege contra dobles clicks del usuario o
 * reintentos del webhook: si llega dos veces la misma key, solo el primer
 * INSERT pasa.
 *
 * `respuesta_pasarela JSONB` guarda el payload completo recibido del
 * provider (Transbank) para auditoría — útil para resolver disputas y
 * verificar firmas a futuro.
 */
export class Transacciones1748340000000 implements MigrationInterface {
  name = 'Transacciones1748340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transacciones (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        cobro_id            UUID REFERENCES cobros(id) ON DELETE SET NULL,
        monto               INTEGER NOT NULL CHECK (monto >= 0),
        pasarela            VARCHAR(30) NOT NULL
                              CHECK (pasarela IN (
                                'WEBPAY','MERCADOPAGO','MACH','MOCK'
                              )),
        estado              VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
                              CHECK (estado IN (
                                'PENDIENTE','PAGO_EN_TRANSITO','APROBADO',
                                'EXPIRADO','REVERSADO','RECHAZADO'
                              )),
        idempotency_key     VARCHAR(150) NOT NULL UNIQUE,
        token_pasarela      VARCHAR(200),
        url_redireccion     VARCHAR(500),
        respuesta_pasarela  JSONB,
        user_pagador_id     UUID REFERENCES users(id) ON DELETE SET NULL,
        pagado_at           TIMESTAMPTZ,
        expira_at           TIMESTAMPTZ NOT NULL,
        notas               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'transacciones');
    await queryRunner.query(
      `CREATE INDEX idx_transacciones_cobro ON transacciones(cobro_id) WHERE cobro_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transacciones_estado ON transacciones(estado, expira_at) WHERE estado IN ('PENDIENTE','PAGO_EN_TRANSITO')`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transacciones_token ON transacciones(token_pasarela) WHERE token_pasarela IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_transacciones_updated_at BEFORE UPDATE ON transacciones FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_transacciones_updated_at ON transacciones`);
    await queryRunner.query(`DROP TABLE IF EXISTS transacciones`);
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
