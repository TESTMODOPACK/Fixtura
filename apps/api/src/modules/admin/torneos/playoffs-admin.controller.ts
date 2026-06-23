import {
  BadRequestException,
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
  type BracketPlayoffResponse,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { PlayoffsAdminService } from './playoffs-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/torneos/:torneoId/playoffs')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class PlayoffsAdminController {
  constructor(private readonly svc: PlayoffsAdminService) {}

  @Get()
  get(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<BracketPlayoffResponse> {
    return this.svc.getBracket(torneoId, ensureTenant(user));
  }

  @Post('sortear')
  @HttpCode(200)
  @Audited({
    action: 'torneo.playoffs_sembrados',
    entityType: 'Torneo',
    entityIdFrom: 'params.torneoId',
  })
  sortear(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<BracketPlayoffResponse> {
    return this.svc.sortear(torneoId, ensureTenant(user));
  }

  @Delete()
  @Audited({
    action: 'torneo.playoffs_borrados',
    entityType: 'Torneo',
    entityIdFrom: 'params.torneoId',
  })
  limpiar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<BracketPlayoffResponse> {
    return this.svc.limpiar(torneoId, ensureTenant(user));
  }
}
