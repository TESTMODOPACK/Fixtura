import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { ROLE } from '@fixtura/types';
import type { Tenant as TenantDto } from '@fixtura/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { Tenant } from './entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@Roles(ROLE.SUPER_ADMIN)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async list(): Promise<TenantDto[]> {
    const items = await this.tenants.list();
    return items.map(toDto);
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<TenantDto> {
    const t = await this.tenants.findById(id);
    return toDto(t);
  }

  @Post()
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
    brandingJson: t.brandingJson,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
  };
}
