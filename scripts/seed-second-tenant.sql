-- ════════════════════════════════════════════════════════════════════
-- SEED SEGUNDO TENANT DEMO — Sprint 36 (multi-tenant white-label)
-- ════════════════════════════════════════════════════════════════════
--
-- Objetivo: crear un segundo tenant en producción para demostrar a
-- futuros clientes que la plataforma soporta múltiples ligas con
-- branding y datos completamente aislados (RLS).
--
-- Idempotente: se puede ejecutar múltiples veces sin duplicar datos.
--
-- Personalizar los valores del bloque DECLARE antes de correr.
-- Password admin por defecto: Fixtura2026!
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- Bypass de RLS para escrituras cross-tenant.
SELECT set_config('app.current_tenant_id', '', true);

DO $$
DECLARE
  -- ─── PARAMETROS ────────────────────────────────────────────────
  v_slug            TEXT := 'liga-norte-demo';
  v_nombre          TEXT := 'Liga Norte Amateur';
  v_custom_domain   TEXT := 'demo.liga-norte.cl';  -- dominio que el cliente apunta al VPS
  v_admin_email     TEXT := 'admin@liga-norte.cl';
  -- bcrypt('Fixtura2026!', 12) — para cambiar password, generá un nuevo hash con
  -- `docker compose exec api node -e "console.log(require('bcrypt').hashSync('TuPass', 12))"`
  v_admin_pass_hash TEXT := '$2b$12$KIXxPfnK8YHrV3JZxCkSm.uo7p5BJj7Xfq3vP5wGvqWzN9LhYx3vS';
  v_color_primario  TEXT := '#1e40af';  -- azul para diferenciar visualmente
  v_color_acento    TEXT := '#fbbf24';

  -- ─── Internos ──────────────────────────────────────────────────
  v_tenant_id     UUID;
  v_user_id       UUID;
  v_temporada_id  UUID;
  v_categoria_id  UUID;
  v_torneo_act_id UUID;
BEGIN
  -- ─── 1. Tenant ──────────────────────────────────────────────────
  INSERT INTO tenants (slug, nombre, tipo, plan, branding_json, custom_domain, is_active)
  VALUES (
    v_slug,
    v_nombre,
    'LIGA',
    'STARTER',
    jsonb_build_object(
      'colorPrimario', v_color_primario,
      'colorAcento',   v_color_acento,
      'tagline',       'Fútbol amateur del norte de Chile'
    ),
    v_custom_domain,
    TRUE
  )
  ON CONFLICT (slug) DO UPDATE
    SET nombre        = EXCLUDED.nombre,
        branding_json = EXCLUDED.branding_json,
        custom_domain = EXCLUDED.custom_domain
  RETURNING id INTO v_tenant_id;

  RAISE NOTICE 'Tenant: % (id=%)', v_slug, v_tenant_id;

  -- ─── 2. Usuario admin ──────────────────────────────────────────
  INSERT INTO users (email, password_hash, nombre, apellido, idioma_pref, is_active)
  VALUES (v_admin_email, v_admin_pass_hash, 'Admin', 'Liga Norte', 'es', TRUE)
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash
  RETURNING id INTO v_user_id;

  INSERT INTO user_roles (tenant_id, user_id, role, scope_type, scope_id)
  VALUES (v_tenant_id, v_user_id, 'LIGA_ADMIN', 'TENANT', v_tenant_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Admin: % (id=%)', v_admin_email, v_user_id;

  -- ─── 3. Setear tenant_id para inserts RLS-aware ────────────────
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- ─── 4. Temporada 2026 ─────────────────────────────────────────
  SELECT id INTO v_temporada_id FROM temporadas
    WHERE tenant_id = v_tenant_id AND anio = 2026 LIMIT 1;

  IF v_temporada_id IS NULL THEN
    INSERT INTO temporadas (tenant_id, nombre, anio, fecha_inicio, fecha_fin)
    VALUES (v_tenant_id, 'Temporada 2026', 2026, '2026-03-01', '2026-12-15')
    RETURNING id INTO v_temporada_id;
    RAISE NOTICE 'Temporada 2026 creada (id=%)', v_temporada_id;
  END IF;

  -- ─── 5. Categoria PRIMERA con serie A ──────────────────────────
  SELECT id INTO v_categoria_id FROM categorias_jugadores
    WHERE tenant_id = v_tenant_id AND slug = 'primera' LIMIT 1;

  IF v_categoria_id IS NULL THEN
    INSERT INTO categorias_jugadores (
      tenant_id, slug, nombre, descripcion,
      edad_minima_general, orden, activa, series
    )
    VALUES (
      v_tenant_id, 'primera', 'Primera División', 'Categoría única - mayores de 18',
      18, 1, TRUE,
      jsonb_build_array(
        jsonb_build_object('slug', 'a', 'nombre', 'Serie A')
      )
    )
    RETURNING id INTO v_categoria_id;
    RAISE NOTICE 'Categoria Primera creada (id=%)', v_categoria_id;
  END IF;

  -- ─── 6. Torneo ACTIVO: Apertura 2026 ────────────────────────────
  SELECT id INTO v_torneo_act_id FROM torneos
    WHERE tenant_id = v_tenant_id AND slug = 'apertura-2026' LIMIT 1;

  IF v_torneo_act_id IS NULL THEN
    INSERT INTO torneos (
      tenant_id, temporada_id, slug, nombre, estado,
      tipo_formato, ruedas, puntos_victoria, puntos_empate, puntos_derrota,
      fecha_inicio, fecha_fin,
      categoria_id,
      categorias_series, tope_jugadores_por_equipo, refuerzos_habilitados,
      duracion_periodo_minutos, duracion_entretiempo_minutos
    ) VALUES (
      v_tenant_id, v_temporada_id, 'apertura-2026', 'Apertura 2026', 'ACTIVO',
      'ROUND_ROBIN', 1, 3, 1, 0,
      '2026-03-15', '2026-07-15',
      v_categoria_id,
      jsonb_build_array(
        jsonb_build_object(
          'categoriaId', v_categoria_id::text,
          'serieSlug',   'a',
          'cupoEquipos', 12
        )
      ),
      22, FALSE,
      40, 10
    )
    RETURNING id INTO v_torneo_act_id;
    RAISE NOTICE 'Torneo Apertura 2026 creado (id=%)', v_torneo_act_id;
  END IF;

  -- ─── 7. Torneo CERRADO: Clausura 2025 (historico) ──────────────
  IF NOT EXISTS (
    SELECT 1 FROM torneos
    WHERE tenant_id = v_tenant_id AND slug = 'clausura-2025'
  ) THEN
    INSERT INTO torneos (
      tenant_id, temporada_id, slug, nombre, estado,
      tipo_formato, ruedas, puntos_victoria, puntos_empate, puntos_derrota,
      fecha_inicio, fecha_fin,
      categoria_id,
      categorias_series, tope_jugadores_por_equipo, refuerzos_habilitados,
      duracion_periodo_minutos, duracion_entretiempo_minutos
    ) VALUES (
      v_tenant_id, v_temporada_id, 'clausura-2025', 'Clausura 2025', 'CERRADO',
      'ROUND_ROBIN', 1, 3, 1, 0,
      '2025-08-01', '2025-12-10',
      v_categoria_id,
      jsonb_build_array(
        jsonb_build_object(
          'categoriaId', v_categoria_id::text,
          'serieSlug',   'a',
          'cupoEquipos', 12
        )
      ),
      22, FALSE,
      40, 10
    );
    RAISE NOTICE 'Torneo Clausura 2025 (historico) creado';
  END IF;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  Tenant demo listo: %', v_slug;
  RAISE NOTICE '  Dominio: %', v_custom_domain;
  RAISE NOTICE '  Login admin: % / Fixtura2026!', v_admin_email;
  RAISE NOTICE '  Apertura 2026 (ACTIVO) + Clausura 2025 (CERRADO)';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

COMMIT;
