import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Observable, catchError, concatMap, from, throwError } from 'rxjs';
import { DataSource } from 'typeorm';

import { runComoSistema } from '../../common/rls/rls-context';
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
 * Si necesitas guardar before/after data, hazlo desde el service
 * con auditLogService.record() — el interceptor no tiene acceso al
 * estado interno del cambio.
 */
@Injectable()
export class AuditedInterceptor implements NestInterceptor {
  private readonly log = new Logger(AuditedInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditLogService,
    @InjectDataSource() private readonly dataSource: DataSource,
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
      // Éxito: el registro corre DENTRO de la tx del request — atómico con
      // el negocio, y el savepoint interno de record() evita envenenarla.
      // Antes era fire-and-forget: el INSERT podía aterrizar después del
      // COMMIT, sobre una conexión ya devuelta al pool.
      concatMap(async (response) => {
        const entityId = this.extractEntityId(opts.entityIdFrom, {
          response,
          params: (req.params ?? {}) as Record<string, unknown>,
          body: (req.body ?? {}) as Record<string, unknown>,
        });

        await this.auditService.record({
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
        return response;
      }),
      catchError((err: unknown) => {
        if (opts.onlyOnSuccess !== false) {
          return throwError(() => err);
        }
        return from(this.registrarFallo(opts, req, user, err)).pipe(
          concatMap(() => throwError(() => err)),
        );
      }),
    );
  }

  /**
   * La tx del request viene abortada (o va a abortar con el rethrow): el
   * registro del fallo va en una transacción propia, en modo sistema, para
   * sobrevivir al rollback y pasar el WITH CHECK de RLS.
   */
  private async registrarFallo(
    opts: AuditedOptions,
    req: Request,
    user:
      | { userId?: string; tenantId?: string | null; impersonatorId?: string | null }
      | undefined,
    err: unknown,
  ): Promise<void> {
    try {
      await runComoSistema(this.dataSource, () =>
        this.auditService.record({
          action: `${opts.action}.failed`,
          tenantId: user?.tenantId ?? null,
          userId: user?.userId ?? null,
          entityType: opts.entityType ?? null,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: {
            method: req.method,
            path: req.path,
            errorMessage: err instanceof Error ? err.message : String(err),
            ...(user?.impersonatorId
              ? { impersonatorId: user.impersonatorId }
              : {}),
          },
        }),
      );
    } catch (e) {
      this.log.warn(
        `No se pudo auditar el fallo de ${opts.action}: ${(e as Error).message}`,
      );
    }
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
