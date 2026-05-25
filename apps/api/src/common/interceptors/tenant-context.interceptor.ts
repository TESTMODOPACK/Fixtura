import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { runInTransaction } from 'typeorm-transactional';

import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Setea `app.current_tenant_id` al inicio de cada request autenticado,
 * envolviéndolo en una transacción para que la session variable sobreviva
 * y todas las queries del request usen la misma conexión del pool.
 *
 * Sin tenantId (público o super_admin sin tenant elegido): se setea ''
 * (string vacío) — las policies RLS reconocen ese marker como "bypass".
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = req.user?.tenantId ?? '';

    return from(
      runInTransaction(async () => {
        await this.dataSource.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
          tenantId,
        ]);
        return next.handle();
      }),
    ).pipe(switchMap((obs) => obs as Observable<unknown>));
  }
}
