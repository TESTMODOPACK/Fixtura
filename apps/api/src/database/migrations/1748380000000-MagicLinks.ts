import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 10 — Magic Links para onboarding de personal y futuros usos.
 *
 * Cuando se invita a un árbitro/planillero/paramédico al sistema, se
 * genera un token único enviado por email. El usuario hace click,
 * llega a /personal/activar?token=..., crea su password y queda
 * registrado.
 *
 * Diseño:
 *   - token_hash (no el token plano): sha256 del token enviado.
 *     Si la DB se filtra, no se pueden usar los links.
 *   - expires_at: TTL típico 72h.
 *   - used_at: una vez usado no se puede reutilizar (idempotencia).
 *   - personal_id / user_id pueden estar vinculados según el flujo.
 *   - email: redundante pero útil para mostrarlo en UI del link.
 *
 * Para password reset reutilizamos esta misma tabla con purpose='RESET_PASSWORD'.
 */
export class MagicLinks1748380000000 implements MigrationInterface {
  name = 'MagicLinks1748380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE magic_links (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
        purpose         VARCHAR(40) NOT NULL
                          CHECK (purpose IN (
                            'PERSONAL_ONBOARDING','RESET_PASSWORD','INVITE_USER'
                          )),
        token_hash      VARCHAR(128) NOT NULL UNIQUE,
        email           VARCHAR(150),
        personal_id     UUID REFERENCES personal(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        metadata        JSONB,
        expires_at      TIMESTAMPTZ NOT NULL,
        used_at         TIMESTAMPTZ,
        created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_magic_links_tenant ON magic_links(tenant_id) WHERE tenant_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_magic_links_personal ON magic_links(personal_id) WHERE personal_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_magic_links_email_unused ON magic_links(email) WHERE used_at IS NULL`,
    );
    // RLS opcional: estos tokens los usa el server con privilegios
    // elevados (al activar no hay contexto tenant). Política permite
    // tenant_id NULL o bypass.
    await queryRunner.query(`ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE magic_links FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON magic_links
        USING (
          tenant_id IS NULL
          OR tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
          tenant_id IS NULL
          OR tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS magic_links`);
  }
}
