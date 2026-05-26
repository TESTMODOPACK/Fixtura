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
