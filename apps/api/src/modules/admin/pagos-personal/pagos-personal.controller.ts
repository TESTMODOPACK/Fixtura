import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  ROLE,
  type CuentasPorPagarResumen,
  type LiquidacionPersonal,
  type LiquidacionPersonalDetalle,
  type NominaPago,
  type NominaPagoDetalle,
  type NominaPreview,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CrearLiquidacionDto, EmitirNominaDto } from './dto';
import { PagosPersonalService } from './pagos-personal.service';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

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

  // ─── F49: Nóminas de pago (pago masivo) ───────────────────────────

  @Get('nominas/preview')
  previewNomina(
    @CurrentUser() user: UserContext,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ): Promise<NominaPreview> {
    if (!FECHA_ISO.test(desde ?? '') || !FECHA_ISO.test(hasta ?? '')) {
      throw new BadRequestException(
        'desde y hasta son obligatorios con formato YYYY-MM-DD.',
      );
    }
    return this.svc.previewNomina(ensureTenant(user), desde, hasta);
  }

  @Get('nominas')
  listNominas(@CurrentUser() user: UserContext): Promise<NominaPago[]> {
    return this.svc.listNominas(ensureTenant(user));
  }

  @Get('nominas/:id')
  getNomina(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NominaPagoDetalle> {
    return this.svc.getNomina(id, ensureTenant(user));
  }

  @Get('nominas/:id/excel')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="nomina-pago.xlsx"')
  async descargarNominaExcel(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.svc.exportarNominaExcel(id, ensureTenant(user));
    res.send(buffer);
  }

  @Post('nominas')
  emitirNomina(
    @CurrentUser() user: UserContext,
    @Body() dto: EmitirNominaDto,
  ): Promise<NominaPagoDetalle> {
    return this.svc.emitirNomina(ensureTenant(user), user.userId, dto);
  }

  @Delete('nominas/:id')
  eliminarNomina(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.eliminarNomina(id, ensureTenant(user), user.userId);
  }
}
