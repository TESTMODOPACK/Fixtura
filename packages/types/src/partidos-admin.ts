import { z } from 'zod';

import { ESTADO_PARTIDO, type EstadoPartido } from './public';

/**
 * DTOs admin para partidos y actas.
 */

export const PartidoAdminSchema = z.object({
  id: z.uuid(),
  fechaId: z.uuid(),
  fechaNumero: z.number().int(),
  fechaEtiqueta: z.string().nullable(),
  equipoLocalId: z.uuid(),
  equipoLocalNombre: z.string(),
  equipoVisitaId: z.uuid(),
  equipoVisitaNombre: z.string(),
  canchaNombre: z.string().nullable(),
  fechaHora: z.iso.datetime().nullable(),
  estado: z.enum(ESTADO_PARTIDO),
  golesLocal: z.number().int().nullable(),
  golesVisita: z.number().int().nullable(),
  actaCerradaAt: z.iso.datetime().nullable(),
  observaciones: z.string().nullable(),
});
export type PartidoAdmin = z.infer<typeof PartidoAdminSchema>;

export const UpdatePartidoSchema = z.object({
  canchaNombre: z.string().max(100).nullable().optional(),
  fechaHora: z.iso.datetime().nullable().optional(),
  estado: z.enum(ESTADO_PARTIDO).optional(),
  observaciones: z.string().max(2000).nullable().optional(),
});
export type UpdatePartidoRequest = z.infer<typeof UpdatePartidoSchema>;

export const TIPO_INCIDENCIA = [
  'GOL',
  'AUTOGOL',
  'AMARILLA',
  'ROJA',
  'AMARILLA_ROJA',
  'CAMBIO',
  'MVP',
  'ASISTENCIA',
  'LESION',
] as const;
export type TipoIncidencia = (typeof TIPO_INCIDENCIA)[number];

export const CreateIncidenciaSchema = z.object({
  equipoId: z.uuid(),
  jugadorInscritoId: z.uuid().nullable(),
  tipo: z.enum(TIPO_INCIDENCIA),
  minuto: z.number().int().min(0).max(150).nullable().optional(),
});
export type CreateIncidenciaRequest = z.infer<typeof CreateIncidenciaSchema>;

export const IncidenciaAdminSchema = z.object({
  id: z.uuid(),
  equipoId: z.uuid(),
  equipoNombre: z.string(),
  jugadorInscritoId: z.uuid().nullable(),
  jugadorNombre: z.string().nullable(),
  tipo: z.enum(TIPO_INCIDENCIA),
  minuto: z.number().int().nullable(),
});
export type IncidenciaAdmin = z.infer<typeof IncidenciaAdminSchema>;

export const PartidoDetalleSchema = PartidoAdminSchema.extend({
  incidencias: z.array(IncidenciaAdminSchema),
});
export type PartidoDetalle = z.infer<typeof PartidoDetalleSchema>;

export const CerrarActaSchema = z.object({
  golesLocal: z.number().int().min(0).max(99),
  golesVisita: z.number().int().min(0).max(99),
  observaciones: z.string().max(2000).nullable().optional(),
});
export type CerrarActaRequest = z.infer<typeof CerrarActaSchema>;

/** Listado del fixture en admin: agrupa partidos por fecha. */
export const FechaAdminSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  etiqueta: z.string().nullable(),
  estado: z.enum(['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'SUSPENDIDA', 'REPROGRAMADA']),
  partidos: z.array(PartidoAdminSchema),
});
export type FechaAdmin = z.infer<typeof FechaAdminSchema>;

export const FixtureAdminSchema = z.object({
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  fechas: z.array(FechaAdminSchema),
});
export type FixtureAdminFull = z.infer<typeof FixtureAdminSchema>;

// Re-export para conveniencia
export type { EstadoPartido };
