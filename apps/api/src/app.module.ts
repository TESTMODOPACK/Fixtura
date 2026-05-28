import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { DatabaseModule } from './database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { RlsModule } from './common/rls/rls.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompetitionModule } from './modules/competition/competition.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './modules/health/health.module';
import { PublicModule } from './modules/public/public.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        autoLogging: { ignore: (req) => req.url === '/health/live' },
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        customProps: () => ({
          // requestId, userId, tenantId se inyectan vía interceptor
        }),
      },
    }),

    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 50 }),
    ScheduleModule.forRoot(),

    DatabaseModule,
    // RlsModule debe registrarse antes que AdminModule (lo usan los
    // crons de Dunning y SII). Es @Global pero NestJS solo lo registra
    // si está en algún imports — sin esto, TenantCronRunner no se
    // resuelve y los crons crashean al bootstrap (incidente 2026-05-28).
    RlsModule,
    EmailModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    CompetitionModule,
    PublicModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
