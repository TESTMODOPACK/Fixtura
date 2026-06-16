import { z } from 'zod';

/**
 * Informes para visibilidad del administrador (y delegados, acotado al
 * club). Todos son de SOLO LECTURA. Fase 1: Disciplina.
 */

/** Acumulación de amarillas que dispara una fecha de suspensión. */
export const AMARILLAS_PARA_SUSPENSION = 5;

/** Estado de la multa asociada a una sanción, derivado del cobro. */
export const ESTADO_MULTA_INFORME = ['PAGADO', 'PENDIENTE', 'VENCIDO'] as const;
export type EstadoMultaInforme = (typeof ESTADO_MULTA_INFORME)[number];

// ─── Informe 1: expulsados de una fecha ──────────────────────────────
export const ExpulsadoFechaSchema = z.object({
  incidenciaId: z.uuid(),
  fechaNumero: z.number().int(),
  partidoId: z.uuid(),
  partidoLabel: z.string(), // "Local vs Visita"
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  // 'ROJA' (directa) | 'AMARILLA_ROJA' (doble amarilla)
  tipo: z.enum(['ROJA', 'AMARILLA_ROJA']),
  minuto: z.number().int().nullable(),
  // Sanción generada (si la hay) y su multa.
  fechasSancion: z.number().int().nullable(),
  multaMonto: z.number().int().nullable(),
  multaEstado: z.enum(ESTADO_MULTA_INFORME).nullable(),
});
export type ExpulsadoFecha = z.infer<typeof ExpulsadoFechaSchema>;

// ─── Informe 2: sancionados vigentes ─────────────────────────────────
export const SancionVigenteSchema = z.object({
  sancionId: z.uuid(),
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  torneoNombre: z.string().nullable(),
  motivo: z.string(),
  fechasTotales: z.number().int(),
  fechasCumplidas: z.number().int(),
  fechasPendientes: z.number().int(),
  desdeFechaNumero: z.number().int(),
  // Fecha (número) en la que vuelve a estar habilitado.
  vuelveEnFecha: z.number().int(),
  cumplida: z.boolean(),
  multaMonto: z.number().int().nullable(),
  multaEstado: z.enum(ESTADO_MULTA_INFORME).nullable(),
});
export type SancionVigente = z.infer<typeof SancionVigenteSchema>;

// ─── Informe 3: en riesgo de suspensión por amarillas ────────────────
export const EnRiesgoAmarillaSchema = z.object({
  jugadorId: z.uuid(),
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  amarillas: z.number().int(),
  // Cuántas amarillas más para la próxima fecha de suspensión.
  faltanParaSuspension: z.number().int(),
});
export type EnRiesgoAmarilla = z.infer<typeof EnRiesgoAmarillaSchema>;
