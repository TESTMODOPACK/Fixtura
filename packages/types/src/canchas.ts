import { z } from 'zod';

/**
 * Canchas: catálogo físico de espacios donde se juega.
 *
 * Cada liga registra sus canchas con metadatos operativos. Por ahora el
 * uso es informativo (mostrar dirección/iluminación, ranking de ocupación
 * futuro). En sprint posterior se enlazará `partido.cancha_id → canchas.id`
 * para validar disponibilidad cruzada.
 */

export const SUPERFICIE_CANCHA = [
  'PASTO_NATURAL',
  'PASTO_SINTETICO',
  'CEMENTO',
  'TIERRA',
  'OTRA',
] as const;
export type SuperficieCancha = (typeof SUPERFICIE_CANCHA)[number];

export const SUPERFICIE_LABEL: Record<SuperficieCancha, string> = {
  PASTO_NATURAL: 'Pasto natural',
  PASTO_SINTETICO: 'Pasto sintético',
  CEMENTO: 'Cemento',
  TIERRA: 'Tierra',
  OTRA: 'Otra',
};

export const CanchaAdminSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  direccion: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  capacidad: z.number().int().nullable(),
  superficie: z.enum(SUPERFICIE_CANCHA),
  iluminacion: z.boolean(),
  tieneCamarines: z.boolean(),
  observaciones: z.string().nullable(),
  activa: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type CanchaAdmin = z.infer<typeof CanchaAdminSchema>;

export const CreateCanchaSchema = z.object({
  nombre: z.string().min(2).max(150),
  direccion: z.string().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  capacidad: z.number().int().min(0).max(200000).optional().nullable(),
  superficie: z.enum(SUPERFICIE_CANCHA).optional(),
  iluminacion: z.boolean().optional(),
  tieneCamarines: z.boolean().optional(),
  observaciones: z.string().max(1000).optional().nullable(),
});
export type CreateCanchaRequest = z.infer<typeof CreateCanchaSchema>;

export const UpdateCanchaSchema = CreateCanchaSchema.partial().extend({
  activa: z.boolean().optional(),
});
export type UpdateCanchaRequest = z.infer<typeof UpdateCanchaSchema>;

/**
 * Ocupación: partidos programados por cancha en un rango de fechas.
 * Alimenta la vista calendario `/admin/canchas/ocupacion`.
 */
export const OcupacionPartidoSchema = z.object({
  partidoId: z.uuid(),
  torneoId: z.uuid(),
  fechaHora: z.iso.datetime(),
  // Duración estimada en minutos (default 90 — fixturizable después).
  duracionMin: z.number().int().positive(),
  equipoLocal: z.string(),
  equipoVisita: z.string(),
  torneoNombre: z.string(),
  estado: z.string(),
});
export type OcupacionPartido = z.infer<typeof OcupacionPartidoSchema>;

export const OcupacionCanchaSchema = z.object({
  canchaId: z.uuid(),
  canchaNombre: z.string(),
  partidos: z.array(OcupacionPartidoSchema),
});
export type OcupacionCancha = z.infer<typeof OcupacionCanchaSchema>;
