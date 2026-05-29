import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { MatchCenterModule } from './modules/match-center/match-center.module';
import { MeModule } from './modules/me/me.module';
import { PublicModule } from './modules/public/public.module';
import { AuditModule } from './modules/audit/audit.module';
import { ImpersonationModule } from './modules/impersonation/impersonation.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

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

    // AUDIT-2: rate limiting global. Default 60 req/min por IP, con
    // límites más estrictos por endpoint vía @Throttle() (login,
    // forgot-password). Sin esto, vulnerable a brute force y spam.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 60,
      },
    ]),

    DatabaseModule,
    // RlsModule debe registrarse antes que AdminModule (lo usan los
    // crons de Dunning y SII). Es @Global pero NestJS solo lo registra
    // si está en algún imports — sin esto, TenantCronRunner no se
    // resuelve y los crons crashean al bootstrap (incidente 2026-05-28).
    RlsModule,
    EmailModule,
    WhatsAppModule,
    AuditModule,
    ImpersonationModule,
    SuperAdminModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    CompetitionModule,
    MeModule,
    PublicModule,
    AdminModule,
    MatchCenterModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // ThrottlerGuard primero — corta tráfico abusivo antes de validar JWT
    // (que es más caro que un counter en memoria).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
