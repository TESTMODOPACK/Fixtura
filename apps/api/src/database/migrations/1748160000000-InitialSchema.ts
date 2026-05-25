import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración inicial — Fase 0.
 *
 * Crea las tablas mínimas de identidad y la primera tabla tenant-scoped
 * con RLS habilitado (FORCE) para probar el patrón end-to-end:
 *
 *   - tenants               (sin RLS — tabla de plataforma)
 *   - users                 (sin RLS — login global)
 *   - user_roles            (con RLS — pivot)
 *   - refresh_tokens        (con RLS)
 *   - magic_links           (sin RLS — el lookup va por token; el rol se grant al consumir)
 *   - audit_logs            (con RLS, tenant nullable para acciones de plataforma)
 */
export class InitialSchema1748160000000 implements MigrationInterface {
  name = 'InitialSchema1748160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ─── tenants ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tenants (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug          VARCHAR(50) NOT NULL UNIQUE,
        nombre        VARCHAR(200) NOT NULL,
        tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('LIGA','RECINTO','FEDERACION')),
        plan          VARCHAR(20) NOT NULL DEFAULT 'STARTER'
                        CHECK (plan IN ('STARTER','GROWTH','PRO','ENTERPRISE')),
        branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_tenants_slug ON tenants(slug)`);

    // ─── users ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(255) NOT NULL UNIQUE,
        rut             VARCHAR(20),
        password_hash   VARCHAR(255),
        nombre          VARCHAR(100) NOT NULL,
        apellido        VARCHAR(100) NOT NULL,
        foto_url        VARCHAR(500),
        idioma_pref     VARCHAR(5) NOT NULL DEFAULT 'es',
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_users_email ON users(email)`);
    await queryRunner.query(`CREATE INDEX idx_users_rut ON users(rut) WHERE rut IS NOT NULL`);

    // ─── user_roles (pivot tenant-scoped con RLS) ─────────────────────
    await queryRunner.query(`
      CREATE TABLE user_roles (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role        VARCHAR(50) NOT NULL,
        scope_type  VARCHAR(20) NOT NULL CHECK (scope_type IN ('PLATFORM','TENANT','TEAM','PERSONAL')),
        scope_id    UUID,
        granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        granted_by  UUID REFERENCES users(id),
        revoked_at  TIMESTAMPTZ,
        UNIQUE (user_id, role, scope_type, scope_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_user_roles_user ON user_roles(user_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id) WHERE tenant_id IS NOT NULL`,
    );

    // RLS en user_roles. SUPER_ADMIN (PLATFORM scope) hace bypass con
    // app.current_tenant_id = '' (string vacío).
    await queryRunner.query(`ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE user_roles FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON user_roles
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

    // ─── refresh_tokens (tenant-scoped via tenant del user, pero
    //     dejamos sin tenant_id porque un user puede tener múltiples
    //     tenants. La sesión se valida por user_id+token_hash.) ──────────
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash   VARCHAR(255) NOT NULL,
        user_agent   TEXT,
        ip_address   INET,
        expires_at   TIMESTAMPTZ NOT NULL,
        revoked_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, token_hash)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_refresh_tokens_user_active ON refresh_tokens(user_id) WHERE revoked_at IS NULL`,
    );

    // ─── magic_links (onboarding personal RF-04b) ─────────────────────
    await queryRunner.query(`
      CREATE TABLE magic_links (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
        email           VARCHAR(255),
        phone           VARCHAR(30),
        token_hash      VARCHAR(255) NOT NULL UNIQUE,
        role_to_grant   VARCHAR(50) NOT NULL,
        scope_id        UUID,
        metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
        expires_at      TIMESTAMPTZ NOT NULL,
        consumed_at     TIMESTAMPTZ,
        created_by      UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_magic_links_token ON magic_links(token_hash)`);

    // ─── audit_logs ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
        user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
        action       VARCHAR(100) NOT NULL,
        entity_type  VARCHAR(50),
        entity_id    UUID,
        before_data  JSONB,
        after_data   JSONB,
        ip_address   INET,
        user_agent   TEXT,
        metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC)`,
    );
    await queryRunner.query(`CREATE INDEX idx_audit_logs_action ON audit_logs(action)`);

    await queryRunner.query(`ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON audit_logs
        USING (
          tenant_id IS NULL
          OR tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
    `);

    // ─── Función trigger para updated_at ──────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of ['tenants', 'users']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION set_updated_at()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_users_updated_at ON users`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS magic_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenants`);
  }
}
