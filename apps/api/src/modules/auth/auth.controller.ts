import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';

import type { AuthTokens, UserContext } from '@fixtura/types';

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
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
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
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('me')
  @HttpCode(200)
  me(@CurrentUser() user: UserContext): UserContext {
    return user;
  }

  // ── Sprint 11: Recuperación de contraseña (RF-03) ──────────────────
  @Post('forgot-password')
  @Public()
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: boolean }> {
    return this.auth.solicitarResetPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: boolean }> {
    return this.auth.aplicarResetPassword(dto.token, dto.password);
  }
}
