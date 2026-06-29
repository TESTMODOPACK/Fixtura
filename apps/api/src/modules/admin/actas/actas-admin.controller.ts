import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import {
  ESTADO_PARTIDO_GLOBAL,
  ROLE,
  type ActaResumen,
  type EstadoPartidoGlobal,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ActasAdminService } from './actas-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/actas')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  // El tribunal lee actas (solo GET en este controller) para fundamentar fallos.
  ROLE.TRIBUNAL_DISCIPLINA,
  ROLE.SUPER_ADMIN,
)
export class ActasAdminController {
  constructor(private readonly svc: ActasAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
    @Query('fechaId') fechaId?: string,
    @Query('estado') estado?: string,
    @Query('filtro') filtro?: string,
  ): Promise<ActaResumen[]> {
    const estadoValid =
      estado && (ESTADO_PARTIDO_GLOBAL as readonly string[]).includes(estado)
        ? (estado as EstadoPartidoGlobal)
        : undefined;
    const filtroValid =
      filtro === 'todas' ||
      filtro === 'pendientes' ||
      filtro === 'cerradas' ||
      filtro === 'vencidas'
        ? filtro
        : undefined;
    return this.svc.list(ensureTenant(user), {
      torneoId,
      fechaId,
      estado: estadoValid,
      filtro: filtroValid,
    });
  }
}
