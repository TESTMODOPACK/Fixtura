-- ─────────────────────────────────────────────────────────────────────
-- heal-cobros-duplicados.sql
--
-- Saneo de COBROS duplicados (matrícula, cuota o multa repetidos). Útil
-- cuando la recaudación / morosos / multas muestran filas idénticas
-- repetidas N veces.
--
-- ANTES DE CORRER: ejecutá scripts/diagnostico-cobros.sql. Este script
-- SOLO sirve si la duplicación es de COBROS con la misma clave natural.
-- Si el diagnóstico muestra EQUIPOS / INSCRIPCIONES / TORNEOS duplicados,
-- este script NO los toca (no comparten clave) y hay que limpiar esa capa
-- primero — pedímelo y lo armo.
--
-- QUÉ BORRA (conservador): solo cobros con generado_auto = TRUE, NO
-- pagados (pagado_at IS NULL), NO cancelados, que sean duplicado EXACTO
-- por la clave natural completa:
--   (tenant, torneo, categoria, tarifa, equipo, inscripción, partido,
--    período año/mes/semana, concepto).
-- De cada grupo conserva el más antiguo y borra el resto.
--
-- QUÉ NO TOCA: cobros pagados, cancelados a mano, manuales (no auto), ni
-- nada que no sea un duplicado exacto. Dos cobros de jugadores/períodos
-- distintos NO se colapsan (el concepto y el período los diferencian).
--
-- Seguro de correr más de una vez. RECOMENDADO: backup antes
-- (scripts/backup-db.sh) y revisar el COUNT de diagnóstico de abajo.
--
-- USO (en el VPS):
--   docker compose cp scripts/heal-cobros-duplicados.sql db:/tmp/heal.sql
--   docker compose exec db psql -U fixtura -d fixtura -f /tmp/heal.sql
-- ─────────────────────────────────────────────────────────────────────

\echo '──── Diagnóstico: cobros auto duplicados a borrar (por categoría) ────'

WITH dup AS (
  SELECT
    id,
    categoria,
    ROW_NUMBER() OVER (
      PARTITION BY
        tenant_id, torneo_id, categoria, tarifa_id,
        COALESCE(equipo_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(inscripcion_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(partido_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(periodo_anio, -1),
        COALESCE(periodo_mes, -1),
        COALESCE(periodo_semana, -1),
        concepto
      ORDER BY created_at ASC, ctid ASC
    ) AS rn
  FROM cobros
  WHERE generado_auto = TRUE
    AND pagado_at IS NULL
    AND cancelado = FALSE
)
SELECT categoria, COUNT(*) AS filas_a_borrar
FROM dup
WHERE rn > 1
GROUP BY categoria
ORDER BY categoria;

\echo '──── Borrando duplicados (conserva 1 por grupo) ────'

BEGIN;

WITH dup AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        tenant_id, torneo_id, categoria, tarifa_id,
        COALESCE(equipo_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(inscripcion_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(partido_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(periodo_anio, -1),
        COALESCE(periodo_mes, -1),
        COALESCE(periodo_semana, -1),
        concepto
      ORDER BY created_at ASC, ctid ASC
    ) AS rn
  FROM cobros
  WHERE generado_auto = TRUE
    AND pagado_at IS NULL
    AND cancelado = FALSE
)
DELETE FROM cobros c
USING dup
WHERE c.id = dup.id
  AND dup.rn > 1;

COMMIT;

\echo '──── heal-cobros-duplicados completado ────'
