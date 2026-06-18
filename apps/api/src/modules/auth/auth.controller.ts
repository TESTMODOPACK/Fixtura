import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';

import type { AuthTokens, UserContext } from '@fixtura/types';

import { Audited } from '../audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';

class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga (máximo 128 caracteres).' })
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // AUDIT-2: rate limit estricto contra brute force. 5 intentos por
  // ventana de 15 min por IP. Si pasa, 429 Too Many Requests.
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('login')
  @Public()
  @HttpCode(200)
  // Loguea TANTO éxito como fallo para detectar ataques de fuerza bruta.
  @Audited({ action: 'auth.login', onlyOnSuccess: false })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @Audited('auth.logout')
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('me')
  @HttpCode(200)
  me(@CurrentUser() user: UserContext): UserContext {
    return user;
  }

  // ── Sprint 11: Recuperación de contraseña (RF-03) ──────────────────
  // AUDIT-2: rate limit anti spam de emails. 3 solicitudes por IP cada
  // 15 min. Si un atacante quiere spammear a una víctima, el cap es 3
  // emails cada 15 min por IP — molesto pero no DoS al sistema.
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  @Public()
  @HttpCode(200)
  @Audited('auth.forgot_password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: boolean }> {
    return this.auth.solicitarResetPassword(dto.email);
  }

  // 10 intentos por 15min: si el atacante adivina el token, igual está
  // limitado por la entropía del token (32 bytes random).
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('reset-password')
  @Public()
  @HttpCode(200)
  @Audited({ action: 'auth.reset_password', onlyOnSuccess: false })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: boolean }> {
    return this.auth.aplicarResetPassword(dto.token, dto.password);
  }
}
