import { z } from 'zod';

import { ESTADO_PARTIDO, type EstadoPartido } from './public';
import { MOTIVO_SUSPENSION } from './suspensiones';

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
  canchaId: z.uuid().nullable(),
  canchaNombre: z.string().nullable(),
  fechaHora: z.iso.datetime().nullable(),
  estado: z.enum(ESTADO_PARTIDO),
  golesLocal: z.number().int().nullable(),
  golesVisita: z.number().int().nullable(),
  actaCerradaAt: z.iso.datetime().nullable(),
  observaciones: z.string().nullable(),
  // Sprint 8 — trazabilidad de suspensión
  motivoSuspension: z.enum(MOTIVO_SUSPENSION).nullable(),
  suspendidoAt: z.iso.datetime().nullable(),
  observacionesSuspension: z.string().nullable(),
  // F46.4 — certificación de jugadores presentes (requisito para cerrar acta)
  presentesCertificadosAt: z.iso.datetime().nullable(),
});
export type PartidoAdmin = z.infer<typeof PartidoAdminSchema>;

export const UpdatePartidoSchema = z.object({
  // Cambiar de fecha (reprogramar). Útil para drag&drop entre fechas en
  // el editor de fixture admin.
  fechaId: z.uuid().optional(),
  // canchaId: nueva relación formal con tabla canchas.
  canchaId: z.uuid().nullable().optional(),
  // canchaNombre: texto libre (legacy / canchas no catalogadas).
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

// ─── F46.4 — Certificación de jugadores presentes (roster del acta) ──────
export const MOTIVO_INHABILITACION = ['SANCIONADO', 'VETADO', 'INACTIVO'] as const;
export type MotivoInhabilitacion = (typeof MOTIVO_INHABILITACION)[number];

export const RosterJugadorSchema = z.object({
  jugadorId: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  numeroCamiseta: z.number().int().nullable(),
  rut: z.string().nullable(),
  capitan: z.boolean(),
  presente: z.boolean(),
  habilitado: z.boolean(),
  // null si está habilitado; si no, el porqué.
  motivoInhabilitacion: z.enum(MOTIVO_INHABILITACION).nullable(),
});
export type RosterJugador = z.infer<typeof RosterJugadorSchema>;

export const RosterEquipoSchema = z.object({
  inscripcionId: z.uuid(),
  equipoNombre: z.string(),
  jugadores: z.array(RosterJugadorSchema),
});
export type RosterEquipo = z.infer<typeof RosterEquipoSchema>;

export const ActaRosterSchema = z.object({
  partidoId: z.uuid(),
  actaCerradaAt: z.iso.datetime().nullable(),
  presentesCertificadosAt: z.iso.datetime().nullable(),
  local: RosterEquipoSchema,
  visita: RosterEquipoSchema,
});
export type ActaRoster = z.infer<typeof ActaRosterSchema>;

export const CertificarPresentesSchema = z.object({
  // jugadorIds presentes en el partido (ambos equipos). Los no incluidos
  // quedan como NO presentes. Bloquea si alguno no está habilitado.
  jugadorIds: z.array(z.uuid()),
});
export type CertificarPresentesRequest = z.infer<typeof CertificarPresentesSchema>;

/** Listado del fixture en admin: agrupa partidos por fecha. */
export const FechaAdminSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  etiqueta: z.string().nullable(),
  fechaInicio: z.string().nullable().optional(),
  estado: z.enum(['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'SUSPENDIDA', 'REPROGRAMADA']),
  partidos: z.array(PartidoAdminSchema),
  // Sprint 8 — trazabilidad de suspensión de fecha
  motivoSuspension: z.enum(MOTIVO_SUSPENSION).nullable(),
  suspendidoAt: z.iso.datetime().nullable(),
  observacionesSuspension: z.string().nullable(),
  // Sprint 19 — diferencia ORIGINAL vs REPROGRAMADA para coexistencia
  // de Fecha N suspendida + Fecha N reprogramada con mismo número.
  tipoReprogramacion: z.enum(['ORIGINAL', 'REPROGRAMADA']).default('ORIGINAL'),
  reemplazaFechaId: z.uuid().nullable().optional(),
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
