import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';

import type { EncuestaPublica } from '@fixtura/types';

import { Public } from '../../../common/decorators/public.decorator';
import { EncuestasService } from './encuestas.service';

/**
 * Endpoint público sin auth (ADR-0011). El delegado abre el link del email; la
 * autorización viene del token firmado. El service re-setea el contexto RLS
 * desde el tenantId del token antes de leer/escribir.
 */
@Controller('public/encuestas')
@Public()
export class EncuestasPublicoController {
  constructor(private readonly svc: EncuestasService) {}

  /** Deprecado T27 (token en query queda en logs/SW): usar POST /info. */
  @Get('info')
  info(@Query('token') token?: string): Promise<EncuestaPublica> {
    if (!token || token.length < 10) throw new BadRequestException('Token faltante o inválido.');
    return this.svc.infoPorToken(token);
  }

  /** T27 — el token viaja en el body, nunca en la URL. */
  @Post('info')
  infoPost(@Body('token') token?: string): Promise<EncuestaPublica> {
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
    // T27 — token en el body; el de query queda como fallback deprecado.
    const tokenBody = (body as { token?: unknown } | null)?.token;
    const token = typeof tokenBody === 'string' ? tokenBody : tokenQuery;
    if (!token || token.length < 10) throw new BadRequestException('Token faltante o inválido.');
    return this.svc.responderPorToken(token, body);
  }
}
