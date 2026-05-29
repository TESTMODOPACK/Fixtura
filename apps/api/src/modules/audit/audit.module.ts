import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from './audit-log.entity';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditedInterceptor } from './audited.interceptor';

/**
 * Sprint 20 — RF-07. @Global porque cualquier service de la app puede
 * inyectar `AuditLogService` para registrar eventos de negocio
 * (no solo lo que captura el interceptor de @Audited).
 *
 * El `AuditedInterceptor` se registra como APP_INTERCEPTOR para correr
 * sobre todo handler que tenga el decorator @Audited().
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditedInterceptor,
    },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}
