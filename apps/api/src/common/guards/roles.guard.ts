import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLE_SCOPE, type Role } from '@fixtura/types';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Sprint 22 — RF-05. RolesGuard con validación de scope.
 *
 * Validación en dos pasadas:
 *   1. ¿Tiene al menos uno de los roles requeridos?
 *   2. Para roles tenant-scoped (LIGA_*, RECINTO_*, TRIBUNAL_*), el
 *      user_role debe tener scope_id = tenantId del request actual.
 *      Como JWT solo carga un tenantId y RLS lo refuerza, en la práctica
 *      este check es defensa en profundidad.
 *
 * Roles PLATFORM (SUPER_ADMIN) pasan cualquier tenant.
 * Roles TEAM/PERSONAL no se validan aquí — su scope se verifica en la
 * lógica de cada service (ej. PartidoService verifica que el equipoId
 * del partido coincida con el equipo del delegado).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // B1 — Sin @Roles, un endpoint autenticado (no @Public) deja pasar a
    // CUALQUIER usuario logueado. Es intencional para endpoints "any-auth"
    // (p. ej. /me). Riesgo latente: un controller de dominio que olvide @Roles
    // queda abierto a HINCHA/JUGADOR. Flipear esto a default-DENY exige antes
    // auditar y anotar explícitamente todos los endpoints any-auth para no
    // romperlos — pendiente como tarea separada.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user) return false;

    // SUPER_ADMIN bypassa todo el check (incluyendo cross-tenant).
    const isSuperAdmin = user.roles.some((r) => r.role === 'SUPER_ADMIN');
    if (isSuperAdmin && requiredRoles.includes('SUPER_ADMIN' as Role)) {
      return true;
    }

    // Verificar coincidencia de rol + scope.
    const ok = requiredRoles.some((requiredRole) => {
      const expectedScope = ROLE_SCOPE[requiredRole];
      return user.roles.some((userRole) => {
        if (userRole.role !== requiredRole) return false;

        // Para roles TENANT, scope_id debe coincidir con tenantId del JWT.
        if (expectedScope === 'TENANT') {
          if (!user.tenantId) return false;
          return userRole.scopeId === user.tenantId;
        }

        // PLATFORM, TEAM, PERSONAL: el rol con scope correcto basta;
        // la validación granular vive en el service de cada feature.
        return true;
      });
    });

    if (!ok) {
      const userRoleSummary = user.roles
        .map((r) => `${r.role}@${r.scope}${r.scopeId ? `(${r.scopeId.slice(0, 8)})` : ''}`)
        .join(', ');
      throw new ForbiddenException(
        `Requires one of roles: ${requiredRoles.join(', ')}. ` +
          `Tu sesión tiene: ${userRoleSummary || '(sin roles)'} tenant=${user.tenantId ?? 'null'}.`,
      );
    }
    return true;
  }
}
