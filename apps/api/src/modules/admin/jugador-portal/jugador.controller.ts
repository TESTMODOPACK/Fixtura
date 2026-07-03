import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type ActivarJugadorInfo,
  type CarnetJugador,
  type InvitarJugadorResponse,
  type InvitarPlantelMasivoResponse,
  type JugadorCuenta,
  type JugadorGlobalDetalle,
  type PartidoDelegado,
  type UserContext,
  type VerificacionCarnet,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CarnetService } from './carnet.service';
import { resolveJugadorId, resolveTenantId } from './jugador-context';
import { JugadorInviteService } from './jugador-invite.service';
import { JugadorPortalService } from './jugador-portal.service';
import { ActivarJugadorDto, InvitarJugadorDto, VerificarCarnetDto } from './dto';

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
  constructor(
    private readonly portal: JugadorPortalService,
    private readonly carnet: CarnetService,
  ) {}

  @Get('mi-perfil')
  miPerfil(@CurrentUser() user: UserContext): Promise<JugadorGlobalDetalle> {
    return this.portal.miPerfil(resolveJugadorId(user), resolveTenantId(user));
  }

  @Get('mis-partidos')
  misPartidos(@CurrentUser() user: UserContext): Promise<PartidoDelegado[]> {
    return this.portal.misPartidos(resolveJugadorId(user), resolveTenantId(user));
  }

  /** Carnet digital: QR firmado de vida corta para el paso de jugadores. */
  @Get('carnet')
  carnetDigital(@CurrentUser() user: UserContext): Promise<CarnetJugador> {
    return this.carnet.emitir(resolveJugadorId(user), resolveTenantId(user));
  }
}

/**
 * Verificación de carnet en cancha — la usa el personal designado (árbitro/
 * planillero/turno) y también el admin de la liga. Tenant del JWT; el carnet
 * escaneado debe pertenecer al mismo tenant.
 */
@Controller('personal')
@Roles(
  ROLE.ARBITRO,
  ROLE.PLANILLERO,
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.SUPER_ADMIN,
)
export class CarnetVerificacionController {
  constructor(private readonly carnet: CarnetService) {}

  @Post('verificar-carnet')
  @HttpCode(200)
  @Audited({ action: 'carnet.verificado' })
  verificar(
    @CurrentUser() user: UserContext,
    @Body() dto: VerificarCarnetDto,
  ): Promise<VerificacionCarnet> {
    return this.carnet.verificar(ensureTenant(user), dto);
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

  /**
   * Invitación masiva: todo el plantel activo del club (todas las categorías),
   * solo por email. clubId por parámetro; el scope de tenant lo valida el
   * servicio (where clubId + tenantId).
   */
  @Post('club/:clubId/invitar-masivo')
  invitarMasivo(
    @CurrentUser() user: UserContext,
    @Param('clubId', ParseUUIDPipe) clubId: string,
  ): Promise<InvitarPlantelMasivoResponse> {
    return this.invite.invitarMasivo(clubId, ensureTenant(user), user.userId);
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
