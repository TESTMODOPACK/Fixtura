import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';

import { AuditLogService } from './audit-log.service';
import { AUDITED_METADATA_KEY, type AuditedOptions } from './audited.decorator';

/**
 * Sprint 20 — RF-07.
 *
 * Interceptor global que registra en audit_logs cuando un handler
 * marcado con @Audited() termina con éxito (status < 400).
 *
 * Extrae automáticamente:
 *   - userId desde req.user.userId (poblado por JwtStrategy)
 *   - tenantId desde req.user.tenantId
 *   - ipAddress desde req.ip (X-Forwarded-For via trust proxy)
 *   - userAgent desde req.headers['user-agent']
 *   - entityId desde el path indicado en opts.entityIdFrom (opcional)
 *
 * Si necesitás guardar before/after data, hacelo desde el service
 * con auditLogService.record() — el interceptor no tiene acceso al
 * estado interno del cambio.
 */
@Injectable()
export class AuditedInterceptor implements NestInterceptor {
  private readonly log = new Logger(AuditedInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditLogService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const opts = this.reflector.getAllAndOverride<AuditedOptions | undefined>(
      AUDITED_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!opts) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const user = req.user as
      | { userId?: string; tenantId?: string | null; impersonatorId?: string | null }
      | undefined;

    return next.handle().pipe(
      tap({
        next: (response) => {
          const entityId = this.extractEntityId(opts.entityIdFrom, {
            response,
            params: (req.params ?? {}) as Record<string, unknown>,
            body: (req.body ?? {}) as Record<string, unknown>,
          });

          void this.auditService.record({
            action: opts.action,
            tenantId: user?.tenantId ?? null,
            userId: user?.userId ?? null,
            entityType: opts.entityType ?? null,
            entityId,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
            metadata: {
              method: req.method,
              path: req.path,
              ...(user?.impersonatorId
                ? { impersonatorId: user.impersonatorId }
                : {}),
            },
          });
        },
        error: (err) => {
          if (opts.onlyOnSuccess === false) {
            void this.auditService.record({
              action: `${opts.action}.failed`,
              tenantId: user?.tenantId ?? null,
              userId: user?.userId ?? null,
              entityType: opts.entityType ?? null,
              ipAddress: req.ip ?? null,
              userAgent: req.headers['user-agent'] ?? null,
              metadata: {
                method: req.method,
                path: req.path,
                errorMessage:
                  err instanceof Error ? err.message : String(err),
                ...(user?.impersonatorId
                  ? { impersonatorId: user.impersonatorId }
                  : {}),
              },
            });
          }
        },
      }),
    );
  }

  private extractEntityId(
    path: string | undefined,
    sources: {
      response: unknown;
      params: Record<string, unknown>;
      body: Record<string, unknown>;
    },
  ): string | null {
    if (!path) return null;
    const [src, ...rest] = path.split('.');
    let base: unknown =
      src === 'response'
        ? sources.response
        : src === 'params'
          ? sources.params
          : src === 'body'
            ? sources.body
            : null;
    for (const key of rest) {
      if (base && typeof base === 'object' && key in (base as object)) {
        base = (base as Record<string, unknown>)[key];
      } else {
        return null;
      }
    }
    return typeof base === 'string' ? base : null;
  }
}
