/**
 * Script idempotente que corre ANTES de `node dist/main` en cada arranque
 * del API (ver `start:prod` en package.json).
 *
 * Responsabilidades:
 *   1. Asegurar usuario de aplicación NON-superuser (`fixtura_app`).
 *   2. Aplicar cambios aditivos seguros que no justifican una migración
 *      formal: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
 *      CREATE EXTENSION, etc.
 *   3. NO borra datos. Cualquier DROP/DELETE/TRUNCATE va en migración
 *      formal con down().
 *
 * Patrón heredado de Eva360 (`apps/api/src/database/cleanup-orphans.ts`).
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main(): Promise<void> {
  const log = (msg: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[cleanup-orphans] ${msg}`);
  };

  const dbUser = process.env.DB_USER ?? 'fixtura';
  const dbPassword = process.env.DB_PASSWORD ?? 'fixtura';
  const dbHost = process.env.DB_HOST ?? 'localhost';
  const dbPort = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? 'fixtura';

  // Conectamos como el usuario superuser para poder ejecutar DDL y crear el
  // usuario de app si no existe.
  const url =
    process.env.DATABASE_URL_SUPERUSER ??
    `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  // ─── Skip explícito ──────────────────────────────────────────────────
  // En dev local con Postgres nativo solemos usar un solo rol (el dueño
  // de la DB) tanto para migrations como para runtime. En ese caso no hay
  // necesidad de crear `fixtura_app` separado — y el CREATE ROLE puede
  // fallar si el usuario no tiene CREATEROLE.
  // En prod, sí queremos el rol separado (FORCE RLS muerde sobre dueños),
  // y este script corre antes de `node dist/main`.
  if (process.env.SKIP_CLEANUP_ORPHANS === 'true') {
    log('SKIP_CLEANUP_ORPHANS=true — saltando.');
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  log('Connected to PostgreSQL');

  try {
    // ─── Extensiones requeridas ─────────────────────────────────────────
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    log('Extensions ensured (pgcrypto, uuid-ossp)');

    // ─── Usuario de aplicación NON-superuser ────────────────────────────
    // Solo intentamos crearlo si está configurado distinto al user dueño
    // de la DB. Si DB_APP_USER == DB_USER, no hay separación → no crear.
    const appUser = process.env.DB_APP_USER;
    const appPassword = process.env.DB_APP_PASSWORD;
    const dbOwnerUser = process.env.DB_USER;

    if (appUser && appPassword && appUser !== dbOwnerUser) {
      const exists = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [appUser],
      );
      if (exists.rowCount === 0) {
        const safeUser = appUser.replace(/"/g, '""');
        const safePass = appPassword.replace(/'/g, "''");
        try {
          await client.query(
            `CREATE ROLE "${safeUser}" LOGIN PASSWORD '${safePass}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
          );
          await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${safeUser}"`);
          await client.query(`GRANT USAGE ON SCHEMA public TO "${safeUser}"`);
          await client.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${safeUser}"`,
          );
          await client.query(
            `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${safeUser}"`,
          );
          await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${safeUser}"`,
          );
          await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${safeUser}"`,
          );
          log(`App user "${appUser}" created and granted permissions`);
        } catch (err) {
          log(`WARN: no pude crear "${appUser}": ${(err as Error).message}. Continuo.`);
        }
      } else {
        log(`App user "${appUser}" already exists`);
      }
    } else {
      log('DB_APP_USER no separado (dev local). Salteando creación de rol app.');
    }

    // ─── Hooks para cambios aditivos futuros ─────────────────────────────
    // Cuando agreguemos tablas y columnas en sprints posteriores, este es
    // el lugar para ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
    // ALTER TYPE ... ADD VALUE IF NOT EXISTS, etc.

    // Sprint 2E: backfill seguro de tablas de operaciones por si el entorno
    // no aplicó la migration formal todavía. Idempotente: usa IF NOT EXISTS
    // tanto en tablas como en índices y triggers.
    await ensurePersonalDesignacionesTables(client, log);

    // Sprint 4B: tabla sponsors (banners portal público).
    await ensureSponsorsTable(client, log);

    // Sprint 2E.x: designaciones de RECINTO (paramédicos por jornada).
    await ensureDesignacionesRecintoTable(client, log);

    // Sprint ANFA: flag por tenant para exigir carnet ANFA a árbitros.
    await client.query(
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS requiere_carnet_anfa BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    log('tenants.requiere_carnet_anfa asegurada.');

    // Sprint 6: tabla canchas.
    await ensureCanchasTable(client, log);

    // Sprint 6B: tabla cobros (finanzas MVP).
    await ensureCobrosTable(client, log);

    // Sprint 6A-v2: FK formal partidos.cancha_id → canchas.id, con
    // backfill por nombre para no perder los partidos ya creados.
    await ensurePartidosCanchaId(client, log);

    // Sprint 7A: tabla transacciones (Webpay + integraciones futuras).
    await ensureTransaccionesTable(client, log);

    log('Done.');
  } finally {
    await client.end();
  }
}

async function ensurePersonalDesignacionesTables(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  // Si la migration formal ya creó las tablas, los IF NOT EXISTS son no-op.
  await client.query(`
    CREATE TABLE IF NOT EXISTS personal (
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
  await ensureRls(client, 'personal');
  await client.query(`CREATE INDEX IF NOT EXISTS idx_personal_tenant ON personal(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_personal_rol ON personal(rol)`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_personal_activo ON personal(activo) WHERE activo = TRUE`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_personal_rut ON personal(rut) WHERE rut IS NOT NULL`,
  );
  await ensureTrigger(client, 'personal');

  await client.query(`
    CREATE TABLE IF NOT EXISTS designaciones (
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
  await ensureRls(client, 'designaciones');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_tenant ON designaciones(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_partido ON designaciones(partido_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_personal ON designaciones(personal_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_estado ON designaciones(estado)`,
  );
  await ensureTrigger(client, 'designaciones');

  log('Personal + designaciones aseguradas (idempotente).');
}

async function ensureSponsorsTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sponsors (
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
  await ensureRls(client, 'sponsors');
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sponsors_tenant ON sponsors(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sponsors_posicion ON sponsors(posicion)`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_sponsors_activos ON sponsors(activo) WHERE activo = TRUE`,
  );
  await ensureTrigger(client, 'sponsors');
  log('Sponsors asegurada (idempotente).');
}

async function ensureDesignacionesRecintoTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS designaciones_recinto (
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
  await ensureRls(client, 'designaciones_recinto');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_recinto_tenant ON designaciones_recinto(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_recinto_fecha ON designaciones_recinto(fecha_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_designaciones_recinto_personal ON designaciones_recinto(personal_id)`,
  );
  await ensureTrigger(client, 'designaciones_recinto');
  log('Designaciones de recinto aseguradas (idempotente).');
}

async function ensureCanchasTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS canchas (
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
  await ensureRls(client, 'canchas');
  await client.query(`CREATE INDEX IF NOT EXISTS idx_canchas_tenant ON canchas(tenant_id)`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_canchas_activa ON canchas(activa) WHERE activa = TRUE`,
  );
  await ensureTrigger(client, 'canchas');
  log('Canchas asegurada (idempotente).');
}

async function ensureCobrosTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS cobros (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      equipo_id         UUID REFERENCES equipos(id) ON DELETE SET NULL,
      concepto          VARCHAR(200) NOT NULL,
      categoria         VARCHAR(30) NOT NULL DEFAULT 'CUOTA'
                          CHECK (categoria IN (
                            'INSCRIPCION','CUOTA','MULTA','ALQUILER_CANCHA',
                            'ARBITRAJE','OTRO'
                          )),
      monto             INTEGER NOT NULL CHECK (monto >= 0),
      vencimiento       DATE,
      pagado_at         TIMESTAMPTZ,
      pagado_metodo     VARCHAR(30)
                          CHECK (pagado_metodo IS NULL OR pagado_metodo IN (
                            'EFECTIVO','TRANSFERENCIA','WEBPAY','MERCADOPAGO','OTRO'
                          )),
      pagado_referencia VARCHAR(150),
      cancelado         BOOLEAN NOT NULL DEFAULT FALSE,
      notas             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await ensureRls(client, 'cobros');
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cobros_tenant ON cobros(tenant_id)`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cobros_equipo ON cobros(equipo_id) WHERE equipo_id IS NOT NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cobros_pendientes ON cobros(vencimiento) WHERE pagado_at IS NULL AND cancelado = FALSE`,
  );
  await ensureTrigger(client, 'cobros');
  log('Cobros asegurada (idempotente).');
}

async function ensureTransaccionesTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS transacciones (
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
  await ensureRls(client, 'transacciones');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_transacciones_tenant ON transacciones(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_transacciones_cobro ON transacciones(cobro_id) WHERE cobro_id IS NOT NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_transacciones_estado ON transacciones(estado, expira_at) WHERE estado IN ('PENDIENTE','PAGO_EN_TRANSITO')`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_transacciones_token ON transacciones(token_pasarela) WHERE token_pasarela IS NOT NULL`,
  );
  await ensureTrigger(client, 'transacciones');
  log('Transacciones asegurada (idempotente).');
}

async function ensurePartidosCanchaId(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    ALTER TABLE partidos
      ADD COLUMN IF NOT EXISTS cancha_id UUID
        REFERENCES canchas(id) ON DELETE SET NULL
  `);
  // Backfill por nombre (case-insensitive, mismo tenant) si todavía no
  // se hizo. Solo afecta filas con cancha_id IS NULL y cancha_nombre no
  // vacío — no pisa asignaciones manuales hechas desde la UI.
  await client.query(`
    UPDATE partidos p
       SET cancha_id = c.id
      FROM canchas c
     WHERE p.tenant_id = c.tenant_id
       AND p.cancha_id IS NULL
       AND p.cancha_nombre IS NOT NULL
       AND LOWER(TRIM(p.cancha_nombre)) = LOWER(TRIM(c.nombre))
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_partidos_cancha_horario
       ON partidos(cancha_id, fecha_hora)
       WHERE cancha_id IS NOT NULL AND fecha_hora IS NOT NULL`,
  );
  log('partidos.cancha_id asegurado (con backfill por nombre).');
}

async function ensureRls(client: Client, table: string): Promise<void> {
  await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  const exists = await client.query(
    `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation'`,
    [table],
  );
  if (exists.rowCount === 0) {
    await client.query(`
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

async function ensureTrigger(client: Client, table: string): Promise<void> {
  const name = `trg_${table}_updated_at`;
  const exists = await client.query(
    `SELECT 1 FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal`,
    [name],
  );
  if (exists.rowCount === 0) {
    await client.query(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[cleanup-orphans] FATAL', err);
  process.exit(1);
});
