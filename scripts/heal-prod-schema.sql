-- ─────────────────────────────────────────────────────────────────────
-- heal-prod-schema.sql
--
-- Script idempotente que aplica TODAS las migraciones aditivas faltantes
-- en producción cuando cleanup-orphans no se ejecutó. Reproduce la lógica
-- de apps/api/src/database/cleanup-orphans.ts en SQL puro.
--
-- Seguro de correr más de una vez: usa IF NOT EXISTS y verifica policies.
-- NO toca datos existentes. Solo agrega columnas/tablas/índices faltantes.
--
-- USO (en el VPS):
--   docker compose exec -T db psql -U fixtura -d fixtura < /ruta/heal-prod-schema.sql
--
-- O dentro del container db:
--   docker compose cp scripts/heal-prod-schema.sql db:/tmp/heal.sql
--   docker compose exec db psql -U fixtura -d fixtura -f /tmp/heal.sql
-- ─────────────────────────────────────────────────────────────────────

\echo '──── Iniciando heal-prod-schema ────'

BEGIN;

-- ── 1. Función set_updated_at (si no existe, raro pero por las dudas) ──
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

\echo '[1/7] set_updated_at function asegurada'

-- ── 2. tenants.requiere_carnet_anfa ──────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS requiere_carnet_anfa BOOLEAN NOT NULL DEFAULT FALSE;

\echo '[2/7] tenants.requiere_carnet_anfa asegurada'

-- ── 3. Tabla canchas ─────────────────────────────────────────────────
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
);

CREATE INDEX IF NOT EXISTS idx_canchas_tenant ON canchas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_canchas_activa ON canchas(activa) WHERE activa = TRUE;

ALTER TABLE canchas ENABLE ROW LEVEL SECURITY;
ALTER TABLE canchas FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='canchas' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON canchas
      USING (
        tenant_id::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant_id', true) = ''
      )
      WITH CHECK (
        tenant_id::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant_id', true) = ''
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_canchas_updated_at'
  ) THEN
    CREATE TRIGGER trg_canchas_updated_at
      BEFORE UPDATE ON canchas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

\echo '[3/7] tabla canchas asegurada con RLS + trigger'

-- ── 4. Tabla cobros ──────────────────────────────────────────────────
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
);

CREATE INDEX IF NOT EXISTS idx_cobros_tenant ON cobros(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cobros_equipo ON cobros(equipo_id) WHERE equipo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cobros_pendientes ON cobros(vencimiento) WHERE pagado_at IS NULL AND cancelado = FALSE;

ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='cobros' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON cobros
      USING (
        tenant_id::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant_id', true) = ''
      )
      WITH CHECK (
        tenant_id::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant_id', true) = ''
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cobros_updated_at'
  ) THEN
    CREATE TRIGGER trg_cobros_updated_at
      BEFORE UPDATE ON cobros FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

\echo '[4/7] tabla cobros asegurada con RLS + trigger'

-- ── 5. partidos.cancha_id (FK + backfill) ────────────────────────────
ALTER TABLE partidos
  ADD COLUMN IF NOT EXISTS cancha_id UUID
    REFERENCES canchas(id) ON DELETE SET NULL;

UPDATE partidos p
   SET cancha_id = c.id
  FROM canchas c
 WHERE p.tenant_id = c.tenant_id
   AND p.cancha_id IS NULL
   AND p.cancha_nombre IS NOT NULL
   AND LOWER(TRIM(p.cancha_nombre)) = LOWER(TRIM(c.nombre));

CREATE INDEX IF NOT EXISTS idx_partidos_cancha_horario
  ON partidos(cancha_id, fecha_hora)
  WHERE cancha_id IS NOT NULL AND fecha_hora IS NOT NULL;

\echo '[5/7] partidos.cancha_id agregada (backfill por nombre si había canchas)'

-- ── 6. designaciones_recinto (por si tampoco corrió) ─────────────────
-- (esta migración estaba registrada en pg_migrations, así que probable
-- que ya existe, pero por seguridad la verificamos)
CREATE TABLE IF NOT EXISTS designaciones_recinto (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fecha_id        UUID NOT NULL REFERENCES fechas(id) ON DELETE CASCADE,
  personal_id     UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  rol             VARCHAR(30) NOT NULL
                    CHECK (rol IN ('PARAMEDICO','OTRO')),
  cancha_nombre   VARCHAR(150),
  observaciones   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\echo '[6/7] designaciones_recinto verificada'

-- ── 7. Sprint 7A: transacciones (pagos online) ───────────────────────
CREATE TABLE IF NOT EXISTS transacciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cobro_id            UUID,
  provider            VARCHAR(20) NOT NULL DEFAULT 'MOCK',
  provider_order_id   VARCHAR(100),
  provider_token      VARCHAR(255),
  monto               INT NOT NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'INICIADA',
  payload_request     JSONB,
  payload_response    JSONB,
  retorno_url         VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transacciones_tenant ON transacciones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_estado ON transacciones(estado);

\echo '[7] transacciones verificada'

-- ── 8. Sprint 7B: documentos_tributarios (SII) ───────────────────────
CREATE TABLE IF NOT EXISTS documentos_tributarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cobro_id            UUID,
  transaccion_id      UUID,
  tipo                VARCHAR(30) NOT NULL,
  folio               VARCHAR(50),
  provider            VARCHAR(30) NOT NULL DEFAULT 'MOCK',
  provider_doc_id     VARCHAR(100),
  pdf_url             VARCHAR(500),
  xml_url             VARCHAR(500),
  monto               INT NOT NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  emitido_at          TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_tributarios_tenant ON documentos_tributarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_docs_tributarios_estado ON documentos_tributarios(estado);

\echo '[8] documentos_tributarios verificada'

-- ── 9. Sprint 7C: cobros.estado_dunning ──────────────────────────────
ALTER TABLE cobros
  ADD COLUMN IF NOT EXISTS estado_dunning VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ultimo_recordatorio_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cantidad_recordatorios INT NOT NULL DEFAULT 0;

\echo '[9] cobros.estado_dunning + recordatorios asegurados'

-- ── 10. Sprint 8: suspensión de partidos y fechas ───────────────────
ALTER TABLE partidos
  ADD COLUMN IF NOT EXISTS motivo_suspension VARCHAR(30),
  ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspendido_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS observaciones_suspension TEXT;

ALTER TABLE fechas
  ADD COLUMN IF NOT EXISTS motivo_suspension VARCHAR(30),
  ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspendido_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS observaciones_suspension TEXT;

\echo '[10] columnas de suspensión en partidos+fechas aseguradas'

-- ── 11. Sprint 10: magic_links (onboarding + reset password) ─────────
-- magic_links debería existir desde InitialSchema, pero si por algún
-- motivo no, lo creamos. Las columnas de payload se aseguran ADD IF.
CREATE TABLE IF NOT EXISTS magic_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  purpose         VARCHAR(30) NOT NULL,
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  email           VARCHAR(150),
  phone           VARCHAR(20),
  personal_id     UUID,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR personal_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token_hash);

\echo '[11] magic_links verificada'

-- ── 12. Sprint 12: torneos.tabla_tiebreakers (CAUSA DEL INCIDENTE) ───
ALTER TABLE torneos
  ADD COLUMN IF NOT EXISTS tabla_tiebreakers JSONB
    NOT NULL DEFAULT '["pts","dg","gf","nombre"]'::jsonb;

\echo '[12] torneos.tabla_tiebreakers asegurada (Sprint 12)'

-- ── 13. Sprint 14: push_subscriptions ────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  scope_type      VARCHAR(20) NOT NULL,
  scope_id        UUID,
  provider        VARCHAR(20) NOT NULL DEFAULT 'MOCK',
  endpoint        TEXT NOT NULL,
  p256dh          TEXT,
  auth            TEXT,
  user_agent      VARCHAR(300),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tenant ON push_subscriptions(tenant_id);

\echo '[13] push_subscriptions verificada'

-- ── 14. AUDIT-3: jugadores_inscritos.torneo_id + UNIQUE rut×torneo ───
ALTER TABLE jugadores_inscritos
  ADD COLUMN IF NOT EXISTS torneo_id UUID;

-- Backfill desde equipo si quedó NULL
UPDATE jugadores_inscritos j
   SET torneo_id = e.torneo_id
  FROM equipos e
 WHERE j.equipo_id = e.id AND j.torneo_id IS NULL;

-- Hacer NOT NULL una vez backfilled (si la columna sigue NULL es porque
-- el equipo no existe — caso anómalo que el operador debe limpiar a mano)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM jugadores_inscritos WHERE torneo_id IS NULL) THEN
    RAISE NOTICE 'WARN: jugadores_inscritos con torneo_id NULL — revisar a mano antes de aplicar NOT NULL.';
  ELSE
    ALTER TABLE jugadores_inscritos ALTER COLUMN torneo_id SET NOT NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_jugadores_torneo ON jugadores_inscritos(torneo_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jugador_rut_torneo
  ON jugadores_inscritos(rut, torneo_id)
  WHERE rut IS NOT NULL AND activo = TRUE;

\echo '[14] jugadores_inscritos.torneo_id + UNIQUE asegurados (AUDIT-3)'

-- ── 15. AUDIT-7: índices de performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_partidos_fecha_estado ON partidos(fecha_id, estado);
CREATE INDEX IF NOT EXISTS idx_partidos_tabla
  ON partidos(estado, fecha_id)
  WHERE estado IN ('FINALIZADO','WALKOVER');
CREATE INDEX IF NOT EXISTS idx_sanciones_rut_torneo
  ON sanciones_activas(torneo_id, rut, cumplida)
  WHERE rut IS NOT NULL;

\echo '[15] índices de performance asegurados (AUDIT-7)'

-- ── 16. AUDIT-11: users.scheduled_deletion_at (Ley 19.628) ──────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_scheduled_deletion
  ON users(scheduled_deletion_at)
  WHERE scheduled_deletion_at IS NOT NULL;

\echo '[16] users.scheduled_deletion_at asegurada (AUDIT-11)'

-- ── 17. Conteos finales para verificar ───────────────────────────────
\echo ''
\echo '──── VERIFICACIÓN POST-HEAL ────'

-- Confirmar columnas críticas del incidente 2026-05-28
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='torneos' AND column_name='tabla_tiebreakers')
       THEN '✅' ELSE '❌' END || ' torneos.tabla_tiebreakers' AS check
UNION ALL SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='users' AND column_name='scheduled_deletion_at')
       THEN '✅' ELSE '❌' END || ' users.scheduled_deletion_at'
UNION ALL SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='jugadores_inscritos' AND column_name='torneo_id')
       THEN '✅' ELSE '❌' END || ' jugadores_inscritos.torneo_id';


SELECT 'partidos' AS tabla, COUNT(*) AS filas FROM partidos
UNION ALL SELECT 'torneos',  COUNT(*) FROM torneos
UNION ALL SELECT 'fechas',   COUNT(*) FROM fechas
UNION ALL SELECT 'canchas',  COUNT(*) FROM canchas
UNION ALL SELECT 'cobros',   COUNT(*) FROM cobros
UNION ALL SELECT 'equipos',  COUNT(*) FROM equipos
UNION ALL SELECT 'personal', COUNT(*) FROM personal
ORDER BY tabla;

\echo ''
\echo '──── Columnas críticas de partidos ────'
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name='partidos' AND column_name IN ('cancha_id','cancha_nombre','fecha_hora')
 ORDER BY column_name;

COMMIT;

\echo ''
\echo '✅ heal-prod-schema completado. Ahora hacé: docker compose restart api'
