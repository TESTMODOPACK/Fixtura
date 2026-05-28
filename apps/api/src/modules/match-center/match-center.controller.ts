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
  type MatchCenterSnapshot,
  type StartMatchCenterRequest,
  type SumarGolRequest,
  type UserContext,
} from '@fixtura/types';

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

@Controller('admin/match-center/:partidoId')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
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
    const snap = await this.svc.arrancar(
      partidoId,
      ensureTenant(user),
      dto.minutosPorPeriodo,
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
    const snap = await this.svc.pausar(partidoId, ensureTenant(user));
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('reanudar')
  @HttpCode(200)
  async reanudar(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    const snap = await this.svc.reanudar(partidoId, ensureTenant(user));
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
    const snap = await this.svc.sumarGol(partidoId, ensureTenant(user), dto.equipo);
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
    const snap = await this.svc.ajustarGoles(
      partidoId,
      ensureTenant(user),
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
    const snap = await this.svc.siguientePeriodo(partidoId, ensureTenant(user));
    void this.gateway.broadcast(partidoId);
    return snap;
  }

  @Post('finalizar')
  @HttpCode(200)
  async finalizar(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<MatchCenterSnapshot> {
    const snap = await this.svc.finalizarCentro(partidoId, ensureTenant(user));
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
