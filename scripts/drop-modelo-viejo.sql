-- ============================================================================
-- ADR-0005 Fase 2 — Drop destructivo del modelo viejo (shim "equipo sombra").
--
-- Mismo efecto que la migración formal 1748430000000-DropModeloViejo, pero
-- pensado para correrse a mano en prod donde el deploy NO ejecuta migraciones
-- formales (el schema lo maneja cleanup-orphans). Idempotente y con un
-- pre-check que ABORTA si quedan filas históricas sin mapear al modelo nuevo
-- (evita perder datos al dropear).
--
-- USO (con backup previo OBLIGATORIO):
--   pg_dump ... > backup_pre_drop.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/drop-modelo-viejo.sql
--
-- Corre dentro de una transacción: si el pre-check falla, NO dropea nada.
-- Requiere que el código de la app (cleanup-orphans + servicios) ya NO lea ni
-- escriba el modelo viejo — deployar ESA versión ANTES de correr esto.
-- ============================================================================

BEGIN;

-- ── Pre-check: huérfanos sin mapear ────────────────────────────────────────
-- Si alguna fila histórica del modelo viejo no tiene su contraparte nueva,
-- dropear perdería ese vínculo. Abortamos para resolverlo a mano primero.
DO $$
DECLARE
  v_part   INT;
  v_inc    INT;
  v_incjug INT;
  v_cob    INT;
BEGIN
  SELECT COUNT(*) INTO v_part FROM partidos
    WHERE (equipo_local_id IS NOT NULL AND inscripcion_local_id IS NULL)
       OR (equipo_visita_id IS NOT NULL AND inscripcion_visita_id IS NULL);
  SELECT COUNT(*) INTO v_inc FROM incidencias_partido
    WHERE equipo_id IS NOT NULL AND inscripcion_id IS NULL;
  SELECT COUNT(*) INTO v_incjug FROM incidencias_partido
    WHERE jugador_inscrito_id IS NOT NULL AND jugador_id IS NULL;
  SELECT COUNT(*) INTO v_cob FROM cobros
    WHERE equipo_id IS NOT NULL AND inscripcion_id IS NULL;

  IF (v_part + v_inc + v_incjug + v_cob) > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: hay huérfanos sin mapear al modelo nuevo — partidos=%, incidencias_sin_insc=%, incidencias_sin_jug=%, cobros=%. Resolver el backfill (cleanup-orphans Fase 1) antes de dropear.',
      v_part, v_inc, v_incjug, v_cob;
  END IF;

  RAISE NOTICE 'Pre-check OK: sin huérfanos. Procediendo al drop.';
END $$;

-- ── Drop de columnas FK al modelo viejo ────────────────────────────────────
-- Dropear las columnas dropea también sus índices y el CHECK de partidos
-- ("equipo_local_id" <> "equipo_visita_id").
ALTER TABLE partidos
  DROP COLUMN IF EXISTS equipo_local_id,
  DROP COLUMN IF EXISTS equipo_visita_id;

ALTER TABLE incidencias_partido
  DROP COLUMN IF EXISTS equipo_id,
  DROP COLUMN IF EXISTS jugador_inscrito_id;

ALTER TABLE sanciones_activas
  DROP COLUMN IF EXISTS jugador_inscrito_id;

ALTER TABLE cobros
  DROP COLUMN IF EXISTS equipo_id;

ALTER TABLE inscripciones_torneo
  DROP COLUMN IF EXISTS equipo_sombra_id;

-- ── Drop de tablas del modelo viejo ────────────────────────────────────────
-- Orden: primero las que dependen por FK, luego las referenciadas.
DROP TABLE IF EXISTS jugadores_inscritos CASCADE;
DROP TABLE IF EXISTS equipos CASCADE;
DROP TABLE IF EXISTS series CASCADE;

COMMIT;

\echo 'ADR-0005 Fase 2: modelo viejo (equipos/jugadores_inscritos/series + columnas FK) eliminado.'
