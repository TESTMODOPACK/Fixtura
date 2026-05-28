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
 * Estrategias para suspender una FECHA completa (Sprint 19 v2).
 *
 * Reglas comunes para TODAS las estrategias salvo MANUAL:
 *   1) La fecha original queda en estado SUSPENDIDA + tipo ORIGINAL.
 *   2) Se crea una NUEVA fecha con el mismo `numero` pero tipo
 *      REPROGRAMADA — preserva la referencia "Fecha 3 reprogramada".
 *   3) Los partidos no jugados de la original se mueven a la nueva.
 *
 *   AL_FINAL          → la nueva fecha REPROGRAMADA va después de la
 *                       última fecha programada del torneo. Las demás
 *                       fechas NO se mueven.
 *
 *   TRASNOCHE_DOMINO  → la nueva fecha se intercala entre la suspendida
 *                       y la siguiente. Las posteriores se corren N días
 *                       (default 7) para hacer espacio. Las corridas
 *                       quedan marcadas REPROGRAMADAS para trazabilidad.
 *
 *   REUSAR_EXISTENTE  → no se crea fecha nueva. Los partidos van a una
 *                       fecha ya existente del torneo (`fechaDestinoId`).
 *                       Esa fecha destino queda marcada REPROGRAMADA.
 *
 *   MANUAL            → solo marca la fecha como SUSPENDIDA. El admin
 *                       reprograma cada partido individualmente. NO crea
 *                       fecha REPROGRAMADA. Compat con flujo anterior.
 */
export const ESTRATEGIA_SUSPENSION_FECHA = [
  'AL_FINAL',
  'TRASNOCHE_DOMINO',
  'REUSAR_EXISTENTE',
  'MANUAL',
] as const;
export type EstrategiaSuspensionFecha = (typeof ESTRATEGIA_SUSPENSION_FECHA)[number];

export const ESTRATEGIA_LABEL: Record<EstrategiaSuspensionFecha, string> = {
  AL_FINAL: 'Reprogramar al final del calendario',
  TRASNOCHE_DOMINO: 'Intercalar nueva fecha y correr las siguientes',
  REUSAR_EXISTENTE: 'Reusar una fecha existente',
  MANUAL: 'Solo marcar suspendida (reprogramo a mano)',
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

export const SuspenderFechaSchema = z
  .object({
    motivo: z.enum(MOTIVO_SUSPENSION),
    observaciones: z.string().max(1000).optional().nullable(),
    estrategia: z.enum(ESTRATEGIA_SUSPENSION_FECHA),
    /** Solo TRASNOCHE_DOMINO: días que se corren las fechas siguientes. */
    diasCorrimiento: z.number().int().min(1).max(60).optional(),
    /** Solo REUSAR_EXISTENTE: id de la fecha ya creada que toma los partidos. */
    fechaDestinoId: z.uuid().optional(),
    /**
     * Solo AL_FINAL / TRASNOCHE_DOMINO: fecha de inicio de la nueva
     * fecha REPROGRAMADA. Si no se pasa, el service calcula una en
     * función de la última fecha (AL_FINAL) o del corrimiento (TRASNOCHE_DOMINO).
     */
    fechaInicioReprogramada: z.iso.date().optional(),
  })
  .refine(
    (data) => data.estrategia !== 'REUSAR_EXISTENTE' || !!data.fechaDestinoId,
    {
      message: 'Si la estrategia es REUSAR_EXISTENTE, fechaDestinoId es obligatorio',
      path: ['fechaDestinoId'],
    },
  );
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
