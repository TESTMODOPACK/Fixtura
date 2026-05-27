import { z } from 'zod';

/**
 * Sponsors: banners del cliente que aparecen en el portal público.
 *
 * El cliente sube banners desde /admin/sponsors. Cada banner tiene una
 * posición (HOME_HERO, HEADER, SIDEBAR, FOOTER), vigencia opcional y
 * un toggle activo. El portal público los carga ordenados por
 * prioridad DESC.
 */

export const POSICION_SPONSOR = [
  'HOME_HERO',
  'HEADER',
  'SIDEBAR',
  'FOOTER',
] as const;
export type PosicionSponsor = (typeof POSICION_SPONSOR)[number];

export const POSICION_LABEL: Record<PosicionSponsor, string> = {
  HOME_HERO: 'Hero principal de la home',
  HEADER: 'Banner del header',
  SIDEBAR: 'Barra lateral',
  FOOTER: 'Pie de página',
};

export const SponsorAdminSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  imagenUrl: z.string(),
  linkUrl: z.string().nullable(),
  posicion: z.enum(POSICION_SPONSOR),
  prioridad: z.number().int(),
  vigenteDesde: z.string().nullable(),
  vigenteHasta: z.string().nullable(),
  activo: z.boolean(),
  impresionesCount: z.number().int(),
  clicksCount: z.number().int(),
  notas: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type SponsorAdmin = z.infer<typeof SponsorAdminSchema>;

export const CreateSponsorSchema = z.object({
  nombre: z.string().min(2).max(150),
  imagenUrl: z.string().url().max(500),
  linkUrl: z.union([z.literal(''), z.string().url().max(500)]).optional().nullable(),
  posicion: z.enum(POSICION_SPONSOR),
  prioridad: z.number().int().min(0).max(1000).optional(),
  vigenteDesde: z.string().optional().nullable(),
  vigenteHasta: z.string().optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
});
export type CreateSponsorRequest = z.infer<typeof CreateSponsorSchema>;

export const UpdateSponsorSchema = CreateSponsorSchema.partial().extend({
  activo: z.boolean().optional(),
});
export type UpdateSponsorRequest = z.infer<typeof UpdateSponsorSchema>;

/**
 * Vista pública de un sponsor — sin counts de tracking ni vigencias
 * (el filtrado se hace en backend), solo lo necesario para renderizar
 * el banner.
 */
export const SponsorPublicoSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  imagenUrl: z.string(),
  linkUrl: z.string().nullable(),
  posicion: z.enum(POSICION_SPONSOR),
});
export type SponsorPublico = z.infer<typeof SponsorPublicoSchema>;
