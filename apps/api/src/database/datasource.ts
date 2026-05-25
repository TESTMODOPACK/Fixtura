/**
 * DataSource standalone para el CLI de TypeORM (migraciones).
 * NO se usa en runtime de la app — eso lo maneja DatabaseModule.
 *
 * Comandos:
 *   pnpm --filter @fixtura/api run migration:generate src/database/migrations/NombreDescriptivo
 *   pnpm --filter @fixtura/api run migration:run
 *   pnpm --filter @fixtura/api run migration:revert
 */
import { join } from 'node:path';

import 'dotenv/config';
import { DataSource } from 'typeorm';

const dbUser = process.env.DB_APP_USER ?? process.env.DB_USER ?? 'fixtura';
const dbPassword = process.env.DB_APP_PASSWORD ?? process.env.DB_PASSWORD ?? 'fixtura';
const dbHost = process.env.DB_HOST ?? 'localhost';
const dbPort = process.env.DB_PORT ?? '5432';
const dbName = process.env.DB_NAME ?? 'fixtura';

const url =
  process.env.DATABASE_URL ??
  `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

// IMPORTANTE: TypeORM CLI (v0.3.x) requiere que este archivo exporte UN
// solo DataSource. No mezclar `export const` con `export default` — el
// CLI lanza "Given data source file must contain only one export".

// Paths relativos a __dirname para que funcione tanto en:
//   - dev local: __dirname = .../apps/api/src/database → busca *.entity.ts
//   - producción container: __dirname = /app/apps/api/dist/database → busca *.entity.js
// Glob `*.{ts,js}` cubre ambos casos.
const AppDataSource = new DataSource({
  type: 'postgres',
  url,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});

export default AppDataSource;
