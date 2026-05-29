import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlanSuscripcion } from '../tenants/entities/plan-suscripcion.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import {
  SuperAdminMetricsController,
  SuperAdminPlanesController,
  SuperAdminTenantsController,
} from './super-admin.controller';
import { SuperAdminMetricsService } from './super-admin-metrics.service';
import { SuperAdminPlanesService } from './super-admin-planes.service';
import { SuperAdminTenantsService } from './super-admin-tenants.service';

/**
 * Sprint 23 — Módulo del super admin de plataforma.
 *
 * Todos los endpoints viven bajo /super-admin/* y requieren rol
 * SUPER_ADMIN. Internamente hacen bypass de RLS para ver datos
 * cross-tenant.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, PlanSuscripcion, User, UserRole])],
  controllers: [
    SuperAdminTenantsController,
    SuperAdminPlanesController,
    SuperAdminMetricsController,
  ],
  providers: [
    SuperAdminTenantsService,
    SuperAdminPlanesService,
    SuperAdminMetricsService,
  ],
})
export class SuperAdminModule {}
