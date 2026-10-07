# Plan de remediación — Auditoría 2026-10-05

Tareas derivadas de [AUDITORIA-ARQUITECTURA-2026-10-05.md](AUDITORIA-ARQUITECTURA-2026-10-05.md).

**Alcance acordado:** todos los hallazgos **excepto los de pagos, emisión de boletas y cobros**, que se abordan en una versión posterior (lista al final). Cuando una tarea transversal roza código de pagos (p. ej. plumbing RLS en el cron de facturación), se incluye solo la parte de infraestructura, nunca la lógica de negocio de pago.

Convención: `[hallazgo]` = ID del informe · esfuerzo XS (<1h) / S (<½ día) / M (1-3 días) / L (>3 días). Las fases están en orden de ataque recomendado; dentro de cada fase, el orden también.

---

## Fase 0 — Seguridad y supervivencia (antes de cualquier liga nueva)

> **Estado 2026-10-06:** T1–T8 implementadas (commits `fbd5a10`…`14b764d`, sin push).
> Revisión propia por tarea hecha; revisión ECC de T1 (security) y de T2–T8
> (code review) corridas como segunda pasada — ver resultados en la sesión.
> Pendiente del operador: `/etc/ligaplus-backup.env` + rclone + crontab (T3)
> y re-deploy de nginx para activar realip (T6).

- [x] **T1 [C-1] (S)** Cerrar la toma de cuenta por onboarding de personal: la activación valida `link.email === personal.email`; el magic link se consume atómicamente (`UPDATE … WHERE used_at IS NULL` + chequear `affected`) ANTES de tocar credenciales; si la cuenta ya tiene `passwordHash`, NO sobreescribir (solo asignar rol); revocar refresh tokens al fijar contraseña; `@Audited` en invitar/editar email/activar. Aplicar el mismo patrón en `delegado-invite` y `jugador-invite`. — `personal-admin.service.ts`, `users.service.ts`, `magic-links.service.ts`
- [x] **T2 [A-9] (XS)** `bootstrap().catch(e => { logger.error(e); process.exit(1) })` en `main.ts:317` — que los chequeos de arranque realmente tumben el contenedor.
- [x] **T3 [A-7] (S)** Backups: corregir defaults del script (`fixtura_db`, `~/fixtura`); subir el dump cifrado a almacenamiento externo (B2/S3) con credencial de solo escritura; alerta si el cron falla; documentar y ejecutar un restore de prueba. — `scripts/backup-db.sh`, `docs/BACKUPS_RUNBOOK.md`
- [x] **T4 [A-8] (S)** Un solo pipeline de deploy: `deploy.yml` deshabilitado o condicionado a CI verde + aprobación manual, invocando `deploy.sh`; **sacar `1748430000000-DropModeloViejo.ts` de la carpeta de migraciones** (cuarentena hasta ejecutarlo a mano con backup); smoke test a `/health/live` (ruta real).
- [x] **T5 [A-8] (S)** CI verde de verdad: flat config de ESLint (o pin a ESLint 8) en api/domain/types; `--passWithNoTests` como puente; verificar que lint+typecheck+test+build corren completos.
- [x] **T6 [A-10] (S)** nginx: `set_real_ip_from <red de Eva360>` + `real_ip_header X-Real-IP` y recalibrar `limit_req` por IP real. — `nginx/nginx.bootstrap.conf`
- [x] **T7 [A-10] (S)** Gateway WS: validar UUID y existencia del partido antes de `partidosActivos.add`; límite de rooms por socket; CORS con whitelist; no devolver `err.message` crudo. — `match-center.gateway.ts`
- [x] **T8 [A-10] (S)** Upgrade `socket.io`/`engine.io`/`socket.io-parser` + `pnpm audit --prod --audit-level=high` en CI. (Next 15 queda como T53/ADR.)

## Fase 1 — RLS y transacciones (el corazón del multi-tenant)

- [x] **T9 [C-2] (M)** Policy RLS v2 fail-closed (dos GUC: `NULLIF(tenant)` + `app.rls_bypass = 'on'`, USING y WITH CHECK, InitPlan) instalada vía `recrearPolicy` (DROP+CREATE en cada boot de cleanup-orphans; converge las 14 tablas de migraciones + variante global-null para user_roles/audit_logs/magic_links/push_subscriptions). Texto canónico en `common/rls/rls-policy.ts`. Escrito **ADR-0013** (el 0012 lo tomó el portero Caddy).
- [x] **T10 [C-2] (M)** Helpers únicos en `common/rls/rls-context.ts` (`fijarTenantLocal`, `fijarBypassLocal`, `runConTenant`, `runComoSistema`, `SIN_TENANT_UUID`); migrados los 17 call-sites de `set_config` manual (interceptor, cron-runner, `procesarMora` + suspensiones con `runAsSystem`/`fijarBypassLocal`, 6 services super-admin/me/match-center, encuestas/nps/designaciones, 5 scripts standalone a bypass de sesión); check de CI (grep) que prohíbe `set_config('app.` fuera de `common/rls/` y `database/`.
- [x] **T11 [C-2/A-12] (S)** Spec de conexión tibia autocontenido (`common/rls/rls-policy.spec.ts`: rol no-superusuario propio + tabla v1 que reproduce el bypass + v2 fail-closed + WITH CHECK + global-null; corre en CI contra el Postgres del workflow). *El gate de schema (pg_policies) queda en T29.*
- [x] **T12 [A-3] (M)** `bestEffort(ds, fn)` con SAVEPOINT manual en `common/db/best-effort.ts` (NESTED descartado: no es savepoint en 0.5.x) aplicado a: import de planteles (por fila), encuestas/NPS (por club), cierre de acta (auto-ASISTIO + multas auto), walkover (multa), reabrir/anular (cleanup cobros), precarga de planilla; `orIgnore()` en planilla_torneo y veto del tribunal. Los `audit.record` de tribunal quedaron sanos por el savepoint interno de `record()`.
- [x] **T13 [A-3] (S)** `SELECT 1` pre-COMMIT en `TenantContextInterceptor`, `runConTenant` y `runComoSistema` — toda tx envenenada detona antes del COMMIT en vez de rollback silencioso.
- [x] **T14 [M-5] (S)** Pool con timeouts (`connectionTimeoutMillis` 5s, `idleTimeoutMillis` 30s, `statement_timeout` 30s, `idle_in_transaction_session_timeout` 120s, `application_name`, `keepAlive`) + `maxQueryExecutionTime` 500ms, overrideables por env (`.env.example`); `/health*` y `/metrics` exentos del interceptor.
- [x] **T15 [C-2/M-4] (M)** Efectos post-commit con contexto: push de resultados y emails de designación diferidos con `runOnTransactionCommit` + `runComoSistema`/`runConTenant` (push además separa lecturas → envíos HTTP → updates batch, y filtra los scope undefined que notificaban cross-tenant — D-7); auditoría del interceptor awaiteada dentro de la tx (`concatMap`) con registro de fallos en tx propia; `record()` con savepoint interno (M-4). *(SII: `crearYEmitirAsync`/`emitir` envueltos en `runComoSistema` — solo plumbing RLS; la lógica de emisión sigue diferida a la versión de pagos.)*

## Fase 2 — Disciplina deportiva

- [ ] **T16 [A-4] (S)** `NO_JUGADO`/`SUSPENDIDO_FUERZA_MAYOR`/`REPROGRAMADO` cuentan como "resueltos" al evaluar el cierre de fecha; `marcarNoJugado`/`suspender`/`reactivar` disparan la reevaluación. — `partidos-admin.service.ts`
- [ ] **T17 [A-4] (S)** Lock `FOR UPDATE` sobre la fila de `fechas` al evaluarla (orden canónico: fecha → partido) en `cerrarActa`, `declararWalkover`, `reabrirActa`.
- [ ] **T18 [A-4] (XS)** `tribunal.ajustar` actualiza también `fechasTotales` (consistencia con el LEAST de la reversión). — `tribunal-admin.service.ts:278-283`
- [ ] **T19 [A-4] (XS)** Carnet QR: filtrar sanciones por `desde_fecha_numero` (no bloquear sanciones futuras). — `carnet.service.ts`
- [ ] **T20 [A-4] (M)** `sancionVigente()` + máquina de estados de partido/fecha (`esResuelto`, `cuentaParaTabla`, `fechaCompleta`) en `packages/domain`; reemplazar las 7 copias del criterio y los >10 literales `IN ('FINALIZADO','WALKOVER')`.
- [ ] **T21 [A-4] (M)** Libro mayor `sancion_cumplimientos(sancion_id, fecha_id)` + reescritura de decremento/reversión sobre el ledger (reabrir un acta revierte EXACTAMENTE lo que esa fecha descontó; nunca toca revocadas). Migración formal + backfill. Escribir **ADR-0015**.
- [ ] **T22 [A-12] (M)** Tests de dominio de disciplina: acumulación de amarillas, identidad cerrar→reabrir→cerrar sobre 4 tipos de sanción, fecha con NO_JUGADO, cierre concurrente de las 2 últimas actas. (Prototipos de la auditoría como semilla.)

## Fase 3 — Auth y sesiones

- [ ] **T23 [A-13] (S-M)** Refresh robusto: rotación atómica (`UPDATE … WHERE revoked_at IS NULL` + `affected`), chequeo de `isActive`, detección de reuso (revocar la cadena), índice parcial por `token_hash`, cron de purga (`refresh_tokens` + `magic_links` expirados).
- [ ] **T24 [A-13] (M)** Offboarding real: desactivar personal revoca roles + refresh tokens; endpoints de revocación para delegado y jugador; la impersonación filtra `revokedAt`.
- [ ] **T25 [M-9] (M)** `invitarMiembro`: el dueño de una cuenta existente acepta por link (no se asigna el rol directo); no devolver datos de cuentas ajenas; login multi-liga con selección explícita de tenant (elimina el lockout por `tenantId=null`).
- [ ] **T26 [M-10] (S)** Helper `esc()` en TODAS las plantillas de email (nombres/club/liga interpolados) + cuota diaria de invitaciones por tenant.
- [ ] **T27 [M-11] (S)** Tokens fuera de la query string (POST con body o fragment `#`); recortar `?…` en el serializer de pino; `beforeSend` de Sentry con scrubbing de URLs.
- [ ] **T28 [M-8] (S-M)** `customDomain`: regex de hostname + lista de reservados (`ligaplus.cl`, `www`, …) + verificación por DNS TXT + solo SUPER_ADMIN; CORS solo `https://` para dominios custom.

## Fase 4 — Datos y schema

- [ ] **T29 [M-3] (M)** Schema con una fuente de verdad: congelar `cleanup-orphans.ts` (no se agregan pasos); baseline `pg_dump --schema-only` de prod como migración 0; servicio `migrator` one-shot con credenciales de owner en el compose; **sacar `DB_USER`/`DB_PASSWORD` del environment del contenedor api**. Test de CI: levantar el schema desde cero (migraciones → query del gate T11). Escribir **ADR-0014**.
- [ ] **T30 [M-3] (S)** Mientras el script viva: `SET lock_timeout='5s'`; mover los `DELETE FROM tarifas_torneo` y los backfills de negocio (planillas, directivas, canchas por nombre) a migraciones one-shot con marcador.
- [ ] **T31 [M-14] (S)** Índices: crear `idx_incidencias_jugador_id` (la colisión de nombres dejó los rankings sin índice en prod), `partido_jugadores(jugador_id)`, `sanciones_activas(origen_incidencia_partido_id)`, `refresh_tokens(token_hash) WHERE revoked_at IS NULL`, parcial de partidos EN_VIVO; borrar los 15 redundantes seguros.
- [ ] **T32 [A-14] (S-M)** Cascadas: `inscripciones_torneo.club_id` y `jugadores.club_id` a RESTRICT (migración formal con down); guardas de servicio (club/jugador con historial → INACTIVO, nunca DELETE). *(La parte de cobros pagados y facturas_plataforma queda para la versión de pagos.)*
- [ ] **T33 [M-13] (XS)** `ALTER DATABASE fixtura SET timezone TO 'America/Santiago'` + verificación `SHOW timezone` en el deploy.
- [ ] **T34 [M-4] (S-M)** Auditoría confiable: `REVOKE UPDATE, DELETE ON audit_logs FROM fixtura_app`; `@Audited` en las rutas mutantes sin cobertura (tribunal, match-center, personal, designaciones — las de cobros quedan para la otra versión); login/reset auditados con email aunque fallen (transacción propia).

## Fase 5 — Frontend

- [ ] **T35 [A-11] (S)** `button.tsx`: `disabled={disabled || loading}` + `aria-busy` + spinner sin reemplazar el texto; guardas `if (isPending) return` en los handlers de acta/nóminas/sorteo.
- [ ] **T36 [A-11] (XS)** `Permissions-Policy`: entrada específica `camera=(self)` para `/personal/verificar`; try/catch alrededor de `new BarcodeDetector` + mensaje de error correcto. Actualizar CLAUDE.md §4.3.
- [ ] **T37 [A-11] (S-M)** Offline real: `networkMode: 'offlineFirst'` en queries y mutaciones; `apiFetch` encola también ante `TypeError`/timeout; consumir `isQueuedResponse` (toast "guardado sin conexión (N en cola)" + setQueryData); montar `OfflineActaBanner` en `/personal/partido/[id]`.
- [ ] **T38 [A-11] (S-M)** Service worker: `/public/*` a network-first con timeout 3s (en-vivo y match-center a network-only); `event.waitUntil` en los `cache.put`; `CACHE_VERSION` derivada de `GIT_SHA`; aviso "nueva versión disponible" con `controllerchange`.
- [ ] **T39 [A-11] (S)** `useAuthHydrated()` compartido + gate en `/suscripcion` (y reemplazar las 6 copias del patrón).
- [ ] **T40 [M-15] (S-M)** TanStack: corregir las 5 invalidaciones con claves muertas (suspender/reprogramar/reactivar/no-jugado → `fixture-detail`; sancionarEquipo); fábrica `lib/query-keys.ts`; `QueryCache.onError` (solo con data previa) + `retry` que no reintente 4xx.
- [ ] **T41 [M-15] (S)** Formularios: `z.config(z.locales.es())` en Providers; helper `optionalNumber()` (arregla el NaN de `minuto`); `zod-resolver` con `path || 'root'`; quitar los `alert()` y toasts duplicados.
- [ ] **T42 [M-15] (M)** Un `<Modal>` único basado en `<dialog>` + migrar los 14 overlays; `useId()` en `Input` + `aria-invalid`/`aria-describedby`; `aria-label` en botones-ícono; targets ≥44px en la planilla móvil.
- [ ] **T43 [M-15] (S)** Contraste de tokens: `ink-mute → #625C52`, texto de `.btn-accent` → verde oscuro, naranja como texto → `#B04A12` (tailwind.config + globals.css + offline.html).
- [ ] **T44 [M-15] (S)** `apiDownload(path, filename)` en `lib/api.ts` (refresh en 401 + toast de error) y migrar las 5 descargas con `fetch` crudo.
- [ ] **T45 [M-2] (S-M)** Contratos: `ExceptionFilter` global ZodError→400; validar los 14 bodies type-only (match-center `ajustar-goles`, super-admin); alinear DTOs divergentes no-pago (`canchaId` en UpdatePartidoDto, `.refine` del tribunal). *(La unificación total Zod→DTO es ADR-0016, 90 días.)*

## Fase 6 — Observabilidad, plataforma y limpieza

- [ ] **T46 [M-13] (S-M)** Sentry real: API con `SentryModule.forRoot()` + `SentryGlobalFilter` + `captureException` en `TenantCronRunner`; web con `instrumentation-client` + `global-error.tsx` + sourcemaps.
- [ ] **T47 [M-13] (S)** `/metrics` real (prom-client + basic auth obligatoria) o retirar la promesa de CLAUDE.md §5.3 — decidir y cerrar la divergencia.
- [ ] **T48 [M-6] (M)** Tick del match center por lotes: una query `id = ANY($1)` por tick, guard de reentrada, autopausa calculada por timer, expulsión de partidos PAUSADO abandonados.
- [ ] **T49 [M-16] (M)** Multi-liga sin tocar infra: `{slug}.ligaplus.cl` con certificado wildcard + resolución de tenant por subdominio (custom_domain pasa a opcional). Escribir **ADR-0017**.
- [ ] **T50 [M-1] (M)** Extraer el contexto **Disciplina** de AdminModule (tribunal + vetados + sanciones) con sus entities y fachada. Regla desde hoy: ningún controller nuevo entra a AdminModule. *(Finanzas se extrae en la versión de pagos.)*
- [ ] **T51 [M-12] (S)** Respetar el boolean de `EmailService.send` en personal/encuestas/ajustes: reintento o estado honesto (jamás marcar enviado lo que devolvió false).
- [ ] **T52 [BAJOS] (S-M)** Limpieza: decidir Redis (usar para throttler/locks de cron o retirarlo — ADR-0020); retirar deps y stubs muertos no-pago (i18next, passport, FCM, Twilio); `--frozen-lockfile` en CI y Dockerfiles; respuesta de designaciones por POST (no GET que muta); corregir el voseo en los 5 archivos de UI; `LoginModal` con dynamic import; `@fixtura/types` a ESM.
- [ ] **T53 [A-10] (M)** ADR-0018 + upgrade Next 14→15 (los parches de DoS solo existen en 15.5.x).
- [ ] **T54 [A-12] (M)** Resto de tests de alto valor no-pago: guards/scopes PERSONAL (meta-test de decoradores con allowlist), fixture (invariantes + el objetivo "no 3 locales seguidos" que hoy no se cumple), E2E de aislamiento con control negativo.

---

## Diferido a la versión de pagos / boletas / cobros

Por instrucción explícita, estos hallazgos NO se abordan ahora: **C-3** (pasarela MOCK en prod), **A-1** (Flow: EXPIRADO, webhook, reconciliación, doble orden), **A-2** (SII: emisor, duplicados, fail-open, post-commit), **A-5** (dunning fantasma), **A-6** (cuotas recurrentes), **M-7** (BYO/credenciales), la parte de cobros de **A-14** (borrar cobros pagados, CASCADE de facturas_plataforma), la parte de cobros de **M-2** (DTO de cobros), la parte de dunning de **M-12**, los tests de Flow/SII de A-12, y la extracción del contexto Finanzas de M-1.

**Advertencia que queda registrada:** mientras C-3 no se corrija, no activar pagos reales ni SII BYO en ninguna liga sin Flow configurado; y mientras A-8/T4 no se cierre, no "arreglar" el workflow de deploy sin antes sacar `DropModeloViejo` de la carpeta.
