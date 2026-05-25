# Fixtura

> SaaS multi-tenant para la gestión integral de ligas amateur de fútbol — Chile y LATAM.

Torneos, fixture, designaciones, actas digitales en cancha, finanzas SII, comunidad estilo FUT
y publicidad. Una sola plataforma. Sin Excel ni WhatsApp paralelos.

## Estado del proyecto

**Fase 0** (infraestructura base) — completada. Próximo: **Fase 1 MVP Core** (10-12 semanas).

Documentos vivos:

- [`CLAUDE.md`](CLAUDE.md) — contrato técnico, stack, patrones, reglas de oro
- [`docs/PLAN_DESARROLLO.md`](docs/PLAN_DESARROLLO.md) — roadmap por fases
- [`docs/decisions/`](docs/decisions/) — ADRs (ORM, mobile, roles, etc.)
- [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) — migraciones de DB
- [`docs/OPS_RUNBOOK.md`](docs/OPS_RUNBOOK.md) — deploy y troubleshooting

## Quickstart (10 minutos)

Requisitos: **Node 20+**, **pnpm 9+**, **PostgreSQL 16** (instalado nativo en Windows / Linux / Mac).

> Para producción usamos Docker Compose. Para dev local usamos Postgres nativo
> (más liviano, sin overhead de WSL2 en Windows).

### 1. PostgreSQL local

Descargar Postgres 16 desde <https://www.postgresql.org/download/>.
Durante la instalación, recordá la password del usuario `postgres`.

Crear DB y usuario para Fixtura (desde `psql -U postgres`):

```sql
CREATE ROLE fixtura LOGIN PASSWORD 'mi_password_segura' CREATEDB;
CREATE DATABASE fixtura OWNER fixtura;
```

### 2. Variables

```bash
cp .env.example .env
```

Editar `.env` con valores mínimos:

```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fixtura
DB_USER=fixtura
DB_PASSWORD=mi_password_segura
DB_APP_USER=fixtura
DB_APP_PASSWORD=mi_password_segura
JWT_SECRET=dev-jwt-secret-local-fixtura-32chars-minimo-aleatorio
SSO_STATE_SECRET=dev-sso-state-secret-distinto-32chars-minimo-fixtura
FRONTEND_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3000
SKIP_CLEANUP_ORPHANS=true
```

> En dev no separamos superuser/app user — son el mismo. `SKIP_CLEANUP_ORPHANS=true`
> evita que el script intente crear un rol separado.

### 3. Levantar la app

```bash
pnpm install
pnpm --filter @fixtura/api migration:run
pnpm --filter @fixtura/api db:seed
pnpm dev
```

- API: <http://localhost:3000/health/live>
- Web: <http://localhost:3001>

**Login demo**:
- Email: `admin@fixtura.local`
- Password: `Fixtura2026!`

### Redis (no requerido en Fase 0)

Fase 0 no usa Redis. Cuando lleguemos a Sprint 5 (queues BullMQ, refresh
tokens en cache), instalar Redis localmente o usar uno en la nube.

## Estructura

```
fixtura/
├── apps/
│   ├── api/                 # NestJS 11 + TypeORM + RLS
│   └── web/                 # Next.js 14 App Router + Tailwind + Fixtura design system
├── packages/
│   ├── config/              # tsconfig + eslint compartidos
│   ├── types/               # DTOs Zod cliente-servidor
│   └── domain/              # Lógica pura (fixture engine, sanciones, permisos)
├── docs/
│   ├── PLAN_DESARROLLO.md
│   ├── decisions/           # ADRs
│   ├── MIGRATIONS.md
│   └── OPS_RUNBOOK.md
├── nginx/                   # Reverse proxy para prod
├── .github/workflows/       # CI
├── docker-compose.yml       # Dev local (solo db + redis por default)
├── docker-compose.yml  # Prod con todos los servicios
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md                # Contrato técnico
```

## Comandos útiles

```bash
# Dev
pnpm dev                                       # api + web en paralelo
pnpm --filter @fixtura/api start:dev           # solo api
pnpm --filter @fixtura/web dev                 # solo web

# Calidad
pnpm lint                                      # ESLint en todo el monorepo
pnpm typecheck                                 # tsc --noEmit en cada workspace
pnpm test                                      # Jest en cada workspace
pnpm format                                    # Prettier write

# Build
pnpm build                                     # Build todo (turbo cachea)

# DB
pnpm --filter @fixtura/api migration:generate src/database/migrations/AddX
pnpm --filter @fixtura/api migration:run
pnpm --filter @fixtura/api migration:revert
pnpm --filter @fixtura/api db:seed
```

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: NestJS 11, TypeScript 5.7, TypeORM 0.3, PostgreSQL 16 + RLS
- **Frontend**: Next.js 14 App Router, React 18, Tailwind CSS 3.4, TanStack Query, Zustand
- **Auth**: JWT 15min + refresh 7d con rotación, bcrypt cost 12
- **Multi-tenant**: RLS de Postgres con `FORCE`, propagación vía `typeorm-transactional`
- **Observabilidad**: Pino JSON + Sentry + Prometheus
- **Tipografía**: Anton, Archivo Black, Newsreader, Geist, Space Grotesk
- **Paleta**: verde cancha + papel + naranja silbato — sistema editorial deportivo

Ver [`CLAUDE.md`](CLAUDE.md) para el contrato técnico completo.

## Sistema de diseño

Fixtura usa una paleta inspirada en el periodismo deportivo chileno/latino (Panenka, El Gráfico)
y se diferencia conscientemente del SaaS genérico azul/Inter.

- `#0F2A1F` — verde cancha profundo (sidebar, dark cards)
- `#E76F26` — naranja silbato (CTA primario, eyebrows, X del logo)
- `#F1ECE2` — papel (fondo base)
- `#FAFAF7` — tiza (fondo cards)
- `#95D5B2` — verde lima (acento sobre dark)

Ver `apps/web/tailwind.config.ts` y `fixtura_brand_system.html` (en raíz, archivo de marca).

## Convenciones

- **Idioma**: español. Commits, comentarios, docs en español.
- **Comentarios**: no decorativos. Solo el "por qué no obvio".
- **Commits**: Conventional Commits — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`
- **Branches**: `main` (prod) + `develop` (staging) + feature branches.

## Licencia

UNLICENSED — código propietario de Fixtura.
