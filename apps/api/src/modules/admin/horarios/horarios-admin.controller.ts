import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  CreateHorarioTorneoSchema,
  ROLE,
  UpdateHorarioTorneoSchema,
  type CreateHorarioTorneoRequest,
  type HorarioTorneo as HorarioDto,
  type UpdateHorarioTorneoRequest,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { HorariosAdminService } from './horarios-admin.service';

/**
 * Sprint 39 — Endpoints CRUD de la plantilla de horarios del torneo.
 *
 *  GET    /admin/torneos/:torneoId/horarios
 *  POST   /admin/torneos/:torneoId/horarios
 *  PATCH  /admin/torneos/:torneoId/horarios/:id
 *  DELETE /admin/torneos/:torneoId/horarios/:id
 */
@Controller('admin/torneos/:torneoId/horarios')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class HorariosAdminController {
  constructor(private readonly svc: HorariosAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<HorarioDto[]> {
    return this.svc.list(torneoId, ensureTenant(user));
  }

  @Post()
  @Audited({
    action: 'torneo.horario_creado',
    entityType: 'HorarioTorneo',
    entityIdFrom: 'response.id',
  })
  create(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() body: unknown,
  ): Promise<HorarioDto> {
    const parsed: CreateHorarioTorneoRequest = CreateHorarioTorneoSchema.parse(body);
    return this.svc.create(torneoId, ensureTenant(user), parsed);
  }

  @Patch(':id')
  @Audited({
    action: 'torneo.horario_actualizado',
    entityType: 'HorarioTorneo',
    entityIdFrom: 'params.id',
  })
  update(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) _torneoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<HorarioDto> {
    const parsed: UpdateHorarioTorneoRequest = UpdateHorarioTorneoSchema.parse(body);
    return this.svc.update(id, ensureTenant(user), parsed);
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({
    action: 'torneo.horario_eliminado',
    entityType: 'HorarioTorneo',
    entityIdFrom: 'params.id',
  })
  remove(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) _torneoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
