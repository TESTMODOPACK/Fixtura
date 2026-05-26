import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ROLE } from '@fixtura/types';
import type { Tenant as TenantDto } from '@fixtura/types';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  /**
   * Endpoint PÚBLICO que devuelve el tenant correspondiente al hostname
   * del request. Usado por el frontend en server-side rendering para
   * decidir si renderiza "marketing" (sin tenant) o el portal de la liga.
   *
   * Retorna 404 si el host no matchea ningún tenant Y NODE_ENV=production.
   * En dev devuelve el tenant de DEV_DEFAULT_TENANT_SLUG.
   */
  @Get('me')
  @Public()
  async byHost(@Req() req: Request): Promise<TenantDto | null> {
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? '';
    const tenant = await this.tenants.findByHost(host);
    return tenant ? toDto(tenant) : null;
  }

  @Get()
  @Roles(ROLE.SUPER_ADMIN)
  async list(): Promise<TenantDto[]> {
    const items = await this.tenants.list();
    return items.map(toDto);
  }

  @Get(':id')
  @Roles(ROLE.SUPER_ADMIN)
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<TenantDto> {
    const t = await this.tenants.findById(id);
    return toDto(t);
  }

  @Post()
  @Roles(ROLE.SUPER_ADMIN)
  async create(@Body() dto: CreateTenantDto): Promise<TenantDto> {
    const t = await this.tenants.create({
      slug: dto.slug,
      nombre: dto.nombre,
      tipo: dto.tipo,
      plan: dto.plan,
    });
    return toDto(t);
  }
}

function toDto(t: Tenant): TenantDto {
  return {
    id: t.id,
    slug: t.slug,
    nombre: t.nombre,
    tipo: t.tipo,
    plan: t.plan,
    customDomain: t.customDomain,
    brandingJson: t.brandingJson,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
  };
}
