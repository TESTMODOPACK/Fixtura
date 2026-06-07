import { z } from 'zod';

/**
 * Sprint 18 — RF-17 Match Center en vivo.
 *
 * Estados:
 *   IDLE              → partido no empezado o reseteado.
 *   EN_VIVO           → cronómetro corriendo.
 *   PAUSADO           → cronómetro detenido (medio tiempo, lesión, etc.).
 *   FINALIZADO_CENTRO → fin del partido en vivo (todavía falta cierre de acta).
 *
 * El cronómetro real se calcula:
 *   segundos = centroSegundosAcumulados + (EN_VIVO ? now - centroArrancadoAt : 0)
 *
 * El gateway emite cada segundo el snapshot a la room del partido.
 */
export const EstadoCentroSchema = z.enum([
  'IDLE',
  'EN_VIVO',
  'PAUSADO',
  'FINALIZADO_CENTRO',
]);
export type EstadoCentro = z.infer<typeof EstadoCentroSchema>;

export const MatchCenterSnapshotSchema = z.object({
  partidoId: z.uuid(),
  estado: EstadoCentroSchema,
  periodo: z.number().int().min(0),
  minutosPorPeriodo: z.number().int().min(1).max(120),
  // Sprint 29A — descanso entre períodos (config del torneo).
  minutosEntretiempo: z.number().int().min(0).max(60),
  segundosTranscurridos: z.number().int().min(0),
  golesLocal: z.number().int().min(0),
  golesVisita: z.number().int().min(0),
  equipoLocalNombre: z.string(),
  equipoVisitaNombre: z.string(),
  ultimaActualizacion: z.iso.datetime(),
});
export type MatchCenterSnapshot = z.infer<typeof MatchCenterSnapshotSchema>;

export const StartMatchCenterRequestSchema = z.object({
  minutosPorPeriodo: z.number().int().min(1).max(120).optional(),
  // F46.2 — el admin fuerza el inicio aunque hoy no sea el día agendado.
  // Queda registrado en observaciones del partido.
  forzarDia: z.boolean().optional(),
});
export type StartMatchCenterRequest = z.infer<typeof StartMatchCenterRequestSchema>;

export const SumarGolRequestSchema = z.object({
  equipo: z.enum(['LOCAL', 'VISITA']),
});
export type SumarGolRequest = z.infer<typeof SumarGolRequestSchema>;
