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
        // Esperamos a que el handler COMPLETE dentro de la transacción para
        // que TODAS sus queries usen la misma conexión con el contexto RLS
        // seteado. Antes se devolvía `next.handle()` (un Observable) sin
        // await: runInTransaction resolvía de inmediato y CERRABA la
        // transacción, y el handler corría afuera. En una conexión sin el
        // SET LOCAL, current_setting('app.current_tenant_id', true) es NULL
        // (no ''), y la policy `tenant_id = NULL OR NULL = ''` evalúa NULL
        // → excluye filas → conteos/listados en 0 de forma intermitente.
        // defaultValue cubre handlers que completan sin emitir (p.ej. @Res()).
        return lastValueFrom(next.handle(), { defaultValue: undefined });
      }),
    );
  }
}
