import type { Role, UserContext } from '@fixtura/types';

/**
 * Helpers de permisos a partir del UserContext.
 * Convención: cada método retorna boolean. Los handlers de Nest delegan
 * aquí en lugar de duplicar comparaciones de roles en cada endpoint.
 */

export function tieneRol(ctx: UserContext, ...roles: Role[]): boolean {
  return ctx.roles.some((r) => roles.includes(r.role));
}

export function esSuperAdmin(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN');
}

export function puedeGestionarFinanzas(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN', 'LIGA_ADMIN', 'LIGA_CONTADOR');
}

export function puedeDesignarPersonal(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN', 'LIGA_ADMIN', 'LIGA_COORDINADOR_ARBITROS');
}

export function puedeConfigurarTorneo(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN', 'LIGA_ADMIN', 'LIGA_COORDINADOR');
}

export function puedeCerrarActa(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN', 'LIGA_ADMIN', 'LIGA_COORDINADOR', 'ARBITRO', 'PLANILLERO');
}

export function puedeGestionarSponsors(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN', 'LIGA_ADMIN', 'LIGA_COMERCIAL');
}

export function puedeJuzgarTribunal(ctx: UserContext): boolean {
  return tieneRol(ctx, 'SUPER_ADMIN', 'LIGA_ADMIN', 'TRIBUNAL_DISCIPLINA');
}
