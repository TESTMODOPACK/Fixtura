import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla cobros: registro financiero MVP.
 *
 * Modelo simple v1: una fila por concepto cobrable (inscripción, multa,
 * cuota mensual, alquiler de cancha). Asociada opcionalmente a un equipo
 * (cuando el cobro va a un club específico) o sin equipo (cobros varios).
 *
 * Estados implícitos por campos:
 *   - pendiente:   pagado_at IS NULL && vencimiento >= hoy
 *   - vencido:     pagado_at IS NULL && vencimiento < hoy
 *   - pagado:      pagado_at IS NOT NULL
 *   - cancelado:   cancelado = TRUE (cobro inválido, no se debe)
 *
 * Sin integración a pasarela de pago todavía — el pago se marca a mano
 * cuando el admin recibe el comprobante. Webpay/MercadoPago en sprint
 * posterior.
 */
export class Cobros1748320000000 implements MigrationInterface {
  name = 'Cobros1748320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE cobros (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        equipo_id       UUID REFERENCES equipos(id) ON DELETE SET NULL,
        concepto        VARCHAR(200) NOT NULL,
        categoria       VARCHAR(30) NOT NULL DEFAULT 'CUOTA'
                          CHECK (categoria IN (
                            'INSCRIPCION','CUOTA','MULTA','ALQUILER_CANCHA',
                            'ARBITRAJE','OTRO'
                          )),
        monto           INTEGER NOT NULL CHECK (monto >= 0),
        vencimiento     DATE,
        pagado_at       TIMESTAMPTZ,
        pagado_metodo   VARCHAR(30)
                          CHECK (pagado_metodo IS NULL OR pagado_metodo IN (
                            'EFECTIVO','TRANSFERENCIA','WEBPAY','MERCADOPAGO','OTRO'
                          )),
        pagado_referencia VARCHAR(150),
        cancelado       BOOLEAN NOT NULL DEFAULT FALSE,
        notas           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'cobros');
    await queryRunner.query(`CREATE INDEX idx_cobros_equipo ON cobros(equipo_id) WHERE equipo_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_cobros_pendientes ON cobros(vencimiento) WHERE pagado_at IS NULL AND cancelado = FALSE`);
    await queryRunner.query(
      `CREATE TRIGGER trg_cobros_updated_at BEFORE UPDATE ON cobros FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_cobros_updated_at ON cobros`);
    await queryRunner.query(`DROP TABLE IF EXISTS cobros`);
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
