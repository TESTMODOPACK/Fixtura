import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { UserContext } from '@fixtura/types';
import { UserContextSchema } from '@fixtura/types';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = authHeader.slice(7);

    try {
      // B2 — Solo se verifica firma + expiración; NO se re-consulta la DB por
      // isActive/rol vigente en cada request (sería un hit por request). Tras
      // desactivar un usuario o cambiarle el rol, su access token sigue válido
      // hasta expirar (≤15 min) — ventana aceptada por el TTL corto. El reset
      // de password sí revoca los refresh tokens de inmediato.
      const payload = await this.jwtService.verifyAsync<UserContext>(token);
      const parsed = UserContextSchema.parse(payload);
      req.user = parsed;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
