import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { ROLE, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { FlyerDelegadosService } from './flyer-delegados.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/flyer-delegados')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class FlyerDelegadosController {
  constructor(private readonly svc: FlyerDelegadosService) {}

  /** Vista previa descargable del flyer de un torneo (sin enviar nada). */
  @Get('torneo/:torneoId/flyer.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="flyer-semanal.pdf"')
  async previewTorneo(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.svc.pdfTorneo(torneoId, ensureTenant(user));
    res.send(buffer);
  }

  /**
   * Dispara el envío del flyer AHORA a todos los delegados (para probar sin
   * esperar al lunes). Manda correos reales — el front pide confirmación.
   */
  @Post('enviar')
  enviar(
    @CurrentUser() user: UserContext,
  ): Promise<{ clubes: number; correos: number }> {
    return this.svc.enviarSemanal(ensureTenant(user));
  }
}
