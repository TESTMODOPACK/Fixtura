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
  UpdatePortalConfigSchema,
  type CreatePlanRequest,
  type CreateTenantPlatformRequest,
  type EstadoCuentaLiga,
  type EstadoFacturaPlataforma,
  type EstadoSuscripcion,
  type FacturaPlataforma as FacturaPlataformaDto,
  type MetricasPlataforma,
  type PlanSuscripcion,
  type PortalConfig,
  type SuspenderTenantRequest,
  type SystemHealth,
  type TenantPlatform,
  type UpdatePlanRequest,
  type UpdatePortalConfigRequest,
  type UpdateTenantPlatformRequest,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppConfigService } from './app-config.service';
import {
  AnularFacturaDto,
  RegistrarPagoManualDto,
} from './dto/facturacion-plataforma.dto';
import { FacturacionPlataformaService } from './facturacion-plataforma.service';
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

/**
 * Sprint 24A — Facturación plataforma. Endpoints super admin.
 *
 *  GET    /super-admin/facturas                   Lista todas (filtros opcionales).
 *  GET    /super-admin/facturas/:id               Detalle.
 *  GET    /super-admin/facturas/estado-cuenta/:tid Estado de cuenta de una liga.
 *  POST   /super-admin/facturas/:id/pago-manual   Marcar como pagada.
 *  POST   /super-admin/facturas/:id/anular        Anular con motivo.
 *  POST   /super-admin/facturas/generar-mes       Fuerza generación del mes actual.
 */
@Controller('super-admin/facturas')
@Roles(ROLE.SUPER_ADMIN)
export class SuperAdminFacturasController {
  constructor(private readonly svc: FacturacionPlataformaService) {}

  @Get()
  list(
    @Query('tenantId') tenantId?: string,
    @Query('estado') estado?: EstadoFacturaPlataforma,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
  ): Promise<FacturaPlataformaDto[]> {
    return this.svc.list({
      tenantId,
      estado,
      anio: anio ? Number(anio) : undefined,
      mes: mes ? Number(mes) : undefined,
    });
  }

  @Get('estado-cuenta/:tenantId')
  estadoCuenta(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ): Promise<EstadoCuentaLiga> {
    return this.svc.estadoCuenta(tenantId);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<FacturaPlataformaDto> {
    return this.svc.findOne(id);
  }

  @Post(':id/pago-manual')
  @HttpCode(200)
  @Audited({
    action: 'platform.factura_pago_manual',
    entityType: 'FacturaPlataforma',
    entityIdFrom: 'params.id',
  })
  pagoManual(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RegistrarPagoManualDto,
  ): Promise<FacturaPlataformaDto> {
    return this.svc.marcarPagada(id, dto.metodoPago, {
      observaciones: dto.observaciones,
      fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : undefined,
    });
  }

  @Post(':id/anular')
  @HttpCode(200)
  @Audited({
    action: 'platform.factura_anulada',
    entityType: 'FacturaPlataforma',
    entityIdFrom: 'params.id',
  })
  anular(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AnularFacturaDto,
  ): Promise<FacturaPlataformaDto> {
    return this.svc.anular(id, dto.motivo, user.userId);
  }

  @Post('generar-mes')
  @HttpCode(200)
  @Audited({ action: 'platform.facturas_generadas_manual' })
  generarMesActual(): Promise<{ creadas: number; saltadas: number }> {
    const hoy = new Date();
    return this.svc.generarFacturasMes(hoy.getMonth() + 1, hoy.getFullYear());
  }
}

/**
 * Sprint 37 — Mantenedor del portal público a nivel plataforma.
 *
 * Sirve para elegir qué tenant aparece en la URL raíz cuando el hostname
 * del request no matchea ningún `tenants.custom_domain`. Útil mientras
 * los dominios de los clientes todavía no están apuntados al VPS.
 *
 *  GET /super-admin/portal-config           Lee config actual.
 *  PUT /super-admin/portal-config           Cambia el tenant default.
 */
@Controller('super-admin/portal-config')
@Roles(ROLE.SUPER_ADMIN)
export class SuperAdminPortalConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get()
  async get(): Promise<PortalConfig> {
    const record = await this.appConfig.getRecord('default_tenant_id');
    return {
      defaultTenantId: record?.value ?? null,
      updatedAt: record?.updatedAt?.toISOString() ?? null,
      updatedBy: record?.updatedBy ?? null,
    };
  }

  @Patch()
  @HttpCode(200)
  @Audited({ action: 'platform.portal_default_tenant_changed' })
  async update(
    @CurrentUser() user: UserContext,
    @Body() body: UpdatePortalConfigRequest,
  ): Promise<PortalConfig> {
    const parsed = UpdatePortalConfigSchema.parse(body);
    await this.appConfig.setDefaultTenantId(parsed.defaultTenantId, user.userId);
    return this.get();
  }
}
