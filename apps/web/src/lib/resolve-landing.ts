import type { Role, UserContext } from '@fixtura/types';

/**
 * Decide a qué ruta debe ir un usuario después del login, según sus roles.
 *
 * Reglas (prioridad de mayor a menor):
 *   1. SUPER_ADMIN → /super-admin
 *   2. Cualquier rol de gestión de liga → /[ligaSlug]/admin
 *   3. TRIBUNAL_DISCIPLINA → /[ligaSlug]/admin/tribunal
 *   4. DELEGADO_EQUIPO → /[ligaSlug]/club
 *   5. ARBITRO, PLANILLERO, PARAMEDICO, SEGURIDAD, MANTENIMIENTO → /[ligaSlug]/personal
 *   6. JUGADOR → /[ligaSlug]/jugador
 *   7. HINCHA → /[ligaSlug]/ (portal público enriquecido)
 *   8. Sin roles aplicables → /[ligaSlug]/
 *
 * Si el usuario no tiene tenantId resoluble, cae al portal genérico /.
 */

const ADMIN_ROLES: Role[] = [
  'LIGA_ADMIN',
  'LIGA_COORDINADOR',
  'LIGA_COORDINADOR_ARBITROS',
  'LIGA_CONTADOR',
  'LIGA_COMERCIAL',
  'RECINTO_ADMIN',
];
const PERSONAL_ROLES: Role[] = ['ARBITRO', 'PLANILLERO', 'PARAMEDICO', 'SEGURIDAD', 'MANTENIMIENTO'];

export function resolveLandingByRole(user: UserContext, ligaSlug: string): string {
  const roles = new Set(user.roles.map((r) => r.role));

  if (roles.has('SUPER_ADMIN')) return '/super-admin';

  const tenantPrefix = `/${ligaSlug}`;

  if (ADMIN_ROLES.some((r) => roles.has(r))) return `${tenantPrefix}/admin`;
  if (roles.has('TRIBUNAL_DISCIPLINA')) return `${tenantPrefix}/admin/tribunal`;
  if (roles.has('DELEGADO_EQUIPO')) return `${tenantPrefix}/club`;
  if (PERSONAL_ROLES.some((r) => roles.has(r))) return `${tenantPrefix}/personal`;
  if (roles.has('JUGADOR')) return `${tenantPrefix}/jugador`;

  // HINCHA o sin rol relevante → al portal público
  return tenantPrefix;
}
