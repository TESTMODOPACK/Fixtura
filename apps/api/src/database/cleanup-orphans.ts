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
          'Si quieres realmente saltarlo, define NODE_ENV distinto (no recomendado).',
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

    // Sprint 48 (F48): ausencias del personal por rango de fechas.
    // Debe correr DESPUÉS de personal (FK personal_id).
    await ensureAusenciasPersonalTable(client, log);

    // Sprint 4B: tabla sponsors (banners portal público).
    await ensureSponsorsTable(client, log);

    // Sprint 2E.x: designaciones de RECINTO (paramédicos por jornada).
    await ensureDesignacionesRecintoTable(client, log);

    // Sprint ANFA: flag por tenant para exigir carnet ANFA a árbitros.
    await client.query(
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS requiere_carnet_anfa BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    log('tenants.requiere_carnet_anfa asegurada.');

    // Etapa 1 pagos: config de métodos de cobro por liga + secretos cifrados
    // de la pasarela (Flow/Khipu). pagos_config es JSON no-secreto; las llaves
    // van en pagos_secretos_enc (AES-256-GCM, ver common/crypto/secret-box).
    await client.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS pagos_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS pagos_secretos_enc TEXT
    `);
    log('tenants.pagos_config / pagos_secretos_enc aseguradas.');

    // WhatsApp BYO por liga: config no-secreta (activo/phoneNumberId/apiVersion)
    // + token de Meta cifrado (mismo secret-box que pagos).
    await client.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS whatsapp_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS whatsapp_token_enc TEXT
    `);
    log('tenants.whatsapp_config / whatsapp_token_enc aseguradas.');

    // Sprint 6: tabla canchas.
    await ensureCanchasTable(client, log);

    // Sprint 6B: tabla cobros (finanzas MVP).
    await ensureCobrosTable(client, log);

    // Sprint 34A: tarifario configurable por torneo + FKs en cobros.
    // Tiene que correr DESPUES de ensureCobrosTable porque suma columnas
    // (torneo_id, sancion_id, tarifa_id, generado_auto, periodo_*) a
    // cobros, y DESPUES de la creacion de torneos/inscripciones/sanciones
    // que ya estan aseguradas por el flujo principal antes de este punto.
    await ensureTarifasTorneoTable(client, log);

    // Sprint 6A-v2: FK formal partidos.cancha_id → canchas.id, con
    // backfill por nombre para no perder los partidos ya creados.
    await ensurePartidosCanchaId(client, log);

    // Sprint 7A: tabla transacciones (Webpay + integraciones futuras).
    await ensureTransaccionesTable(client, log);

    // Sprint 7B: tabla documentos_tributarios (boletas/facturas SII).
    await ensureDocumentosTributariosTable(client, log);
    await ensureAuditLogsPolicy(client, log);

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

    // F46.3 — mínimo de jugadores en planilla por equipo para iniciar un
    // partido. Configurable por torneo (default 7, fútbol amateur). Aditiva.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS min_jugadores_para_iniciar SMALLINT
          NOT NULL DEFAULT 7
          CHECK (min_jugadores_para_iniciar BETWEEN 1 AND 30)
    `);
    log('torneos.min_jugadores_para_iniciar asegurada (F46.3).');

    // Umbral de amarillas para suspensión, configurable por torneo. Aditiva.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS amarillas_para_suspension SMALLINT
          NOT NULL DEFAULT 5
          CHECK (amarillas_para_suspension BETWEEN 2 AND 20)
    `);
    log('torneos.amarillas_para_suspension asegurada.');

    // F46.4 — Certificación de jugadores presentes por partido (roster del
    // acta) + timestamp de certificación en partidos. Aditivo e idempotente.
    await client.query(`
      CREATE TABLE IF NOT EXISTS partido_jugadores (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        partido_id     UUID NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
        inscripcion_id UUID NOT NULL,
        jugador_id     UUID NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
        presente       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_partido_jugador UNIQUE (partido_id, jugador_id)
      )
    `);
    await ensureRls(client, 'partido_jugadores');
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_partido_jugadores_tenant ON partido_jugadores(tenant_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_partido_jugadores_partido ON partido_jugadores(partido_id)`,
    );
    await ensureTrigger(client, 'partido_jugadores');
    await client.query(`
      ALTER TABLE partidos
        ADD COLUMN IF NOT EXISTS presentes_certificados_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS presentes_certificados_por UUID
    `);
    log('partido_jugadores + partidos.presentes_certificados_* asegurados (F46.4).');

    // F47 (ADR-0006) — Pagos a personal: liquidaciones (pago agrupado por
    // persona) + columna liquidacion_id en designaciones. Las cuentas por
    // pagar pendientes = designaciones ASISTIO con liquidacion_id NULL.
    await client.query(`
      CREATE TABLE IF NOT EXISTS liquidaciones_personal (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        personal_id   UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
        total         INTEGER NOT NULL DEFAULT 0,
        metodo_pago   VARCHAR(20) NOT NULL DEFAULT 'TRANSFERENCIA'
                        CHECK (metodo_pago IN ('TRANSFERENCIA','EFECTIVO','OTRO')),
        comprobante   TEXT,
        observaciones TEXT,
        fecha_pago    DATE NOT NULL,
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await ensureRls(client, 'liquidaciones_personal');
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_liquidaciones_personal_tenant ON liquidaciones_personal(tenant_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_liquidaciones_personal_personal ON liquidaciones_personal(personal_id)`,
    );
    await ensureTrigger(client, 'liquidaciones_personal');
    await client.query(`
      ALTER TABLE designaciones
        ADD COLUMN IF NOT EXISTS liquidacion_id UUID
          REFERENCES liquidaciones_personal(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_designaciones_liquidacion ON designaciones(liquidacion_id)`,
    );
    log('liquidaciones_personal + designaciones.liquidacion_id asegurados (F47).');

    // F49 (ADR-0007) — Nómina de pago (pago masivo). Datos bancarios del
    // personal + cabecera de nómina que agrupa N liquidaciones de un período.
    await client.query(`
      ALTER TABLE personal
        ADD COLUMN IF NOT EXISTS banco           VARCHAR(60),
        ADD COLUMN IF NOT EXISTS tipo_cuenta     VARCHAR(20),
        ADD COLUMN IF NOT EXISTS numero_cuenta   VARCHAR(40),
        ADD COLUMN IF NOT EXISTS titular_nombre  VARCHAR(150),
        ADD COLUMN IF NOT EXISTS titular_rut     VARCHAR(20)
    `);
    // CHECK aditivo del tipo de cuenta (idempotente: solo si no existe).
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_personal_tipo_cuenta'
        ) THEN
          ALTER TABLE personal ADD CONSTRAINT chk_personal_tipo_cuenta
            CHECK (tipo_cuenta IS NULL OR tipo_cuenta IN
              ('CORRIENTE','VISTA','AHORRO','CUENTA_RUT'));
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS nominas_pago (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        periodo_desde     DATE NOT NULL,
        periodo_hasta     DATE NOT NULL,
        fecha_pago        DATE NOT NULL,
        metodo_pago       VARCHAR(20) NOT NULL DEFAULT 'TRANSFERENCIA'
                            CHECK (metodo_pago IN ('TRANSFERENCIA','EFECTIVO','OTRO')),
        total             INTEGER NOT NULL DEFAULT 0,
        cantidad_personas INTEGER NOT NULL DEFAULT 0,
        observaciones     TEXT,
        created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await ensureRls(client, 'nominas_pago');
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_nominas_pago_tenant ON nominas_pago(tenant_id)`,
    );
    await ensureTrigger(client, 'nominas_pago');
    await client.query(`
      ALTER TABLE liquidaciones_personal
        ADD COLUMN IF NOT EXISTS nomina_id UUID
          REFERENCES nominas_pago(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_liquidaciones_personal_nomina ON liquidaciones_personal(nomina_id)`,
    );
    log('nominas_pago + personal bancario + liquidaciones.nomina_id asegurados (F49).');

    // F51 (ADR-0008) — tarifa por rol arbitral: un árbitro puede actuar de
    // principal o asistente y cobrar distinto según el rol del partido.
    // tarifaBase queda como fallback (y para planillero/otros).
    await client.query(`
      ALTER TABLE personal
        ADD COLUMN IF NOT EXISTS tarifa_arbitro_principal INTEGER,
        ADD COLUMN IF NOT EXISTS tarifa_arbitro_asistente INTEGER
    `);
    log('personal.tarifa_arbitro_principal/asistente asegurados (F51).');

    // F53 — multi-rol: una persona puede ejercer varios roles. `roles` es
    // simple-array (texto separado por comas). Backfill desde `rol` (single)
    // para los registros existentes.
    await client.query(`ALTER TABLE personal ADD COLUMN IF NOT EXISTS roles TEXT`);
    await client.query(
      `UPDATE personal SET roles = rol WHERE (roles IS NULL OR roles = '') AND rol IS NOT NULL`,
    );
    log('personal.roles (multi-rol) asegurado + backfill (F53).');

    // Sprint 14: tabla push_subscriptions (notificaciones FCM/WebPush).
    await ensurePushSubscriptionsTable(client, log);

    // Sprint 16: tabla dias_no_jugables (RF-13).
    await ensureDiasNoJugablesTable(client, log);

    // Sprint 23 (Super Admin): planes_suscripcion + flags en tenants.
    await ensurePlanesSuscripcionTable(client, log);

    // Sprint 24A (Facturación plataforma): facturas que cobra LigaPlus a sus ligas.
    await ensureFacturasPlataformaTable(client, log);
    // FK transacciones → facturas_plataforma. Se hace aquí porque transacciones
    // se crea más arriba pero la tabla destino se crea recién aquí.
    await ensureFkTransaccionesFacturaPlataforma(client, log);

    // Sprint 25 (Categorías): categorias_jugadores + series. Soporte para
    // ligas con divisiones por edad (Senior, Super Senior, Dorados, etc.)
    // con cupo de excepciones configurable.
    await ensureCategoriasYSeriesTables(client, log);

    // Sprint 25 Paso 3: vincular torneos a una categoría. FK ON DELETE SET
    // NULL: si borran una categoría, los torneos referenciados quedan sin
    // categoría (no se rompe el torneo en curso).
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS categoria_id UUID
          REFERENCES categorias_jugadores(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_torneos_categoria ON torneos(categoria_id)`,
    );
    log('torneos.categoria_id asegurado (Sprint 25 paso 3).');

    // Sprint 26A (ADR-0004/0005) — Clubes globales por tenant, fuente de
    // verdad única. Tablas:
    //   clubes                  — entidad de primera clase a nivel tenant
    //   club_categorias         — N:N club ↔ categoría (multi-categoría)
    //   jugadores               — plantel del club por categoría
    //   inscripciones_torneo    — club inscrito a (torneo, categoría, serie)
    //   planilla_torneo         — subset del plantel que juega ese torneo
    //   jugadores_vetados       — lista negra por RUT a nivel tenant
    await ensureClubesTables(client, log);
    await ensureGruposTorneo(client, log);
    await ensurePlayoffsTables(client, log);

    // Sprint 32 — directiva por categoría. Un club que participa en
    // varias categorías puede tener distinta directiva en cada una
    // (caso típico: presidente Senior ≠ presidente Super Senior).
    // Aditivo. Healing copia la directiva del club a cada fila del
    // pivote como punto de partida.
    await client.query(`
      ALTER TABLE club_categorias
        ADD COLUMN IF NOT EXISTS presidente_nombre VARCHAR(150),
        ADD COLUMN IF NOT EXISTS presidente_email VARCHAR(150),
        ADD COLUMN IF NOT EXISTS presidente_telefono VARCHAR(50),
        ADD COLUMN IF NOT EXISTS presidente_cargo VARCHAR(60),
        ADD COLUMN IF NOT EXISTS delegados JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    const healingDirectiva = await client.query(`
      UPDATE club_categorias cc
      SET
        presidente_nombre = c.presidente_nombre,
        presidente_email = c.presidente_email,
        presidente_telefono = c.presidente_telefono,
        delegados = COALESCE(c.delegados, '[]'::jsonb)
      FROM clubes c
      WHERE cc.club_id = c.id
        AND cc.presidente_nombre IS NULL
        AND cc.presidente_email IS NULL
        AND cc.presidente_telefono IS NULL
        AND (cc.delegados IS NULL OR jsonb_array_length(cc.delegados) = 0)
        AND (
          c.presidente_nombre IS NOT NULL
          OR c.presidente_email IS NOT NULL
          OR c.presidente_telefono IS NOT NULL
          OR jsonb_array_length(COALESCE(c.delegados, '[]'::jsonb)) > 0
        )
    `);
    if ((healingDirectiva.rowCount ?? 0) > 0) {
      log(
        `Sprint 32: directiva copiada del club a ${healingDirectiva.rowCount} fila(s) de club_categorias.`,
      );
    }
    log('club_categorias.directiva por categoría asegurada (Sprint 32).');

    // Etapa 2 (módulo M5) — encuestas NPS, una por (torneo, club). El admin
    // las dispara y el delegado responde por un link con token firmado.
    await client.query(`
      CREATE TABLE IF NOT EXISTS encuestas_nps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        club_id UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
        email_destino VARCHAR(150) NOT NULL,
        token TEXT NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        nps SMALLINT,
        eval_arbitraje SMALLINT,
        eval_recinto SMALLINT,
        eval_organizacion SMALLINT,
        comentario TEXT,
        enviada_at TIMESTAMPTZ,
        respondida_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_encuesta_nps UNIQUE (tenant_id, torneo_id, club_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_encuestas_nps_tenant ON encuestas_nps(tenant_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_encuestas_nps_torneo ON encuestas_nps(torneo_id)`,
    );
    await client.query(`ALTER TABLE encuestas_nps ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE encuestas_nps FORCE ROW LEVEL SECURITY`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'encuestas_nps' AND policyname = 'tenant_isolation'
        ) THEN
          CREATE POLICY tenant_isolation ON encuestas_nps
            USING (
              tenant_id::text = current_setting('app.current_tenant_id', true)
              OR current_setting('app.current_tenant_id', true) = ''
            );
        END IF;
      END $$;
    `);
    log('encuestas_nps asegurada (módulo M5 etapa 2).');

    // ── Sprint ENC (ADR-0011) — encuestas configurables ──────────────────
    // Reemplaza el NPS fijo por un constructor: plantillas + preguntas +
    // envíos + respuestas, todas tenant-scoped con RLS FORCE.
    await client.query(`
      CREATE TABLE IF NOT EXISTS plantillas_encuesta (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS preguntas_encuesta (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plantilla_id UUID NOT NULL REFERENCES plantillas_encuesta(id) ON DELETE CASCADE,
        orden SMALLINT NOT NULL DEFAULT 0,
        texto VARCHAR(300) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        opciones JSONB NOT NULL DEFAULT '[]'::jsonb,
        obligatoria BOOLEAN NOT NULL DEFAULT FALSE,
        es_nps BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS envios_encuesta (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plantilla_id UUID NOT NULL REFERENCES plantillas_encuesta(id) ON DELETE CASCADE,
        torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        club_id UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
        email_destino VARCHAR(150) NOT NULL,
        token TEXT NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        enviada_at TIMESTAMPTZ,
        respondida_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_envio_encuesta UNIQUE (tenant_id, plantilla_id, torneo_id, club_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS respuestas_encuesta (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        envio_id UUID NOT NULL REFERENCES envios_encuesta(id) ON DELETE CASCADE,
        pregunta_id UUID NOT NULL REFERENCES preguntas_encuesta(id) ON DELETE CASCADE,
        valor_numero SMALLINT,
        valor_texto TEXT,
        valor_opciones JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_respuesta_encuesta UNIQUE (envio_id, pregunta_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_plantillas_encuesta_tenant ON plantillas_encuesta(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_preguntas_encuesta_tenant ON preguntas_encuesta(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_preguntas_encuesta_plantilla ON preguntas_encuesta(plantilla_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_envios_encuesta_tenant ON envios_encuesta(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_envios_encuesta_plantilla ON envios_encuesta(plantilla_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_respuestas_encuesta_tenant ON respuestas_encuesta(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_respuestas_encuesta_envio ON respuestas_encuesta(envio_id)`);
    // RLS para las 4 (nombres de tabla controlados por el código, no input).
    for (const tabla of [
      'plantillas_encuesta',
      'preguntas_encuesta',
      'envios_encuesta',
      'respuestas_encuesta',
    ]) {
      await client.query(`ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE ${tabla} FORCE ROW LEVEL SECURITY`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = '${tabla}' AND policyname = 'tenant_isolation'
          ) THEN
            CREATE POLICY tenant_isolation ON ${tabla}
              USING (
                tenant_id::text = current_setting('app.current_tenant_id', true)
                OR current_setting('app.current_tenant_id', true) = ''
              );
          END IF;
        END $$;
      `);
    }
    log('encuestas configurables (ENC) aseguradas: plantillas/preguntas/envios/respuestas.');

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

    // Sprint 29A — duración del partido configurable por torneo.
    // duracion_periodo_minutos: minutos por tiempo (default 40 amateur).
    // duracion_entretiempo_minutos: descanso entre períodos (default 10).
    // Cantidad de períodos sigue siendo fija en 2 (los deportes que cubrimos
    // son 2 tiempos). Si en el futuro se quiere soportar cuartos/tercios,
    // se agrega cantidad_periodos aquí.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS duracion_periodo_minutos SMALLINT
          NOT NULL DEFAULT 40 CHECK (duracion_periodo_minutos BETWEEN 1 AND 120),
        ADD COLUMN IF NOT EXISTS duracion_entretiempo_minutos SMALLINT
          NOT NULL DEFAULT 10 CHECK (duracion_entretiempo_minutos BETWEEN 0 AND 60)
    `);
    log('torneos.duracion_periodo + duracion_entretiempo asegurados (Sprint 29A).');

    // Cobertura del recinto por jornada (auto-asignar): cuántos paramédicos
    // y "otros" (utilería/seguridad) designar automáticamente al recinto en
    // cada jornada. Cubren el día completo; default 1 paramédico, 0 otros.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS paramedicos_por_jornada SMALLINT
          NOT NULL DEFAULT 1 CHECK (paramedicos_por_jornada BETWEEN 0 AND 20),
        ADD COLUMN IF NOT EXISTS otros_por_jornada SMALLINT
          NOT NULL DEFAULT 0 CHECK (otros_por_jornada BETWEEN 0 AND 20)
    `);
    log('torneos.paramedicos_por_jornada + otros_por_jornada asegurados.');

    // Sprint 30 fix — backfill categorias_series desde la categoria_id
    // legacy. Torneos creados antes del Sprint 26D quedaron con
    // categoria_id poblado pero categorias_series = '[]', lo que hacía
    // que /admin/torneos/:id/inscripciones mostrara "TORNEO SIN
    // CATEGORÍAS" como falso positivo. Cupo 99 = "ilimitado" práctico.
    const healingCategorias = await client.query(`
      UPDATE torneos
      SET categorias_series = jsonb_build_array(
        jsonb_build_object(
          'categoriaId', categoria_id::text,
          'serieSlug', NULL,
          'cupoEquipos', 99
        )
      )
      WHERE categoria_id IS NOT NULL
        AND (categorias_series IS NULL OR jsonb_array_length(categorias_series) = 0)
    `);
    if ((healingCategorias.rowCount ?? 0) > 0) {
      log(
        `Sprint 30: ${healingCategorias.rowCount} torneo(s) con categoriasSeries autogenerado desde categoria legacy.`,
      );
    }

    // Sprint 26G.1 (ADR-0004/0005) — columnas inscripcion_*_id, fuente de
    // verdad del "equipo" en partidos/incidencias/cobros. Aditivas y NULLABLE.
    // ON DELETE SET NULL: si una inscripción se borra preservamos los
    // registros históricos (partidos jugados, incidencias, cobros).
    await client.query(`
      ALTER TABLE partidos
        ADD COLUMN IF NOT EXISTS inscripcion_local_id UUID
          REFERENCES inscripciones_torneo(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS inscripcion_visita_id UUID
          REFERENCES inscripciones_torneo(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_insc_local ON partidos(inscripcion_local_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_partidos_insc_visita ON partidos(inscripcion_visita_id)`,
    );
    await client.query(`
      ALTER TABLE incidencias_partido
        ADD COLUMN IF NOT EXISTS inscripcion_id UUID
          REFERENCES inscripciones_torneo(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_incidencias_inscripcion ON incidencias_partido(inscripcion_id)`,
    );
    await client.query(`
      ALTER TABLE cobros
        ADD COLUMN IF NOT EXISTS inscripcion_id UUID
          REFERENCES inscripciones_torneo(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_cobros_inscripcion ON cobros(inscripcion_id)`,
    );
    log(
      'partidos + incidencias_partido + cobros.inscripcion_*_id asegurados (Sprint 26G.1).',
    );

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
        ADD COLUMN IF NOT EXISTS centro_minutos_por_periodo SMALLINT NOT NULL DEFAULT 40,
        ADD COLUMN IF NOT EXISTS centro_minutos_entretiempo SMALLINT NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS centro_minutos_agregados SMALLINT NOT NULL DEFAULT 0
    `);
    log('partidos.centro_* asegurado (Sprint 18, RF-17 / 29A entretiempo / tiempo agregado).');

    // Estado NO_JUGADO — el CHECK de partidos.estado se creó en la migración
    // formal inicial (que no corre en prod). Lo recreamos para admitir el
    // estado nuevo. Idempotente y robusto al nombre del constraint: busca
    // cualquier CHECK sobre estado que aún no incluya NO_JUGADO y lo reemplaza.
    await client.query(`
      DO $$
      DECLARE cons_name text;
      BEGIN
        SELECT conname INTO cons_name
        FROM pg_constraint
        WHERE conrelid = 'partidos'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%PROGRAMADO%'
          AND pg_get_constraintdef(oid) NOT LIKE '%NO_JUGADO%'
        LIMIT 1;
        IF cons_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE partidos DROP CONSTRAINT %I', cons_name);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'partidos'::regclass AND conname = 'partidos_estado_check'
        ) THEN
          ALTER TABLE partidos ADD CONSTRAINT partidos_estado_check
            CHECK (estado IN (
              'PROGRAMADO','EN_CURSO','FINALIZADO',
              'SUSPENDIDO_FUERZA_MAYOR','REPROGRAMADO','WALKOVER','NO_JUGADO'
            ));
        END IF;
      END $$;
    `);
    log('partidos.estado admite NO_JUGADO (CHECK actualizado).');

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

    // Sprint 37 — tabla app_config key/value para configuración de plataforma.
    // Sin RLS (es metadata global, no datos de tenant). Acceso solo desde
    // super admin. Caso de uso: tenant por defecto del portal cuando el
    // hostname del request no matchea ningun custom_domain.
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key         VARCHAR(100) PRIMARY KEY,
        value       TEXT NOT NULL,
        descripcion TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    log('app_config asegurada (Sprint 37).');

    // Sprint 39 — Horarios del torneo (plantilla por dia de semana).
    // Cada slot define un dia_semana (1=lun, 7=dom ISO) + hora + cancha
    // del catalogo. Al generar el fixture, los partidos se asignan
    // round-robin a los slots cuyo dia_semana matchee la fecha calculada.
    await client.query(`
      CREATE TABLE IF NOT EXISTS horarios_torneo (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id    UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        dia_semana   SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
        hora         TIME NOT NULL,
        cancha_id    UUID REFERENCES canchas(id) ON DELETE SET NULL,
        orden        SMALLINT NOT NULL DEFAULT 0,
        activo       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_horarios_torneo ON horarios_torneo(torneo_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_horarios_tenant ON horarios_torneo(tenant_id)`,
    );
    // UNIQUE para que no se carguen dos slots iguales por error.
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_horario_slot'
        ) THEN
          ALTER TABLE horarios_torneo
            ADD CONSTRAINT uq_horario_slot
            UNIQUE (torneo_id, dia_semana, hora, cancha_id);
        END IF;
      END $$
    `);
    // RLS estandar.
    await client.query(`ALTER TABLE horarios_torneo ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE horarios_torneo FORCE ROW LEVEL SECURITY`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'horarios_torneo' AND policyname = 'tenant_isolation'
        ) THEN
          CREATE POLICY tenant_isolation ON horarios_torneo
            USING (
              tenant_id::text = current_setting('app.current_tenant_id', true)
              OR current_setting('app.current_tenant_id', true) = ''
            )
            WITH CHECK (
              tenant_id::text = current_setting('app.current_tenant_id', true)
              OR current_setting('app.current_tenant_id', true) = ''
            );
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_horarios_torneo_updated_at'
        ) THEN
          CREATE TRIGGER trg_horarios_torneo_updated_at
            BEFORE UPDATE ON horarios_torneo
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        END IF;
      END $$
    `);
    log('horarios_torneo asegurada (Sprint 39).');

    // Sprint 40 — Simplificacion de canchas. Agregamos estado explicito
    // DISPONIBLE/NO_DISPONIBLE + motivo opcional. Las columnas viejas
    // (direccion, latitud, longitud, capacidad_aforo, superficie,
    // tiene_iluminacion, tiene_camarines) quedan en la tabla pero la UI
    // las oculta. Backfill: is_active=true → DISPONIBLE.
    // Detectamos si `estado` ya existía ANTES del ALTER: el backfill que
    // deriva el estado inicial del legacy `activa` debe correr UNA sola vez
    // (al agregar la columna). Correrlo en cada arranque pisaba los cambios
    // manuales — un admin marcaba DISPONIBLE una cancha con activa=false y el
    // siguiente deploy la revertía a NO_DISPONIBLE.
    const canchasEstadoExistia = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'canchas' AND column_name = 'estado'`,
    );
    await client.query(`
      ALTER TABLE canchas
        ADD COLUMN IF NOT EXISTS estado VARCHAR(20)
          NOT NULL DEFAULT 'DISPONIBLE'
          CHECK (estado IN ('DISPONIBLE','NO_DISPONIBLE')),
        ADD COLUMN IF NOT EXISTS motivo_no_disponible TEXT
    `);
    if (canchasEstadoExistia.rowCount === 0) {
      // Primera vez: las canchas legacy soft-borradas (activa=false) arrancan
      // NO_DISPONIBLE. (La columna se llama `activa`, no `is_active`.)
      await client.query(
        `UPDATE canchas SET estado = 'NO_DISPONIBLE' WHERE activa = FALSE`,
      );
      log('canchas: backfill inicial de estado desde activa (una sola vez).');
    }
    log('canchas.estado + motivo_no_disponible asegurada (Sprint 40).');

    // Sprint 45 — Cobros al iniciar el torneo. Dos campos nuevos en el
    // tarifario:
    //   cantidad_cuotas: solo para tarifa CUOTA. Cuántas cuotas se
    //     generan en total al activar el torneo (ej. 5 cuotas mensuales).
    //   dias_plazo_pago: solo para tarifa MATRICULA. Días de plazo desde
    //     la activación del torneo para pagar la matrícula. Vencida si pasa.
    await client.query(`
      ALTER TABLE tarifas_torneo
        ADD COLUMN IF NOT EXISTS cantidad_cuotas SMALLINT,
        ADD COLUMN IF NOT EXISTS dias_plazo_pago SMALLINT
    `);
    log('tarifas_torneo.cantidad_cuotas + dias_plazo_pago asegurados (Sprint 45).');

    // Sprint 45 — Marca de idempotencia: cuándo se generaron los cobros
    // (matrícula + cuotas) de este torneo. Se setea al pasar el torneo a
    // ACTIVO por primera vez. Sirve para no regenerar cobros si el torneo
    // se desactiva/reactiva.
    await client.query(`
      ALTER TABLE torneos
        ADD COLUMN IF NOT EXISTS cobros_generados_at TIMESTAMPTZ
    `);
    log('torneos.cobros_generados_at asegurada (Sprint 45).');

    // Sprint 38 — Backfill de planillas vacias. Inscripciones que se
    // crearon antes del auto-copy quedaron con planilla en 0 jugadores
    // aunque el club tuviera plantel cargado. Esta query rellena cada
    // planilla vacia con TODOS los jugadores ACTIVOS del club en la
    // categoria correspondiente, respetando el tope del torneo.
    // Idempotente: ON CONFLICT no duplica.
    const planillaBackfill = await client.query(`
      WITH inscripciones_vacias AS (
        SELECT i.id AS inscripcion_id,
               i.tenant_id,
               i.club_id,
               i.categoria_id,
               i.torneo_id,
               t.tope_jugadores_por_equipo AS tope
        FROM inscripciones_torneo i
        JOIN torneos t ON t.id = i.torneo_id
        WHERE NOT EXISTS (
          SELECT 1 FROM planilla_torneo p
          WHERE p.inscripcion_id = i.id
        )
      ),
      candidatos AS (
        SELECT iv.tenant_id,
               iv.inscripcion_id,
               j.id AS jugador_id,
               ROW_NUMBER() OVER (
                 PARTITION BY iv.inscripcion_id
                 ORDER BY j.created_at ASC
               ) AS rn,
               iv.tope
        FROM inscripciones_vacias iv
        JOIN jugadores j
          ON j.tenant_id = iv.tenant_id
         AND j.club_id = iv.club_id
         AND j.categoria_id = iv.categoria_id
         AND j.estado = 'ACTIVO'
      )
      INSERT INTO planilla_torneo (tenant_id, inscripcion_id, jugador_id)
      SELECT tenant_id, inscripcion_id, jugador_id
      FROM candidatos
      WHERE rn <= tope
      ON CONFLICT (inscripcion_id, jugador_id) DO NOTHING
    `);
    if ((planillaBackfill.rowCount ?? 0) > 0) {
      log(
        `Sprint 38: planilla_torneo backfill — ${planillaBackfill.rowCount} jugador(es) copiado(s) desde planteles de club.`,
      );
    }

    // Sprint 46 (ADR-0005) — ELIMINADO el sync a jugadores_inscritos del
    // modelo viejo. Ya nada lee esa tabla (todos los lectores leen jugadores
    // vía planilla). Además ese INSERT no seteaba torneo_id (NOT NULL) y
    // crasheaba el arranque del API. El modelo viejo queda como backup
    // congelado hasta el drop de la Fase 2.

    // ====================================================================
    // Sprint 46 (ADR-0005) — Fase 1: promover el modelo nuevo a fuente de
    // verdad. Columnas jugador_id (FK jugadores) en incidencias y sanciones,
    // y backfill idempotente de TODAS las columnas nuevas en filas históricas
    // para que actas/sanciones/cobros/fixture puedan leer del modelo nuevo
    // sin perder historial. Las tablas viejas (equipos, jugadores_inscritos)
    // quedan intactas como backup hasta la Fase 2 (drop destructivo).
    // ====================================================================

    // Columnas de suspensión en inscripciones_torneo (antes vivían en
    // `equipos`). Se crean AQUÍ porque el backfill de equipos huérfanos las
    // necesita. Aditivas + nullable.
    await client.query(`
      ALTER TABLE inscripciones_torneo
        ADD COLUMN IF NOT EXISTS motivo_suspension VARCHAR(20)
          CHECK (motivo_suspension IS NULL OR motivo_suspension IN ('DEPORTIVA','ECONOMICA','OTRA')),
        ADD COLUMN IF NOT EXISTS observaciones_suspension TEXT,
        ADD COLUMN IF NOT EXISTS suspendido_en TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspendido_por UUID
    `);

    // Rellenar planilla de inscripciones vacías desde el plantel del club
    // (mismo criterio que el backfill Sprint 38, idempotente).
    const bfPlanillaHuerfanos = await client.query(`
      WITH inscripciones_vacias AS (
        SELECT i.id AS inscripcion_id, i.tenant_id, i.club_id, i.categoria_id,
               t.tope_jugadores_por_equipo AS tope
        FROM inscripciones_torneo i
        JOIN torneos t ON t.id = i.torneo_id
        WHERE NOT EXISTS (SELECT 1 FROM planilla_torneo p WHERE p.inscripcion_id = i.id)
      ),
      candidatos AS (
        SELECT iv.tenant_id, iv.inscripcion_id, j.id AS jugador_id,
               ROW_NUMBER() OVER (PARTITION BY iv.inscripcion_id ORDER BY j.created_at ASC) AS rn,
               iv.tope
        FROM inscripciones_vacias iv
        JOIN jugadores j
          ON j.tenant_id = iv.tenant_id AND j.club_id = iv.club_id
         AND j.categoria_id = iv.categoria_id AND j.estado = 'ACTIVO'
      )
      INSERT INTO planilla_torneo (tenant_id, inscripcion_id, jugador_id)
      SELECT tenant_id, inscripcion_id, jugador_id FROM candidatos
      WHERE rn <= tope
      ON CONFLICT (inscripcion_id, jugador_id) DO NOTHING
    `);
    if ((bfPlanillaHuerfanos.rowCount ?? 0) > 0) {
      log(
        `Sprint 46: planilla rellenada para huérfanos — ${bfPlanillaHuerfanos.rowCount} jugador(es).`,
      );
    }

    await client.query(`
      ALTER TABLE incidencias_partido
        ADD COLUMN IF NOT EXISTS jugador_id UUID
          REFERENCES jugadores(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_incidencias_jugador ON incidencias_partido(jugador_id)`,
    );
    await client.query(`
      ALTER TABLE sanciones_activas
        ADD COLUMN IF NOT EXISTS jugador_id UUID
          REFERENCES jugadores(id) ON DELETE SET NULL
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_sanciones_jugador ON sanciones_activas(jugador_id)`,
    );
    log('Sprint 46: incidencias_partido.jugador_id + sanciones_activas.jugador_id aseguradas.');

    // Informes — total de fechas de la sanción (para mostrar cumplidas vs
    // pendientes). Aditivo. Backfill: para sanciones existentes el total
    // real no se guardó, así que estimamos = max(fechas_pendientes, 1).
    await client.query(`
      ALTER TABLE sanciones_activas
        ADD COLUMN IF NOT EXISTS fechas_totales SMALLINT
    `);
    await client.query(`
      UPDATE sanciones_activas
        SET fechas_totales = GREATEST(fechas_pendientes, 1)
        WHERE fechas_totales IS NULL
    `);
    log('Informes: sanciones_activas.fechas_totales asegurada.');

    // Backfill sanciones_activas.jugador_id por RUT (clave real de la sanción).
    // Es del modelo nuevo (jugadores) — se mantiene tras el drop de Fase 2.
    const bfSanc = await client.query(`
      UPDATE sanciones_activas s
      SET jugador_id = j.id
      FROM jugadores j
      WHERE j.tenant_id = s.tenant_id
        AND j.rut = s.rut
        AND s.rut IS NOT NULL
        AND s.jugador_id IS NULL
    `);
    log(`ADR-0005: backfill sanciones — ${(bfSanc.rowCount ?? 0)} con jugador.`);

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

/**
 * Sprint 48 (F48) — Ausencias del personal por rango de fechas.
 *
 * Una persona puede declararse NO disponible en un rango de fechas
 * calendario (vacaciones, lesión, viaje). El rango es por fecha calendario
 * — no por jornada del torneo — para que cubra todos los partidos de ese
 * día, incluso de torneos distintos. La auto-asignación y el análisis de
 * cobertura excluyen a quienes tengan una ausencia que cubra la fecha del
 * partido. Aditiva e idempotente.
 */
async function ensureAusenciasPersonalTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ausencias_personal (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      personal_id  UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
      desde        DATE NOT NULL,
      hasta        DATE NOT NULL,
      motivo       VARCHAR(200),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_ausencia_rango CHECK (hasta >= desde)
    )
  `);
  await ensureRls(client, 'ausencias_personal');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_ausencias_personal_tenant ON ausencias_personal(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_ausencias_personal_personal ON ausencias_personal(personal_id)`,
  );
  // Index para cruzar por rango de fechas (cobertura/auto-asignar).
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_ausencias_personal_rango ON ausencias_personal(tenant_id, desde, hasta)`,
  );
  await ensureTrigger(client, 'ausencias_personal');
  log('ausencias_personal asegurada (Sprint 48).');
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
    `CREATE INDEX IF NOT EXISTS idx_cobros_pendientes ON cobros(vencimiento) WHERE pagado_at IS NULL AND cancelado = FALSE`,
  );
  await ensureTrigger(client, 'cobros');
  log('Cobros asegurada (idempotente).');

  // Sprint 34A — vinculos del cobro con torneo, sancion origen y tarifa
  // que lo genero. Tambien marca generado_auto y periodo (para cuotas
  // recurrentes mensuales/semanales). Todo nullable para back-compat con
  // los cobros viejos creados manualmente.
  await client.query(`
    ALTER TABLE cobros
      ADD COLUMN IF NOT EXISTS torneo_id     UUID REFERENCES torneos(id)          ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS sancion_id    UUID REFERENCES sanciones_activas(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS generado_auto BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS periodo_anio   SMALLINT,
      ADD COLUMN IF NOT EXISTS periodo_mes    SMALLINT CHECK (periodo_mes    IS NULL OR periodo_mes    BETWEEN 1 AND 12),
      ADD COLUMN IF NOT EXISTS periodo_semana SMALLINT CHECK (periodo_semana IS NULL OR periodo_semana BETWEEN 1 AND 53)
  `);
  // tarifa_id se agrega despues, una vez que ensureTarifasTorneoTable
  // creo la tabla (orden de FK).
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cobros_torneo
      ON cobros(torneo_id)  WHERE torneo_id  IS NOT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cobros_sancion
      ON cobros(sancion_id) WHERE sancion_id IS NOT NULL
  `);
  log('cobros: torneo_id + sancion_id + generado_auto + periodo asegurados (Sprint 34A).');
}

async function ensureTarifasTorneoTable(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  // Sprint 34A — Tarifario configurable por torneo.
  //
  // Una fila por (torneo, tipo de cobro). UNIQUE (torneo_id, tipo) — solo
  // puede haber UNA tarifa por concepto, p.ej. una MATRICULA, una CUOTA,
  // una MULTA_AMARILLA. Si la liga necesita varios "OTROS", los crea
  // todos con tipo='OTRO' y los distingue por descripcion (no aplica
  // UNIQUE en ese caso porque tenemos `descripcion` parte del key
  // funcional, pero por simplicidad arrancamos con UNIQUE estricta y si
  // hace falta se relaja despues).
  //
  // `frecuencia` aplica solo a tipo=CUOTA (UNICO=no recurrente, SEMANAL,
  // MENSUAL, ANUAL). `dia_vencimiento` para mensual/anual es el dia del
  // mes; para semanal es 1..7 (lunes..domingo) — el service lo interpreta.
  await client.query(`
    CREATE TABLE IF NOT EXISTS tarifas_torneo (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
      torneo_id       UUID NOT NULL REFERENCES torneos(id)  ON DELETE CASCADE,
      tipo            VARCHAR(40) NOT NULL CHECK (tipo IN (
                        'MATRICULA','CUOTA',
                        'MULTA_AMARILLA','MULTA_ROJA',
                        'MULTA_FECHA_SANCION','MULTA_WALKOVER',
                        'OTRO'
                      )),
      descripcion     VARCHAR(200),
      monto           INTEGER NOT NULL CHECK (monto >= 0),
      frecuencia      VARCHAR(20) NOT NULL DEFAULT 'UNICO'
                        CHECK (frecuencia IN ('UNICO','SEMANAL','MENSUAL','ANUAL')),
      dia_vencimiento SMALLINT CHECK (dia_vencimiento IS NULL OR (dia_vencimiento BETWEEN 1 AND 31)),
      activo          BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tarifa_torneo_tipo UNIQUE (torneo_id, tipo)
    )
  `);
  await ensureRls(client, 'tarifas_torneo');
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_tarifas_tenant ON tarifas_torneo(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_tarifas_torneo ON tarifas_torneo(torneo_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_tarifas_activas ON tarifas_torneo(torneo_id) WHERE activo = TRUE`,
  );
  await ensureTrigger(client, 'tarifas_torneo');
  log('tarifas_torneo asegurada (Sprint 34A).');

  // Ahora que existe tarifas_torneo, podemos sumar la FK al cobro.
  await client.query(`
    ALTER TABLE cobros
      ADD COLUMN IF NOT EXISTS tarifa_id UUID
        REFERENCES tarifas_torneo(id) ON DELETE SET NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cobros_tarifa
      ON cobros(tarifa_id) WHERE tarifa_id IS NOT NULL
  `);

  // Anti-duplicado de cuotas recurrentes: 1 sola cobro activo por
  // (inscripcion, tarifa, periodo). El COALESCE trata NULL como 0
  // (semanal no usa mes y viceversa). Limitado a generados auto y no
  // cancelados — los manuales no entran al anti-dup.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cobro_cuota_periodo
      ON cobros (
        inscripcion_id,
        tarifa_id,
        periodo_anio,
        COALESCE(periodo_mes, 0),
        COALESCE(periodo_semana, 0)
      )
      WHERE generado_auto = TRUE AND cancelado = FALSE
  `);
  log('cobros.tarifa_id + UNIQUE(inscripcion, tarifa, periodo) asegurados (Sprint 34A).');

  // Sprint 34C revision (decision producto): MULTA_FECHA_SANCION sale
  // del enum. Las rojas se cobran como monto fijo (MULTA_ROJA), las
  // fechas de suspension NO generan cobro adicional. Cualquier sancion
  // extra del tribunal queda como cobro manual desde /admin/finanzas.
  //
  // Aseguramos el enum actual: limpiamos filas con valores viejos y
  // recreamos el CHECK constraint sin MULTA_FECHA_SANCION. Idempotente.
  await client.query(`
    DELETE FROM tarifas_torneo
     WHERE tipo NOT IN (
       'MATRICULA','CUOTA',
       'MULTA_AMARILLA','MULTA_ROJA','MULTA_WALKOVER',
       'OTRO'
     )
  `);
  await client.query(`
    ALTER TABLE tarifas_torneo DROP CONSTRAINT IF EXISTS tarifas_torneo_tipo_check
  `);
  await client.query(`
    ALTER TABLE tarifas_torneo ADD CONSTRAINT tarifas_torneo_tipo_check
      CHECK (tipo IN (
        'MATRICULA','CUOTA',
        'MULTA_AMARILLA','MULTA_ROJA','MULTA_WALKOVER',
        'OTRO'
      ))
  `);
  log('tarifas_torneo.tipo: MULTA_FECHA_SANCION removida del enum (Sprint 34C revision).');

  // Sprint 34G — validar que cuotas SEMANAL tengan dia_vencimiento en
  // rango 1..7 (lun..dom). La columna admite 1..31 para uso de tarifas
  // mensuales/anuales, pero no tiene sentido un "dia 15 semanal".
  // Idempotente: dropea + crea.
  await client.query(`
    DELETE FROM tarifas_torneo
     WHERE frecuencia = 'SEMANAL'
       AND dia_vencimiento IS NOT NULL
       AND dia_vencimiento NOT BETWEEN 1 AND 7
  `);
  await client.query(`
    ALTER TABLE tarifas_torneo
      DROP CONSTRAINT IF EXISTS tarifas_torneo_dia_semanal_check
  `);
  await client.query(`
    ALTER TABLE tarifas_torneo
      ADD CONSTRAINT tarifas_torneo_dia_semanal_check CHECK (
        frecuencia <> 'SEMANAL'
        OR dia_vencimiento IS NULL
        OR dia_vencimiento BETWEEN 1 AND 7
      )
  `);
  log('tarifas_torneo: CHECK dia_vencimiento 1..7 para frecuencia SEMANAL (Sprint 34G).');

  // Sprint 34D — vincular cobros al partido para multas automaticas.
  // Permite borrar/regenerar al reabrir el acta de un partido sin
  // afectar cobros de otros partidos.
  await client.query(`
    ALTER TABLE cobros
      ADD COLUMN IF NOT EXISTS partido_id UUID REFERENCES partidos(id) ON DELETE SET NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cobros_partido
      ON cobros(partido_id) WHERE partido_id IS NOT NULL
  `);
  log('cobros.partido_id asegurada (Sprint 34D).');
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
                              'WEBPAY','MERCADOPAGO','MACH','FLOW','KHIPU','MOCK'
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

  // Etapa 2 pagos — ampliar el CHECK de pasarela para admitir FLOW/KHIPU.
  // Es aditivo (solo agrega valores permitidos, nunca toca datos) e
  // idempotente: dropea el constraint con cualquiera de sus nombres
  // conocidos y lo recrea con nombre estable.
  await client.query(
    `ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_pasarela_check`,
  );
  await client.query(
    `ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS chk_transacciones_pasarela`,
  );
  await client.query(`
    ALTER TABLE transacciones
      ADD CONSTRAINT chk_transacciones_pasarela
      CHECK (pasarela IN ('WEBPAY','MERCADOPAGO','MACH','FLOW','KHIPU','MOCK'))
  `);
  log('transacciones.pasarela CHECK ampliado con FLOW/KHIPU (Etapa 2 pagos).');

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
    `CREATE INDEX IF NOT EXISTS idx_doctrib_pendientes ON documentos_tributarios(estado, ultimo_intento_at) WHERE estado IN ('PENDIENTE_EMISION','RECHAZADO_SII')`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_doctrib_folio ON documentos_tributarios(folio_sii) WHERE folio_sii IS NOT NULL`,
  );
  // M4 — UNIQUE en transaccion_id: corta a nivel DB la emisión de boletas SII
  // duplicadas si las dos confirmaciones (webhook Flow + retorno del navegador)
  // ganaran la carrera. El índice ÚNICO parcial cubre también los lookups por
  // transaccion_id. Si ya hay duplicados, NO se puede el UNIQUE (rompería el
  // arranque): dejamos un no-único para los lookups + aviso de dedupe. El índice
  // de lookup se crea UNA vez en la rama que corresponde (sin churn por arranque).
  const dupDoctrib = await client.query(
    `SELECT 1 FROM documentos_tributarios
       WHERE transaccion_id IS NOT NULL
       GROUP BY transaccion_id HAVING COUNT(*) > 1 LIMIT 1`,
  );
  if (dupDoctrib.rowCount === 0) {
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_doctrib_transaccion
         ON documentos_tributarios(transaccion_id) WHERE transaccion_id IS NOT NULL`,
    );
    // Limpia el no-único de versiones previas (el UNIQUE ya sirve de lookup).
    await client.query(`DROP INDEX IF EXISTS idx_doctrib_transaccion`);
  } else {
    // No se puede el UNIQUE con duplicados: no-único como fallback de lookup.
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_doctrib_transaccion ON documentos_tributarios(transaccion_id) WHERE transaccion_id IS NOT NULL`,
    );
    log(
      '[M4] documentos_tributarios tiene transaccion_id duplicados — NO se crea el UNIQUE. Dedupe manual requerido.',
    );
  }
  await ensureTrigger(client, 'documentos_tributarios');
  log('Documentos tributarios asegurada (idempotente).');
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
 * Sprint 24A — Facturas que LigaPlus cobra a las ligas.
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
  // Sprint TRI — veto del club de por vida (resolución del Tribunal). Aditivo:
  // un club con vetado_at != null no puede inscribirse en ningún torneo de la
  // liga. Reversible (un admin levanta el veto poniendo las columnas en NULL).
  await client.query(`
    ALTER TABLE clubes ADD COLUMN IF NOT EXISTS vetado_at TIMESTAMPTZ;
    ALTER TABLE clubes ADD COLUMN IF NOT EXISTS vetado_motivo TEXT;
    ALTER TABLE clubes ADD COLUMN IF NOT EXISTS vetado_por_user_id UUID;
  `);

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

  // Sprint 33A — contacto de emergencia del jugador.
  // Para avisar a un familiar/responsable en caso de accidente durante
  // un partido. Ambas columnas opcionales — no se exige cargarlas.
  await client.query(`
    ALTER TABLE jugadores
      ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(50),
      ADD COLUMN IF NOT EXISTS nombre_contacto   VARCHAR(100)
  `);
  log('jugadores.telefono_contacto + nombre_contacto asegurados (Sprint 33A).');

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

/**
 * B5 — Uniforma la policy RLS de audit_logs con WITH CHECK explícito.
 *
 * La migración inicial creó la policy solo con USING. En una policy FOR ALL,
 * Postgres YA usa la expresión USING como WITH CHECK para INSERT/UPDATE, así
 * que los inserts cross-tenant ya estaban rechazados. Esto solo lo hace
 * explícito, para que coincida con el resto de las tablas (ensureRls) y no
 * dependa de esa sutileza. Idempotente y sin cambio de comportamiento.
 */
async function ensureAuditLogsPolicy(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  const tabla = await client.query(`SELECT to_regclass('public.audit_logs') AS t`);
  if (!tabla.rows[0]?.t) return; // aún no existe (migración inicial no corrió)
  const pol = await client.query(
    `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='tenant_isolation'`,
  );
  if (pol.rowCount === 0) return; // la crea la migración inicial
  await client.query(`
    ALTER POLICY tenant_isolation ON audit_logs
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
  log('audit_logs policy con WITH CHECK explícito (B5).');
}

/**
 * Fase 1 (Grupos) — config de grupos en torneos + tablas grupos_torneo y
 * grupo_inscripcion + partidos.grupo_id. Aditivo e idempotente. Corre después
 * de ensureClubesTables (que crea inscripciones_torneo).
 */
async function ensureGruposTorneo(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    ALTER TABLE torneos
      ADD COLUMN IF NOT EXISTS cantidad_grupos       SMALLINT,
      ADD COLUMN IF NOT EXISTS clasifican_por_grupo  SMALLINT,
      ADD COLUMN IF NOT EXISTS grupos_a_playoffs     BOOLEAN NOT NULL DEFAULT false
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS grupos_torneo (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      torneo_id   UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
      numero      SMALLINT NOT NULL,
      nombre      VARCHAR(50) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (torneo_id, numero)
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_grupos_torneo_tenant ON grupos_torneo(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_grupos_torneo_torneo ON grupos_torneo(torneo_id)`,
  );
  await ensureRls(client, 'grupos_torneo');
  await ensureTrigger(client, 'grupos_torneo');

  await client.query(`
    CREATE TABLE IF NOT EXISTS grupo_inscripcion (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      torneo_id       UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
      grupo_id        UUID NOT NULL REFERENCES grupos_torneo(id) ON DELETE CASCADE,
      inscripcion_id  UUID NOT NULL REFERENCES inscripciones_torneo(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (torneo_id, inscripcion_id)
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_grupo_inscripcion_tenant ON grupo_inscripcion(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_grupo_inscripcion_grupo ON grupo_inscripcion(grupo_id)`,
  );
  await ensureRls(client, 'grupo_inscripcion');

  await client.query(`
    ALTER TABLE partidos
      ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES grupos_torneo(id) ON DELETE SET NULL
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_partidos_grupo ON partidos(grupo_id) WHERE grupo_id IS NOT NULL`,
  );

  log(
    'Grupos de torneo asegurados (G1: grupos_torneo + grupo_inscripcion + partidos.grupo_id).',
  );
}

/**
 * Fase Playoffs (P1) — config de playoffs en torneos + tabla llaves_playoff
 * + partidos.llave_id. Aditivo e idempotente. Corre después de ensureClubesTables
 * (FK a inscripciones_torneo). Topología del bracket: la llave (ronda R, orden O)
 * alimenta la llave (ronda R+1, orden floor(O/2)); no necesita FK explícita.
 */
async function ensurePlayoffsTables(
  client: Client,
  log: (msg: string) => void,
): Promise<void> {
  await client.query(`
    ALTER TABLE torneos
      ADD COLUMN IF NOT EXISTS playoff_ida_vuelta     BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS playoff_tercer_puesto  BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS round_robin_a_playoffs BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS clasifican_playoffs    SMALLINT
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS llaves_playoff (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      torneo_id               UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
      ronda                   SMALLINT NOT NULL,
      orden                   SMALLINT NOT NULL,
      nombre                  VARCHAR(50) NOT NULL,
      inscripcion_local_id    UUID REFERENCES inscripciones_torneo(id) ON DELETE SET NULL,
      inscripcion_visita_id   UUID REFERENCES inscripciones_torneo(id) ON DELETE SET NULL,
      ganador_inscripcion_id  UUID REFERENCES inscripciones_torneo(id) ON DELETE SET NULL,
      es_tercer_puesto        BOOLEAN NOT NULL DEFAULT false,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (torneo_id, ronda, orden)
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_llaves_playoff_tenant ON llaves_playoff(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_llaves_playoff_torneo ON llaves_playoff(torneo_id)`,
  );
  await ensureRls(client, 'llaves_playoff');
  await ensureTrigger(client, 'llaves_playoff');

  await client.query(`
    ALTER TABLE partidos
      ADD COLUMN IF NOT EXISTS llave_id UUID REFERENCES llaves_playoff(id) ON DELETE SET NULL
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_partidos_llave ON partidos(llave_id) WHERE llave_id IS NOT NULL`,
  );

  // Mixto round robin → playoffs (M2): marca las fechas de la eliminatoria
  // agregadas tras la fase regular.
  await client.query(`
    ALTER TABLE fechas
      ADD COLUMN IF NOT EXISTS es_playoffs BOOLEAN NOT NULL DEFAULT false
  `);

  log('Playoffs asegurado (P1+M2: torneos.playoff_* + llaves_playoff + partidos.llave_id + fechas.es_playoffs).');
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
