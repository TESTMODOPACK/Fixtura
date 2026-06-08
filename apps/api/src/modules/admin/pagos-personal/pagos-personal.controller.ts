import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type CuentasPorPagarResumen,
  type LiquidacionPersonal,
  type LiquidacionPersonalDetalle,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CrearLiquidacionDto } from './dto';
import { PagosPersonalService } from './pagos-personal.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/pagos-personal')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_CONTADOR, ROLE.SUPER_ADMIN)
export class PagosPersonalController {
  constructor(private readonly svc: PagosPersonalService) {}

  @Get('cuentas-por-pagar')
  cuentasPorPagar(
    @CurrentUser() user: UserContext,
  ): Promise<CuentasPorPagarResumen> {
    return this.svc.cuentasPorPagar(ensureTenant(user));
  }

  @Get('liquidaciones')
  listLiquidaciones(
    @CurrentUser() user: UserContext,
  ): Promise<LiquidacionPersonal[]> {
    return this.svc.listLiquidaciones(ensureTenant(user));
  }

  @Get('liquidaciones/:id')
  getLiquidacion(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<LiquidacionPersonalDetalle> {
    return this.svc.getLiquidacion(id, ensureTenant(user));
  }

  @Post('liquidaciones')
  liquidar(
    @CurrentUser() user: UserContext,
    @Body() dto: CrearLiquidacionDto,
  ): Promise<LiquidacionPersonalDetalle> {
    return this.svc.liquidar(ensureTenant(user), user.userId, dto);
  }

  @Delete('liquidaciones/:id')
  eliminar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.eliminarLiquidacion(id, ensureTenant(user), user.userId);
  }
}
