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

/** Etiqueta humana de cada rol (para UI). */
export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin (plataforma)',
  LIGA_ADMIN: 'Administrador de liga',
  LIGA_COORDINADOR: 'Coordinador deportivo',
  LIGA_COORDINADOR_ARBITROS: 'Coordinador de árbitros',
  LIGA_CONTADOR: 'Contador',
  LIGA_COMERCIAL: 'Comercial / Sponsors',
  RECINTO_ADMIN: 'Admin de recinto',
  TRIBUNAL_DISCIPLINA: 'Tribunal de disciplina',
  DELEGADO_EQUIPO: 'Delegado de equipo',
  ARBITRO: 'Árbitro',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  SEGURIDAD: 'Seguridad',
  MANTENIMIENTO: 'Mantenimiento',
  JUGADOR: 'Jugador',
  HINCHA: 'Hincha',
};

/** Descripción de permisos por rol (para tooltips en UI de gestión). */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  SUPER_ADMIN: 'Acceso total a la plataforma. Puede impersonar a cualquier usuario (excepto otro super admin).',
  LIGA_ADMIN: 'Todo dentro de la liga: usuarios, finanzas, configuración, fixture, designaciones, sponsors.',
  LIGA_COORDINADOR: 'Operación deportiva: torneos, fixture, actas, suspensiones. NO finanzas ni sponsors.',
  LIGA_COORDINADOR_ARBITROS: 'Designaciones de personal y catálogo de árbitros. NO finanzas.',
  LIGA_CONTADOR: 'Módulo financiero, boletas SII, dunning, reportes financieros.',
  LIGA_COMERCIAL: 'Módulo de sponsors y métricas publicitarias. Solo lectura del resto.',
  RECINTO_ADMIN: 'Canchas, reservas, ocupación, precios dinámicos.',
  TRIBUNAL_DISCIPLINA: 'Casos disciplinarios, fallos. Solo lectura del resto.',
  DELEGADO_EQUIPO: 'Roster, pagos y comunicación de su equipo. Scope: equipo.',
  ARBITRO: 'Sus designaciones y planillas digitales. Scope: personal.',
  PLANILLERO: 'Cargar planillas en cancha. Scope: personal.',
  PARAMEDICO: 'Registrar incidentes médicos. Scope: personal.',
  SEGURIDAD: 'Bitácora de incidentes de seguridad. Scope: personal.',
  MANTENIMIENTO: 'Órdenes de trabajo asignadas. Scope: personal.',
  JUGADOR: 'Su perfil, stats, próximos partidos. Scope: personal.',
  HINCHA: 'Lectura del portal público + Fantasy/Polla. Scope: personal.',
};

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
