import { z } from 'zod';

/**
 * Analytics de la liga (módulo M5, etapa 1). Métricas agregadas sobre los
 * datos que ya tenemos (clubes, jugadores, partidos, cobros, disciplina).
 * NO incluye NPS — eso es la etapa 2 (encuestas).
 *
 * Todo se calcula tenant-scoped en el backend; el front solo grafica.
 */

export const AnalyticsResumenSchema = z.object({
  clubesActivos: z.number().int().nonnegative(),
  jugadoresActivos: z.number().int().nonnegative(),
  partidosJugados: z.number().int().nonnegative(),
  // Montos en pesos enteros (CLP).
  recaudado: z.number().int().nonnegative(),
  pendiente: z.number().int().nonnegative(),
  // Amarillas + rojas en toda la liga.
  tarjetas: z.number().int().nonnegative(),
});
export type AnalyticsResumen = z.infer<typeof AnalyticsResumenSchema>;

/** Punto genérico de una serie (gráfico de barras/líneas). */
export const SeriePuntoSchema = z.object({
  etiqueta: z.string(),
  valor: z.number(),
});
export type SeriePunto = z.infer<typeof SeriePuntoSchema>;

export const AnalyticsCobrosSchema = z.object({
  recaudado: z.number().int().nonnegative(),
  // "Por vencer" y "vencido" son disjuntos: juntos = todo lo no pagado.
  // Así las tres barras del gráfico suman el total facturado, sin solaparse.
  porVencer: z.number().int().nonnegative(),
  vencido: z.number().int().nonnegative(),
});
export type AnalyticsCobros = z.infer<typeof AnalyticsCobrosSchema>;

export const DisciplinaTorneoSchema = z.object({
  torneo: z.string(),
  amarillas: z.number().int().nonnegative(),
  rojas: z.number().int().nonnegative(),
});
export type DisciplinaTorneo = z.infer<typeof DisciplinaTorneoSchema>;

export const AnalyticsAdminSchema = z.object({
  resumen: AnalyticsResumenSchema,
  // Jugadores nuevos por mes (últimos 12 meses, por created_at).
  jugadoresPorMes: z.array(SeriePuntoSchema),
  // Estado financiero de los cobros (montos CLP).
  cobros: AnalyticsCobrosSchema,
  // Tarjetas por torneo (amarillas vs rojas), top por volumen.
  disciplinaPorTorneo: z.array(DisciplinaTorneoSchema),
  // Distribución de jugadores activos por categoría.
  jugadoresPorCategoria: z.array(SeriePuntoSchema),
});
export type AnalyticsAdmin = z.infer<typeof AnalyticsAdminSchema>;
