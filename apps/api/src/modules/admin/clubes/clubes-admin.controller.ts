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
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type Club,
  type CreateClubRequest,
  type CreateJugadorClubRequest,
  type Jugador,
  type UpdateClubRequest,
  type UpdateJugadorClubRequest,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { ClubesAdminService } from './clubes-admin.service';
import {
  CreateClubDto,
  CreateJugadorClubDto,
  UpdateClubDto,
  UpdateJugadorClubDto,
} from './dto';

@Controller('admin/clubes')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class ClubesAdminController {
  constructor(private readonly svc: ClubesAdminService) {}

  @Get()
  list(@CurrentUser() user: UserContext): Promise<Club[]> {
    return this.svc.list(ensureTenant(user));
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Club> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  @Audited({ action: 'club.creado', entityType: 'Club' })
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateClubDto,
  ): Promise<Club> {
    // class-validator deja campos con default ausentes en runtime;
    // el service aplica defaults internamente (delegados → []).
    return this.svc.create(ensureTenant(user), dto as unknown as CreateClubRequest);
  }

  @Patch(':id')
  @Audited({
    action: 'club.actualizado',
    entityType: 'Club',
    entityIdFrom: 'params.id',
  })
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClubDto,
  ): Promise<Club> {
    return this.svc.update(id, ensureTenant(user), dto as unknown as UpdateClubRequest);
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({
    action: 'club.eliminado',
    entityType: 'Club',
    entityIdFrom: 'params.id',
  })
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }

  // ── Plantel del club (jugadores) ───────────────────────────────

  @Get(':id/jugadores')
  listPlantel(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('categoriaId') categoriaId?: string,
  ): Promise<Jugador[]> {
    return this.svc.listPlantel(id, ensureTenant(user), categoriaId);
  }

  @Post(':id/jugadores')
  @Audited({
    action: 'club.jugador.agregado',
    entityType: 'Club',
    entityIdFrom: 'params.id',
  })
  addJugador(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateJugadorClubDto,
  ): Promise<Jugador> {
    return this.svc.addJugador(
      id,
      ensureTenant(user),
      dto as unknown as CreateJugadorClubRequest,
    );
  }

  @Patch(':id/jugadores/:jugadorId')
  @Audited({
    action: 'club.jugador.actualizado',
    entityType: 'Jugador',
    entityIdFrom: 'params.jugadorId',
  })
  updateJugador(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('jugadorId', new ParseUUIDPipe()) jugadorId: string,
    @Body() dto: UpdateJugadorClubDto,
  ): Promise<Jugador> {
    return this.svc.updateJugador(
      id,
      jugadorId,
      ensureTenant(user),
      dto as unknown as UpdateJugadorClubRequest,
    );
  }

  @Delete(':id/jugadores/:jugadorId')
  @HttpCode(204)
  @Audited({
    action: 'club.jugador.eliminado',
    entityType: 'Jugador',
    entityIdFrom: 'params.jugadorId',
  })
  removeJugador(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('jugadorId', new ParseUUIDPipe()) jugadorId: string,
  ): Promise<void> {
    return this.svc.removeJugador(id, jugadorId, ensureTenant(user));
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
