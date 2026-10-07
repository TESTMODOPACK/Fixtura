import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Observable, from, lastValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';
import { runInTransaction } from 'typeorm-transactional';

import {
  SIN_TENANT_UUID,
  fijarBypassLocal,
  fijarTenantLocal,
} from '../rls/rls-context';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Envuelve cada request en UNA transacción (misma conexión del pool para
 * todas sus queries) y fija el contexto RLS v2:
 *
 *   - tenant del JWT → app.current_tenant_id = uuid.
 *   - sin usuario (público) o SUPER_ADMIN sin tenant → app.rls_bypass
 *     (los services públicos filtran por tenant explícito).
 *   - autenticado SIN tenant y SIN super admin (roles en 2+ ligas sin
 *     elegir) → tenant "nadie": antes caía en bypass y veía TODO.
 *
 * Esperamos a que el handler COMPLETE dentro de la transacción: devolver
 * el Observable sin await cerraba la tx y el handler corría afuera, con
 * 0 filas intermitentes bajo RLS.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // T14: liveness/metrics no deben abrir transacción ni depender del
    // pool — con el pool saturado, el healthcheck también colgaba y
    // Docker no distinguía "lento" de "muerto".
    const path = req.path ?? '';
    if (path.startsWith('/health') || path === '/metrics') {
      return next.handle();
    }

    const user = req.user;
    const esSuperAdmin = user?.roles?.some((r) => r.role === 'SUPER_ADMIN') ?? false;

    return from(
      runInTransaction(async () => {
        if (user?.tenantId) {
          await fijarTenantLocal(this.dataSource, user.tenantId);
        } else if (!user || esSuperAdmin) {
          await fijarBypassLocal(this.dataSource);
        } else {
          await fijarTenantLocal(this.dataSource, SIN_TENANT_UUID);
        }
        const res = await lastValueFrom(next.handle(), { defaultValue: undefined });
        // T13: si un catch del handler tragó un error de Postgres, la tx
        // quedó abortada y el COMMIT sería un ROLLBACK silencioso con
        // respuesta 200. Este SELECT 1 la detona acá, visible, como 500.
        await this.dataSource.query('SELECT 1');
        return res;
      }),
    );
  }
}
