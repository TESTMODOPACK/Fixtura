import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { ROLE, type JugadorAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { BulkCreateJugadoresDto, CreateJugadorDto } from './dto';
import { JugadoresAdminService } from './jugadores-admin.service';

@Controller('admin/equipos/:equipoId/jugadores')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.DELEGADO_EQUIPO, ROLE.SUPER_ADMIN)
export class JugadoresAdminController {
  constructor(private readonly svc: JugadoresAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('equipoId', new ParseUUIDPipe()) equipoId: string,
  ): Promise<JugadorAdmin[]> {
    return this.svc.listByEquipo(equipoId, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Param('equipoId', new ParseUUIDPipe()) equipoId: string,
    @Body() dto: CreateJugadorDto,
  ): Promise<JugadorAdmin> {
    return this.svc.create(equipoId, ensureTenant(user), { ...dto, capitan: dto.capitan ?? false });
  }

  @Post('bulk')
  bulk(
    @CurrentUser() user: UserContext,
    @Param('equipoId', new ParseUUIDPipe()) equipoId: string,
    @Body() dto: BulkCreateJugadoresDto,
  ): Promise<JugadorAdmin[]> {
    const normalizados = dto.jugadores.map((j) => ({ ...j, capitan: j.capitan ?? false }));
    return this.svc.bulkCreate(equipoId, ensureTenant(user), normalizados);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
