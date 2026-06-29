import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type AjustarTiempoAgregadoRequest,
  type MatchCenterSnapshot,
  type StartMatchCenterRequest,
  type SumarGolRequest,
  type UserContext,
} from '@fixtura/types';

import { actorPersonalScope } from '../../common/auth/actor-personal-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MatchCenterGateway } from './match-center.gateway';
import { MatchCenterService } from './match-center.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

/**
 * Operaciones del cronómetro/marcador. Además de los roles de liga, el
 * personal designado al partido (árbitro/planillero) puede operarlo: cada
 * mutación valida la designación vía assertActorPuedeOperar (SEC-3). El GET
 * snapshot queda abierto a esos roles sin chequeo extra — ya existe una
 * versión pública del mismo snapshot.
 */
@Controller('admin/match-center/:partidoId')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.LIGA_COORDINADOR_ARBITROS,
  ROLE.ARBITRO,
  ROLE.PLANILLERO,
  ROLE.SUPER_ADMIN,
)
export class MatchCenterAdminController {
  constructor(
    private readonly svc: MatchCenterService,
    private readonly gateway: MatchCenterGateway,
  ) {}

  @Get()
  async snapshot(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    return this.svc.snapshot(partidoId, ensureTenant(user));
  }

  @Post('arrancar')
  @HttpCode(200)
  async arrancar(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
    @Body() dto: StartMatchCenterRequest,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.arrancar(
      partidoId,
      tenantId,
      dto.minutosPorPeriodo,
      dto.forzarDia ?? false,
    );
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('pausar')
  @HttpCode(200)
  async pausar(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.pausar(partidoId, tenantId);
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('reanudar')
  @HttpCode(200)
  async reanudar(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.reanudar(partidoId, tenantId);
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('sumar-gol')
  @HttpCode(200)
  async sumarGol(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
    @Body() dto: SumarGolRequest,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.sumarGol(partidoId, tenantId, dto.equipo);
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('quitar-gol')
  @HttpCode(200)
  async quitarGol(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
    @Body() dto: SumarGolRequest,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.quitarGol(partidoId, tenantId, dto.equipo);
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('ajustar-goles')
  @HttpCode(200)
  async ajustarGoles(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
    @Body() dto: { golesLocal: number; golesVisita: number },
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.ajustarGoles(
      partidoId,
      tenantId,
      Number(dto.golesLocal),
      Number(dto.golesVisita),
    );
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('siguiente-periodo')
  @HttpCode(200)
  async siguientePeriodo(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.siguientePeriodo(partidoId, tenantId);
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('tiempo-agregado')
  @HttpCode(200)
  async tiempoAgregado(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
    @Body() dto: AjustarTiempoAgregadoRequest,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.ajustarTiempoAgregado(
      partidoId,
      tenantId,
      Number(dto.minutos),
    );
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('finalizar')
  @HttpCode(200)
  async finalizar(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    const tenantId = ensureTenant(user);
    await this.svc.assertActorPuedeOperar(partidoId, tenantId, actorPersonalScope(user));
    const snap = await this.svc.finalizarCentro(partidoId, tenantId);
    void this.gateway.broadcast(partidoId);
    return snap;
  }
}

/**
 * Snapshot público — para el embed en el portal SEO o cualquier
 * frontend público. Sin auth. El polling vía WS es la opción
 * principal; este endpoint sirve como fallback HTTP y SSR.
 */
@Controller('public/match-center/:partidoId')
@Public()
export class MatchCenterPublicController {
  constructor(private readonly svc: MatchCenterService) {}

  @Get()
  async snapshot(
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    return this.svc.snapshotPublico(partidoId);
  }
}
