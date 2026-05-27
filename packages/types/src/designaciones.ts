import { z } from 'zod';

import { ROL_PERSONAL, ROLES_DESIGNABLES_PARTIDO } from './personal';

export const ESTADO_DESIGNACION = [
  'PROPUESTA',
  'CONFIRMADA',
  'RECHAZADA',
  'ASISTIO',
  'AUSENTE',
] as const;
export type EstadoDesignacion = (typeof ESTADO_DESIGNACION)[number];

export const DesignacionAdminSchema = z.object({
  id: z.uuid(),
  partidoId: z.uuid(),
  personalId: z.uuid(),
  personalNombre: z.string(),
  personalApellido: z.string(),
  personalRolBase: z.enum(ROL_PERSONAL),
  carnetAnfaVence: z.string().nullable(),
  rolAsignado: z.enum(ROLES_DESIGNABLES_PARTIDO),
  estado: z.enum(ESTADO_DESIGNACION),
  montoPago: z.number().int().nullable(),
  confirmadoAt: z.iso.datetime().nullable(),
  notas: z.string().nullable(),
  conflictoDobleBooking: z.boolean(),
  carnetAnfaWarning: z.enum(['VENCIDO', 'POR_VENCER', 'OK', 'NO_APLICA']),
  createdAt: z.iso.datetime(),
});
export type DesignacionAdmin = z.infer<typeof DesignacionAdminSchema>;

export const AsignarDesignacionSchema = z.object({
  partidoId: z.uuid(),
  personalId: z.uuid(),
  // Solo árbitros y planillero — paramédico y "otro" son del recinto.
  rolAsignado: z.enum(ROLES_DESIGNABLES_PARTIDO),
  montoPago: z.number().int().min(0).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
});
export type AsignarDesignacionRequest = z.infer<typeof AsignarDesignacionSchema>;

export const UpdateDesignacionEstadoSchema = z.object({
  estado: z.enum(ESTADO_DESIGNACION),
});
export type UpdateDesignacionEstadoRequest = z.infer<
  typeof UpdateDesignacionEstadoSchema
>;

/** Vista por fecha: lista de partidos con sus designaciones agrupadas. */
export const DesignacionesPorFechaSchema = z.object({
  fechaId: z.uuid(),
  fechaNumero: z.number().int(),
  fechaEtiqueta: z.string().nullable(),
  partidos: z.array(
    z.object({
      partidoId: z.uuid(),
      equipoLocalNombre: z.string(),
      equipoVisitaNombre: z.string(),
      fechaHora: z.iso.datetime().nullable(),
      canchaNombre: z.string().nullable(),
      designaciones: z.array(DesignacionAdminSchema),
    }),
  ),
});
export type DesignacionesPorFecha = z.infer<typeof DesignacionesPorFechaSchema>;

/**
 * Request para auto-asignar árbitros a los partidos de una fecha.
 * - roles: qué roles cubrir. Default: ['ARBITRO_PRINCIPAL'].
 * - sobreescribir: si ya hay alguien asignado en ese rol, ¿reemplazar?
 *   Default false — solo cubre partidos sin designar.
 */
export const AutoAsignarSchema = z.object({
  roles: z.array(z.enum(ROLES_DESIGNABLES_PARTIDO)).min(1).optional(),
  sobreescribir: z.boolean().optional(),
});
export type AutoAsignarRequest = z.infer<typeof AutoAsignarSchema>;

export const AutoAsignarResultSchema = z.object({
  // Designaciones nuevas creadas (con su partido_id + personal asignado).
  asignados: z.array(
    z.object({
      partidoId: z.uuid(),
      rolAsignado: z.enum(ROLES_DESIGNABLES_PARTIDO),
      personalId: z.uuid(),
      personalNombre: z.string(),
      personalApellido: z.string(),
    }),
  ),
  // Partidos+rol donde no se pudo asignar (sin árbitros disponibles).
  sinDisponibilidad: z.array(
    z.object({
      partidoId: z.uuid(),
      rolAsignado: z.enum(ROLES_DESIGNABLES_PARTIDO),
      motivo: z.string(),
    }),
  ),
  // Partidos+rol que ya tenían designación y no se sobreescribió.
  yaAsignados: z.array(
    z.object({
      partidoId: z.uuid(),
      rolAsignado: z.enum(ROLES_DESIGNABLES_PARTIDO),
    }),
  ),
});
export type AutoAsignarResult = z.infer<typeof AutoAsignarResultSchema>;
