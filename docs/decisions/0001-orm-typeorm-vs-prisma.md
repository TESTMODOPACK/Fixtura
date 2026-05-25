# ADR-0001 — ORM: TypeORM (sin migrar a Prisma)

- **Estado**: Aceptada
- **Fecha**: 2026-05-24
- **Decisores**: Equipo Fixtura

## Contexto

El documento maestro de Fixtura propone **Prisma + PostgreSQL** como capa de acceso a datos. El `CLAUDE.md` del repo, destilado de Eva360, prescribe **TypeORM 0.3 + `typeorm-transactional`** como stack canónico. Hay tensión.

Razones para considerar Prisma:
- DX superior (autocompletado fuerte, schema declarativo, migraciones automáticas más predecibles)
- Mayor adopción reciente en proyectos NestJS greenfield
- Mejor soporte para tipos compartidos con frontend

Razones para mantener TypeORM:
- Eva360 lo tiene en producción con 78 entidades y multi-tenant RLS funcionando
- El patrón `typeorm-transactional` + `AsyncLocalStorage` + `TenantContextInterceptor` está validado y resuelve el problema de connection pinning que requiere RLS
- Eva360 tiene migraciones formales + script idempotente `cleanup-orphans.ts` ya implementados — Fixtura puede reusar la convención
- Migrar a Prisma costaría:
  - 1-2 semanas reescribir entidades y queries
  - Re-investigar cómo Prisma maneja connection pinning para RLS (Prisma usa `prisma.$transaction` que NO garantiza la misma conexión a nivel `pg`)
  - Reescribir el helper `TenantCronRunner`
  - Tests E2E de RLS desde cero
- Prisma tiene fricción conocida con RLS de Postgres: el approach recomendado oficial es middleware en cada query, lo cual es la regresión que `typeorm-transactional` evita.

## Decisión

**Usar TypeORM 0.3.x + `typeorm-transactional` en Fixtura, replicando el patrón de Eva360.**

Específicamente:
- Entidades definidas con decoradores TypeORM.
- Migraciones formales en `apps/api/src/database/migrations/` para cambios destructivos.
- Script idempotente `cleanup-orphans.ts` para cambios aditivos seguros (`ADD COLUMN IF NOT EXISTS`, índices, valores de enum, etc.).
- `initializeTransactionalContext()` antes de `NestFactory.create` en `main.ts`.
- `TenantContextInterceptor` global que ejecuta `SELECT set_config('app.current_tenant_id', $1, true)` envuelto en transacción.
- `TenantCronRunner` para crons (replicando el de Eva360 en `apps/api/src/common/rls/`).

## Consecuencias

**Positivas**:
- Cero R&D arquitectónico. El equipo (1 dev) puede arrancar Fase 0 inmediatamente.
- Patrón RLS ya probado bajo carga real (Eva360 con 20 tenants activos).
- Posibilidad de copiar código de evapro (modelos genéricos como `audit_log`, `users`, `refresh_tokens`).

**Negativas**:
- DX de TypeORM es inferior al de Prisma — más boilerplate en repositorios, queries con joins manuales.
- Migraciones generadas automáticamente por TypeORM CLI a veces incluyen `DROP COLUMN` indeseado al renombrar — requiere revisar siempre antes de ejecutar.
- Tipos generados no se comparten automáticamente con frontend (vs Prisma Client que sí). Se mitiga con DTOs Zod en `packages/types`.

**Compromiso aceptado**: la velocidad de Fase 0 y la baja de riesgo arquitectónico pesan más que la mejora marginal de DX que daría Prisma en un proyecto donde el equipo es chico y el patrón ya está validado.

## Revisión futura

Esta decisión se revisará si:
- El equipo crece a 4+ devs full-time y la fricción de TypeORM se vuelve cuello de botella.
- Aparecen bugs estructurales en `typeorm-transactional` que rompan RLS.
- Migramos a otro engine (CockroachDB, Aurora DSQL) y TypeORM no lo soporta bien.

En tal caso, la migración sería incremental: Prisma puede convivir con TypeORM en módulos distintos por un periodo, con el costo de mantener dos schemas en paralelo.
