import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { NoImpersonationGuard } from './no-impersonation.guard';

/**
 * Sprint 21 — RF-06. Impersonación super admin con audit log obligatorio
 * y guard que bloquea endpoints sensibles.
 *
 * NoImpersonationGuard registrado como APP_GUARD para que @NoImpersonation()
 * funcione en cualquier handler de cualquier módulo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRole]),
    AuthModule, // expone AuthService.issueTokens()
  ],
  controllers: [ImpersonationController],
  providers: [
    ImpersonationService,
    {
      provide: APP_GUARD,
      useClass: NoImpersonationGuard,
    },
  ],
  exports: [ImpersonationService],
})
export class ImpersonationModule {}
