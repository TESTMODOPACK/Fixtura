import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { ROLE, type EquipoAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateEquipoDto } from './dto';
import { EquiposAdminService } from './equipos-admin.service';

@Controller('admin/torneos/:torneoId/equipos')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class EquiposAdminController {
  constructor(private readonly svc: EquiposAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<EquipoAdmin[]> {
    return this.svc.listByTorneo(torneoId, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: CreateEquipoDto,
  ): Promise<EquipoAdmin> {
    return this.svc.create(torneoId, ensureTenant(user), dto);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
