import { z } from 'zod';

/**
 * Tipos del PORTAL PÚBLICO de una liga (sin auth).
 *
 * Los endpoints viven bajo /api/v1/public/:ligaSlug/...
 */

export const LigaPublicaSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  nombre: z.string(),
  brandingJson: z.record(z.string(), z.unknown()),
});
export type LigaPublica = z.infer<typeof LigaPublicaSchema>;

export const TorneoPublicoSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  temporada: z.string(),
  estado: z.enum(['DRAFT', 'ACTIVO', 'CERRADO']),
  fechaActual: z.number().int().min(0),
  fechasTotales: z.number().int().min(0),
});
export type TorneoPublico = z.infer<typeof TorneoPublicoSchema>;

export const FilaTablaSchema = z.object({
  posicion: z.number().int().min(1),
  equipoId: z.string(),
  equipoNombre: z.string(),
  equipoSlug: z.string(),
  escudoUrl: z.url().nullable(),
  pj: z.number().int().min(0),
  pg: z.number().int().min(0),
  pe: z.number().int().min(0),
  pp: z.number().int().min(0),
  gf: z.number().int().min(0),
  gc: z.number().int().min(0),
  dg: z.number().int(),
  pts: z.number().int().min(0),
});
export type FilaTabla = z.infer<typeof FilaTablaSchema>;

export const TablaPosicionesSchema = z.object({
  torneo: TorneoPublicoSchema,
  filas: z.array(FilaTablaSchema),
  actualizadaAt: z.iso.datetime(),
});
export type TablaPosiciones = z.infer<typeof TablaPosicionesSchema>;

export const ESTADO_PARTIDO = ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO', 'SUSPENDIDO', 'WALKOVER'] as const;
export type EstadoPartido = (typeof ESTADO_PARTIDO)[number];

export const PartidoPublicoSchema = z.object({
  id: z.uuid(),
  fechaNumero: z.number().int().min(1),
  fechaHora: z.iso.datetime(),
  estado: z.enum(ESTADO_PARTIDO),
  local: z.object({
    equipoId: z.string(),
    nombre: z.string(),
    slug: z.string(),
    escudoUrl: z.url().nullable(),
    goles: z.number().int().min(0).nullable(),
  }),
  visita: z.object({
    equipoId: z.string(),
    nombre: z.string(),
    slug: z.string(),
    escudoUrl: z.url().nullable(),
    goles: z.number().int().min(0).nullable(),
  }),
  canchaNombre: z.string().nullable(),
});
export type PartidoPublico = z.infer<typeof PartidoPublicoSchema>;

export const FixturePublicoSchema = z.object({
  torneo: TorneoPublicoSchema,
  fechas: z.array(
    z.object({
      numero: z.number().int().min(1),
      etiqueta: z.string(),
      partidos: z.array(PartidoPublicoSchema),
    }),
  ),
});
export type FixturePublico = z.infer<typeof FixturePublicoSchema>;

export const RankingItemSchema = z.object({
  posicion: z.number().int().min(1),
  jugadorId: z.string(),
  jugadorNombre: z.string(),
  jugadorSlug: z.string(),
  fotoUrl: z.url().nullable(),
  equipoNombre: z.string(),
  equipoSlug: z.string(),
  valor: z.number().int().min(0),
});
export type RankingItem = z.infer<typeof RankingItemSchema>;

export const RankingSchema = z.object({
  torneo: TorneoPublicoSchema,
  tipo: z.enum(['GOLEADORES', 'ASISTENCIAS', 'MVP', 'FAIR_PLAY']),
  items: z.array(RankingItemSchema),
});
export type Ranking = z.infer<typeof RankingSchema>;

export const ResumenLigaSchema = z.object({
  liga: LigaPublicaSchema,
  torneoActivo: TorneoPublicoSchema.nullable(),
  proximaFecha: z
    .object({
      numero: z.number().int().min(1),
      etiqueta: z.string(),
      partidos: z.array(PartidoPublicoSchema),
    })
    .nullable(),
  resultadosRecientes: z.array(PartidoPublicoSchema),
  topGoleadores: z.array(RankingItemSchema),
});
export type ResumenLiga = z.infer<typeof ResumenLigaSchema>;
