# ADR-0015 — Cumplimiento de sanciones como libro mayor

- **Estado**: aceptada (2026-10-07)
- **Origen**: auditoría oct-2026, hallazgo **A-4** (contadores sin dueño). Tareas T16–T21 del plan de remediación. Complementa ADR-0013 (RLS v2).

## Contexto

El cumplimiento de suspensiones vivía solo en dos contadores de
`sanciones_activas` (`fechas_pendientes`, `cumplida`) mutados por el cierre de
fecha, sin registro de QUÉ fecha descontó QUÉ sanción. Defectos verificados:

- **La reversión era ciega**: reabrir un acta sumaba +1 a TODAS las sanciones
  del torneo con `desde <= N` — revivía sanciones cumplidas por otras fechas y
  hasta revocadas por el tribunal.
- **`ajustar` no tocaba `fechas_totales`** → el `LEAST` de la reversión
  recortaba una sanción agravada a 4 fechas de vuelta a 1.
- **Una fecha con un NO_JUGADO/SUSPENDIDO no se finalizaba nunca** (el cierre
  exigía FINALIZADO|WALKOVER en todos) → las suspensiones no se descontaban.
- **Write skew**: dos planilleros cerrando las 2 últimas actas en paralelo —
  ninguno veía la fecha completa y la fecha quedaba abierta.
- El criterio "sanción vigente" estaba copiado con variantes en 7 servicios
  (el carnet QR ignoraba `desde_fecha_numero` y bloqueaba sanciones futuras).

## Decisión

### 1. Tabla `sancion_cumplimientos` (el ledger)

Una fila = "la fecha X descontó 1 fecha a la sanción Y":
`(id, tenant_id, sancion_id→CASCADE, fecha_id→CASCADE, created_at)` con
`UNIQUE (sancion_id, fecha_id)`, RLS v2 e índices por tenant y fecha.
La crea cleanup-orphans (aditivo).

- **Descuento** (`decrementarSancionesPendientes`): por cada sanción vigente
  del torneo (`sancionVigente(s, fecha.numero)` de `packages/domain`), INSERT
  al ledger con `ON CONFLICT DO NOTHING`; **solo si la fila entró** se
  decrementa (`GREATEST(pendientes-1, 0)`). Idempotente por fecha: re-evaluar
  una fecha ya finalizada no descuenta dos veces.
- **Reversión** (`revertirDecrementoSanciones`): lee el ledger de ESA fecha,
  devuelve +1 SOLO a esas sanciones (capeado por `fechas_totales`), nunca a
  las `revocada = true`, y borra las filas. Lo que la fecha no descontó, no se
  toca.
- **Sin backfill**: no existe registro histórico de qué fecha descontó qué.
  Reabrir una fecha finalizada ANTES de este deploy no revierte descuentos
  (conservador: el comportamiento anterior sobre-revertía). Las sanciones
  automáticas borradas al reabrir un acta arrastran su ledger por CASCADE.

### 2. Flag `revocada` en `sanciones_activas`

`revoke()` del tribunal ahora marca `revocada = true` (antes solo
`pendientes=0 + cumplida`, indistinguible de una cumplida real). Una revocada
jamás revive — ni por reversión del ledger ni por `sancionVigente`. Solo un
`ajustar` explícito con fechas > 0 la re-activa. Healing: las revocadas
pre-columna se detectan por el stamp `[Revocada por tribunal]` en la
descripción.

`ajustar` además sube `fechas_totales` cuando el ajuste supera el total (T18).

### 3. Máquina de estados de partido/fecha (`packages/domain/partidos`)

- `esPartidoResuelto`: FINALIZADO, WALKOVER, NO_JUGADO,
  SUSPENDIDO_FUERZA_MAYOR, REPROGRAMADO — ya no se espera acta de ellos.
- `cuentaParaTabla`: FINALIZADO, WALKOVER — los únicos que suman puntos.
- `fechaCompleta(estados)`: todos resueltos (y al menos uno).

La fecha se cierra cuando está COMPLETA, no cuando todo se jugó (T16). Las
transiciones disparan la evaluación simétrica:

| Transición | Efecto sobre la fecha |
|---|---|
| cerrar acta, walkover, suspender, marcar NO_JUGADO | `evaluarCierreDeFecha` (finaliza + descuenta si quedó completa) |
| reabrir acta, anular walkover, reactivar, reprogramar | `revertirCierreDeFecha` (reabre + revierte el descuento de ESA fecha) |

Ambas toman **`SELECT … FOR UPDATE` sobre la fila de `fechas`** antes de leer
los partidos hermanos (T17): dos actas cerrándose en paralelo se serializan y
la segunda ve el estado final — fin del write skew. Orden canónico de locks:
partido (update del caller) → fecha.

### 4. Criterio único de vigencia (`sancionVigente`)

`packages/domain/sanciones/vigencia.ts`: no cumplida, no revocada,
pendientes > 0, y `desde_fecha_numero <= fecha` cuando se sabe qué fecha se
evalúa. Reemplazó las 7 copias (carnet con la próxima fecha no finalizada del
torneo — T19; tribunal, roster/incidencias, delegado, dashboard,
jugadores-global, decremento, y los KPI de la web). Los literales
`IN ('FINALIZADO','WALKOVER')` de tablas/estadísticas usan
`ESTADOS_PARTIDO_CUENTAN_TABLA`, y los bloqueadores de "pendientes"
(siembra de playoffs, `suspenderFecha`) usan `ESTADOS_PARTIDO_RESUELTO`.

## Consecuencias

- Reabrir/cerrar deja de ser destructivo: cerrar → reabrir → cerrar converge
  al mismo estado (identidad), y el historial de cumplimiento es
  reconstruible por fecha.
- Un partido suspendido/no jugado ya no congela la disciplina del torneo: la
  fecha cierra y las suspensiones corren. Si después se reactiva o
  reprograma, la fecha se reabre y SU descuento se revierte exacto.
- El costo: toda transición de estado de partido pasa por los helpers con
  lock — un flujo nuevo que mute `partidos.estado` a mano repite el bug.
- `informes.sancionadosVigentes` conserva su semántica de reporte
  (`incluirCumplidas`); las revocadas aparecen como cumplidas ahí hasta que
  la UI distinga el flag (expuesto ya en el DTO).

## Alternativas descartadas

- **Evento/log de dominio genérico**: más general, pero el UNIQUE
  `(sancion, fecha)` del ledger ES la regla de negocio (una fecha descuenta a
  lo sumo 1) y da la idempotencia gratis.
- **Snapshot de contadores al cerrar la fecha**: permite revertir pero no
  distingue qué sanción descontó esa fecha de las creadas después.
