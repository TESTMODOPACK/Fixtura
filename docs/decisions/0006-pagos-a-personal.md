# ADR-0006 — Pagos a personal (cuentas por pagar + liquidaciones)

Estado: Aceptado · Fecha: 2026-06-07

## Contexto

El personal operativo de la liga (árbitros, asistentes, planilleros,
paramédicos) cobra por trabajar partidos. Hasta ahora el sistema registraba
designaciones con un `montoPago` (heredado de `tarifaBase` del personal) pero
no había forma de llevar las **cuentas por pagar** ni de registrar las
**liquidaciones** (pagos) a cada persona.

F47 agrega ese módulo: cuánto le debe la liga a cada persona y registrar
cuándo y cómo se le pagó.

## Decisión

Tres reglas (definidas con el dueño del producto):

1. **Devengo = cuando ASISTIO.** La cuenta por pagar de una persona por un
   partido se genera cuando su designación queda en estado `ASISTIO` (asistió
   y trabajó). Si la designación queda `AUSENTE`/`RECHAZADA`, no se paga. No
   hay tabla de devengo separada: la "cuenta por pagar pendiente" es una
   **designación ASISTIO que todavía no fue incluida en una liquidación**.

2. **Monto = `Designacion.montoPago`.** Reusa el monto que ya tiene cada
   designación (hereda la `tarifaBase` del personal y es editable por
   partido). No se agrega una tabla de tarifas por rol.

3. **Liquidación = pago agrupado por persona.** Una liquidación junta varias
   cuentas pendientes de una misma persona y las marca pagadas de una sola
   vez, registrando método (transferencia/efectivo/otro), comprobante/nota y
   fecha de pago.

## Modelo de datos

- Tabla nueva `liquidaciones_personal` (RLS FORCE): `id`, `tenant_id`,
  `personal_id`, `total` (snapshot = suma de los montos al liquidar),
  `metodo_pago`, `comprobante`, `observaciones`, `fecha_pago`, `created_by`,
  timestamps.
- Columna aditiva `designaciones.liquidacion_id` (UUID, nullable, FK a
  `liquidaciones_personal` ON DELETE SET NULL).
  - `liquidacion_id IS NULL` + `estado = 'ASISTIO'` → **cuenta pendiente**.
  - `liquidacion_id` poblado → **pagada** (forma parte de esa liquidación).

## Flujo

- **Cuentas por pagar**: lista las designaciones `ASISTIO` sin liquidar,
  agrupadas por persona, con el total adeudado.
- **Liquidar**: el admin elige una persona + las designaciones pendientes a
  pagar + método + comprobante + fecha → se crea la liquidación (total = suma)
  y se setea `liquidacion_id` en esas designaciones.
- **Revertir**: borrar una liquidación desvincula sus designaciones (vuelven a
  pendientes) gracias a `ON DELETE SET NULL`.

## Consecuencias

- Es "cuentas por pagar" de la liga (egresos), separado de `cobros` (ingresos
  de los clubes). No se mezclan en Finanzas.
- El total de la liquidación es un **snapshot**: si luego se edita el
  `montoPago` de una designación ya liquidada, la liquidación conserva el
  monto pagado (consistente con cómo `cobros` snapshotea montos del tarifario).
- Aditivo: no toca el modelo existente; `designaciones` solo suma una columna
  nullable. No hay borrado destructivo.
