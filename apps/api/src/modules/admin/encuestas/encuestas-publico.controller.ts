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

  @Get('info')
  info(@Query('token') token?: string): Promise<EncuestaPublica> {
    if (!token || token.length < 10) throw new BadRequestException('Token faltante o inválido.');
    return this.svc.infoPorToken(token);
  }

  @Post('responder')
  responder(
    @Query('token') token: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: boolean; yaRespondida: boolean }> {
    if (!token || token.length < 10) throw new BadRequestException('Token faltante o inválido.');
    return this.svc.responderPorToken(token, body);
  }
}
