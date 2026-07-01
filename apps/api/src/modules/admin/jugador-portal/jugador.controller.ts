import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type ActivarJugadorInfo,
  type InvitarJugadorResponse,
  type JugadorCuenta,
  type JugadorGlobalDetalle,
  type PartidoDelegado,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { resolveJugadorId, resolveTenantId } from './jugador-context';
import { JugadorInviteService } from './jugador-invite.service';
import { JugadorPortalService } from './jugador-portal.service';
import { ActivarJugadorDto, InvitarJugadorDto } from './dto';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) throw new BadRequestException('No hay tenant en el contexto');
  return user.tenantId;
}

/**
 * Portal del JUGADOR — todo auto-acotado al jugador del JWT (scope PERSONAL).
 * El jugadorId nunca se recibe por parámetro: sale de resolveJugadorId(user).
 */
@Controller('jugador')
@Roles(ROLE.JUGADOR)
export class JugadorController {
  constructor(private readonly portal: JugadorPortalService) {}

  @Get('mi-perfil')
  miPerfil(@CurrentUser() user: UserContext): Promise<JugadorGlobalDetalle> {
    return this.portal.miPerfil(resolveJugadorId(user), resolveTenantId(user));
  }

  @Get('mis-partidos')
  misPartidos(@CurrentUser() user: UserContext): Promise<PartidoDelegado[]> {
    return this.portal.misPartidos(resolveJugadorId(user), resolveTenantId(user));
  }
}

/**
 * Gestión de la cuenta del jugador desde el lado admin de la liga (desde la
 * ficha del plantel). El jugadorId sí viene por parámetro acá, pero el
 * endpoint es solo para admin (RolesGuard) y se valida contra el tenant.
 */
@Controller('admin/jugadores')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class JugadorCuentaAdminController {
  constructor(private readonly invite: JugadorInviteService) {}

  @Post(':jugadorId/invitar')
  invitar(
    @CurrentUser() user: UserContext,
    @Param('jugadorId', ParseUUIDPipe) jugadorId: string,
    @Body() dto: InvitarJugadorDto,
  ): Promise<InvitarJugadorResponse> {
    return this.invite.invitar(jugadorId, ensureTenant(user), user.userId, dto);
  }

  @Get(':jugadorId/cuenta')
  cuenta(
    @CurrentUser() user: UserContext,
    @Param('jugadorId', ParseUUIDPipe) jugadorId: string,
  ): Promise<JugadorCuenta> {
    return this.invite.estadoCuenta(jugadorId, ensureTenant(user));
  }
}

/**
 * Activación pública (sin auth) — el jugador fija su contraseña con el token
 * del magic link.
 */
@Controller('public/jugador')
@Public()
export class JugadorPublicController {
  constructor(private readonly invite: JugadorInviteService) {}

  @Get('activar')
  info(@Query('token') token?: string): Promise<ActivarJugadorInfo> {
    if (!token) throw new BadRequestException('Falta el token.');
    return this.invite.infoActivacion(token);
  }

  @Post('activar')
  activar(@Body() dto: ActivarJugadorDto): Promise<{ ok: boolean }> {
    return this.invite.activar(dto.token, dto.password);
  }
}
