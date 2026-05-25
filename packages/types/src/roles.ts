import { z } from 'zod';

/**
 * Catálogo completo de roles de Fixtura — 16 roles según ADR-0003.
 *
 * El scope define dónde aplica el rol:
 *   PLATFORM — global, atraviesa todos los tenants (solo SUPER_ADMIN)
 *   TENANT   — alcance de una liga / recinto / federación específica
 *   TEAM     — alcance de un equipo dentro de un tenant (DELEGADO_EQUIPO)
 *   PERSONAL — alcance del usuario mismo (ARBITRO, JUGADOR, etc.)
 */
export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',

  LIGA_ADMIN: 'LIGA_ADMIN',
  LIGA_COORDINADOR: 'LIGA_COORDINADOR',
  LIGA_COORDINADOR_ARBITROS: 'LIGA_COORDINADOR_ARBITROS',
  LIGA_CONTADOR: 'LIGA_CONTADOR',
  LIGA_COMERCIAL: 'LIGA_COMERCIAL',
  RECINTO_ADMIN: 'RECINTO_ADMIN',
  TRIBUNAL_DISCIPLINA: 'TRIBUNAL_DISCIPLINA',

  DELEGADO_EQUIPO: 'DELEGADO_EQUIPO',

  ARBITRO: 'ARBITRO',
  PLANILLERO: 'PLANILLERO',
  PARAMEDICO: 'PARAMEDICO',
  SEGURIDAD: 'SEGURIDAD',
  MANTENIMIENTO: 'MANTENIMIENTO',

  JUGADOR: 'JUGADOR',
  HINCHA: 'HINCHA',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_VALUES = Object.values(ROLE) as readonly Role[];

export const RoleSchema = z.enum(ROLE_VALUES as [Role, ...Role[]]);

export const SCOPE = {
  PLATFORM: 'PLATFORM',
  TENANT: 'TENANT',
  TEAM: 'TEAM',
  PERSONAL: 'PERSONAL',
} as const;

export type Scope = (typeof SCOPE)[keyof typeof SCOPE];
export const ScopeSchema = z.enum(['PLATFORM', 'TENANT', 'TEAM', 'PERSONAL']);

/** Scope canónico de cada rol — usado para validaciones de runtime. */
export const ROLE_SCOPE: Record<Role, Scope> = {
  SUPER_ADMIN: 'PLATFORM',

  LIGA_ADMIN: 'TENANT',
  LIGA_COORDINADOR: 'TENANT',
  LIGA_COORDINADOR_ARBITROS: 'TENANT',
  LIGA_CONTADOR: 'TENANT',
  LIGA_COMERCIAL: 'TENANT',
  RECINTO_ADMIN: 'TENANT',
  TRIBUNAL_DISCIPLINA: 'TENANT',

  DELEGADO_EQUIPO: 'TEAM',

  ARBITRO: 'PERSONAL',
  PLANILLERO: 'PERSONAL',
  PARAMEDICO: 'PERSONAL',
  SEGURIDAD: 'PERSONAL',
  MANTENIMIENTO: 'PERSONAL',
  JUGADOR: 'PERSONAL',
  HINCHA: 'PERSONAL',
};
