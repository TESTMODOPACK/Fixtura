import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * F57 — Gating de suscripción. Si la liga (tenant) del usuario está
 * SUSPENDIDA o CANCELADA (mora ≥2 meses o trial vencido sin plan), se
 * bloquea TODA operación con 402 Payment Required, salvo:
 *   - endpoints públicos (@Public) → el portal de hinchas sigue visible
 *   - SUPER_ADMIN y sesiones impersonadas (soporte de plataforma)
 *   - rutas para regularizar el pago (mi-suscripción) y de auth
 *
 * El front intercepta el 402 (code SUBSCRIPTION_SUSPENDED) y manda al
 * usuario a la pantalla de pago.
 *
 * Corre como último APP_GUARD (después de Jwt + Roles). La tabla `tenants`
 * no tiene RLS, así que la consulta funciona sin contexto de tenant.
 */

const RUTAS_PERMITIDAS = ['/admin/mi-suscripcion', '/auth/'];

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    // Sin usuario o sin tenant (plataforma / personal sin liga) → no aplica.
    if (!user || !user.tenantId) return true;

    // Super admin y soporte impersonado nunca se bloquean.
    if (user.roles?.some((r) => r.role === 'SUPER_ADMIN')) return true;
    if (user.impersonatorId) return true;

    // Rutas para pagar / autenticarse siempre disponibles.
    const path = req.path ?? req.url ?? '';
    if (RUTAS_PERMITIDAS.some((p) => path.includes(p))) return true;

    const rows: Array<{ estado_suscripcion: string }> = await this.ds.query(
      `SELECT estado_suscripcion FROM tenants WHERE id = $1 LIMIT 1`,
      [user.tenantId],
    );
    const estado = rows[0]?.estado_suscripcion;

    if (estado === 'SUSPENDIDO' || estado === 'CANCELADO') {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'Payment Required',
          code: 'SUBSCRIPTION_SUSPENDED',
          message:
            'La suscripción de tu liga está suspendida por falta de pago. Regulariza el pago para volver a operar.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
