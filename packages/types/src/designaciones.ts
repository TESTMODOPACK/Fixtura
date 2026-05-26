import { z } from 'zod';

import { ROL_PERSONAL } from './personal';

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
  rolAsignado: z.enum(ROL_PERSONAL),
  estado: z.enum(ESTADO_DESIGNACION),
  montoPago: z.number().int().nullable(),
  confirmadoAt: z.iso.datetime().nullable(),
  notas: z.string().nullable(),
  // Cruce con otros partidos del mismo personal a la misma hora (warning UI)
  conflictoDobleBooking: z.boolean(),
  // Carnet ANFA vencido o por vencer (<30 días) cuando aplica al rol arbitral
  carnetAnfaWarning: z.enum(['VENCIDO', 'POR_VENCER', 'OK', 'NO_APLICA']),
  createdAt: z.iso.datetime(),
});
export type DesignacionAdmin = z.infer<typeof DesignacionAdminSchema>;

export const AsignarDesignacionSchema = z.object({
  partidoId: z.uuid(),
  personalId: z.uuid(),
  rolAsignado: z.enum(ROL_PERSONAL),
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
