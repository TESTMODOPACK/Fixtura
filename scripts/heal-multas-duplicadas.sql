-- ─────────────────────────────────────────────────────────────────────
-- heal-multas-duplicadas.sql
--
-- Saneo de multas automáticas DUPLICADAS (mismo cobro repetido N veces).
-- Causa: incidencias duplicadas en la BD (acta cargada dos veces o seed
-- re-corrido) → cada cierre de acta generaba una multa por cada copia.
-- El fix de código (dedup en aplicarMultasDePartido) ya evita que se
-- vuelvan a generar; este script limpia las que YA quedaron.
--
-- QUÉ BORRA (conservador):
--   solo cobros con generado_auto = TRUE, NO pagados (pagado_at IS NULL),
--   NO cancelados, que sean duplicado EXACTO por
--   (tenant_id, partido_id, inscripcion_id, tarifa_id, concepto).
--   El concepto incluye jugador + minuto, así que NO colapsa multas de
--   jugadores distintos del mismo club. De cada grupo conserva la más
--   antigua (created_at, ctid) y borra el resto.
--
-- QUÉ NO TOCA: multas pagadas, canceladas a mano, manuales, ni cuotas
--   ni matrículas. Tampoco toca las incidencias ni las sanciones.
--
-- Seguro de correr más de una vez (si no hay duplicados, no borra nada).
--
-- RECOMENDADO: hacer backup antes (scripts/backup-db.sh) y correr primero
-- el SELECT de diagnóstico para ver cuántas filas se borrarían.
--
-- USO (en el VPS):
--   docker compose cp scripts/heal-multas-duplicadas.sql db:/tmp/heal.sql
--   docker compose exec db psql -U fixtura -d fixtura -f /tmp/heal.sql
-- ─────────────────────────────────────────────────────────────────────

\echo '──── Diagnóstico: multas auto duplicadas a borrar ────'

WITH dup AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, partido_id, inscripcion_id, tarifa_id, concepto
      ORDER BY created_at ASC, ctid ASC
    ) AS rn
  FROM cobros
  WHERE generado_auto = TRUE
    AND pagado_at IS NULL
    AND cancelado = FALSE
    AND partido_id IS NOT NULL
    AND categoria = 'MULTA'
)
SELECT COUNT(*) AS filas_a_borrar
FROM dup
WHERE rn > 1;

\echo '──── Borrando duplicados (conserva 1 por grupo) ────'

BEGIN;

WITH dup AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, partido_id, inscripcion_id, tarifa_id, concepto
      ORDER BY created_at ASC, ctid ASC
    ) AS rn
  FROM cobros
  WHERE generado_auto = TRUE
    AND pagado_at IS NULL
    AND cancelado = FALSE
    AND partido_id IS NOT NULL
    AND categoria = 'MULTA'
)
DELETE FROM cobros c
USING dup
WHERE c.id = dup.id
  AND dup.rn > 1;

COMMIT;

\echo '──── heal-multas-duplicadas completado ────'
