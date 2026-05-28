import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 14 — Tabla de suscripciones push (FCM Web Push).
 *
 * Cada usuario puede suscribirse desde múltiples dispositivos (mismo
 * user, distintos endpoints — uno por browser). Cuando el acta de un
 * partido se cierra, el sistema busca subscriptions relacionadas y
 * dispara push.
 *
 * El "scope" determina a quién va el push:
 *   PARTIDO  → notif del partido X (delegados, jugadores, hinchas)
 *   EQUIPO   → notif del equipo X (hinchas de un club)
 *   TORNEO   → notif del torneo (admins, observadores)
 *
 * Se guarda el endpoint, claves p256dh/auth (Web Push API estándar)
 * y el provider (mock o FCM).
 */
export class PushSubscriptions1748400000000 implements MigrationInterface {
  name = 'PushSubscriptions1748400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE push_subscriptions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
        user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
        scope_type    VARCHAR(20) NOT NULL
                        CHECK (scope_type IN ('PARTIDO','EQUIPO','TORNEO','GLOBAL')),
        scope_id      UUID,
        provider      VARCHAR(20) NOT NULL DEFAULT 'MOCK'
                        CHECK (provider IN ('MOCK','FCM','WEBPUSH')),
        endpoint      TEXT NOT NULL,
        p256dh        TEXT,
        auth          TEXT,
        user_agent    VARCHAR(300),
        last_used_at  TIMESTAMPTZ,
        revoked_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_push_endpoint_unique ON push_subscriptions(endpoint) WHERE revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_push_scope ON push_subscriptions(scope_type, scope_id) WHERE revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_push_user ON push_subscriptions(user_id) WHERE user_id IS NOT NULL AND revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_push_tenant ON push_subscriptions(tenant_id) WHERE tenant_id IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON push_subscriptions
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
    await queryRunner.query(`DROP TABLE IF EXISTS push_subscriptions`);
  }
}
