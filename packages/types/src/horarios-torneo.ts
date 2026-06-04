import { z } from 'zod';

/**
 * Sprint 39 — Plantilla de horarios del torneo (por día de semana).
 *
 * `diaSemana`: ISO-8601 (1=Lunes, 7=Domingo).
 * `hora`: HH:MM en 24h (string).
 * `canchaId`: del catálogo de canchas; null permitido para slots sin
 *   cancha asignada (se completa después).
 */
export const DIAS_SEMANA = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const;

export const HoraSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM requerido');

export const HorarioTorneoSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  torneoId: z.uuid(),
  diaSemana: z.number().int().min(1).max(7),
  /** HH:MM (sin segundos en el DTO, normalizado desde TIME). */
  hora: HoraSchema,
  canchaId: z.uuid().nullable(),
  canchaNombre: z.string().nullable(),
  orden: z.number().int().min(0),
  activo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type HorarioTorneo = z.infer<typeof HorarioTorneoSchema>;

export const CreateHorarioTorneoSchema = z.object({
  diaSemana: z.number().int().min(1).max(7),
  hora: HoraSchema,
  canchaId: z.uuid().nullable(),
  orden: z.number().int().min(0).default(0),
  activo: z.boolean().default(true),
});
export type CreateHorarioTorneoRequest = z.infer<typeof CreateHorarioTorneoSchema>;

export const UpdateHorarioTorneoSchema = CreateHorarioTorneoSchema.partial();
export type UpdateHorarioTorneoRequest = z.infer<typeof UpdateHorarioTorneoSchema>;
