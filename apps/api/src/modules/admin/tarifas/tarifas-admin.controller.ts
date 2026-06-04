import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type TarifaTorneo,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';

import { CreateTarifaDto, UpdateTarifaDto } from './dto';
import { TarifasAdminService } from './tarifas-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/torneos/:torneoId/tarifario')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class TarifasAdminController {
  constructor(private readonly svc: TarifasAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<TarifaTorneo[]> {
    return this.svc.list(torneoId, ensureTenant(user));
  }

  @Post()
  @Audited({
    action: 'torneo.tarifa.creada',
    entityType: 'TarifaTorneo',
    entityIdFrom: 'response.id',
  })
  create(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: CreateTarifaDto,
  ): Promise<TarifaTorneo> {
    return this.svc.create(torneoId, ensureTenant(user), dto);
  }

  @Patch(':id')
  @Audited({
    action: 'torneo.tarifa.actualizada',
    entityType: 'TarifaTorneo',
    entityIdFrom: 'params.id',
  })
  update(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTarifaDto,
  ): Promise<TarifaTorneo> {
    return this.svc.update(id, torneoId, ensureTenant(user), dto);
  }

  @Delete(':id')
  @Audited({
    action: 'torneo.tarifa.eliminada',
    entityType: 'TarifaTorneo',
    entityIdFrom: 'params.id',
  })
  remove(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ cobrosDesvinculados: number }> {
    return this.svc.remove(id, torneoId, ensureTenant(user));
  }
}
