# ADR-0013 — RLS v2: policy fail-closed con bypass explícito

- **Estado**: aceptada (2026-10-06)
- **Origen**: auditoría de arquitectura oct-2026, hallazgo **C-2** (RLS fail-open) + A-3/M-4/M-5. Tareas T9–T15 del plan de remediación.

## Contexto

La policy v1 (heredada del patrón Eva360) trataba `app.current_tenant_id = ''`
como bypass de super admin:

```sql
USING (
  tenant_id::text = current_setting('app.current_tenant_id', true)
  OR current_setting('app.current_tenant_id', true) = ''
)
```

El problema: `''` es también el valor **residual** de una conexión reciclada
del pool. `set_config(..., true)` (transaction-scoped) revierte al valor de
sesión al terminar la tx — y si algo corre fuera de transacción, o el
interceptor no corrió (WS, crons, efectos post-commit), la conexión queda en
`''` → **bypass involuntario: esa query veía TODOS los tenants**. El mismo
valor significaba a la vez "sin contexto" (debería ver nada) y "modo sistema"
(ve todo): fail-open por diseño.

Además, cada flujo fijaba el GUC a mano (`set_config` disperso en ~17
call-sites), con los errores esperables: crons sin contexto (0 filas
silencioso), efectos post-commit heredando una conexión ya devuelta, y
transacciones envenenadas (25P02) que commiteaban como ROLLBACK silencioso.

## Decisión

### 1. Dos GUC, ambos con residuo inocuo

```sql
USING (
  tenant_id = (SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR (SELECT current_setting('app.rls_bypass', true) = 'on')
)
```

- **Tenant**: `NULLIF(residuo '', '') → NULL` → `tenant_id = NULL` → **0 filas**.
- **Bypass**: GUC separado `app.rls_bypass`; solo `'on'` habilita. Su residuo
  `''` no es `'on'`. El modo sistema pasa a ser **explícito y grepeable**.
- Los `(SELECT ...)` fuerzan un InitPlan: Postgres evalúa el GUC una vez por
  query (no por fila) y puede usar el índice de `tenant_id` (medido 40–100×).
- `WITH CHECK` con la misma cláusula: tampoco se puede **escribir** fuera del
  contexto.
- Variante **global-null** (`tenant_id IS NULL OR ...`) para las 4 tablas con
  filas de plataforma: `user_roles`, `audit_logs`, `magic_links`,
  `push_subscriptions`. Endurecer el `WITH CHECK` del NULL queda para R-3.

La policy se instala con `DROP POLICY + CREATE POLICY` en cada boot
(`recrearPolicy` en `cleanup-orphans.ts`): converge las policies v1 existentes
sin migración manual. El texto canónico vive en
`apps/api/src/common/rls/rls-policy.ts` (lo comparte el spec).

### 2. Punto único de entrada al contexto (`common/rls/rls-context.ts`)

| Helper | Uso |
|---|---|
| `fijarTenantLocal(ds, tenantId)` | Dentro de una tx existente (interceptor, endpoints públicos con token firmado) |
| `fijarBypassLocal(ds)` | Dentro de una tx existente, modo sistema (super admin, métricas) |
| `runConTenant(ds, tenantId, fn)` | Tx NUEVA (`REQUIRES_NEW`) acotada a un tenant — crons por tenant, efectos post-commit |
| `runComoSistema(ds, fn)` | Tx NUEVA en modo sistema — mantenimiento, snapshots públicos, auditoría de errores |
| `SIN_TENANT_UUID` | Autenticado multi-liga sin liga elegida: contexto válido que ve 0 filas |

Ambos `run*` ejecutan `SELECT 1` antes de resolver (T13): una tx envenenada
por un catch que tragó un error de Postgres **detona antes del COMMIT**, en
vez de convertirse en ROLLBACK silencioso con respuesta exitosa.

Un step de CI (grep) prohíbe `set_config('app.` fuera de `common/rls/` y de
los scripts standalone de `database/`.

### 3. Efectos post-commit y best-effort

- Fire-and-forget (push de resultados, emails de designación, retries SII):
  `runOnTransactionCommit(...)` en el caller + `runConTenant`/`runComoSistema`
  dentro del servicio. Nunca heredan la conexión del request.
- Best-efforts DENTRO de una tx (multas auto, precarga de planilla, import de
  planteles, envíos NPS/encuestas): `bestEffort(ds, fn)`
  (`common/db/best-effort.ts`) — SAVEPOINT manual; el fallo revierte solo su
  trabajo y la tx del negocio sigue sana. **`Propagation.NESTED` de
  typeorm-transactional 0.5.x NO es un savepoint** (abre otra conexión, sin
  contexto RLS): no usarlo para esto.
- Inserciones idempotentes contra UNIQUE: `.orIgnore()` (ON CONFLICT DO
  NOTHING) en vez de try/catch — el duplicado deja de generar un error que
  envenene la tx.

### 4. Verificación (T11)

`apps/api/src/common/rls/rls-policy.spec.ts`: spec autocontenido (crea tabla,
rol no-superusuario y policy propios) que reproduce el bypass v1 con residuo
`''` sobre una conexión tibia y prueba que v2 es fail-closed, que el contexto
no sobrevive al COMMIT y que `WITH CHECK` bloquea escrituras cruzadas. Corre
en CI contra el Postgres del workflow. El gate de schema (toda tabla con
`tenant_id` tiene ENABLE+FORCE+policy) queda para T29.

## Consecuencias

- Un flujo sin contexto ahora **ve 0 filas** (fallo visible y seguro) en vez
  de ver todos los tenants. El costo: todo entrypoint nuevo (cron, WS, worker,
  efecto post-commit) DEBE abrir contexto vía los helpers — el CI y la
  policy lo recuerdan por las malas.
- El bypass es auditable: `grep runComoSistema` lista los puntos cross-tenant.
- Los seeds/scripts standalone usan `set_config('app.rls_bypass','on',false)`
  a nivel de sesión sobre SU propia conexión (permitido por el CI check).
- `migrate-clubes-from-equipos.ts` fija un tenant real a nivel de sesión:
  compatible con v2 sin cambios.

## Alternativas descartadas

- **`ALTER POLICY` vía migración formal**: cleanup-orphans ya es el dueño del
  ciclo de vida de las policies (idempotente, corre antes del healthy);
  duplicar el texto en una migración crea dos fuentes de verdad.
- **Un solo GUC con sentinela distinto** (p.ej. `system`): seguía mezclando
  "sin contexto" con "modo sistema" en el mismo canal; el residuo del pool
  vuelve ambiguo cualquier sentinela que viaje por el GUC del tenant.
