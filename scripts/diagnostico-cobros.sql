-- ─────────────────────────────────────────────────────────────────────
-- diagnostico-cobros.sql  (SOLO LECTURA — no modifica nada)
--
-- Distingue por qué la recaudación muestra números inflados:
--   (A) cobros duplicados reales  vs.  (B) equipos/torneos duplicados.
--
-- USO (en el VPS):
--   docker compose cp scripts/diagnostico-cobros.sql db:/tmp/diag.sql
--   docker compose exec db psql -U fixtura -d fixtura -f /tmp/diag.sql
--
-- Copiá y pegá la salida completa para prescribir el saneo exacto.
-- ─────────────────────────────────────────────────────────────────────

\echo '════ 1. Conteos globales por tenant ════'
SELECT
  t.slug AS tenant,
  (SELECT COUNT(*) FROM torneos       x WHERE x.tenant_id = t.id) AS torneos,
  (SELECT COUNT(*) FROM equipos       x WHERE x.tenant_id = t.id) AS equipos,
  (SELECT COUNT(*) FROM inscripciones_torneo x WHERE x.tenant_id = t.id) AS inscripciones,
  (SELECT COUNT(*) FROM partidos      x WHERE x.tenant_id = t.id) AS partidos,
  (SELECT COUNT(*) FROM incidencias_partido x WHERE x.tenant_id = t.id) AS incidencias,
  (SELECT COUNT(*) FROM cobros        x WHERE x.tenant_id = t.id) AS cobros
FROM tenants t
ORDER BY t.slug;

\echo '════ 2. ¿Hay TORNEOS duplicados? (misma temporada + nombre) ════'
SELECT tenant_id, temporada_id, nombre, COUNT(*) AS veces
FROM torneos
GROUP BY tenant_id, temporada_id, nombre
HAVING COUNT(*) > 1
ORDER BY veces DESC
LIMIT 20;

\echo '════ 3. ¿Hay EQUIPOS duplicados? (mismo torneo + nombre) ════'
SELECT tenant_id, torneo_id, nombre, COUNT(*) AS veces
FROM equipos
GROUP BY tenant_id, torneo_id, nombre
HAVING COUNT(*) > 1
ORDER BY veces DESC
LIMIT 20;

\echo '════ 4. ¿Hay INSCRIPCIONES duplicadas? (mismo torneo + club + categoría) ════'
SELECT tenant_id, torneo_id, club_id, categoria_id, COUNT(*) AS veces
FROM inscripciones_torneo
GROUP BY tenant_id, torneo_id, club_id, categoria_id
HAVING COUNT(*) > 1
ORDER BY veces DESC
LIMIT 20;

\echo '════ 5. ¿Hay COBROS duplicados reales? (misma clave natural) ════'
SELECT
  categoria,
  COUNT(*) AS grupos_duplicados,
  SUM(veces) AS filas_en_grupos,
  SUM(veces - 1) AS filas_sobrantes
FROM (
  SELECT
    categoria,
    COUNT(*) AS veces
  FROM cobros
  GROUP BY
    tenant_id, torneo_id,
    COALESCE(equipo_id, inscripcion_id),
    tarifa_id, categoria,
    COALESCE(periodo_anio, -1),
    COALESCE(periodo_mes, -1),
    COALESCE(periodo_semana, -1),
    concepto
  HAVING COUNT(*) > 1
) g
GROUP BY categoria
ORDER BY categoria;

\echo '════ 6. Cobros por torneo (para ver si se reparten en N torneos) ════'
SELECT
  c.torneo_id,
  tor.nombre AS torneo,
  tor.estado,
  COUNT(*) AS cobros
FROM cobros c
LEFT JOIN torneos tor ON tor.id = c.torneo_id
GROUP BY c.torneo_id, tor.nombre, tor.estado
ORDER BY cobros DESC
LIMIT 20;

\echo '════ 7. ¿El índice único de cuotas existe? ════'
SELECT indexname
FROM pg_indexes
WHERE tablename = 'cobros'
  AND indexname LIKE '%cuota%';
