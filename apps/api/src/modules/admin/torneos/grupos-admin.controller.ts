import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type GruposTorneoResponse,
  type TablasPorGrupoAdmin,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { MoverInscripcionGrupoDto } from './dto';
import { GruposAdminService } from './grupos-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/torneos/:torneoId/grupos')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class GruposAdminController {
  constructor(private readonly svc: GruposAdminService) {}

  @Get()
  get(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<GruposTorneoResponse> {
    return this.svc.getGrupos(torneoId, ensureTenant(user));
  }

  @Get('tabla')
  tabla(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<TablasPorGrupoAdmin> {
    return this.svc.getTablasPorGrupo(torneoId, ensureTenant(user));
  }

  @Post('sortear')
  @HttpCode(200)
  @Audited({
    action: 'torneo.grupos_sorteados',
    entityType: 'Torneo',
    entityIdFrom: 'params.torneoId',
  })
  sortear(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<GruposTorneoResponse> {
    return this.svc.sortear(torneoId, ensureTenant(user));
  }

  @Post('mover')
  @HttpCode(200)
  @Audited({
    action: 'torneo.grupo_movido',
    entityType: 'Torneo',
    entityIdFrom: 'params.torneoId',
  })
  mover(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: MoverInscripcionGrupoDto,
  ): Promise<GruposTorneoResponse> {
    return this.svc.mover(torneoId, ensureTenant(user), dto.inscripcionId, dto.grupoId);
  }

  @Delete()
  @Audited({
    action: 'torneo.grupos_borrados',
    entityType: 'Torneo',
    entityIdFrom: 'params.torneoId',
  })
  limpiar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<GruposTorneoResponse> {
    return this.svc.limpiar(torneoId, ensureTenant(user));
  }
}
