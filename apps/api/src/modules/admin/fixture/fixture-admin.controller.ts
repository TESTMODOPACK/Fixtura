import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { ROLE, type FixtureGenerationResult, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GenerarFixtureDto } from './dto';
import { FixtureAdminService } from './fixture-admin.service';

@Controller('admin/torneos/:torneoId/fixture')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class FixtureAdminController {
  constructor(private readonly svc: FixtureAdminService) {}

  @Post('generar')
  generar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: GenerarFixtureDto,
  ): Promise<FixtureGenerationResult> {
    return this.svc.generar(torneoId, ensureTenant(user), {
      fechaInicio: dto.fechaInicio,
      diasEntreFechas: dto.diasEntreFechas ?? 7,
      horariosPorFecha: dto.horariosPorFecha ?? ['10:00', '12:00', '14:00', '16:00'],
      canchas: dto.canchas ?? ['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4'],
    });
  }

  @Delete()
  reset(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<{ deleted: number }> {
    return this.svc.reset(torneoId, ensureTenant(user));
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
