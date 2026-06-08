import { ForbiddenException } from '@nestjs/common';

import type { UserContext } from '@fixtura/types';

/**
 * Extrae el clubId del JWT del delegado (rol DELEGADO_EQUIPO, scope TEAM).
 * Es el único origen del clubId — nunca se recibe por parámetro, para que
 * un delegado no pueda mirar datos de otro club. Lanza 403 si no aplica.
 */
export function resolveClubId(user: UserContext): string {
  const rol = user.roles.find(
    (r) => r.role === 'DELEGADO_EQUIPO' && r.scope === 'TEAM' && !!r.scopeId,
  );
  if (!rol?.scopeId) {
    throw new ForbiddenException('Tu usuario no está asociado a un club.');
  }
  return rol.scopeId;
}

/**
 * Tenant del delegado. Con el fix de login viene en user.tenantId; si por
 * algún motivo no está, el caller debe resolverlo desde el club.
 */
export function resolveTenantId(user: UserContext): string {
  if (!user.tenantId) {
    throw new ForbiddenException('Tu usuario no tiene una liga asociada.');
  }
  return user.tenantId;
}
