import { z } from 'zod';

/**
 * Vista cross-torneo de actas. El admin de liga necesita ver todas las
 * actas pendientes / cerradas sin tener que navegar torneo por torneo.
 */

export const ESTADO_PARTIDO_GLOBAL = [
  'PROGRAMADO',
  'EN_CURSO',
  'FINALIZADO',
  'SUSPENDIDO_FUERZA_MAYOR',
  'REPROGRAMADO',
  'WALKOVER',
] as const;
export type EstadoPartidoGlobal = (typeof ESTADO_PARTIDO_GLOBAL)[number];

export const ActaResumenSchema = z.object({
  partidoId: z.uuid(),
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  fechaId: z.uuid(),
  fechaNumero: z.number().int(),
  fechaEtiqueta: z.string().nullable(),
  equipoLocalId: z.uuid(),
  equipoLocalNombre: z.string(),
  equipoVisitaId: z.uuid(),
  equipoVisitaNombre: z.string(),
  fechaHora: z.iso.datetime().nullable(),
  canchaNombre: z.string().nullable(),
  estado: z.enum(ESTADO_PARTIDO_GLOBAL),
  golesLocal: z.number().int().nullable(),
  golesVisita: z.number().int().nullable(),
  actaCerradaAt: z.iso.datetime().nullable(),
  incidenciasCount: z.number().int(),
});
export type ActaResumen = z.infer<typeof ActaResumenSchema>;

export const ActasGlobalQuerySchema = z.object({
  torneoId: z.uuid().optional(),
  fechaId: z.uuid().optional(),
  estado: z.enum(ESTADO_PARTIDO_GLOBAL).optional(),
  // 'pendientes' = no cerrada y estado no FINALIZADO/WALKOVER
  // 'cerradas' = actaCerradaAt != null
  filtro: z.enum(['todas', 'pendientes', 'cerradas']).optional(),
});
export type ActasGlobalQuery = z.infer<typeof ActasGlobalQuerySchema>;
