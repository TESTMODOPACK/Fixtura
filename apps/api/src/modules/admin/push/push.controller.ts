import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { Request } from 'express';

import type { UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PushService } from './push.service';

const SCOPE = ['PARTIDO', 'EQUIPO', 'TORNEO', 'GLOBAL'] as const;
type Scope = (typeof SCOPE)[number];

class SubscribeDto {
  @IsEnum(SCOPE)
  scopeType!: Scope;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsString()
  @MaxLength(2000)
  endpoint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  p256dh?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  auth?: string | null;
}

class UnsubscribeDto {
  @IsString()
  @MaxLength(2000)
  endpoint!: string;
}

/**
 * Endpoints públicos para suscribirse/desuscribirse a push. Cualquiera
 * con un endpoint válido puede suscribirse (hinchas no autenticados
 * incluidos). Si el user está logueado, se asocia el userId.
 */
@Controller('public/push')
@Public()
export class PushPublicController {
  constructor(private readonly svc: PushService) {}

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser() user: UserContext | null,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    if (!dto.endpoint || dto.endpoint.length < 10) {
      throw new BadRequestException('Endpoint inválido');
    }
    return this.svc.subscribe({
      tenantId: user?.tenantId ?? null,
      userId: user?.userId ?? null,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId ?? null,
      endpoint: dto.endpoint,
      p256dh: dto.p256dh ?? null,
      auth: dto.auth ?? null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
    });
  }

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body() dto: UnsubscribeDto): Promise<{ revoked: boolean }> {
    return this.svc.unsubscribe(dto.endpoint);
  }
}
