import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';

import type { EncuestaNpsInfo } from '@fixtura/types';

import { Public } from '../../../common/decorators/public.decorator';
import { NpsService } from './nps.service';

/**
 * Endpoint público sin auth — usado por el link del email que recibe el
 * delegado del club. La autorización viene del token firmado (JWT). El
 * NpsService re-setea el contexto RLS desde el tenantId del token antes
 * de leer/escribir la encuesta.
 */
@Controller('public/nps')
@Public()
export class NpsPublicoController {
  constructor(private readonly svc: NpsService) {}

  /** Deprecado T27 (token en query queda en logs/SW): usar POST /info. */
  @Get('info')
  info(@Query('token') token?: string): Promise<EncuestaNpsInfo> {
    if (!token || token.length < 10) {
      throw new BadRequestException('Token faltante o inválido.');
    }
    return this.svc.infoPorToken(token);
  }

  /** T27 — el token viaja en el body, nunca en la URL. */
  @Post('info')
  infoPost(@Body('token') token?: string): Promise<EncuestaNpsInfo> {
    if (!token || typeof token !== 'string' || token.length < 10) {
      throw new BadRequestException('Token faltante o inválido.');
    }
    return this.svc.infoPorToken(token);
  }

  @Post('responder')
  responder(
    @Query('token') tokenQuery: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: boolean; yaRespondida: boolean }> {
    // T27 — token en el body; el de query queda como fallback deprecado
    // para links/páginas viejas en vuelo.
    const tokenBody = (body as { token?: unknown } | null)?.token;
    const token = typeof tokenBody === 'string' ? tokenBody : tokenQuery;
    if (!token || token.length < 10) {
      throw new BadRequestException('Token faltante o inválido.');
    }
    return this.svc.responderPorToken(token, body);
  }
}
