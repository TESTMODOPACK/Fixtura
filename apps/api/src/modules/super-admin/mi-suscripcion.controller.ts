import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ROLE,
  type EstadoCuentaLiga,
  type FacturaPlataforma as FacturaPlataformaDto,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NoImpersonation } from '../impersonation/no-impersonation.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FacturacionPlataformaPagosService } from './facturacion-plataforma-pagos.service';
import { FacturacionPlataformaService } from './facturacion-plataforma.service';

/**
 * Sprint 24A — Vista "Mi Suscripción" para el LIGA_ADMIN.
 *
 *  GET  /admin/mi-suscripcion                Estado de cuenta + datos del plan.
 *  GET  /admin/mi-suscripcion/facturas       Mis facturas (historial completo).
 *  POST /admin/mi-suscripcion/pagar/:id      Inicia pago Webpay, devuelve URL.
 *  POST /admin/mi-suscripcion/retorno        Procesa el retorno de Webpay.
 *
 * El tenantId viene del JWT, NUNCA del body — el LIGA_ADMIN solo puede
 * operar sobre su propia liga.
 */
@Controller('admin/mi-suscripcion')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_CONTADOR)
export class MiSuscripcionController {
  constructor(
    private readonly facturacion: FacturacionPlataformaService,
    private readonly pagos: FacturacionPlataformaPagosService,
  ) {}

  @Get()
  async getMiSuscripcion(
    @CurrentUser() user: UserContext,
  ): Promise<EstadoCuentaLiga> {
    if (!user.tenantId) {
      throw new UnauthorizedException('Usuario sin tenant.');
    }
    return this.facturacion.estadoCuenta(user.tenantId);
  }

  @Get('facturas')
  async listMisFacturas(
    @CurrentUser() user: UserContext,
  ): Promise<FacturaPlataformaDto[]> {
    if (!user.tenantId) {
      throw new UnauthorizedException('Usuario sin tenant.');
    }
    return this.facturacion.listPorTenant(user.tenantId);
  }

  /**
   * Inicia el flujo de pago Webpay para una factura propia.
   * Bloqueado durante impersonación: solo el LIGA_ADMIN real puede pagar.
   */
  @Post('pagar/:facturaId')
  @HttpCode(200)
  @NoImpersonation()
  @Audited({
    action: 'platform.factura_pago_iniciado',
    entityType: 'FacturaPlataforma',
    entityIdFrom: 'params.facturaId',
  })
  async pagar(
    @CurrentUser() user: UserContext,
    @Param('facturaId', new ParseUUIDPipe()) facturaId: string,
    @Body() body: { baseUrlFrontend?: string },
  ): Promise<{ url: string; token: string; transaccionId: string }> {
    if (!user.tenantId) {
      throw new UnauthorizedException('Usuario sin tenant.');
    }

    // Verifica que la factura pertenece al tenant del usuario.
    const factura = await this.facturacion.findOne(facturaId);
    if (factura.tenantId !== user.tenantId) {
      throw new UnauthorizedException('La factura no pertenece a tu liga.');
    }

    const baseUrl =
      body?.baseUrlFrontend ??
      process.env.FRONTEND_URL ??
      'http://localhost:3000';
    return this.pagos.iniciarPagoWebpay(facturaId, user.userId, baseUrl);
  }

  /**
   * Retorno de Webpay. El token viene del query string del redirect que
   * hace Transbank al merchant. Marca factura como pagada + emite SII.
   */
  @Post('retorno')
  @HttpCode(200)
  @Audited({ action: 'platform.webpay_retorno' })
  async retorno(
    @Query('token_ws') token?: string,
    @Body('token_ws') tokenBody?: string,
  ): Promise<{
    aprobado: boolean;
    facturaId: string | null;
    estadoFactura: string | null;
  }> {
    const finalToken = token ?? tokenBody;
    if (!finalToken) {
      throw new UnauthorizedException('Token Webpay ausente.');
    }
    return this.pagos.retornoWebpay(finalToken);
  }
}
