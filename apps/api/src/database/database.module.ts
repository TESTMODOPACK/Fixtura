import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { DataSource } from 'typeorm';

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
          logging: !isProduction,
          extra: {
            max: Number(config.get('DB_POOL_MAX', '20')),
            min: Number(config.get('DB_POOL_MIN', '2')),
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
