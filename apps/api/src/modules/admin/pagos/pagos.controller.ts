import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type ConfirmarPagoResponse,
  type IniciarPagoResponse,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { IniciarPagoDto } from './dto';
import { PagosService } from './pagos.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

/**
 * Endpoints autenticados de pagos (admin/delegado pueden iniciar pago).
 * El retorno del flujo Webpay vive en PagosPublicController (sin auth).
 */
@Controller('admin/pagos')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_CONTADOR,
  ROLE.LIGA_COORDINADOR,
  ROLE.DELEGADO_EQUIPO,
  ROLE.SUPER_ADMIN,
)
export class PagosAdminController {
  constructor(private readonly svc: PagosService) {}

  /**
   * Inicia un pago Webpay para un cobro existente. Devuelve la URL a la
   * que hay que redirigir al usuario para que complete el pago.
   *
   * Body: { cobroId: uuid, urlRetornoBase?: string }
   *  - urlRetornoBase: prefijo donde Webpay redirige al user con el
   *    token. Si no se pasa, asume FRONTEND_URL/pago/retorno (config).
   */
  @Post('iniciar')
  @Audited({ action: 'pago.iniciado', entityType: 'Cobro' })
  iniciar(
    @CurrentUser() user: UserContext,
    @Body() dto: IniciarPagoDto,
  ): Promise<IniciarPagoResponse> {
    const tenantId = ensureTenant(user);
    const urlRetornoBase =
      dto.urlRetornoBase ??
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/pago/retorno`;
    return this.svc.iniciarPago(dto.cobroId, tenantId, user.userId, urlRetornoBase);
  }
}

/**
 * Endpoint público para el retorno de la pasarela. Webpay no manda
 * cookies de sesión — sólo el token. El frontend de /pago/retorno
 * llama acá con el transaccionId para confirmar.
 *
 * No requiere auth porque la pasarela no la tiene. La transacción se
 * identifica por su UUID (no enumerable).
 */
@Controller('public/pagos')
@Public()
export class PagosPublicController {
  constructor(private readonly svc: PagosService) {}

  /**
   * Confirma el pago consultando a la pasarela. Idempotente: si ya está
   * en estado final, devuelve el estado guardado sin volver a llamar.
   */
  @Post(':transaccionId/confirmar')
  @Audited({ action: 'pago.confirmado', entityType: 'Transaccion', entityIdFrom: 'params.transaccionId' })
  confirmar(
    @Param('transaccionId', new ParseUUIDPipe()) transaccionId: string,
  ): Promise<ConfirmarPagoResponse> {
    return this.svc.confirmarPago(transaccionId);
  }

  /**
   * Solo lectura del estado (útil si el user refresca la página de
   * retorno y la confirmación ya pasó). El TenantContextInterceptor pone
   * RLS en bypass para endpoints @Public, así que la query funciona sin
   * tenantId. El "auth" es el UUID no enumerable de la transacción.
   */
  @Get(':transaccionId/estado')
  async estado(
    @Param('transaccionId', new ParseUUIDPipe()) transaccionId: string,
  ): Promise<ConfirmarPagoResponse> {
    const tx = await this.svc.findOnePublic(transaccionId);
    return {
      transaccionId: tx.id,
      cobroId: tx.cobroId,
      estado: tx.estado,
      monto: tx.monto,
      mensaje: `Estado actual: ${tx.estado}`,
    };
  }
}
