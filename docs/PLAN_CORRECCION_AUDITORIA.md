# Plan de corrección — Auditoría técnica LigaPlus

> Origen: auditoría implacable (Tech Lead + QA + Móvil) de jun-2026 sobre seguridad/multi-tenancy, estado móvil, lógica de negocio y rendimiento/ACID.
> Este plan corrige **todos** los hallazgos, priorizados por severidad × riesgo de regresión × esfuerzo, y agrupados por archivo/área para minimizar despliegues.

**Última actualización:** 2026-07-01

---

## Resumen ejecutivo

La base multi-tenant (RLS `FORCE` + DB no-superuser + stats derivadas on-read) es sólida; la mayoría de los IDOR ya están bloqueados a nivel del motor. Los problemas reales se concentran en: **integridad de datos** al editar partidos, **idempotencia** de la operación en cancha, un **flujo móvil de jugador que no existe**, y endurecimiento de **sesión/paginación/performance**.

- **19 hallazgos**: 4 Bloqueantes, 6 Altas, 7 Medias, 2 Bajas.
- **Filosofía del plan**: primero lo que **corrompe datos en producción** (Fase 0, 1 PR, sin migración), luego lo que **bloquea la app móvil** (Fases 1-2), luego **seguridad/resiliencia/performance** (Fases 3-4), y por último **deuda transaccional** (Fase 5).
- **Esfuerzo total**: ~4-6 semanas-dev secuencial; ~3-4 con la Fase 2 (portal del jugador) en paralelo.

---

## Matriz de priorización

| ID | Área | Hallazgo | Sev. | Esf. | Fase | Archivo principal |
|----|------|----------|------|------|------|-------------------|
| LOG-1 | Lógica | PATCH partido setea `estado` sin validar | 🔴 Bloq. | S | 0 | partidos-admin.service.ts + dto.ts |
| LOG-2 | Lógica | `reabrirActa` deja sanciones huérfanas | 🔴 Bloq. | S | 0 | partidos-admin.service.ts |
| LOG-3 | Lógica | Revert `fechas_pendientes` sin cap | 🟠 Alta | XS | 0 | partidos-admin.service.ts |
| LOG-4 | Lógica | Reabrir WALKOVER lo deja EN_CURSO 3-0 | 🟠 Alta | S | 0 | partidos-admin.service.ts |
| LOG-6 | Lógica | Match-center sin reset ni `assertOperable` | 🟢 Baja | S | 0 | partidos-admin.service.ts + match-center.service.ts |
| MOV-1 | Móvil | Sin idempotencia → doble-gol | 🔴 Bloq. | M | 1 | incidencia-partido.entity + match-center + partidos-admin + offline-queue |
| MOV-2 | Móvil | Rol JUGADOR/HINCHA sin endpoints | 🔴 Bloq. | L | 2 | (nuevo) jugador-portal + User↔Jugador |
| SEG-1 | Seguridad | Refresh token en sessionStorage (XSS) | 🟠 Alta | M | 3 | auth.controller + auth.service + auth-store.ts |
| SEG-2 | Seguridad | Superficie `@Public` = borde de bypass RLS | 🟡 Media | S-M | 3 | tests RLS + (opc.) guard |
| SEG-5 | Seguridad | Throttle en login/refresh a confirmar | 🟢 Baja | XS | 3 | auth.controller.ts |
| MOV-4 | Móvil | Cola offline: sin backoff/refresh/cobertura | 🟠 Alta | M | 4 | offline-queue.ts + use-match-center.ts |
| MOV-3 | Móvil | Endpoints de lectura sin paginar + PII | 🟠 Alta | M | 4 | jugadores-global + delegado-portal + public + personal-portal |
| DB-1 | Perf | N+1 en `public.getTorneos` | 🟠 Alta | S | 4 | public.service.ts |
| DB-2 | Perf | Flyer recomputa tabla N× | 🟠 Alta | XS | 4 | flyer-delegados.service.ts |
| DB-3 | Perf | `jugadores-global.list` no pagina | 🟡 Media | — | 4 | (fusionado con MOV-3) |
| MOV-5 | Móvil | WS `partidosActivos` no se reconstruye al boot | 🟡 Media | XS | 4 | match-center.gateway.ts |
| DB-4 | ACID | `equipos.suspender` sin `@Transactional` | 🟡 Media | XS | 5 | equipos-admin.service.ts |
| DB-5 | ACID | autoAsignar/import/cobros sin `@Transactional` | 🟡 Media | S | 5 | designaciones + plantel-import + tarifas |
| LOG-5 | Lógica | Multas best-effort se pueden perder | 🟡 Media | S | 5 | partidos-admin.service.ts + tarifas |
| SEG-3 | Seguridad | M7: `facturas_plataforma` sin RLS | 🟡 Media | M | 5 | facturacion-plataforma.* |
| SEG-4 | Seguridad | `.manager` crudo en delegado-portal | 🟢 Baja | XS | 5 | delegado-portal.service.ts |

Esfuerzo: XS ≤1h · S ≤½ día · M 1-4 días · L 1-2 semanas.

---

## Fase 0 — Parche de integridad de datos 🔴 URGENTE

**Por qué primero:** cada día que estos bugs están vivos, un admin puede corromper silenciosamente posiciones y sanciones. Son fixes chicos, **sin cambio de schema**, todos en `partidos-admin.service.ts` → **1 PR, 1 deploy de API**. Cero riesgo para móvil.

**Alcance:** LOG-1, LOG-2, LOG-3, LOG-4, LOG-6. **Esfuerzo:** ~1-1.5 días.

- **LOG-1 — Blindar el cambio de estado del partido**
  - Fix: quitar `estado` de `UpdatePartidoDto` (que solo lo muevan los métodos de transición). Si se conserva por compat: `if (partido.actaCerradaAt) throw ConflictException`, `assertPartidoEstadoOperable(partido.estado)`, y validar contra una tabla de transiciones permitidas.
  - Aceptación (test): PATCH que intente `FINALIZADO→EN_CURSO` con acta cerrada → 409; `PROGRAMADO→FINALIZADO` → 409/400 (debe ir por cerrar-acta). Buscar callers del PATCH que hoy manden `estado` (admin UI de editar partido) y migrarlos.
  - Riesgo de regresión: **medio** — verificar que la UI de "editar partido" no dependa de setear estado por esta vía (usa métodos dedicados).

- **LOG-2 — `reabrirActa` borra las sanciones auto del partido**
  - Fix: dentro de la `@Transactional()` de `reabrirActa`, antes de recalcular: `DELETE FROM sanciones_activas WHERE tenant_id=? AND origen_incidencia_partido_id=? AND motivo IN ('ROJA_DIRECTA','DOBLE_AMARILLA','ACUMULACION_AMARILLAS')` (nunca `TRIBUNAL`).
  - Aceptación (test): cerrar acta con roja → existe sanción; reabrir + eliminar la roja + re-cerrar → **no** queda sanción huérfana con ese `origen`. Las sanciones de tribunal sobreviven.
  - Riesgo: **bajo** (borra solo lo generado por ese partido).

- **LOG-3 — Cap del revert de `fechas_pendientes`**
  - Fix: `SET fechas_pendientes = LEAST(fechas_totales, fechas_pendientes + 1)`.
  - Aceptación: reaperturas múltiples nunca dejan `fechas_pendientes > fechas_totales`.

- **LOG-4 — Reabrir WALKOVER rechazado / flujo de anulación**
  - Fix: en `reabrirActa`, `if (estado==='WALKOVER') throw` con mensaje que derive a "anular walkover"; agregar método `anularWalkover` que resetee goles a null, estado a `PROGRAMADO` y borre la multa.
  - Aceptación: reabrir un walkover devuelve error claro; `anularWalkover` deja el partido limpio (sin 3-0 fantasma).

- **LOG-6 — Reset de match-center + defensa en profundidad** *(bonus, mismo archivo)*
  - Fix: al `marcarNoJugado`/`suspenderPartido`, resetear `centroEstado`/`centroArrancadoAt`; agregar `assertPartidoEstadoOperable` al `ensure()` del match-center.
  - Aceptación: un partido pasado a NO_JUGADO no deja cronómetro público colgado.

**Entrega:** PR único `fix(partidos): blindar transiciones de estado y reversión de acta`. Deploy solo API.

---

## Fase 1 — Idempotencia de cancha 🔴 (bloqueante móvil)

**Por qué:** sin esto no se puede confiar en el resultado subido desde la cancha (doble-gol por reconexión o doble-tap). Requiere **migración formal** (columna + UNIQUE) → fase propia.

**Alcance:** MOV-1. **Esfuerzo:** ~2-3 días.

- **Backend/schema**
  - Migración formal (con `down()`): `ALTER TABLE incidencias_partido ADD COLUMN client_key uuid NULL` + índice `UNIQUE (partido_id, client_key) WHERE client_key IS NOT NULL` (parcial, para no romper filas históricas sin clave).
  - `CreateIncidenciaDto` y el body de `sumar-gol` aceptan `clientKey?: string (uuid)`.
  - `addIncidencia` / `sumarGol`: al persistir, si viene `clientKey`, capturar violación de unique → devolver la incidencia existente (idempotente, 200 en vez de duplicar).
- **Frontend/PWA**
  - Generar `clientKey` (uuid v4) al crear la acción; la cola offline (`QueueItem`) lo **guarda y reusa** entre reintentos.
- Aceptación (test QA): enviar dos veces la misma incidencia con el mismo `clientKey` (simulando replay de cola y doble-tap con red cortada) → **una sola** fila; marcador correcto; sanciones por acumulación cuentan bien.
- Riesgo: **bajo** — aditivo; la unicidad es parcial (no toca datos viejos).

**Entrega:** PR `feat(acta): idempotencia de incidencias/goles con clientKey`. Deploy API (corre la migración) + web.

---

## Fase 2 — Portal del Jugador 🔴 (feature bloqueante del flujo móvil "a")

**Por qué:** hoy el rol JUGADOR/HINCHA no tiene endpoints; el jugador no puede loguearse y ver sus stats. Es una **feature nueva**, mayormente aditiva → puede correr **en paralelo** a las otras fases.

**Alcance:** MOV-2. **Esfuerzo:** ~1-2 semanas.

- **Modelo:** puente `User ↔ Jugador` (columna `user_id` nullable en `jugadores` o tabla de vínculo) + flujo de invitación/activación por magic link (reutilizar el patrón de delegado/personal).
- **Backend:** módulo `jugador-portal`:
  - `GET /jugador/mi-ficha`, `GET /jugador/mis-partidos` (próximos + resultados de su club), `GET /jugador/mis-estadisticas` (goles/tarjetas/PJ/MVP + sanciones por torneo). Todos `@Roles(ROLE.JUGADOR)` y scoped por `userId→jugador`, **paginados desde el día 1**.
  - Endpoint admin para invitar jugador (desde la ficha del plantel).
- **Frontend:** área `/jugador` (layout + páginas + hooks), pantalla de activación.
- **HINCHA (opcional, fase 2b):** suscripción "seguir club" + push personalizado (el push ya existe; falta la suscripción por usuario logueado).
- Aceptación: un jugador activado ve solo SUS datos; no accede a datos de otros jugadores/clubes/ligas (test RLS + scope).
- Riesgo: **bajo** (aditivo); cuidar el onboarding (no crear cuentas duplicadas por RUT ya existente).

**Entrega:** varios PRs (modelo+invitación → endpoints → frontend). Deploy API + web.

---

## Fase 3 — Endurecimiento de sesión y borde público 🟠

**Alcance:** SEG-1, SEG-2, SEG-5. **Esfuerzo:** ~3-5 días.

- **SEG-1 — Refresh token a cookie httpOnly** *(el más delicado)*
  - Fix: `login`/`refresh` setean el refresh en **cookie httpOnly + Secure + SameSite=Strict**; `/auth/refresh` lo lee de la cookie (no del body); el front deja de guardar refresh en `sessionStorage` (solo access token en memoria); `logout` limpia la cookie. Evaluar CSRF token para el POST de refresh basado en cookie.
  - Aceptación: `document.cookie`/`sessionStorage` no exponen el refresh; robar el store JS ya no permite renovar sesión; rotación de refresh en cada uso.
  - Riesgo: **medio-alto** — toca todo el flujo de auth (web + PWA + impersonación). Probar login/refresh/logout/impersonar en móvil y desktop.

- **SEG-2 — Tests RLS de la superficie `@Public` + (opcional) guard**
  - Fix: test de integración por cada endpoint `@Public` que toque datos de tenant, confirmando que Liga A no lee/escribe datos de Liga B. Opcional: decorador `@TenantScopedPublic(resolver)` que fuerce el `set_config` al tenant resuelto.
  - Aceptación: suite RLS verde; un endpoint público sin re-acotar falla el test.

- **SEG-5 — Throttle explícito en login/refresh**
  - Fix: `@Throttle({ default:{ limit:5, ttl:15*60_000 }})` en `login` (similar en `refresh`); confirmar el default global.
  - Aceptación: 6º intento de login desde una IP en 15 min → 429.

**Entrega:** PR `security: refresh en cookie httpOnly + throttle login + tests RLS públicos`. Deploy API + web.

---

## Fase 4 — Resiliencia offline + performance de lectura 🟠

**Alcance:** MOV-4, MOV-3 (+DB-3), DB-1, DB-2, MOV-5. **Esfuerzo:** ~1 semana.

- **MOV-4 — Cola offline robusta**
  - Fix: `attempts` + backoff exponencial con cap + `maxRetries` + dead-letter visible para 4xx permanentes; refrescar token antes del replay (no trabar en 401); encolar `certificarPresentes` (antes del cierre); superficializar `result.errors` en el banner.
  - Aceptación: ítem que da 401 se refresca y drena; 4xx permanente va a dead-letter con feedback; certificar+cerrar funcionan offline.

- **MOV-3 + DB-3 — Paginación y PII**
  - Fix: `{ data, meta:{total,page,limit} }` con `take/skip` real en `jugadores-global.list` (mover filtros a SQL, sacar PII innecesaria), `delegado-portal.resumen`, `public.getFixture` (lazy por fecha), `personal-portal.miPortal` (próximos/últimos N).
  - Aceptación: payload acotado; el listado global no expone RUT/email/teléfono masivos; front con paginación/scroll infinito.

- **DB-1 — N+1 en `public.getTorneos`**
  - Fix: una query con `LEFT JOIN` + `COUNT(...) GROUP BY` para fechas/inscripciones y `DISTINCT ON` para próximo partido, en lugar del loop.
  - Aceptación: el endpoint hace ≤2-3 queries totales (no ~3N).

- **DB-2 — Memoizar la tabla en el flyer**
  - Fix: `Map` por `torneoId` en la corrida del cron para computar cada torneo una sola vez.
  - Aceptación: N clubes de un mismo torneo → 1 cálculo de tabla.

- **MOV-5 — Reconstruir `partidosActivos` al boot**
  - Fix: al arrancar el gateway, poblar el Set desde `partidos WHERE centroEstado IN ('EN_VIVO','PAUSADO')`.
  - Aceptación: tras un restart a mitad de partido, el auto-pausa server-side corre sin depender de un viewer.

**Entrega:** 2 PRs (móvil/offline + performance). Deploy API + web.

---

## Fase 5 — Consistencia transaccional y deuda restante 🟡

**Alcance:** DB-4, DB-5, LOG-5, SEG-3, SEG-4. **Esfuerzo:** ~3-5 días.

- **DB-4 — `@Transactional()` en `equipos.suspender`** (walkover batch todo-o-nada). Aceptación: fallo a mitad no deja walkovers parciales.
- **DB-5 — `@Transactional()` en `autoAsignar`, `plantel-import.bulkCreate`, `generarCobrosInicioTorneo`**. Aceptación: escritura atómica; fallo revierte todo.
- **LOG-5 — Regeneración de multas confiable**: endpoint idempotente "regenerar multas del partido" + flag de audit cuando el `catch` best-effort se dispara. Aceptación: multas recuperables tras un re-cierre con fallo parcial.
- **SEG-3 — Cerrar M7**: habilitar RLS en `facturas_plataforma` + refactor del cron para setear tenant por iteración (o mantener filtro explícito + test cross-tenant).
- **SEG-4 — Repo inyectado en `delegado-portal.sanciones`** (quitar `.manager` crudo). Aceptación: sin `.manager`; query sigue filtrando `tenant_id`.

**Entrega:** PR `chore: consistencia transaccional + deuda de auditoría`. Deploy API.

---

## Secuenciación recomendada (roadmap)

```
Semana 1   ██ Fase 0 (integridad datos) ── deploy API
           ░░ Fase 2 arranca en paralelo (modelo User↔Jugador)
Semana 2   ██ Fase 1 (idempotencia)      ── deploy API+web
           ░░ Fase 2 (endpoints jugador-portal)
Semana 3   ██ Fase 3 (sesión/seguridad)  ── deploy API+web
           ░░ Fase 2 (frontend /jugador) ── deploy cuando cierre
Semana 4   ██ Fase 4 (offline+perf)      ── deploy API+web
Semana 5   ██ Fase 5 (transaccional+deuda) ── deploy API
```

- **Gate de "app móvil lista para prod":** Fase 0 + Fase 1 + Fase 2 + MOV-4 (de Fase 4) cerradas.
- **Gate de "seguro para escalar":** + Fase 3 + resto de Fase 4.

---

## Estrategia de QA transversal (aplicar en cada fase)

1. **Tests de integración RLS** por endpoint que toque datos de tenant (Liga A no ve/edita Liga B) — obligatorio para Fase 3 y todo endpoint nuevo (Fase 2).
2. **Tests de idempotencia** (Fase 1): replay de la misma acción con `clientKey` → un solo efecto.
3. **Tests de máquina de estados** (Fase 0): matriz de transiciones permitidas/prohibidas de `Partido`.
4. **Tests de reversión** (Fase 0): cerrar→reabrir→re-cerrar deja sanciones/multas/contadores consistentes.
5. **E2E móvil con red simulada** (Fases 1 y 4): intermitencia, offline→online, token vencido en cola.
6. **Regresión de auth** (Fase 3): login/refresh/logout/impersonación en web y PWA.
7. Cada PR: `pnpm typecheck` + `pnpm build` + revisión exhaustiva antes de cerrar (política del proyecto).

---

## Notas de deploy

- Los cambios de Fase 0/3/5 son solo-API; Fase 1/2/4 tocan API + web (rebuild `--no-cache` de ambos).
- Fase 1 corre una **migración formal** — respaldar antes; la columna+UNIQUE es aditiva/reversible (`down()`).
- Ninguna fase requiere `DROP`/`DELETE` destructivo salvo el `DELETE` acotado de sanciones-por-partido en LOG-2 (dentro de transacción, solo lo generado por ese partido).
