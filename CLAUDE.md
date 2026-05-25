# Fixtura — Guía técnica para Claude

> Este documento es el contrato técnico del proyecto. Define stack, arquitectura, patrones, convenciones y reglas de operación. **Está destilado de las lecciones aprendidas en Eva360** (plataforma SaaS multi-tenant en producción) — no es teoría, es lo que funcionó y lo que dolió.
>
> Cuando una decisión nueva contradiga lo que está acá, primero se discute y se actualiza este archivo. Después se cambia el código.

---

## 0. Contexto del producto

Fixtura es una plataforma SaaS multi-tenant para gestión de ligas deportivas (delegados, jugadores, árbitros, hinchas, designaciones, pagos, fixture/calendario, reprogramaciones). Hay 5 roles principales: super admin (Fixtura), admin de liga, delegado/club, jugador, árbitro, hincha.

El stack y la arquitectura son los mismos patrones que Eva360 — la base técnica está validada en producción. Lo que cambia es el dominio.

---

## 1. Stack oficial (no negociable sin discutirlo)

### Monorepo
- **pnpm workspaces** + **Turborepo** — caching de builds, pipeline declarativo en `turbo.json`
- Estructura:
  ```
  fixtura/
  ├── apps/
  │   ├── api/      # NestJS backend
  │   └── web/      # Next.js frontend
  ├── packages/
  │   ├── ui/       # Componentes compartidos
  │   ├── types/    # Tipos TS compartidos
  │   └── config/   # Configs compartidas (eslint, tsconfig)
  ├── docs/         # Runbooks, planes, decisiones
  ├── docker-compose.yml
  └── turbo.json
  ```

### Backend (apps/api)
- **NestJS 11** + **TypeScript 5.7+** + **TypeORM 0.3**
- **PostgreSQL 16** con **Row-Level Security (RLS)** habilitado
- **typeorm-transactional** para propagar contexto transaccional (RLS necesita una conexión por request)
- **Pino** para logs estructurados JSON (vía `nestjs-pino`)
- **class-validator + class-transformer** para DTOs
- **Passport-JWT** + **bcrypt** (cost 12) para auth
- **@nestjs/schedule** para crons
- **@nestjs/cache-manager** + Redis para cache (opcional fase 1)
- **Sentry** + **prom-client** para observabilidad
- **Resend** para emails transaccionales
- **Stripe** + **MercadoPago** para pagos (si aplica a Fixtura)
- **Cloudinary** o S3-compatible para uploads

### Frontend (apps/web)
- **Next.js 14** App Router + **React 18** + **TypeScript**
- **TailwindCSS** 3.4
- **TanStack Query** (server state) + **Zustand** (UI state)
- **React Hook Form** + **Zod** (validación cliente y servidor)
- **i18next** + **react-i18next** (multi-idioma)
- **lucide-react** (íconos) — preferir sobre librerías más pesadas
- **recharts** para gráficos
- **Sentry/nextjs** para errors + sourcemaps
- **NO Redux** — es overkill, Zustand cubre todo.

### Infra
- **Docker Compose** para dev y producción (Hostinger VPS o equivalente)
- **Nginx** como reverse proxy + Let's Encrypt
- **GitHub Actions** para CI/CD

---

## 2. Decisiones arquitectónicas fundacionales

### 2.1 Multi-tenancy: RLS + `tenant_id`
Todos los datos de cliente viven en tablas con `tenant_id UUID NOT NULL`. PostgreSQL Row-Level Security garantiza aislamiento a nivel del motor: aunque el código olvide un `WHERE tenant_id`, RLS bloquea.

**Patrón estándar para una tabla tenant-scoped**:
```sql
CREATE TABLE jugadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  -- ... resto de columnas
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jugadores_tenant ON jugadores(tenant_id);

ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE jugadores FORCE ROW LEVEL SECURITY;  -- FORCE: aplica también al owner

CREATE POLICY tenant_isolation ON jugadores
  USING (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_tenant_id', true) = ''  -- bypass super_admin / sistema
  );
```

**Reglas duras**:
- Toda tabla con datos de cliente DEBE tener `tenant_id`, RLS habilitado con `FORCE`, e índice en `tenant_id`.
- Tablas de plataforma (`tenants`, `super_admins`, `migrations`) NO tienen RLS.
- Para queries cross-tenant legítimas (super admin reports, crons globales) → setear `app.current_tenant_id = ''` (vacío) y la policy permite el bypass.
- El API conecta a la DB con un usuario **NO superuser** (`fixtura_app`). El usuario superuser (`fixtura`) queda para backups y migraciones. Esto es lo que hace que `FORCE` muerda — un superuser ignoraría RLS.

### 2.2 Propagación de contexto: AsyncLocalStorage + typeorm-transactional
RLS requiere que **todas las queries de un request usen la misma conexión** (porque `SET LOCAL app.current_tenant_id` es por-conexión). Sin esto, el pool de TypeORM puede dar conexiones distintas dentro del mismo request.

**Solución**: `typeorm-transactional` envuelve el request en una transacción y usa `AsyncLocalStorage` para que todos los repositorios usen el mismo `EntityManager`. **Inicializar ANTES de crear la app Nest**:

```ts
// main.ts (orden estricto)
import './instrument';  // Sentry primero
import { initializeTransactionalContext } from 'typeorm-transactional';

async function bootstrap() {
  initializeTransactionalContext();  // ANTES de NestFactory.create
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // ...
}
```

Después, un `TenantContextInterceptor` global ejecuta en cada request autenticado:
```ts
await dataSource.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
```

### 2.3 Crons y contexto de tenant
Los cron jobs no pasan por el interceptor (no hay request HTTP). Si una tabla tiene RLS y un cron no setea el contexto → retorna 0 filas. Usar el helper `TenantCronRunner` (ver patrón en `apps/api/src/common/rls/tenant-cron-runner.ts` de Eva360):

- `runForEachTenant(label, callback)` — itera tenants activos, una tx por cada uno, errores aislados.
- `runAsSystem(label, callback)` — `tenant_id = ''` (modo sistema, para cleanups, dunning, expiración de trials).

**Nunca** hacer `getRepository(Foo).find({ where: { ... } })` directo en un cron tenant-scoped sin contexto.

### 2.4 Roles del sistema
| Rol | Nivel | Descripción |
|---|---|---|
| Super Admin | Plataforma | Equipo Fixtura, ve todos los tenants |
| Admin de Liga (`tenant_admin`) | Tenant | Gestiona la liga: usuarios, fixture, designaciones |
| Delegado/Club | Tenant | Gestiona su club: plantilla, pagos |
| Árbitro | Tenant | Ve designaciones, confirma asistencia |
| Jugador | Tenant | Ve su ficha, calendario, estadísticas |
| Hincha | Tenant | Vista pública/seguidor de su club |

Decorators: `@Roles('tenant_admin', 'delegado')` + `RolesGuard` global.

---

## 3. Patrones de implementación

### 3.1 Estructura de un módulo NestJS
```
apps/api/src/modules/<dominio>/
├── dto/
│   ├── create-<x>.dto.ts        # class-validator + class-transformer
│   └── update-<x>.dto.ts
├── entities/
│   └── <x>.entity.ts            # TypeORM, con tenant_id
├── <x>.controller.ts            # routes, @Roles, validación
├── <x>.service.ts               # lógica de negocio, transacciones
├── <x>.module.ts
└── <x>.service.spec.ts          # unit tests
```

### 3.2 Convenciones de servicios
- **Toda firma de método tenant-scoped recibe `tenantId: string` explícito** como primer argumento (después del `actor` si aplica). Es defensa-en-profundidad: aunque RLS proteja, el código sigue siendo legible y testeable.
- **Usar transacciones** (`@Transactional()` o `runInTransaction`) cuando varias escrituras deben ser atómicas — especialmente en flujos críticos (crear/lanzar fixture, procesar pago, importar usuarios).
- **Nunca interpolar strings en SQL.** Usar `queryBuilder` o parameters `$1, $2`.
- **Audit log en toda acción crítica**: crear/editar/borrar entidades de dominio, login, cambios de rol, pagos, lanzar/cerrar fixture.

### 3.3 Convenciones de controllers
- Endpoint base: `/api/v1`
- Paginación: `{ data, meta: { total, page, limit } }`
- DTO con `class-validator` en cada body/query.
- `ValidationPipe` global con `whitelist: true, transform: true`.
- `@Roles()` o `@Public()` siempre explícito — nunca confiar en defaults.

### 3.4 Migraciones de DB
**Dos sistemas conviven** (decisión madurada en Eva360):

1. **Migraciones formales TypeORM** (`apps/api/src/database/migrations/*.ts`) — para cambios destructivos: DROP COLUMN, rename con data, cambios de tipo no compatibles. Reversibles vía `down()`.

2. **`cleanup-orphans.ts`** (script idempotente que corre al arranque del API) — para cambios aditivos seguros: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TYPE ADD VALUE IF NOT EXISTS`, backfills no destructivos.

| Caso | Usar |
|---|---|
| DROP COLUMN / DROP TABLE | **Migración formal** |
| Rename de columna con data | **Migración formal** (con `down()`) |
| Agregar columna nullable / con default | `cleanup-orphans` |
| Agregar índice | `cleanup-orphans` |
| Agregar valor a enum existente | `cleanup-orphans` |
| Convertir varchar → enum | `cleanup-orphans` con pre-check + `USING` cast |

**Reglas duras**:
- **NUNCA `synchronize: true` en producción.** El código debe leer `process.env.NODE_ENV === 'production'` y forzar `synchronize: false`.
- **NUNCA modificar el schema con SQL directo en prod.** Siempre vía migración o script idempotente versionado.
- `cleanup-orphans.ts` NO borra datos. Cualquier `DROP`, `DELETE`, `TRUNCATE` → migración formal con `down()`.

### 3.5 Frontend — estructura y patrones
```
apps/web/src/
├── app/                  # App Router
│   ├── (auth)/           # Login, invite, reset
│   ├── (dashboard)/      # Layout autenticado
│   ├── layout.tsx
│   └── page.tsx
├── components/
├── hooks/                # useFoo() — wrappers de TanStack Query
├── lib/
│   ├── api.ts            # Cliente fetch tipado, baseURL desde env
│   ├── auth.ts           # Token storage, refresh logic
│   └── i18n.ts
├── locales/              # es.json, en.json, pt.json (estructura idéntica)
├── providers/            # QueryClientProvider, ThemeProvider, etc.
└── store/                # Zustand stores (un slice por dominio de UI)
```

**Reglas**:
- **TanStack Query para todo lo que viene de la API**: `useFoo()` retorna `{ data, isLoading, error }`. Mutaciones con `useMutation` + invalidaciones.
- **Zustand solo para UI state global** (sidebar abierto, tema, usuario actual). NO para datos del servidor.
- **React Hook Form + Zod** en todo formulario. Schema Zod compartido idealmente con `packages/types`.
- **Optimistic updates** en acciones críticas (autosave de borradores, marcar leído).
- **Skeleton/Empty states siempre**. Nunca un blank screen mientras carga.
- **Mobile-first**: targets touch ≥ 44px, bottom nav en mobile, sidebar en desktop.

---

## 4. Seguridad — implementada desde el día 1

No hay "fase de seguridad después". Estos controles son parte de Fase 0.

### 4.1 Autenticación
- **JWT access token**: 15 minutos. **Refresh token**: 7 días con **rotación en cada uso**.
- Refresh tokens persistidos en Redis (o tabla `refresh_tokens` con índice) — invalidables individualmente y por usuario.
- Passwords: **bcrypt cost 12**.
- **Rate limit** en `/auth/login`: 5 intentos por IP cada 15min.
- **Validación de secrets al bootstrap** (`main.ts`): en prod, `JWT_SECRET` y `SSO_STATE_SECRET` deben tener ≥32 chars, no ser un default conocido, y ser distintos entre sí. Si falla → el container crashea (loud failure es mejor que silent insecurity).

### 4.2 Tenant isolation
- RLS habilitado con `FORCE` (sección 2.1).
- `TenantContextInterceptor` global que setea `app.current_tenant_id` en cada request autenticado.
- El API conecta con usuario NO superuser.

### 4.3 Otros controles obligatorios
| Control | Implementación |
|---|---|
| RBAC | `@Roles()` decorador + `RolesGuard` global |
| Validación de inputs | `class-validator` en todos los DTOs (BE), Zod en formularios (FE) |
| SQL Injection | TypeORM query builder o parameters, nunca string interpolation |
| XSS | `DOMPurify` en frontend para inputs ricos (chats, comentarios) |
| CORS | **Whitelist obligatoria** (`FRONTEND_URL` env). En prod sin esta var, el container crashea. NO reflect-all en prod. |
| CSRF | `CsrfGuard` para mutaciones desde browser (si usás cookies session) |
| Security headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `HSTS`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| Trust proxy | `app.set('trust proxy', 'loopback, linklocal, uniquelocal')` — para que el rate limit cuente IPs reales detrás de nginx |
| Webhook signatures | `express.raw()` **antes** del JSON parser, en `/webhooks/stripe` y `/webhooks/mercadopago` |
| Audit log | Interceptor global con decorator `@Audited('action.name')` |
| HTTPS | Forzado, HSTS, Let's Encrypt auto-renewal |
| Secrets | `.env` local, env vars del runtime (Docker, Render) — nunca commiteados |

### 4.4 Impersonación (super admin)
Cuando un super admin "entra como" un tenant admin para soporte, marcar el JWT con `impersonatorId` y un decorator `@NoImpersonation()` bloquea endpoints sensibles (cambiar password, eliminar cuenta). Loggear toda sesión impersonada en `audit_log`.

---

## 5. Observabilidad

### 5.1 Logs
- **Pino** estructurado JSON. Reemplazar el logger default de Nest:
  ```ts
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  ```
- Inyectar `requestId`, `userId`, `tenantId` automáticamente en cada log.
- Niveles: `error` → Sentry; `warn` y `info` → stdout (Docker rota).
- `LOG_LEVEL` env var, default `info`.

### 5.2 Sentry
- **Primer import del proceso**: `import './instrument'`. El side-effect ejecuta `Sentry.init()` y registra los hooks de OpenTelemetry antes de cargar express/typeorm/pg.
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` (= GIT_SHA), `SENTRY_TRACES_SAMPLE_RATE` (default 0.1).
- Capturar `unhandledRejection` y `uncaughtException` explícitamente, con `tags.source`.
- Frontend: `@sentry/nextjs` + sourcemaps subidos en build (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`).

### 5.3 Métricas Prometheus
- `prom-client` + `@willsoto/nestjs-prometheus`. Endpoint `/metrics`.
- **Proteger con basic auth** (`METRICS_USER`, `METRICS_PASSWORD`) — nunca público en prod.
- Métricas mínimas: request duration histogram, error rate counter, DB pool gauge, cron run duration.

### 5.4 Health checks
- `/health/live` — liveness puro, no toca DB. Para Docker healthcheck.
- `/health/ready` — readiness, valida DB y dependencias. Para load balancer.
- `/health/version` — expone `GIT_SHA` y version. Útil para verificar deploys.

---

## 6. Operación y deploy

### 6.1 Docker Compose
Cada servicio (`db`, `api`, `web`, `nginx`) debe tener:
- `mem_limit` y `cpus` explícitos — sin esto, un leak en un servicio mata al VPS.
- `healthcheck` con `interval`, `timeout`, `retries`, `start_period`.
- `stop_grace_period` ≥ 15-30s para shutdown ordenado.
- `logging: driver json-file, max-size: 50m, max-file: 5` — sin esto, los logs llenan el disco en semanas.
- `restart: unless-stopped`.

### 6.2 Build
- `args: GIT_SHA: ${GIT_SHA:-unknown}` para que `/health/version` lo exponga.
- Container `api` arranca con: `node dist/database/cleanup-orphans.js && node dist/main`. El cleanup corre primero (idempotente, seguro).

### 6.3 Deploy (rolling)
Estándar VPS único:
```bash
git fetch && git reset --hard origin/main
docker compose build --no-cache api
docker compose up -d --no-deps api
# Esperar healthy antes de cleanup
timeout 120 bash -c 'until docker inspect fixtura_api --format "{{.State.Health.Status}}" | grep -q healthy; do sleep 5; done'
docker image prune -f
```

Para cambios que tocan webhooks de pago o ventanas de alta carga → seguir [docs/OPS_RUNBOOK.md](docs/OPS_RUNBOOK.md).

### 6.4 Backups
- `pg_dump` rotativo diario (30 días retención). Script + cron en el host.
- Verificar restore mensualmente — backup que no se restaura es ficción.

### 6.5 CI/CD (GitHub Actions)
Pipeline mínimo en cada PR:
1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm test` (unit + integration)
4. `pnpm build`
5. Para `main`: deploy automático a staging; producción es manual.

---

## 7. Testing

| Tipo | Herramienta | Cubrir |
|---|---|---|
| Unit | Jest | Lógica pura de services |
| Integración API | Supertest | Cada endpoint con DTO + auth + tenant isolation |
| E2E RLS | Jest con DB real | Test que confirme que un tenant no ve datos de otro |
| Frontend | (a definir — Vitest + Testing Library) | Hooks de TanStack Query, formularios críticos |

**Reglas**:
- Cada endpoint tiene al menos 1 test de integración con tenant fake.
- Tests de RLS deben fallar **sin** la capa de seguridad (para confirmar que el test sí prueba lo que dice).
- Coverage threshold low pero existente — el equipo lo sube fase a fase.
- `testTimeout: 30000`, `maxWorkers: 50%` para CI estable.

---

## 8. Internacionalización

- **i18next + react-i18next** en frontend.
- Archivos `es.json`, `en.json`, `pt.json` en `apps/web/src/locales/`. Estructura idéntica.
- Validar al build que las 3 tienen las mismas keys (script en `scripts/`).
- Backend: emails y notificaciones tienen plantilla por idioma; el `language` se guarda por usuario.

---

## 9. Convenciones de código

### TypeScript
- `strict: true`. Nada de `any` salvo casos justificados con comentario.
- Tipos compartidos entre FE y BE → `packages/types`.
- Naming: PascalCase para clases/types/enums, camelCase para todo lo demás, kebab-case para nombres de archivo.

### Estilo
- Prettier + ESLint (configs en `packages/config`).
- Prettier: comillas simples, sin punto y coma final (a definir en el equipo).
- ESLint: `@typescript-eslint/recommended`, `eslint-plugin-import` para orden de imports.

### Comentarios
- Por default, **no escribir comentarios**. Código autoexplicativo con buenos nombres.
- Comentar solo el **POR QUÉ no-obvio**: restricción oculta, workaround para un bug específico, comportamiento que sorprendería al lector.
- No documentar "qué hace" — eso lo dice el código.
- No referenciar tickets/PRs/issues en comentarios — eso vive en el commit message.

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
- Branch model: `main` (prod) + `develop` (staging) + feature branches.
- PRs requieren al menos 1 review + CI verde.
- **Nunca commitear secretos.** `.env.example` se commitea, `.env` no.
- **Nunca `git push --force` a `main` o `develop`.**

---

## 10. Reglas de oro (no negociables)

1. **Tenant isolation primero.** Cada PR que toca BD debe responder: ¿esta tabla tiene `tenant_id`? ¿tiene RLS habilitado? ¿la query nueva propaga el contexto?
2. **Nunca `synchronize: true` en producción.** El código debe forzarlo `false` si `NODE_ENV=production`.
3. **Nunca string interpolation en SQL.** Query builder o parameters, siempre.
4. **`.env` jamás commiteado.** `.env.example` con valores fake sí.
5. **Toda acción crítica genera audit log** con `user_id`, `tenant_id`, `ip`, `timestamp`.
6. **Healthcheck en cada servicio** Docker. Sin healthcheck, el deploy rolling no sabe cuándo está listo.
7. **Log rotation configurado** desde el primer deploy. No es algo para "después".
8. **Cron jobs setean contexto de tenant explícitamente.** Sin esto, RLS los rompe silenciosamente cuando se habilita.
9. **Secrets validados al bootstrap.** Si faltan o son débiles en prod, el container crashea — loud failure > silent insecurity.
10. **Migraciones son source of truth del schema.** No hay ALTER TABLE manuales en prod, ni "lo arreglé en el dashboard".

---

## 11. Roadmap por fases (template a refinar con producto)

### Fase 0 — Infraestructura (1 semana, bloqueante)
- Monorepo pnpm + Turbo
- Docker Compose (db + api + web + nginx)
- PostgreSQL 16 + RLS habilitado en tabla pivot
- NestJS con TenantContextInterceptor + typeorm-transactional
- Next.js 14 con auth middleware
- JWT (15min access + 7d refresh con rotación)
- CI/CD GitHub Actions (lint + test + build)
- Sentry + Pino + Prometheus + Health checks
- README onboarding para nuevos devs
- `.env.example` completo

### Fase 1 — MVP Core
A definir con el documento maestro de Fixtura. Mínimo:
- Auth + onboarding de tenants (ligas)
- Gestión de usuarios (admin, delegados, jugadores, árbitros)
- Importación CSV de planteles
- Fixture/calendario (creación + reprogramación, según anexo de reglas)
- Designaciones de árbitros
- Vista pública para hinchas
- Notificaciones email (Resend)

### Fase 2+ — Pagos, observabilidad avanzada, mobile PWA, analytics, integraciones

---

## 12. Archivos clave del repo (a crear)

| Archivo | Propósito |
|---|---|
| `README.md` | Quickstart de 5 minutos para dev local |
| `docs/MIGRATIONS.md` | Cómo crear y aplicar migraciones |
| `docs/OPS_RUNBOOK.md` | Deploy, rollback, debugging en prod |
| `docs/BACKUPS_RUNBOOK.md` | Backup + restore + verificación |
| `docs/F4-RLS-PLAN.md` (si aplica) | Plan de habilitación de RLS si arrancás sin él |
| `docs/decisions/NNNN-titulo.md` | ADRs — una decisión por archivo, append-only |
| `.env.example` | Todas las env vars con valores fake/comentarios |
| `docker-compose.yml` | Prod-ready desde el día 1 |
| `nginx.conf` | Reverse proxy + SSL + rate limit a nivel nginx |
| `turbo.json` | Pipeline de build/test/lint/dev |

---

## 13. Cómo trabajar conmigo (Claude) en este repo

- **Idioma**: español. Comentarios y commits también.
- **Tareas grandes**: arranco con TaskCreate, voy marcando progreso. Vos podés interrumpir y redirigir.
- **Cambios riesgosos**: pregunto antes (delete, push --force, migración destructiva, dropping prod data, etc.).
- **Decisiones arquitectónicas**: las escribo como ADR en `docs/decisions/` para que queden trazables.
- **Cuando no sé algo del dominio**: pregunto. Fixtura tiene reglas específicas (calendario, reprogramaciones, designaciones) que no puedo inferir del código.
- **No agrego abstracciones especulativas.** Tres líneas similares > una abstracción prematura.
- **No genero comentarios decorativos** ni explico "qué hace" el código.

---

*Última actualización: 2026-05-24. Origen: lecciones técnicas de Eva360 (plataforma SaaS en producción).*
