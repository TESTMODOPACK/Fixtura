import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { AdvancedConsoleLogger, DataSource } from 'typeorm';

/**
 * El log de query lenta de TypeORM adjunta "-- PARAMETERS: [...]" — con
 * maxQueryExecutionTime activo, cualquier query lenta escribiría RUTs,
 * emails y hashes a stdout. Este logger omite los parámetros SOLO ahí.
 */
class LoggerSinParametrosLentos extends AdvancedConsoleLogger {
  override logQuerySlow(time: number, query: string): void {
    super.logQuerySlow(time, query);
  }
}

/** Entero positivo desde env; con basura o vacío cae al default (no a NaN,
 *  que pg interpreta como "sin timeout" en silencio). */
function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';

        const dbUser = config.get<string>('DB_APP_USER') ?? config.get<string>('DB_USER');
        const dbPassword =
          config.get<string>('DB_APP_PASSWORD') ?? config.get<string>('DB_PASSWORD');

        return {
          type: 'postgres' as const,
          url:
            config.get<string>('DATABASE_URL') ??
            `postgres://${dbUser}:${dbPassword}@${config.get('DB_HOST', 'db')}:${config.get('DB_PORT', '5432')}/${config.get('DB_NAME', 'fixtura')}`,
          ssl: config.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: false, // NUNCA true. Schema via migraciones + cleanup-orphans.
          logger: new LoggerSinParametrosLentos(
            isProduction ? ['error', 'warn', 'migration', 'schema'] : 'all',
          ),
          // T14 — loggea como warning toda query que supere este umbral.
          maxQueryExecutionTime: enteroPositivo(config.get('DB_SLOW_QUERY_MS'), 500),
          extra: {
            max: enteroPositivo(config.get('DB_POOL_MAX'), 20),
            min: enteroPositivo(config.get('DB_POOL_MIN'), 2),
            // T14 — sin estos límites, una conexión colgada o una tx
            // olvidada retienen el pool para siempre (el síntoma aguas
            // arriba es "API colgada", no un error).
            connectionTimeoutMillis: enteroPositivo(config.get('DB_CONNECT_TIMEOUT_MS'), 5000),
            idleTimeoutMillis: enteroPositivo(config.get('DB_IDLE_TIMEOUT_MS'), 30000),
            statement_timeout: enteroPositivo(config.get('DB_STATEMENT_TIMEOUT_MS'), 30000),
            idle_in_transaction_session_timeout: enteroPositivo(
              config.get('DB_IDLE_TX_TIMEOUT_MS'),
              120000,
            ),
            application_name: 'ligaplus-api',
            keepAlive: true,
          },
        };
      },
      // typeorm-transactional necesita envolver el DataSource ANTES de
      // que Nest lo use, para que AsyncLocalStorage propague la tx.
      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('TypeORM options inválidas');
        }
        return addTransactionalDataSource(new DataSource(options));
      },
    }),
  ],
})
export class DatabaseModule {}
