import { ForbiddenException } from '@nestjs/common';

import type { UserContext } from '@fixtura/types';

/**
 * Extrae el jugadorId del JWT del jugador (rol JUGADOR, scope PERSONAL,
 * scopeId = jugadorId). Es el único origen del jugadorId — nunca se recibe
 * por parámetro, para que un jugador no pueda mirar datos de otro. Lanza 403
 * si el usuario no tiene el vínculo.
 */
export function resolveJugadorId(user: UserContext): string {
  const rol = user.roles.find(
    (r) => r.role === 'JUGADOR' && r.scope === 'PERSONAL' && !!r.scopeId,
  );
  if (!rol?.scopeId) {
    throw new ForbiddenException('Tu usuario no está asociado a un jugador.');
  }
  return rol.scopeId;
}

/** Tenant del jugador (viene en el JWT con el fix de login). */
export function resolveTenantId(user: UserContext): string {
  if (!user.tenantId) {
    throw new ForbiddenException('Tu usuario no tiene una liga asociada.');
  }
  return user.tenantId;
}
