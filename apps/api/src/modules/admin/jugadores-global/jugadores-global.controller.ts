import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type JugadorGlobal,
  type JugadorGlobalDetalle,
  type UserContext,
} from '@fixtura/types';

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
    @Query('clubId') clubId?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('estado') estado?: string,
  ): Promise<JugadorGlobal[]> {
    const estadoValid =
      estado === 'todos' || estado === 'activos' || estado === 'vetados'
        ? estado
        : 'activos';
    return this.svc.list(ensureTenant(user), {
      search: search?.trim() || undefined,
      clubId: clubId || undefined,
      categoriaId: categoriaId || undefined,
      estado: estadoValid,
    });
  }

  @Get(':id')
  detalle(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<JugadorGlobalDetalle> {
    return this.svc.getDetalle(ensureTenant(user), id);
  }
}
