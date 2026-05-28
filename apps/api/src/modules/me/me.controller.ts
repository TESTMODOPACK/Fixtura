import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { UserContext } from '@fixtura/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MeService } from './me.service';

/**
 * AUDIT-11 — Ley 19.628 (Chile). Endpoints ARCO autenticados.
 *
 * Todos los endpoints requieren JWT válido (JwtAuthGuard global aplica
 * por default). Ningún @Public aquí — el user solo puede operar sobre
 * sus propios datos.
 */
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /**
   * GET /me/data — exporta todos los datos del user en JSON.
   * Content-Disposition: attachment fuerza descarga en el browser.
   */
  @Get('data')
  async getData(
    @CurrentUser() user: UserContext,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.me.exportData(
      user.userId,
      req.ip,
      req.headers['user-agent'],
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fixtura-mis-datos-${user.userId}.json"`,
    );
    res.send(JSON.stringify(payload, null, 2));
  }

  /**
   * POST /me/delete-request — programa eliminación de cuenta en 30d.
   */
  @Post('delete-request')
  @HttpCode(200)
  async requestDeletion(
    @CurrentUser() user: UserContext,
    @Req() req: Request,
  ): Promise<{ scheduledFor: string; graceDays: number }> {
    return this.me.requestDeletion(
      user.userId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  /**
   * DELETE /me/delete-request — cancela un pedido durante la ventana de
   * gracia. Permite arrepentirse antes de la baja definitiva.
   */
  @Delete('delete-request')
  @HttpCode(200)
  async cancelDeletion(
    @CurrentUser() user: UserContext,
    @Req() req: Request,
  ): Promise<{ cancelado: boolean }> {
    return this.me.cancelDeletion(
      user.userId,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
