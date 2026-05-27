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

-- ── 7. Conteos finales para verificar ───────────────────────────────
\echo ''
\echo '──── VERIFICACIÓN POST-HEAL ────'

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
