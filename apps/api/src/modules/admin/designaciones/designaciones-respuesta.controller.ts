import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

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

  @Get('respuesta')
  async responder(
    @Query('token') token?: string,
  ): Promise<{ ok: boolean; estado: string; partidoId?: string }> {
    if (!token || token.length < 10) {
      throw new BadRequestException('Token faltante o inválido');
    }
    const payload = this.emailSvc.verifyToken(token);
    if (!payload) {
      throw new BadRequestException('Token inválido o expirado');
    }
    const result = await this.svc.aplicarRespuestaPorToken(
      payload.designacionId,
      payload.tenantId,
      payload.accion,
    );
    return result;
  }
}
