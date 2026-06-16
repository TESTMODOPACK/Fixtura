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
  type ActivarDelegadoInfo,
  type DelegadoCuenta,
  type EstadisticasDelegado,
  type FinanzasDelegado,
  type IniciarPagoResponse,
  type InvitarDelegadoResponse,
  type MiClubDelegado,
  type PartidoDelegado,
  type PlantelCategoriaDelegado,
  type ResumenDelegado,
  type SancionVigente,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { resolveClubId, resolveTenantId } from './delegado-context';
import { DelegadoInviteService } from './delegado-invite.service';
import { DelegadoPortalService } from './delegado-portal.service';
import { ActivarDelegadoDto, InvitarDelegadoDto } from './dto';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) throw new BadRequestException('No hay tenant en el contexto');
  return user.tenantId;
}

function urlRetornoPago(): string {
  const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return `${base}/pago/retorno`;
}

/**
 * Portal del DELEGADO — todo auto-acotado al club del JWT (scope TEAM).
 * El clubId nunca se recibe por parámetro: sale de resolveClubId(user).
 */
@Controller('delegado')
@Roles(ROLE.DELEGADO_EQUIPO)
export class DelegadoController {
  constructor(private readonly portal: DelegadoPortalService) {}

  @Get('resumen')
  resumen(@CurrentUser() user: UserContext): Promise<ResumenDelegado> {
    return this.portal.resumen(resolveClubId(user), resolveTenantId(user));
  }

  @Get('mi-club')
  miClub(@CurrentUser() user: UserContext): Promise<MiClubDelegado> {
    return this.portal.miClub(resolveClubId(user), resolveTenantId(user));
  }

  @Get('plantel')
  plantel(@CurrentUser() user: UserContext): Promise<PlantelCategoriaDelegado[]> {
    return this.portal.plantel(resolveClubId(user), resolveTenantId(user));
  }

  @Get('partidos')
  partidos(@CurrentUser() user: UserContext): Promise<PartidoDelegado[]> {
    return this.portal.partidos(resolveClubId(user), resolveTenantId(user));
  }

  @Get('estadisticas')
  estadisticas(@CurrentUser() user: UserContext): Promise<EstadisticasDelegado> {
    return this.portal.estadisticas(resolveClubId(user), resolveTenantId(user));
  }

  @Get('finanzas')
  finanzas(@CurrentUser() user: UserContext): Promise<FinanzasDelegado> {
    return this.portal.finanzas(resolveClubId(user), resolveTenantId(user));
  }

  @Get('disciplina/sancionados')
  misSancionados(@CurrentUser() user: UserContext): Promise<SancionVigente[]> {
    return this.portal.misSancionados(resolveClubId(user), resolveTenantId(user));
  }

  @Post('cobros/:cobroId/pagar')
  pagar(
    @CurrentUser() user: UserContext,
    @Param('cobroId', ParseUUIDPipe) cobroId: string,
  ): Promise<IniciarPagoResponse> {
    return this.portal.pagar(
      resolveClubId(user),
      resolveTenantId(user),
      user.userId,
      cobroId,
      urlRetornoPago(),
    );
  }
}

/**
 * Gestión de la cuenta del delegado desde el lado admin de la liga.
 */
@Controller('admin/clubes')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class DelegadoAdminController {
  constructor(private readonly invite: DelegadoInviteService) {}

  @Post(':clubId/delegado/invitar')
  invitar(
    @CurrentUser() user: UserContext,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body() dto: InvitarDelegadoDto,
  ): Promise<InvitarDelegadoResponse> {
    return this.invite.invitar(clubId, ensureTenant(user), user.userId, dto);
  }

  @Get(':clubId/delegado')
  estado(
    @CurrentUser() user: UserContext,
    @Param('clubId', ParseUUIDPipe) clubId: string,
  ): Promise<DelegadoCuenta> {
    return this.invite.estadoCuenta(clubId, ensureTenant(user));
  }
}

/**
 * Activación pública (sin auth) — el delegado fija su contraseña con el
 * token del magic link.
 */
@Controller('public/delegado')
@Public()
export class DelegadoPublicController {
  constructor(private readonly invite: DelegadoInviteService) {}

  @Get('activar')
  info(@Query('token') token?: string): Promise<ActivarDelegadoInfo> {
    if (!token) throw new BadRequestException('Falta el token.');
    return this.invite.infoActivacion(token);
  }

  @Post('activar')
  activar(@Body() dto: ActivarDelegadoDto): Promise<{ ok: boolean }> {
    return this.invite.activar(dto.token, dto.password);
  }
}
