import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { ROLE, type JugadorGlobal, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JugadoresGlobalService } from './jugadores-global.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/jugadores')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class JugadoresGlobalController {
  constructor(private readonly svc: JugadoresGlobalService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('search') search?: string,
    @Query('torneoId') torneoId?: string,
    @Query('equipoId') equipoId?: string,
    @Query('estado') estado?: string,
  ): Promise<JugadorGlobal[]> {
    return this.svc.list(ensureTenant(user), {
      search: search?.trim() || undefined,
      torneoId: torneoId || undefined,
      equipoId: equipoId || undefined,
      estado: estado === 'todos' ? 'todos' : 'activos',
    });
  }
}
