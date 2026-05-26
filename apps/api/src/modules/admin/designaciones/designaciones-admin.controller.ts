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
  type DesignacionAdmin,
  type DesignacionesPorFecha,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DesignacionesAdminService } from './designaciones-admin.service';
import { AsignarDesignacionDto, UpdateDesignacionEstadoDto } from './dto';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class DesignacionesAdminController {
  constructor(private readonly svc: DesignacionesAdminService) {}

  /** Vista por fecha — usada en /admin/torneos/[id]/designaciones */
  @Get('torneos/:torneoId/fechas/:fechaId/designaciones')
  listPorFecha(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Param('fechaId', new ParseUUIDPipe()) fechaId: string,
  ): Promise<DesignacionesPorFecha> {
    return this.svc.listPorFecha(torneoId, fechaId, ensureTenant(user));
  }

  /** Vista por partido individual — usada en detalle del acta */
  @Get('partidos/:partidoId/designaciones')
  listPorPartido(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<DesignacionAdmin[]> {
    return this.svc.listPorPartido(partidoId, ensureTenant(user));
  }

  @Post('designaciones')
  asignar(
    @CurrentUser() user: UserContext,
    @Body() dto: AsignarDesignacionDto,
  ): Promise<DesignacionAdmin> {
    return this.svc.asignar(ensureTenant(user), dto);
  }

  @Patch('designaciones/:id/estado')
  updateEstado(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDesignacionEstadoDto,
  ): Promise<DesignacionAdmin> {
    return this.svc.updateEstado(id, ensureTenant(user), dto);
  }

  @Delete('designaciones/:id')
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }
}
