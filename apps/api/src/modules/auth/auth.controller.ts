import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';

import type { AuthTokens, UserContext } from '@fixtura/types';

import { Audited } from '../audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

/** A5 — nombre de la cookie HttpOnly que transporta el refresh token. */
const REFRESH_COOKIE = 'lp_refresh';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A5 — Opciones de la cookie del refresh token. Path '/api' la limita a las
 * rutas del API (refresh/logout viven bajo /api/v1/auth). SameSite=Lax corta
 * CSRF en POST cross-site. Secure solo en prod (en dev http la bloquearía).
 */
function refreshCookieOpts(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
  };
}
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOpts(),
    maxAge: REFRESH_MAX_AGE_MS,
  });
}
function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOpts());
}

function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

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
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    // A5 — el refresh token NO va en el body: se setea como cookie HttpOnly.
    setRefreshCookie(res, tokens.refreshToken!);
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    // A5 — el refresh token viene de la cookie HttpOnly, no del body.
    const fromCookie = readRefreshCookie(req);
    if (!fromCookie) {
      throw new UnauthorizedException('No hay sesión activa.');
    }
    const tokens = await this.auth.refresh(fromCookie);
    setRefreshCookie(res, tokens.refreshToken!);
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    };
  }

  @Post('logout')
  @HttpCode(204)
  @Audited('auth.logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const fromCookie = readRefreshCookie(req);
    if (fromCookie) await this.auth.logout(fromCookie);
    clearRefreshCookie(res);
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
