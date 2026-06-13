import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { NO_IMPERSONATION_KEY } from './no-impersonation.decorator';

/**
 * Sprint 21 — RF-06. Bloquea handlers con @NoImpersonation() cuando la
 * sesión actual es impersonada (req.user.impersonatorId presente).
 */
@Injectable()
export class NoImpersonationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const block = this.reflector.getAllAndOverride<boolean | undefined>(
      NO_IMPERSONATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!block) return true;

    const req = context.switchToHttp().getRequest<{ user?: { impersonatorId?: string | null } }>();
    if (req.user?.impersonatorId) {
      throw new ForbiddenException(
        'Esta acción no se puede realizar en modo impersonación. Sal del modo soporte y vuelve a iniciar sesión normalmente.',
      );
    }
    return true;
  }
}
