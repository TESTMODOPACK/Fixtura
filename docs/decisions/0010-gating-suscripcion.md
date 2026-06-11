# ADR-0010 — Gating de suscripción (bloqueo por falta de pago)

**Estado:** Aceptado · 2026-06-11
**Contexto:** F57

## Decisión

Se condiciona el uso del sistema por parte de cada liga (tenant) al estado
de su suscripción a LigaPlus. El modelo ya existía en el schema
(`tenants.estado_suscripcion`: `TRIAL | ACTIVO | SUSPENDIDO | CANCELADO`,
`trial_expira_at`, `suspendido_at/motivo`); este ADR define el **enforcement**.

### Política

- **Trial:** las ligas nuevas arrancan en `TRIAL` por 30 días (configurable
  vía `trialDias` al crear el tenant). Operan con normalidad.
- **Bloqueo (lockout total):** ocurre cuando `estado_suscripcion ∈
  {SUSPENDIDO, CANCELADO}`. El usuario de la liga **no accede al panel** —
  el front lo redirige a `/suscripcion` (pantalla de pago).
- **Disparadores de SUSPENDIDO** (cron diario de mora):
  - **≥ 2 facturas de plataforma `VENCIDA`** (≈2 meses de suscripción impagos).
  - **Trial vencido sin plan** contratado (los trial vencidos con plan pasan a `ACTIVO`).
- **Reactivación automática:** al confirmarse un pago (Webpay o registro
  manual del super admin), si la liga ya no acumula ≥2 vencidas, vuelve a `ACTIVO`.

### Exenciones (no se bloquean)

- **SUPER_ADMIN** y sesiones **impersonadas** (soporte de plataforma).
- **Endpoints públicos** (`@Public`) → el **portal de hinchas** (tabla,
  fixture, goleadores) sigue visible aunque la liga deba.
- **Rutas para regularizar:** `admin/mi-suscripcion/*` (ver estado + pagar)
  y `auth/*`.

## Implementación

- **`SubscriptionGuard`** (`common/guards/subscription.guard.ts`), último
  `APP_GUARD` (tras Jwt + Roles). Si el tenant del usuario autenticado está
  suspendido/cancelado y la ruta no está exenta → **402 Payment Required**
  con `code: SUBSCRIPTION_SUSPENDED`. Consulta `tenants` por PK (tabla sin RLS).
- **Cron `facturacion-mora`** (`facturacion-plataforma.cron.ts`):
  `suspenderTrialesVencidos()` + `suspenderMorosos()` (≥2 vencidas).
- **Reactivación** en `FacturacionPlataformaService.marcarPagada()`.
- **Front:** `apiFetch` intercepta el 402 → `window.location = '/suscripcion'`.
  Página `/suscripcion` (fuera del layout admin) muestra deuda + facturas +
  pago Webpay + contacto + cerrar sesión.

## Consecuencias

- El estado se evalúa por request con un lookup por PK (barato; sin RLS).
  Una suspensión mid-sesión corta en el siguiente request (no hace falta
  re-login).
- La facturación de plataforma sigue **mock-first**: sin proveedor de pago
  real configurado, el bloqueo igual funciona (el super admin registra el
  pago manual y reactiva).
- El super admin puede suspender/reactivar manualmente desde
  `/admin/super/tenants/[id]` (campo estado + endpoint `/suspender`).
