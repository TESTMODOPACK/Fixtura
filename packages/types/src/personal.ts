import { z } from 'zod';

/**
 * Personal operativo de la liga: árbitros, planilleros, paramédicos.
 * El catálogo es por tenant (cada liga tiene los suyos).
 */

export const ROL_PERSONAL = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
  'PLANILLERO',
  'PARAMEDICO',
  'OTRO',
] as const;
export type RolPersonal = (typeof ROL_PERSONAL)[number];

/**
 * Roles que se asignan a un partido específico. Paramédico y "otro"
 * son personal del RECINTO (cubre toda la jornada de la cancha, no un
 * partido individual) — quedan fuera de las designaciones por partido.
 */
export const ROLES_DESIGNABLES_PARTIDO = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
  'PLANILLERO',
] as const;
export type RolDesignablePartido = (typeof ROLES_DESIGNABLES_PARTIDO)[number];

/**
 * Cuántos slots de cada rol se necesitan por partido. Estándar ANFA:
 *   - 1 árbitro principal
 *   - 2 árbitros asistentes (uno por línea)
 *   - 1 planillero
 *
 * La auto-asignación itera estos slots. La UI muestra exactamente esta
 * cantidad de filas por partido y rol.
 */
export const SLOTS_POR_ROL: Record<RolDesignablePartido, number> = {
  ARBITRO_PRINCIPAL: 1,
  ARBITRO_ASISTENTE: 2,
  PLANILLERO: 1,
};

/**
 * Roles asignables al RECINTO (toda la jornada de una cancha, no por
 * partido). Típicamente: paramédico y personal de servicio.
 */
export const ROLES_DESIGNABLES_RECINTO = [
  'PARAMEDICO',
  'OTRO',
] as const;
export type RolDesignableRecinto = (typeof ROLES_DESIGNABLES_RECINTO)[number];

/**
 * Roles arbitrales que requieren carnet ANFA vigente. Usado para
 * computar warnings en designaciones.
 */
export const ROLES_ARBITRAJE = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
] as const;
export type RolArbitraje = (typeof ROLES_ARBITRAJE)[number];

export const PersonalAdminSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  nombre: z.string(),
  apellido: z.string(),
  rut: z.string().nullable(),
  rol: z.enum(ROL_PERSONAL),
  telefono: z.string().nullable(),
  email: z.string().nullable(),
  tarifaBase: z.number().int().nullable(),
  carnetAnfaNumero: z.string().nullable(),
  // ISO date YYYY-MM-DD o null
  carnetAnfaVence: z.string().nullable(),
  activo: z.boolean(),
  notas: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type PersonalAdmin = z.infer<typeof PersonalAdminSchema>;

export const CreatePersonalSchema = z.object({
  nombre: z.string().min(2).max(100),
  apellido: z.string().min(2).max(100),
  rut: z.string().max(20).optional().nullable(),
  rol: z.enum(ROL_PERSONAL),
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email().max(150).optional().nullable(),
  tarifaBase: z.number().int().min(0).optional().nullable(),
  carnetAnfaNumero: z.string().max(50).optional().nullable(),
  carnetAnfaVence: z.string().optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
});
export type CreatePersonalRequest = z.infer<typeof CreatePersonalSchema>;

export const UpdatePersonalSchema = CreatePersonalSchema.partial().extend({
  activo: z.boolean().optional(),
});
export type UpdatePersonalRequest = z.infer<typeof UpdatePersonalSchema>;
