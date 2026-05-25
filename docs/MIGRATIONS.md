# Migraciones de Base de Datos — Fixtura

## Resumen

Fixtura usa **dos sistemas** complementarios para gestionar el schema:

1. **Migraciones formales TypeORM** (`apps/api/src/database/migrations/*.ts`) — para
   cambios destructivos o reversibles: `DROP COLUMN`, rename con data, cambios de tipo.
2. **`cleanup-orphans.ts`** — script idempotente que corre al arranque del API en
   producción (`start:prod`). Solo cambios aditivos seguros (`ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, valores de enum, extensiones, usuario app).

**Regla #1**: NUNCA modificar el schema directamente con SQL en producción. Siempre vía
migración formal o script idempotente versionado.

**Regla #2**: `synchronize: true` está DESACTIVADO en todos los ambientes. Eso lo dicta
`DatabaseModule` y no admite override.

## Cuándo usar cada uno

| Caso | Usar |
|---|---|
| DROP COLUMN / DROP TABLE | **Migración formal** |
| Rename de columna con data | **Migración formal** (con `down()`) |
| Cambio de tipo no compatible (varchar → int) | **Migración formal** |
| Agregar columna nullable o con default | `cleanup-orphans.ts` |
| Agregar índice | `cleanup-orphans.ts` |
| Agregar valor a enum existente | `cleanup-orphans.ts` (`ALTER TYPE ADD VALUE IF NOT EXISTS`) |
| Agregar extension Postgres | `cleanup-orphans.ts` (`CREATE EXTENSION IF NOT EXISTS`) |
| Crear usuario de aplicación | `cleanup-orphans.ts` (idempotente) |
| Backfill simple (NULL → default) | `cleanup-orphans.ts` con WHERE específico |
| Backfill complejo con lógica | **Migración formal** |

## Comandos

Desde `apps/api/`:

```bash
# Generar migración a partir de cambios en entities/
pnpm migration:generate src/database/migrations/AddTorneosTable

# Ejecutar todas las migraciones pendientes
pnpm migration:run

# Revertir la última migración (ejecuta down())
pnpm migration:revert

# Ver estado (cuáles aplicadas y cuáles pendientes)
pnpm migration:show
```

## Flujo típico

### 1. Modificar la entidad TypeORM

```ts
@Entity({ name: 'torneos' })
export class Torneo {
  // ...nuevo campo
  @Column({ name: 'reglamento_url', type: 'varchar', length: 500, nullable: true })
  reglamentoUrl!: string | null;
}
```

### 2. Generar la migración

```bash
pnpm migration:generate src/database/migrations/AddReglamentoUrl
```

TypeORM compara el schema actual de la BD con las entities y genera el SQL.

### 3. Revisar SIEMPRE el archivo generado

TypeORM a veces genera migraciones destructivas si renombraste un campo
(genera `DROP COLUMN x; ADD COLUMN y`). Revisar antes de ejecutar.

### 4. Ejecutar en dev

```bash
pnpm migration:run
```

### 5. Commit + push

El siguiente deploy en prod la ejecutará automáticamente vía
`docker compose exec api pnpm migration:run` antes del rollover de containers.

## RLS en migraciones

Toda tabla tenant-scoped DEBE incluir en la misma migración:

```sql
ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
ALTER TABLE foo FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON foo
  USING (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_tenant_id', true) = ''
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_tenant_id', true) = ''
  );
CREATE INDEX idx_foo_tenant ON foo(tenant_id);
```

El `FORCE` es crítico — sin él, el owner de la tabla (el usuario superuser) bypassea
las policies. Por eso el API conecta como `fixtura_app` (no superuser).

## Rollback de migración

```bash
pnpm migration:revert
```

Ejecuta el `down()` de la última migración aplicada. Si el `down()` está vacío o mal
escrito, manual rollback (ojo con destruir data).

## Regla de oro del cleanup-orphans

**NO borra datos**. Sin `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, ni `SET columna = NULL`
masivos. Cualquier operación destructiva requiere migración formal con `down()` y
aprobación explícita.

## DB_SYNC en producción — prohibido

```ts
// database.module.ts
synchronize: false,  // hardcoded, no admite env var
```

Si un PR incluye `synchronize: true` o cualquier mecanismo equivalente, rechazarlo en
review.
