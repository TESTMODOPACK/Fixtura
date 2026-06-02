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
  //
  // Incidente 2026-05-28: el .env de prod tenía SKIP_CLEANUP_ORPHANS=true
  // heredado de la config de dev. cleanup-orphans nunca corrió, así que
  // las columnas que dependen de él (tabla_tiebreakers, scheduled_deletion_at,
  // torneo_id en jugadores_inscritos, etc.) quedaron sin aplicar. El portal
  // público revienta con `column t.tabla_tiebreakers does not exist`.
  //
  // Para evitar que vuelva a pasar, IGNORAMOS el skip en producción —
  // mejor que el container falle al arrancar (loud failure) que servir
  // requests con schema corrupto (silent corruption).
  if (process.env.SKIP_CLEANUP_ORPHANS === 'true') {
    if (process.env.NODE_ENV === 'production') {
      log(
        'SKIP_CLEANUP_ORPHANS=true detectado en NODE_ENV=production — IGNORANDO. ' +
          'En prod, cleanup-orphans es necesario para aplicar cambios aditivos de schema. ' +
          'Si querés realmente saltarlo, seteá NODE_ENV distinto (no recomendado).',
      );
    } else {
      log('SKIP_CLEANUP_ORPHANS=true — saltando.');
      return;
    }
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

    // Sprint 7B: tabla documentos_tributarios (boletas/facturas SII).
    await ensureDocumentosTributariosTable(client, log);

    // Sprint 7C: columnas de dunning en cobros.
    await ensureDunningCobros(client, log);

    // Sprint 8: columnas de suspensión en partidos y fechas.
    await ensureSuspensiones(client, log);

    // Sprint 10: tabla magic_links (onboarding personal + reset password).
    await ensureMagicLinksTable(client, log);

    // Sprint 12: tiebreakers configurables por torneo.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS tabla_tiebreakers JSONB
          NOT NULL DEFAULT '["pts","dg","gf","nombre"]'::jsonb
    `);
    log('torneos.tabla_tiebreakers asegurada.');

    // Sprint 14: tabla push_subscriptions (notificaciones FCM/WebPush).
    await ensurePushSubscriptionsTable(client, log);

    // Sprint 16: tabla dias_no_jugables (RF-13).
    await ensureDiasNoJugablesTable(client, log);

    // Sprint 23 (Super Admin): planes_suscripcion + flags en tenants.
    await ensurePlanesSuscripcionTable(client, log);

    // Sprint 24A (Facturación plataforma): facturas que cobra Fixtura a sus ligas.
    await ensureFacturasPlataformaTable(client, log);
    // FK transacciones → facturas_plataforma. Se hace acá porque transacciones
    // se crea más arriba pero la tabla destino se crea recién acá.
    await ensureFkTransaccionesFacturaPlataforma(client, log);

    // Sprint 25 (Categorías): categorias_jugadores + series. Soporte para
    // ligas con divisiones por edad (Senior, Super Senior, Dorados, etc.)
    // con cupo de excepciones configurable.
    await ensureCategoriasYSeriesTables(client, log);

    // Sprint 25 Paso 3: vincular torneos a una categoría y equipos a una
    // serie (slug embebido de la categoría del torneo). categoria_id en
    // torneos para evitar referencias cruzadas raras desde equipos, y
    // serie_slug en equipos porque cada equipo del torneo puede estar en
    // una serie distinta (Primera/Segunda/Honor dentro de la misma cat.).
    // FK ON DELETE SET NULL: si borran una categoría, los torneos
    // referenciados quedan sin categoría (no se rompe el torneo en curso).
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS categoria_id UUID
          REFERENCES categorias_jugadores(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_torneos_categoria ON torneos(categoria_id)`,
    );
    await client.query(`
      ALTER TABLE equipos
        ADD COLUMN IF NOT EXISTS serie_slug VARCHAR(50)
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_equipos_torneo_serie ON equipos(torneo_id, serie_slug)`,
    );
    log('torneos.categoria_id + equipos.serie_slug asegurados (Sprint 25 paso 3).');

    // Sprint 26A — Clubes globales por tenant (reemplaza el modelo viejo
    // de equipos por torneo). Ver ADR-0004. Tablas:
    //   clubes                  — entidad de primera clase a nivel tenant
    //   club_categorias         — N:N club ↔ categoría (multi-categoría)
    //   jugadores               — plantel del club por categoría
    //   inscripciones_torneo    — club inscrito a (torneo, categoría, serie)
    //   planilla_torneo         — subset del plantel que juega ese torneo
    //   jugadores_vetados       — lista negra por RUT a nivel tenant
    // Mientras dure la coexistencia (hasta sprint 26G), las tablas viejas
    // `equipos` y `jugadores_inscritos` siguen existiendo.
    await ensureClubesTables(client, log);

    // Sprint 26D — campos nuevos en torneos para soportar el modelo nuevo.
    // Aditivos: torneos viejos quedan con defaults razonables.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS categorias_series JSONB
          NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS tope_jugadores_por_equipo SMALLINT
          NOT NULL DEFAULT 25 CHECK (tope_jugadores_por_equipo BETWEEN 1 AND 99),
        ADD COLUMN IF NOT EXISTS refuerzos_habilitados BOOLEAN
          NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS fecha_limite_refuerzos_numero SMALLINT
          CHECK (fecha_limite_refuerzos_numero IS NULL OR fecha_limite_refuerzos_numero >= 0)
    `);
    log('torneos.categorias_series + tope_jugadores + refuerzos asegurados (Sprint 26D).');

    await client.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES planes_suscripcion(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS estado_suscripcion VARCHAR(20) NOT NULL DEFAULT 'TRIAL'
          CHECK (estado_suscripcion IN ('TRIAL','ACTIVO','SUSPENDIDO','CANCELADO')),
        ADD COLUMN IF NOT EXISTS trial_expira_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspendido_motivo TEXT,
        ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    log('tenants.plan_id + estado_suscripcion + feature_flags asegurados (Sprint 23).');

    // Sprint 19 (suspensión v2): tipo_reprogramacion + UNIQUE compuesto.
    // Permite coexistencia de Fecha 3 ORIGINAL (SUSPENDIDA) + Fecha 3 REPROGRAMADA.
    await client.query(`
      ALTER TABLE fechas
        ADD COLUMN IF NOT EXISTS tipo_reprogramacion VARCHAR(20) NOT NULL DEFAULT 'ORIGINAL'
          CHECK (tipo_reprogramacion IN ('ORIGINAL','REPROGRAMADA')),
        ADD COLUMN IF NOT EXISTS reemplaza_fecha_id UUID REFERENCES fechas(id) ON DELETE SET NULL
    `);
    // Migrar UNIQUE: drop el viejo (torneo_id, numero) si existe y crear
    // el nuevo (torneo_id, numero, tipo_reprogramacion). Postgres permite
    // DROP CONSTRAINT IF EXISTS — seguro de correr varias veces.
    // Busco el nombre del constraint generado por TypeORM (suele ser UQ_...)
    const fechasUnique = await client.query(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'fechas'::regclass
         AND contype = 'u'
         AND pg_get_constraintdef(oid) LIKE '%(torneo_id, numero)%'
    `);
    for (const row of fechasUnique.rows as Array<{ conname: string }>) {
      await client.query(`ALTER TABLE fechas DROP CONSTRAINT IF EXISTS "${row.conname}"`);
      log(`Drop UNIQUE viejo: ${row.conname}`);
    }
    await client.query(`
      ALTER TABLE fechas
        ADD CONSTRAINT uq_fechas_torneo_numero_tipo
          UNIQUE (torneo_id, numero, tipo_reprogramacion)
    `).catch((err: Error) => {
      // Si ya existe, ignorar. ADD CONSTRAINT no soporta IF NOT EXISTS antes
      // de PG 16 pero el error de duplicado es benigno aquí.
      if (!/already exists/i.test(err.message)) throw err;
    });
    log('fechas.tipo_reprogramacion + UNIQUE compuesto asegurados (Sprint 19).');

    // Sprint 18 (RF-17): cronómetro persistente de Match Center.
    // Mantenemos el estado por partido para sobrevivir reinicios del API.
    await client.query(`
      ALTER TABLE partidos
        ADD COLUMN IF NOT EXISTS centro_estado VARCHAR(20) DEFAULT 'IDLE'
          CHECK (centro_estado IN ('IDLE','EN_VIVO','PAUSADO','FINALIZADO_CENTRO')),
        ADD COLUMN IF NOT EXISTS centro_arrancado_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS centro_pausado_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS centro_segundos_acumulados INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS centro_periodo SMALLINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS centro_minutos_por_periodo SMALLINT NOT NULL DEFAULT 45
    `);
    log('partidos.centro_* asegurado (Sprint 18, RF-17).');

    // AUDIT-3: jugadores_inscritos.torneo_id + UNIQUE (rut, torneo).
    await ensureJugadoresUniqueRutTorneo(client, log);

    // AUDIT-7: índices de performance.
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_fecha_estado ON partidos(fecha_id, estado)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_tabla
         ON partidos(estado, fecha_id)
         WHERE estado IN ('FINALIZADO','WALKOVER')`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_sanciones_rut_torneo
         ON sanciones_activas(torneo_id, rut, cumplida)
         WHERE rut IS NOT NULL`,
    );
    log('Índices de performance asegurados.');

    // AUDIT-11: Ley 19.628 — derecho de cancelación.
    // scheduled_deletion_at: timestamp futuro en el que el cron borra
    // (o anonimiza) la cuenta del user. Permite ventana de gracia de 30
    // días configurable en la que el user puede cancelar el pedido.
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_scheduled_deletion
         ON users(scheduled_deletion_at)
         WHERE scheduled_deletion_at IS NOT NULL`,
    );
    log('users.scheduled_deletion_at asegurada (Ley 19.628).');

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
  // Auto-cura schema drift (incidente 2026-05-28).
  await client.query(`
    ALTER TABLE transacciones
      ADD COLUMN IF NOT EXISTS tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS cobro_id            UUID REFERENCES cobros(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS monto               INTEGER,
      ADD COLUMN IF NOT EXISTS pasarela            VARCHAR(30),
      ADD COLUMN IF NOT EXISTS estado              VARCHAR(30) DEFAULT 'PENDIENTE',
      ADD COLUMN IF NOT EXISTS idempotency_key     VARCHAR(150),
      ADD COLUMN IF NOT EXISTS token_pasarela      VARCHAR(200),
      ADD COLUMN IF NOT EXISTS url_redireccion     VARCHAR(500),
      ADD COLUMN IF NOT EXISTS respuesta_pasarela  JSONB,
      ADD COLUMN IF NOT EXISTS user_pagador_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS pagado_at           TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS expira_at           TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS notas               TEXT,
      ADD COLUMN IF NOT EXISTS factura_plataforma_id UUID,
      ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  // La FK transacciones.factura_plataforma_id → facturas_plataforma(id) se
  // agrega en ensureFkTransaccionesFacturaPlataforma() — corre DESPUÉS de
  // crear ambas tablas para no depender del orden de invocación.
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

async function ensureDocumentosTributariosTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS documentos_tributarios (
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
  // Auto-cura schema drift.
  await client.query(`
    ALTER TABLE documentos_tributarios
      ADD COLUMN IF NOT EXISTS tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS transaccion_id      UUID REFERENCES transacciones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cobro_id            UUID REFERENCES cobros(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS tipo                VARCHAR(30) DEFAULT 'BOLETA',
      ADD COLUMN IF NOT EXISTS monto               INTEGER,
      ADD COLUMN IF NOT EXISTS rut_receptor        VARCHAR(20),
      ADD COLUMN IF NOT EXISTS razon_social        VARCHAR(200),
      ADD COLUMN IF NOT EXISTS folio_sii           BIGINT,
      ADD COLUMN IF NOT EXISTS url_pdf             VARCHAR(500),
      ADD COLUMN IF NOT EXISTS url_xml             VARCHAR(500),
      ADD COLUMN IF NOT EXISTS estado              VARCHAR(30) DEFAULT 'PENDIENTE_EMISION',
      ADD COLUMN IF NOT EXISTS intentos            SMALLINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS respuesta_sii       JSONB,
      ADD COLUMN IF NOT EXISTS emitido_at          TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ultimo_error        TEXT,
      ADD COLUMN IF NOT EXISTS ultimo_intento_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await ensureRls(client, 'documentos_tributarios');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_documentos_tributarios_tenant ON documentos_tributarios(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_doctrib_transaccion ON documentos_tributarios(transaccion_id) WHERE transaccion_id IS NOT NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_doctrib_pendientes ON documentos_tributarios(estado, ultimo_intento_at) WHERE estado IN ('PENDIENTE_EMISION','RECHAZADO_SII')`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_doctrib_folio ON documentos_tributarios(folio_sii) WHERE folio_sii IS NOT NULL`,
  );
  await ensureTrigger(client, 'documentos_tributarios');
  log('Documentos tributarios asegurada (idempotente).');
}

async function ensureJugadoresUniqueRutTorneo(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    ALTER TABLE jugadores_inscritos
      ADD COLUMN IF NOT EXISTS torneo_id UUID
        REFERENCES torneos(id) ON DELETE CASCADE
  `);
  // Backfill desde equipo (idempotente, solo NULLs)
  await client.query(`
    UPDATE jugadores_inscritos j
       SET torneo_id = e.torneo_id
      FROM equipos e
     WHERE j.equipo_id = e.id
       AND j.torneo_id IS NULL
  `);
  // No forzamos NOT NULL en cleanup-orphans (la migración formal lo
  // hace después de validar). Aquí es best-effort.

  // Resolver duplicados existentes (más antiguo gana)
  await client.query(`
    WITH duplicados AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY tenant_id, torneo_id, rut
               ORDER BY created_at ASC, id ASC
             ) AS rn
        FROM jugadores_inscritos
       WHERE rut IS NOT NULL AND activo = TRUE AND torneo_id IS NOT NULL
    )
    UPDATE jugadores_inscritos
       SET activo = FALSE
     WHERE id IN (SELECT id FROM duplicados WHERE rn > 1)
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_jugador_rut_torneo
      ON jugadores_inscritos (tenant_id, torneo_id, rut)
      WHERE rut IS NOT NULL AND activo = TRUE
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_torneo ON jugadores_inscritos (torneo_id)`,
  );
  log('jugadores_inscritos: torneo_id + UNIQUE(rut, torneo) asegurado.');
}

async function ensurePushSubscriptionsTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
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
  // Auto-cura schema drift (mismo motivo que en magic_links).
  await client.query(`
    ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS scope_type   VARCHAR(20),
      ADD COLUMN IF NOT EXISTS scope_id     UUID,
      ADD COLUMN IF NOT EXISTS provider     VARCHAR(20) DEFAULT 'MOCK',
      ADD COLUMN IF NOT EXISTS endpoint     TEXT,
      ADD COLUMN IF NOT EXISTS p256dh       TEXT,
      ADD COLUMN IF NOT EXISTS auth         TEXT,
      ADD COLUMN IF NOT EXISTS user_agent   VARCHAR(300),
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS revoked_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint_unique ON push_subscriptions(endpoint) WHERE revoked_at IS NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_push_scope ON push_subscriptions(scope_type, scope_id) WHERE revoked_at IS NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id) WHERE user_id IS NOT NULL AND revoked_at IS NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_push_tenant ON push_subscriptions(tenant_id) WHERE tenant_id IS NOT NULL`,
  );
  await client.query(`ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY`);
  const exists = await client.query(
    `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions' AND policyname='tenant_isolation'`,
  );
  if (exists.rowCount === 0) {
    await client.query(`
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
  log('push_subscriptions asegurada (idempotente).');
}

async function ensureMagicLinksTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS magic_links (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
      purpose             VARCHAR(40) NOT NULL
                            CHECK (purpose IN (
                              'PERSONAL_ONBOARDING','RESET_PASSWORD','INVITE_USER'
                            )),
      token_hash          VARCHAR(128) NOT NULL UNIQUE,
      email               VARCHAR(150),
      personal_id         UUID REFERENCES personal(id) ON DELETE CASCADE,
      user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
      metadata            JSONB,
      expires_at          TIMESTAMPTZ NOT NULL,
      used_at             TIMESTAMPTZ,
      created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Auto-cura schema drift: si la tabla magic_links ya existía con un
  // schema viejo (ej. InitialSchema o un heal-prod-schema previo que
  // omitió columnas), agregamos las faltantes con ADD COLUMN IF NOT
  // EXISTS. Incidente 2026-05-28: prod tenía magic_links sin personal_id,
  // CREATE INDEX ... ON magic_links(personal_id) crashaba el bootstrap.
  await client.query(`
    ALTER TABLE magic_links
      ADD COLUMN IF NOT EXISTS tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS purpose             VARCHAR(40),
      ADD COLUMN IF NOT EXISTS token_hash          VARCHAR(128),
      ADD COLUMN IF NOT EXISTS email               VARCHAR(150),
      ADD COLUMN IF NOT EXISTS personal_id         UUID REFERENCES personal(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS metadata            JSONB,
      ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS used_at             TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_magic_links_tenant ON magic_links(tenant_id) WHERE tenant_id IS NOT NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_magic_links_personal ON magic_links(personal_id) WHERE personal_id IS NOT NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_magic_links_email_unused ON magic_links(email) WHERE used_at IS NULL`,
  );
  await client.query(`ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE magic_links FORCE ROW LEVEL SECURITY`);
  const exists = await client.query(
    `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='magic_links' AND policyname='tenant_isolation'`,
  );
  if (exists.rowCount === 0) {
    await client.query(`
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
  log('magic_links asegurada (idempotente).');
}

async function ensureSuspensiones(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  for (const tbl of ['partidos', 'fechas']) {
    await client.query(`
      ALTER TABLE ${tbl}
        ADD COLUMN IF NOT EXISTS motivo_suspension VARCHAR(30)
          CHECK (motivo_suspension IS NULL OR motivo_suspension IN (
            'LLUVIA','CANCHA_NO_DISPONIBLE','FUERZA_MAYOR','DECISION_LIGA','OTRO'
          ))
    `);
    await client.query(
      `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ`,
    );
    await client.query(
      `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS suspendido_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
    );
    await client.query(
      `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS observaciones_suspension TEXT`,
    );
  }
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_partidos_suspendido ON partidos(estado, suspendido_at) WHERE estado IN ('SUSPENDIDO_FUERZA_MAYOR','REPROGRAMADO')`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_fechas_suspendida ON fechas(estado) WHERE estado IN ('SUSPENDIDA','REPROGRAMADA')`,
  );
  log('suspensiones (partidos + fechas) aseguradas (idempotente).');
}

async function ensureDunningCobros(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    ALTER TABLE cobros
      ADD COLUMN IF NOT EXISTS estado_dunning VARCHAR(20)
        NOT NULL DEFAULT 'AL_DIA'
        CHECK (estado_dunning IN ('AL_DIA','MOROSO','SUSPENDIDO'))
  `);
  await client.query(`
    ALTER TABLE cobros
      ADD COLUMN IF NOT EXISTS dunning_avisos_enviados SMALLINT NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE cobros
      ADD COLUMN IF NOT EXISTS dunning_ultimo_aviso_at TIMESTAMPTZ
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cobros_dunning ON cobros(estado_dunning) WHERE estado_dunning <> 'AL_DIA'`,
  );
  log('cobros dunning columns aseguradas (idempotente).');
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

/**
 * Sprint 16 — RF-13: días no jugables (feriados, eventos, mantención
 * de cancha). El fixture generator los respeta corriendo la fecha al
 * próximo día válido. El admin también recibe warnings si edita un
 * partido y lo agenda en un día bloqueado.
 *
 * scope:
 *   GLOBAL  → aplica a todos los torneos del tenant.
 *   TORNEO  → aplica solo al torneo_id referenciado.
 *
 * Sin DATE UNIQUE por scope: pueden coexistir un día GLOBAL + un día
 * TORNEO con la misma fecha (uno con motivo, el otro con override).
 */
async function ensureDiasNoJugablesTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dias_no_jugables (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      fecha           DATE NOT NULL,
      scope           VARCHAR(10) NOT NULL DEFAULT 'GLOBAL'
                        CHECK (scope IN ('GLOBAL','TORNEO')),
      torneo_id       UUID REFERENCES torneos(id) ON DELETE CASCADE,
      motivo          VARCHAR(150) NOT NULL,
      origen          VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
                        CHECK (origen IN ('MANUAL','FERIADO_CHILE','IMPORT')),
      created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (scope = 'GLOBAL' OR torneo_id IS NOT NULL)
    )
  `);
  // Auto-cura schema drift (lección 2026-05-28).
  await client.query(`
    ALTER TABLE dias_no_jugables
      ADD COLUMN IF NOT EXISTS tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS fecha      DATE,
      ADD COLUMN IF NOT EXISTS scope      VARCHAR(10) DEFAULT 'GLOBAL',
      ADD COLUMN IF NOT EXISTS torneo_id  UUID REFERENCES torneos(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS motivo     VARCHAR(150),
      ADD COLUMN IF NOT EXISTS origen     VARCHAR(20) DEFAULT 'MANUAL',
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_dias_no_jugables_tenant_fecha
       ON dias_no_jugables(tenant_id, fecha)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_dias_no_jugables_torneo
       ON dias_no_jugables(torneo_id)
       WHERE torneo_id IS NOT NULL`,
  );
  // UNIQUE parcial: evita duplicar mismo día con misma fuente (GLOBAL ó por torneo).
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_no_jugables_global
       ON dias_no_jugables(tenant_id, fecha)
       WHERE scope = 'GLOBAL'`,
  );
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_no_jugables_torneo
       ON dias_no_jugables(tenant_id, torneo_id, fecha)
       WHERE scope = 'TORNEO' AND torneo_id IS NOT NULL`,
  );
  await ensureRls(client, 'dias_no_jugables');
  log('dias_no_jugables asegurada (Sprint 16, RF-13).');
}

/**
 * Sprint 23 — Tabla de planes de suscripción (Starter / Growth / Pro / Enterprise).
 *
 * Sin RLS — es catálogo de plataforma. Solo SUPER_ADMIN puede mutarlos.
 * Cada plan declara sus límites en JSONB (max_torneos, max_equipos,
 * max_partidos_mes, features habilitadas).
 *
 * Seed: si no hay planes, crear 4 niveles base.
 */
async function ensurePlanesSuscripcionTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS planes_suscripcion (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre            VARCHAR(100) NOT NULL,
      slug              VARCHAR(50) NOT NULL UNIQUE,
      precio_mensual_clp INT NOT NULL DEFAULT 0 CHECK (precio_mensual_clp >= 0),
      orden             SMALLINT NOT NULL DEFAULT 0,
      activo            BOOLEAN NOT NULL DEFAULT TRUE,
      limites           JSONB NOT NULL DEFAULT '{}'::jsonb,
      features          JSONB NOT NULL DEFAULT '{}'::jsonb,
      descripcion       TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    ALTER TABLE planes_suscripcion
      ADD COLUMN IF NOT EXISTS nombre             VARCHAR(100),
      ADD COLUMN IF NOT EXISTS slug               VARCHAR(50),
      ADD COLUMN IF NOT EXISTS precio_mensual_clp INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS orden              SMALLINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS activo             BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS limites            JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS features           JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS descripcion        TEXT,
      ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await ensureTrigger(client, 'planes_suscripcion');

  // Seed inicial — solo si la tabla está vacía. Precios CLP/mes según
  // CLAUDE.md decisión D-11. Limites son orientativos para v1.
  const count = await client.query(`SELECT COUNT(*)::int AS n FROM planes_suscripcion`);
  if (Number((count.rows[0] as { n: number }).n) === 0) {
    await client.query(`
      INSERT INTO planes_suscripcion (nombre, slug, precio_mensual_clp, orden, limites, features, descripcion)
      VALUES
        ('Starter',    'starter',    19900, 1,
          '{"maxTorneos":1,"maxEquipos":12,"maxPartidosMes":50}'::jsonb,
          '{"matchCenter":false,"sponsors":false,"sii":false}'::jsonb,
          'Para ligas chicas que arrancan'),
        ('Growth',     'growth',     39900, 2,
          '{"maxTorneos":3,"maxEquipos":40,"maxPartidosMes":200}'::jsonb,
          '{"matchCenter":true,"sponsors":true,"sii":false}'::jsonb,
          'Para ligas establecidas con varias categorías'),
        ('Pro',        'pro',        69900, 3,
          '{"maxTorneos":10,"maxEquipos":200,"maxPartidosMes":1000}'::jsonb,
          '{"matchCenter":true,"sponsors":true,"sii":true,"reservas":true}'::jsonb,
          'Federaciones y recintos profesionales'),
        ('Enterprise', 'enterprise', 99900, 4,
          '{"maxTorneos":null,"maxEquipos":null,"maxPartidosMes":null}'::jsonb,
          '{"matchCenter":true,"sponsors":true,"sii":true,"reservas":true,"fantasy":true,"prioritySupport":true}'::jsonb,
          'Sin límites, soporte prioritario, SLA')
    `);
    log('planes_suscripcion seed: 4 planes base cargados.');
  }
  log('planes_suscripcion asegurada (Sprint 23).');
}

/**
 * Sprint 24A — Facturas que Fixtura cobra a las ligas.
 *
 * Sin RLS — datos de plataforma. Solo SUPER_ADMIN puede crear/anular.
 * El LIGA_ADMIN puede ver SUS facturas (filtro por tenant_id explícito
 * en el service, sin RLS).
 *
 * UNIQUE (tenant_id, periodo_mes, periodo_anio) evita duplicar facturas.
 */
async function ensureFkTransaccionesFacturaPlataforma(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_transacciones_factura_plataforma'
      ) THEN
        ALTER TABLE transacciones
          ADD CONSTRAINT fk_transacciones_factura_plataforma
          FOREIGN KEY (factura_plataforma_id) REFERENCES facturas_plataforma(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  log('FK transacciones.factura_plataforma_id → facturas_plataforma asegurada.');
}

async function ensureFacturasPlataformaTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS facturas_plataforma (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_id             UUID REFERENCES planes_suscripcion(id) ON DELETE SET NULL,
      periodo_mes         SMALLINT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
      periodo_anio        SMALLINT NOT NULL CHECK (periodo_anio BETWEEN 2000 AND 2100),
      monto               INT NOT NULL CHECK (monto >= 0),
      fecha_emision       DATE NOT NULL DEFAULT CURRENT_DATE,
      fecha_vencimiento   DATE NOT NULL,
      fecha_pago          TIMESTAMPTZ,
      estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                            CHECK (estado IN ('PENDIENTE','PAGADA','VENCIDA','ANULADA')),
      metodo_pago         VARCHAR(20)
                            CHECK (metodo_pago IS NULL OR metodo_pago IN (
                              'WEBPAY','MERCADOPAGO','TRANSFERENCIA','MANUAL','ONECLICK'
                            )),
      transaccion_id      UUID REFERENCES transacciones(id) ON DELETE SET NULL,
      doc_tributario_id   UUID REFERENCES documentos_tributarios(id) ON DELETE SET NULL,
      observaciones       TEXT,
      anulada_motivo      TEXT,
      anulada_at          TIMESTAMPTZ,
      anulada_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, periodo_mes, periodo_anio)
    )
  `);
  // Auto-cura schema drift (patrón Sprint 19).
  await client.query(`
    ALTER TABLE facturas_plataforma
      ADD COLUMN IF NOT EXISTS tenant_id          UUID REFERENCES tenants(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS plan_id            UUID REFERENCES planes_suscripcion(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS periodo_mes        SMALLINT,
      ADD COLUMN IF NOT EXISTS periodo_anio       SMALLINT,
      ADD COLUMN IF NOT EXISTS monto              INT,
      ADD COLUMN IF NOT EXISTS fecha_emision      DATE NOT NULL DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS fecha_vencimiento  DATE,
      ADD COLUMN IF NOT EXISTS fecha_pago         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS estado             VARCHAR(20) DEFAULT 'PENDIENTE',
      ADD COLUMN IF NOT EXISTS metodo_pago        VARCHAR(20),
      ADD COLUMN IF NOT EXISTS transaccion_id     UUID REFERENCES transacciones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS doc_tributario_id  UUID REFERENCES documentos_tributarios(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS observaciones      TEXT,
      ADD COLUMN IF NOT EXISTS anulada_motivo     TEXT,
      ADD COLUMN IF NOT EXISTS anulada_at         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS anulada_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_facturas_plataforma_tenant_estado
       ON facturas_plataforma(tenant_id, estado)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_facturas_plataforma_periodo
       ON facturas_plataforma(periodo_anio DESC, periodo_mes DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_facturas_plataforma_vencimiento
       ON facturas_plataforma(fecha_vencimiento)
       WHERE estado = 'PENDIENTE'`,
  );
  await ensureTrigger(client, 'facturas_plataforma');
  log('facturas_plataforma asegurada (Sprint 24A).');
}

/**
 * Sprint 25 — Mantenedor de categorías y series por tenant.
 * Ej. Senior, Super Senior, Dorados con sus series Primera, Segunda.
 * El cupo de excepciones permite flexibilizar la edad mínima general.
 */
async function ensureCategoriasYSeriesTables(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  // NOTA: NO creamos tabla `series` aparte porque ya existe otra (modelo
  // viejo torneo→serie en uso por Equipo). Las series de esta categoría
  // van embebidas como JSONB en la propia categoría.
  await client.query(`
    CREATE TABLE IF NOT EXISTS categorias_jugadores (
      id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      slug                            VARCHAR(50) NOT NULL,
      nombre                          VARCHAR(100) NOT NULL,
      descripcion                     TEXT,
      edad_minima_general             SMALLINT NOT NULL CHECK (edad_minima_general BETWEEN 0 AND 99),
      cupo_excepciones_por_equipo     SMALLINT NOT NULL DEFAULT 0
                                        CHECK (cupo_excepciones_por_equipo BETWEEN 0 AND 20),
      edad_minima_excepcion           SMALLINT
                                        CHECK (edad_minima_excepcion IS NULL OR edad_minima_excepcion BETWEEN 0 AND 99),
      orden                           SMALLINT NOT NULL DEFAULT 0,
      activa                          BOOLEAN NOT NULL DEFAULT TRUE,
      series                          JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_categoria_slug UNIQUE (tenant_id, slug),
      CONSTRAINT chk_excepcion_edad_coherente CHECK (
        cupo_excepciones_por_equipo = 0
        OR (edad_minima_excepcion IS NOT NULL AND edad_minima_excepcion < edad_minima_general)
      )
    )
  `);
  // Auto-cura schema drift (si la tabla ya existía pre-series JSONB).
  await client.query(`
    ALTER TABLE categorias_jugadores
      ADD COLUMN IF NOT EXISTS series JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await ensureRls(client, 'categorias_jugadores');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_categorias_tenant ON categorias_jugadores(tenant_id)`,
  );
  await ensureTrigger(client, 'categorias_jugadores');

  log('categorias_jugadores asegurada (Sprint 25 con series embebidas JSONB).');
}

/**
 * Sprint 26A — Modelo Clubes (ADR-0004).
 *
 * Crea las tablas del nuevo modelo de dominio: club como entidad de
 * primera clase a nivel tenant, con planteles por categoría e
 * inscripción a torneos como pivote separado.
 *
 * Coexiste con el modelo viejo (equipos/jugadores_inscritos) hasta el
 * sprint 26G que hace el refactor cascada. La migración de datos
 * (equipo viejo → club + inscripción) la hace el sprint 26F en un
 * script aparte (no en cleanup-orphans para no correr en cada arranque).
 */
async function ensureClubesTables(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  // ─── clubes ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS clubes (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      slug                        VARCHAR(100) NOT NULL,
      nombre                      VARCHAR(150) NOT NULL,
      escudo_url                  VARCHAR(500),
      color_primario              VARCHAR(7),
      color_secundario            VARCHAR(7),
      pagina_web                  VARCHAR(500),
      resena                      TEXT,
      presidente_nombre           VARCHAR(150),
      presidente_email            VARCHAR(150),
      presidente_telefono         VARCHAR(50),
      delegados                   JSONB NOT NULL DEFAULT '[]'::jsonb,
      historial_manual            TEXT,
      estado                      VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
                                    CHECK (estado IN ('ACTIVO','INACTIVO')),
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_club_slug UNIQUE (tenant_id, slug)
    )
  `);
  await ensureRls(client, 'clubes');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_clubes_tenant ON clubes(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_clubes_estado ON clubes(estado)`,
  );
  await ensureTrigger(client, 'clubes');

  // ─── club_categorias (pivote N:N) ────────────────────────────────
  // Modelado como tabla pivote (no array) para tener FK real a
  // categorias_jugadores y poder hacer JOIN limpio sin GIN index raro.
  // tenant_id se duplica explícitamente para que la policy RLS sea
  // simple y consistente con el resto.
  await client.query(`
    CREATE TABLE IF NOT EXISTS club_categorias (
      tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      club_id       UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
      categoria_id  UUID NOT NULL REFERENCES categorias_jugadores(id) ON DELETE CASCADE,
      PRIMARY KEY (club_id, categoria_id)
    )
  `);
  await ensureRls(client, 'club_categorias');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_club_categorias_tenant ON club_categorias(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_club_categorias_categoria ON club_categorias(categoria_id)`,
  );

  // ─── jugadores (plantel global del club por categoría) ──────────
  // OJO: hay una tabla `jugadores_inscritos` del modelo viejo que NO
  // tocamos. La nueva se llama `jugadores` y va a reemplazarla en 26G.
  //
  // UNIQUE (tenant_id, rut) implementa la regla "un jugador = un solo
  // equipo en toda la liga" — un mismo RUT no puede aparecer dos
  // veces en el tenant ni siquiera en distintas categorías del mismo
  // club. Es el plantel-por-categoría coherente con la regla de
  // multi-torneo cross-tenant.
  await client.query(`
    CREATE TABLE IF NOT EXISTS jugadores (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      club_id            UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
      categoria_id       UUID NOT NULL REFERENCES categorias_jugadores(id) ON DELETE RESTRICT,
      rut                VARCHAR(20) NOT NULL,
      nombres            VARCHAR(100) NOT NULL,
      apellidos          VARCHAR(100) NOT NULL,
      fecha_nac          DATE,
      email              VARCHAR(150),
      telefono           VARCHAR(50),
      numero_camiseta    SMALLINT CHECK (numero_camiseta IS NULL OR numero_camiseta BETWEEN 0 AND 99),
      posicion           VARCHAR(20) CHECK (posicion IS NULL OR posicion IN ('ARQUERO','DEFENSA','MEDIO','DELANTERO')),
      pie_habil          VARCHAR(20) CHECK (pie_habil IS NULL OR pie_habil IN ('IZQUIERDO','DERECHO','AMBIDIESTRO')),
      apodo              VARCHAR(50),
      capitan            BOOLEAN NOT NULL DEFAULT FALSE,
      estado             VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
                           CHECK (estado IN ('ACTIVO','INACTIVO')),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_jugador_rut UNIQUE (tenant_id, rut)
    )
  `);
  await ensureRls(client, 'jugadores');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_tenant ON jugadores(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_club ON jugadores(club_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_categoria ON jugadores(categoria_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_rut ON jugadores(rut)`,
  );
  await ensureTrigger(client, 'jugadores');

  // ─── inscripciones_torneo ────────────────────────────────────────
  // Pivote entre club y torneo. Un club puede inscribirse en distintas
  // (categoría, serie) del mismo torneo (Halcones en Senior Primera y
  // en Super Senior Primera al mismo torneo), pero NO dos veces en la
  // misma combinación (UNIQUE).
  await client.query(`
    CREATE TABLE IF NOT EXISTS inscripciones_torneo (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      club_id         UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
      torneo_id       UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
      categoria_id    UUID NOT NULL REFERENCES categorias_jugadores(id) ON DELETE RESTRICT,
      serie_slug      VARCHAR(50),
      estado          VARCHAR(20) NOT NULL DEFAULT 'INSCRITO'
                        CHECK (estado IN ('INSCRITO','ACTIVO','RETIRADO','SUSPENDIDO')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_inscripcion UNIQUE (torneo_id, club_id, categoria_id)
    )
  `);
  await ensureRls(client, 'inscripciones_torneo');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_inscripciones_tenant ON inscripciones_torneo(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_inscripciones_torneo ON inscripciones_torneo(torneo_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_inscripciones_club ON inscripciones_torneo(club_id)`,
  );
  await ensureTrigger(client, 'inscripciones_torneo');

  // ─── planilla_torneo ─────────────────────────────────────────────
  // Subset del plantel del club (jugadores) que efectivamente
  // participa en este torneo. fecha_incorporacion permite distinguir
  // refuerzos (incorporados después del inicio del torneo).
  await client.query(`
    CREATE TABLE IF NOT EXISTS planilla_torneo (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      inscripcion_id       UUID NOT NULL REFERENCES inscripciones_torneo(id) ON DELETE CASCADE,
      jugador_id           UUID NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
      fecha_incorporacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_planilla_jugador UNIQUE (inscripcion_id, jugador_id)
    )
  `);
  await ensureRls(client, 'planilla_torneo');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_planilla_tenant ON planilla_torneo(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_planilla_inscripcion ON planilla_torneo(inscripcion_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_planilla_jugador ON planilla_torneo(jugador_id)`,
  );

  // ─── jugadores_vetados ───────────────────────────────────────────
  // Lista negra a nivel tenant. Identificación por RUT (ADR-0004).
  // origen=TRIBUNAL: insertado automáticamente al dictar sanción
  // permanente (Sprint 26H). origen=MANUAL: agregado por admin.
  // El creado_por_user_id queda NULL si fue automático.
  await client.query(`
    CREATE TABLE IF NOT EXISTS jugadores_vetados (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      rut                  VARCHAR(20) NOT NULL,
      motivo               TEXT,
      origen               VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
                             CHECK (origen IN ('TRIBUNAL','MANUAL')),
      creado_por_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_jugador_vetado_rut UNIQUE (tenant_id, rut)
    )
  `);
  await ensureRls(client, 'jugadores_vetados');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_vetados_tenant ON jugadores_vetados(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_jugadores_vetados_rut ON jugadores_vetados(rut)`,
  );

  log(
    'clubes + club_categorias + jugadores + inscripciones_torneo + ' +
      'planilla_torneo + jugadores_vetados asegurados (Sprint 26A, ADR-0004).',
  );
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
