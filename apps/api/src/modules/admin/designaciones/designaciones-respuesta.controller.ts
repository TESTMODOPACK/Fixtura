import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Public } from '../../../common/decorators/public.decorator';
import { DesignacionesAdminService } from './designaciones-admin.service';
import { DesignacionesEmailService } from './designaciones-email.service';

/**
 * Endpoint público sin auth — usado por el link del email que recibe
 * el árbitro. La autorización viene del token firmado (JWT corto).
 *
 * Live en /public porque NO requiere JWT del admin. El RLS se desactiva
 * temporalmente (set_config tenant_id='') antes de leer/escribir la
 * designación; en su lugar validamos el tenantId que viene en el token
 * (firmado, así que no se puede falsificar).
 */
@Controller('public/designaciones')
@Public()
export class DesignacionesRespuestaController {
  constructor(
    private readonly emailSvc: DesignacionesEmailService,
    private readonly svc: DesignacionesAdminService,
  ) {}

  /**
   * Deprecado T27: GET que escribe + token en query (queda en logs/SW).
   * Se mantiene mientras haya emails en vuelo (TTL del token: 7 días).
   */
  @Get('respuesta')
  async responder(
    @Query('token') token?: string,
  ): Promise<{ ok: boolean; estado: string; partidoId?: string }> {
    return this.aplicar(token);
  }

  /** T27 — canónico: la página postea el token en el body. */
  @Post('respuesta')
  async responderPost(
    @Body('token') token?: string,
  ): Promise<{ ok: boolean; estado: string; partidoId?: string }> {
    return this.aplicar(typeof token === 'string' ? token : undefined);
  }

  private async aplicar(
    token?: string,
  ): Promise<{ ok: boolean; estado: string; partidoId?: string }> {
    if (!token || token.length < 10) {
      throw new BadRequestException('Token faltante o inválido');
    }
    const payload = this.emailSvc.verifyToken(token);
    if (!payload) {
      throw new BadRequestException('Token inválido o expirado');
    }
    return this.svc.aplicarRespuestaPorToken(
      payload.designacionId,
      payload.tenantId,
      payload.accion,
    );
  }
}
