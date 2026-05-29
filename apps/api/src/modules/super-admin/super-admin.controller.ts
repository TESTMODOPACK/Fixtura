import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type CreatePlanRequest,
  type CreateTenantPlatformRequest,
  type EstadoSuscripcion,
  type MetricasPlataforma,
  type PlanSuscripcion,
  type SuspenderTenantRequest,
  type SystemHealth,
  type TenantPlatform,
  type UpdatePlanRequest,
  type UpdateTenantPlatformRequest,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SuperAdminMetricsService } from './super-admin-metrics.service';
import { SuperAdminPlanesService } from './super-admin-planes.service';
import { SuperAdminTenantsService } from './super-admin-tenants.service';

/**
 * Sprint 23 — Endpoints super admin. Todos requieren rol SUPER_ADMIN.
 * Prefijo /super-admin para distinguirlos del namespace de liga (/admin/...).
 */
@Controller('super-admin/tenants')
@Roles(ROLE.SUPER_ADMIN)
export class SuperAdminTenantsController {
  constructor(private readonly svc: SuperAdminTenantsService) {}

  @Get()
  list(
    @Query('estado') estado?: EstadoSuscripcion,
    @Query('search') search?: string,
  ): Promise<TenantPlatform[]> {
    return this.svc.list({ estado, search });
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<TenantPlatform> {
    return this.svc.findOne(id);
  }

  @Post()
  @Audited({ action: 'platform.tenant_created', entityType: 'Tenant', entityIdFrom: 'response.id' })
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateTenantPlatformRequest,
  ): Promise<TenantPlatform> {
    return this.svc.create(user.userId, dto);
  }

  @Patch(':id')
  @Audited({ action: 'platform.tenant_updated', entityType: 'Tenant', entityIdFrom: 'params.id' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTenantPlatformRequest,
  ): Promise<TenantPlatform> {
    return this.svc.update(id, dto);
  }

  @Post(':id/suspender')
  @HttpCode(200)
  @Audited({ action: 'platform.tenant_suspended', entityType: 'Tenant', entityIdFrom: 'params.id' })
  suspender(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspenderTenantRequest,
  ): Promise<TenantPlatform> {
    return this.svc.suspender(id, dto.motivo);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  @Audited({ action: 'platform.tenant_reactivated', entityType: 'Tenant', entityIdFrom: 'params.id' })
  reactivar(@Param('id', new ParseUUIDPipe()) id: string): Promise<TenantPlatform> {
    return this.svc.reactivar(id);
  }
}

@Controller('super-admin/planes')
@Roles(ROLE.SUPER_ADMIN)
export class SuperAdminPlanesController {
  constructor(private readonly svc: SuperAdminPlanesService) {}

  @Get()
  list(): Promise<PlanSuscripcion[]> {
    return this.svc.list();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<PlanSuscripcion> {
    return this.svc.findOne(id);
  }

  @Post()
  @Audited({ action: 'platform.plan_created', entityType: 'PlanSuscripcion' })
  create(@Body() dto: CreatePlanRequest): Promise<PlanSuscripcion> {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Audited({ action: 'platform.plan_updated', entityType: 'PlanSuscripcion', entityIdFrom: 'params.id' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlanRequest,
  ): Promise<PlanSuscripcion> {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({ action: 'platform.plan_deactivated', entityType: 'PlanSuscripcion', entityIdFrom: 'params.id' })
  async deactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.svc.deactivate(id);
  }
}

@Controller('super-admin/metricas')
@Roles(ROLE.SUPER_ADMIN)
export class SuperAdminMetricsController {
  constructor(private readonly svc: SuperAdminMetricsService) {}

  @Get()
  getMetricas(): Promise<MetricasPlataforma> {
    return this.svc.getMetricas();
  }

  @Get('health')
  getHealth(): Promise<SystemHealth> {
    return this.svc.getHealth();
  }
}
