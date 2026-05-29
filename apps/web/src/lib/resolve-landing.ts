import type { Role, UserContext } from '@fixtura/types';

/**
 * Decide a qué ruta debe ir un usuario después del login, según sus roles.
 *
 * Como ahora cada tenant tiene su propio dominio, las rutas son FLAT
 * (no incluyen ligaSlug). El path retornado se resuelve sobre el
 * mismo hostname desde donde se hizo login.
 *
 * Reglas (prioridad de mayor a menor):
 *   1. SUPER_ADMIN → /admin/super (Sprint 23: ruta del panel plataforma)
 *   2. Roles de gestión de liga → /admin
 *   3. TRIBUNAL_DISCIPLINA → /admin/tribunal
 *   4. DELEGADO_EQUIPO → /club
 *   5. ARBITRO, PLANILLERO, PARAMEDICO, SEGURIDAD, MANTENIMIENTO → /personal
 *   6. JUGADOR → /jugador
 *   7. HINCHA / sin roles aplicables → / (portal público)
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

export function resolveLandingByRole(user: UserContext): string {
  const roles = new Set(user.roles.map((r) => r.role));

  // Bug 2026-05-29: antes redirigía a /super-admin que no existe en
  // Next (404). La ruta real del panel super admin es /admin/super.
  if (roles.has('SUPER_ADMIN')) return '/admin/super';
  if (ADMIN_ROLES.some((r) => roles.has(r))) return '/admin';
  if (roles.has('TRIBUNAL_DISCIPLINA')) return '/admin/tribunal';
  if (roles.has('DELEGADO_EQUIPO')) return '/club';
  if (PERSONAL_ROLES.some((r) => roles.has(r))) return '/personal';
  if (roles.has('JUGADOR')) return '/jugador';

  return '/'; // HINCHA o sin rol relevante → portal público
}
