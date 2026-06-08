# ADR-0008 — Tarifa por rol arbitral + devengo de pagos al cerrar acta

- Estado: Aceptada
- Fecha: 2026-06-07
- Relacionado: ADR-0005 (designaciones), ADR-0006 (pagos a personal).

## Contexto

Tres ajustes operativos pedidos por la liga:

1. En Finanzas faltaba filtrar por **concepto** (categoría del cobro).
2. Los **pagos a personal** quedaban en $0 aunque hubiera fechas terminadas:
   el devengo (ADR-0006) ocurre cuando una designación pasa a ASISTIO, pero
   cerrar el acta no marcaba ASISTIO — había que hacerlo a mano.
3. Un **árbitro** puede actuar de principal o de asistente, y cobra distinto
   según el rol; el modelo tenía un único `rol` y una única `tarifaBase`.

## Decisiones

### 1. Filtro por concepto en Finanzas
`GET /admin/cobros` acepta `categoria` (validada contra `CATEGORIA_COBRO`).
Filtro adicional a torneo/club/origen. Sin cambios de schema.

### 2. Devengo automático al cerrar acta
`cerrarActa` marca las designaciones del partido en estado PROPUESTA/CONFIRMADA
como **ASISTIO** (el partido se jugó → el personal asistió). Esto genera las
cuentas por pagar sin paso manual. RECHAZADA/AUSENTE/ya-ASISTIO se respetan; el
admin puede corregir a AUSENTE a quien no se presentó. Idempotente (re-cerrar no
duplica) y best-effort (no bloquea el cierre del acta).

**Retroactividad:** aplica a partidos cerrados DESPUÉS del deploy. Para fechas ya
terminadas antes, reabrir+cerrar el acta (o marcar ASISTIO manual en
Designación de personal).

### 3. Tarifa por rol — árbitros intercambiables ("ambos roles")
Opción elegida con el usuario: **tarifa por rol + ambos roles**.

- `Personal` suma `tarifa_arbitro_principal` y `tarifa_arbitro_asistente`
  (nullables, aditivas). `tarifaBase` queda como fallback (y para planillero /
  otros).
- `resolverTarifa(personal, rolAsignado)`: si hay tarifa específica del rol
  arbitral, prevalece; si no, cae a `tarifaBase`. Usado en `asignar` (manual) y
  en la auto-asignación.
- **Elegibilidad**: en la auto-asignación, para roles arbitrales (principal /
  asistente) cualquier árbitro (`rol ∈ {ARBITRO_PRINCIPAL, ARBITRO_ASISTENTE}`)
  es candidato a **ambos** roles. Para PLANILLERO se mantiene match exacto (no se
  usan árbitros como fallback).
- **Guard nuevo**: un mismo árbitro no puede cubrir dos roles del MISMO partido
  en la auto-asignación (se excluye a quien ya quedó designado en ese partido en
  cualquier rol). El doble-booking cross-partido (<2h) y las ausencias (F48)
  siguen vigentes.

El `montoPago` de la designación sigue siendo un snapshot al momento de asignar;
las designaciones viejas conservan su monto.

## Notas

- Todo aditivo/no destructivo. `cleanup-orphans` agrega las dos columnas de
  tarifa al arranque.
- El monto a pagar manualmente en `asignar` sigue pudiéndose sobreescribir
  (`input.montoPago`).
