import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';

import { ROLE, type Temporada } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { UserContext } from '@fixtura/types';
import { CreateTemporadaDto } from './dto';
import { TemporadasAdminService } from './temporadas-admin.service';

@Controller('admin/temporadas')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.LIGA_COORDINADOR_ARBITROS,
  ROLE.SUPER_ADMIN,
)
export class TemporadasAdminController {
  constructor(private readonly svc: TemporadasAdminService) {}

  @Get()
  async list(@CurrentUser() user: UserContext): Promise<Temporada[]> {
    const tenantId = ensureTenant(user);
    const items = await this.svc.list(tenantId);
    return items.map(toDto);
  }

  @Post()
  async create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateTemporadaDto,
  ): Promise<Temporada> {
    const tenantId = ensureTenant(user);
    const created = await this.svc.create(tenantId, dto);
    return toDto(created);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

function toDto(t: {
  id: string;
  nombre: string;
  anio: number;
  fechaInicio: string | null;
  fechaFin: string | null;
  createdAt: Date;
}): Temporada {
  return {
    id: t.id,
    nombre: t.nombre,
    anio: t.anio,
    fechaInicio: t.fechaInicio,
    fechaFin: t.fechaFin,
    createdAt: t.createdAt.toISOString(),
  };
}
