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

export const ESTADO_PARTIDO = [
  'PROGRAMADO',
  'EN_CURSO',
  'FINALIZADO',
  'SUSPENDIDO_FUERZA_MAYOR',
  'REPROGRAMADO',
  'WALKOVER',
  // Partido cuya fecha pasó y no se jugó ni se cargó acta. Lo marca el admin
  // a mano. No suma a la tabla de posiciones ni cuenta como acta pendiente.
  'NO_JUGADO',
] as const;
export type EstadoPartido = (typeof ESTADO_PARTIDO)[number];

/**
 * Partidos EN VIVO del portal de hinchas. Lista los partidos con el Match
 * Center corriendo (EN_VIVO o PAUSADO) en toda la liga, con marcador y
 * cronómetro para mostrarlo actualizándose. El front avanza el reloj local
 * y resincroniza con cada poll (ver useEnVivo).
 */
export const PartidoEnVivoSchema = z.object({
  partidoId: z.uuid(),
  torneoNombre: z.string(),
  torneoSlug: z.string(),
  fechaNumero: z.number().int().nullable(),
  estado: z.enum(['EN_VIVO', 'PAUSADO']),
  periodo: z.number().int().min(0),
  minutosPorPeriodo: z.number().int().min(1).max(120),
  segundosTranscurridos: z.number().int().min(0),
  golesLocal: z.number().int().min(0),
  golesVisita: z.number().int().min(0),
  equipoLocalNombre: z.string(),
  equipoVisitaNombre: z.string(),
  canchaNombre: z.string().nullable(),
});
export type PartidoEnVivo = z.infer<typeof PartidoEnVivoSchema>;

export const EnVivoPublicoSchema = z.object({
  partidos: z.array(PartidoEnVivoSchema),
  actualizadaAt: z.iso.datetime(),
});
export type EnVivoPublico = z.infer<typeof EnVivoPublicoSchema>;

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
  // Solo se muestra nombre + rol de personal confirmado o asistente. La info
  // sensible (carnet, tarifa, contacto) queda en admin.
  arbitros: z
    .array(
      z.object({
        nombre: z.string(),
        apellido: z.string(),
        rol: z.enum([
          'ARBITRO_PRINCIPAL',
          'ARBITRO_ASISTENTE',
          'PLANILLERO',
          'PARAMEDICO',
          'OTRO',
        ]),
      }),
    )
    .default([]),
});
export type PartidoPublico = z.infer<typeof PartidoPublicoSchema>;

export const FixturePublicoSchema = z.object({
  torneo: TorneoPublicoSchema,
  fechas: z.array(
    z.object({
      numero: z.number().int().min(1),
      etiqueta: z.string(),
      // Fecha calendario de la jornada (date-only ISO) y si es una
      // reprogramación, para mostrarlo en el portal público.
      fechaInicio: z.string().nullable(),
      reprogramada: z.boolean(),
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

/**
 * Sprint 36A — Item del hub publico con los datos suficientes para
 * dibujar una card resumen del torneo. NO incluye tabla ni fixture
 * completos (esos viven en los endpoints dedicados); solo metadata
 * + un partido destacado para que el hincha decida si entrar al
 * detalle.
 */
export const TorneoListaPublicoSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  nombre: z.string(),
  temporadaNombre: z.string(),
  estado: z.enum(['ACTIVO', 'CERRADO']),
  fechaActual: z.number().int().min(0),
  fechasTotales: z.number().int().min(0),
  equiposCount: z.number().int().min(0),
  // Categorias (de torneos.categorias_series) — los chips de la card.
  categorias: z.array(
    z.object({
      categoriaId: z.uuid(),
      nombre: z.string(),
      series: z.array(z.string()),
    }),
  ),
  // Si esta ACTIVO: proximo partido programado. Si esta CERRADO:
  // ultimo partido jugado (fecha final del torneo).
  proximoPartidoAt: z.iso.datetime().nullable(),
  ultimoPartidoAt: z.iso.datetime().nullable(),
});
export type TorneoListaPublico = z.infer<typeof TorneoListaPublicoSchema>;

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
