import { z } from 'zod';

/**
 * Sanciones disciplinarias — tipos compartidos.
 *
 * REGLA CRÍTICA (anexo correcciones del documento maestro):
 * Las sanciones se aplican sobre RUT × torneo_id, NO sobre equipo. Un
 * jugador que cambia de club dentro del mismo torneo no elude la sanción
 * porque la búsqueda es por RUT en sanciones_activas.
 */

export const MOTIVO_SANCION = [
  'ACUMULACION_AMARILLAS',
  'ROJA_DIRECTA',
  'DOBLE_AMARILLA',
  'TRIBUNAL',
] as const;
export type MotivoSancion = (typeof MOTIVO_SANCION)[number];

export const SancionAdminSchema = z.object({
  id: z.uuid(),
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  jugadorInscritoId: z.uuid().nullable(),
  jugadorNombre: z.string().nullable(),
  jugadorApellido: z.string().nullable(),
  equipoNombre: z.string().nullable(),
  rut: z.string().nullable(),
  motivo: z.enum(MOTIVO_SANCION),
  fechasPendientes: z.number().int().min(0),
  desdeFechaNumero: z.number().int().min(1),
  descripcion: z.string().nullable(),
  cumplida: z.boolean(),
  origenIncidenciaPartidoId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type SancionAdmin = z.infer<typeof SancionAdminSchema>;

/** Crear sanción manual desde Tribunal de Disciplina. */
export const CreateSancionTribunalSchema = z.object({
  jugadorInscritoId: z.uuid(),
  fechasSuspension: z.number().int().min(1).max(20),
  descripcion: z.string().min(3).max(1000),
  desdeFechaNumero: z.number().int().min(1).optional(),
  /**
   * Sprint 26H (ADR-0004) — Si true, además de la suspensión por fechas
   * agrega el RUT del jugador a la lista negra de la liga (vetado de
   * por vida cross-torneos). Útil para expulsiones definitivas.
   * Default false. Idempotente: si el RUT ya está vetado, no falla.
   */
  vetoPermanente: z.boolean().default(false),
});
export type CreateSancionTribunalRequest = z.infer<typeof CreateSancionTribunalSchema>;

/**
 * Resultado del cierre de acta — qué sanciones se crearon
 * automáticamente. Se devuelve al cliente para feedback visual.
 */
export const SancionesAutoResultSchema = z.object({
  nuevas: z.array(SancionAdminSchema),
  totalGeneradas: z.number().int(),
});
export type SancionesAutoResult = z.infer<typeof SancionesAutoResultSchema>;
