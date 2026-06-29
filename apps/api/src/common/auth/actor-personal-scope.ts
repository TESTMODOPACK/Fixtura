import { ROLE, type UserContext } from '@fixtura/types';

const ROLES_LIGA: string[] = [
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.LIGA_COORDINADOR_ARBITROS,
  ROLE.SUPER_ADMIN,
];

/**
 * SEC-3 — Personal del actor que requiere designación para operar un partido
 * (acta o match center). `null` ⇒ rol de liga (admin/coordinador/super): sin
 * restricción. Para ARBITRO/PLANILLERO devuelve sus personalId (scopeId del rol
 * PERSONAL); el caller exige una designación en el partido. RLS no aísla
 * intra-tenant, por eso la validación es explícita en el handler.
 */
export function actorPersonalScope(user: UserContext): string[] | null {
  const esLiga = user.roles.some((r) => ROLES_LIGA.includes(r.role));
  if (esLiga) return null;
  return user.roles
    .filter((r) => (r.role === ROLE.ARBITRO || r.role === ROLE.PLANILLERO) && r.scopeId)
    .map((r) => r.scopeId as string);
}
