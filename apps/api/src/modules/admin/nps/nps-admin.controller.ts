import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';

import {
  DispararNpsSchema,
  ROLE,
  type DispararNpsResultado,
  type NpsResumenAdmin,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { NpsService } from './nps.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/nps')
// El NPS dispara correos masivos a los clubes y muestra su feedback: lo
// gestiona el admin de la liga (y el super admin).
@Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
export class NpsAdminController {
  constructor(private readonly svc: NpsService) {}

  @Get('resumen')
  resumen(@CurrentUser() user: UserContext): Promise<NpsResumenAdmin> {
    return this.svc.resumen(ensureTenant(user));
  }

  @Post('disparar')
  disparar(
    @CurrentUser() user: UserContext,
    @Body() body: unknown,
  ): Promise<DispararNpsResultado> {
    const parsed = DispararNpsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Debes indicar un torneo válido.');
    }
    return this.svc.dispararPorTorneo(ensureTenant(user), parsed.data.torneoId);
  }
}
