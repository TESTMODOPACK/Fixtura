import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { ROLE, type JugadorAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { resolveClubId } from '../delegado/delegado-context';
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
    return this.svc.listByEquipo(equipoId, ensureTenant(user), scopedClubId(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Param('equipoId', new ParseUUIDPipe()) equipoId: string,
    @Body() dto: CreateJugadorDto,
  ): Promise<JugadorAdmin> {
    return this.svc.create(equipoId, ensureTenant(user), scopedClubId(user), {
      ...dto,
      capitan: dto.capitan ?? false,
    });
  }

  @Post('bulk')
  bulk(
    @CurrentUser() user: UserContext,
    @Param('equipoId', new ParseUUIDPipe()) equipoId: string,
    @Body() dto: BulkCreateJugadoresDto,
  ): Promise<JugadorAdmin[]> {
    const normalizados = dto.jugadores.map((j) => ({ ...j, capitan: j.capitan ?? false }));
    return this.svc.bulkCreate(equipoId, ensureTenant(user), scopedClubId(user), normalizados);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

const ROLES_ADMIN_LIGA: string[] = [ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN];

/**
 * Acota la gestión de jugadores al club del delegado. Para roles de liga
 * (admin/coordinador/super) devuelve null = sin restricción de club dentro
 * del tenant. Para un DELEGADO_EQUIPO devuelve su clubId, de modo que el
 * service rechace inscripciones de otros clubes — RLS no aísla intra-tenant.
 */
function scopedClubId(user: UserContext): string | null {
  const esAdminLiga = user.roles.some((r) => ROLES_ADMIN_LIGA.includes(r.role));
  return esAdminLiga ? null : resolveClubId(user);
}
