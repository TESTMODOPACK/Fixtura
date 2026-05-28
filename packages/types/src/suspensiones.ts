import { z } from 'zod';

/**
 * Sprint 8 — Suspensiones y reprogramaciones de partidos y fechas.
 *
 * Diferenciamos:
 *   - Suspender un PARTIDO individual: queda como SUSPENDIDO_FUERZA_MAYOR
 *     (entry de partido.estado existente) + motivo + observaciones.
 *   - Reprogramar un partido: cambia fechaHora / canchaId y vuelve a
 *     PROGRAMADO, manteniendo el historial.
 *   - Suspender una FECHA completa: estrategia DOMINO / TRASNOCHE / MANUAL.
 */

export const MOTIVO_SUSPENSION = [
  'LLUVIA',
  'CANCHA_NO_DISPONIBLE',
  'FUERZA_MAYOR',
  'DECISION_LIGA',
  'OTRO',
] as const;
export type MotivoSuspension = (typeof MOTIVO_SUSPENSION)[number];

export const MOTIVO_SUSPENSION_LABEL: Record<MotivoSuspension, string> = {
  LLUVIA: 'Lluvia / mal tiempo',
  CANCHA_NO_DISPONIBLE: 'Cancha no disponible',
  FUERZA_MAYOR: 'Fuerza mayor',
  DECISION_LIGA: 'Decisión de la liga',
  OTRO: 'Otro',
};

/**
 * Estrategias para suspender una FECHA completa:
 *
 *   DOMINO     → corre todas las fechas siguientes N días (típico: 7).
 *                Útil si el campeonato no admite huecos. Mantiene el
 *                orden y separación entre fechas.
 *
 *   TRASNOCHE  → crea una "fecha bis" intercalada en una posición
 *                específica del calendario. El resto del calendario NO
 *                se mueve. Útil para recuperar sin afectar otras fechas.
 *
 *   MANUAL     → solo marca la fecha como SUSPENDIDA. El admin
 *                reprograma cada partido a mano a otra fecha existente.
 */
export const ESTRATEGIA_SUSPENSION_FECHA = ['DOMINO', 'TRASNOCHE', 'MANUAL'] as const;
export type EstrategiaSuspensionFecha = (typeof ESTRATEGIA_SUSPENSION_FECHA)[number];

export const ESTRATEGIA_LABEL: Record<EstrategiaSuspensionFecha, string> = {
  DOMINO: 'Efecto dominó (correr fechas)',
  TRASNOCHE: 'Trasnoche (fecha intercalada)',
  MANUAL: 'Solo marcar suspendida',
};

// ── DTOs para partido individual ─────────────────────────────────────

export const SuspenderPartidoSchema = z.object({
  motivo: z.enum(MOTIVO_SUSPENSION),
  observaciones: z.string().max(1000).optional().nullable(),
});
export type SuspenderPartidoRequest = z.infer<typeof SuspenderPartidoSchema>;

export const ReprogramarPartidoSchema = z.object({
  fechaHora: z.iso.datetime(),
  canchaId: z.uuid().optional().nullable(),
  canchaNombre: z.string().max(100).optional().nullable(),
  /** Si true, mantiene las designaciones existentes; si false las borra. */
  mantieneDesignaciones: z.boolean().optional(),
});
export type ReprogramarPartidoRequest = z.infer<typeof ReprogramarPartidoSchema>;

// ── DTOs para suspensión de fecha completa ───────────────────────────

export const SuspenderFechaSchema = z.object({
  motivo: z.enum(MOTIVO_SUSPENSION),
  observaciones: z.string().max(1000).optional().nullable(),
  estrategia: z.enum(ESTRATEGIA_SUSPENSION_FECHA),
  /** Solo para DOMINO: días que se corre el calendario (default 7). */
  diasCorrimiento: z.number().int().min(1).max(60).optional(),
  /**
   * Solo para TRASNOCHE: posición donde insertar la fecha bis. Si la
   * fecha suspendida es la N, esto define el número de la nueva fecha
   * (debe ir entre N y N+1, recomendado N+0.5 → numero=N, etiqueta="bis").
   * Si no se pasa, el service la inserta justo después de la fecha N.
   */
  fechaBisDespuesDeNumero: z.number().int().optional(),
});
export type SuspenderFechaRequest = z.infer<typeof SuspenderFechaSchema>;

// ── Resumen de suspensiones activas (dashboard) ──────────────────────

export const SuspensionResumenSchema = z.object({
  partidosSuspendidos: z.array(
    z.object({
      partidoId: z.uuid(),
      torneoId: z.uuid(),
      torneoNombre: z.string(),
      fechaNumero: z.number().int(),
      equipoLocal: z.string(),
      equipoVisita: z.string(),
      motivo: z.enum(MOTIVO_SUSPENSION).nullable(),
      suspendidoAt: z.iso.datetime().nullable(),
      estado: z.string(),
    }),
  ),
  fechasSuspendidas: z.array(
    z.object({
      fechaId: z.uuid(),
      torneoId: z.uuid(),
      torneoNombre: z.string(),
      numero: z.number().int(),
      etiqueta: z.string().nullable(),
      motivo: z.enum(MOTIVO_SUSPENSION).nullable(),
      suspendidoAt: z.iso.datetime().nullable(),
      estado: z.string(),
    }),
  ),
});
export type SuspensionResumen = z.infer<typeof SuspensionResumenSchema>;
