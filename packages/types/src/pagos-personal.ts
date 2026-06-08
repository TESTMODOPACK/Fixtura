import { z } from 'zod';

import { ROL_PERSONAL, TIPO_CUENTA_BANCARIA } from './personal';

/**
 * F47 (ADR-0006) — Pagos a personal (cuentas por pagar).
 *
 * Devengo: una designación genera deuda cuando su estado pasa a ASISTIO.
 * El monto adeudado es `Designacion.montoPago` (heredado de la tarifa base
 * del personal, editable por designación).
 *
 * Cuenta pendiente = designación ASISTIO con `liquidacion_id` NULL.
 * Pagar = crear una `LiquidacionPersonal` que agrupa N designaciones de una
 * misma persona; cada designación queda con `liquidacion_id` apuntando a ella.
 * Revertir = eliminar la liquidación (ON DELETE SET NULL las libera).
 */

export const METODO_PAGO_LIQUIDACION = [
  'TRANSFERENCIA',
  'EFECTIVO',
  'OTRO',
] as const;
export type MetodoPagoLiquidacion = (typeof METODO_PAGO_LIQUIDACION)[number];

export const METODO_PAGO_LIQUIDACION_LABEL: Record<
  MetodoPagoLiquidacion,
  string
> = {
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO: 'Efectivo',
  OTRO: 'Otro',
};

/** Una designación ASISTIO pendiente de pago (línea de cuenta por pagar). */
export const DesignacionPendientePagoSchema = z.object({
  designacionId: z.uuid(),
  partidoId: z.uuid(),
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  fechaNumero: z.number().int().nullable(),
  fechaHora: z.iso.datetime().nullable(),
  equipoLocalNombre: z.string(),
  equipoVisitaNombre: z.string(),
  rolAsignado: z.string(),
  monto: z.number().int(),
});
export type DesignacionPendientePago = z.infer<
  typeof DesignacionPendientePagoSchema
>;

/** Cuenta por pagar agrupada por persona: lo que se le debe en total. */
export const CuentaPorPagarPersonaSchema = z.object({
  personalId: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  rut: z.string().nullable(),
  rol: z.enum(ROL_PERSONAL),
  // Designaciones ASISTIO sin liquidar.
  designacionesCount: z.number().int(),
  totalPendiente: z.number().int(),
  detalle: z.array(DesignacionPendientePagoSchema),
});
export type CuentaPorPagarPersona = z.infer<
  typeof CuentaPorPagarPersonaSchema
>;

export const CuentasPorPagarResumenSchema = z.object({
  personas: z.array(CuentaPorPagarPersonaSchema),
  totalPendienteGlobal: z.number().int(),
  // Designaciones ASISTIO sin montoPago definido (no se pueden liquidar).
  sinMontoCount: z.number().int(),
});
export type CuentasPorPagarResumen = z.infer<
  typeof CuentasPorPagarResumenSchema
>;

/** Una liquidación (pago) ya registrada. */
export const LiquidacionPersonalSchema = z.object({
  id: z.uuid(),
  personalId: z.uuid(),
  personalNombre: z.string(),
  personalApellido: z.string(),
  total: z.number().int(),
  metodoPago: z.enum(METODO_PAGO_LIQUIDACION),
  comprobante: z.string().nullable(),
  observaciones: z.string().nullable(),
  fechaPago: z.string(), // YYYY-MM-DD
  designacionesCount: z.number().int(),
  createdByNombre: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type LiquidacionPersonal = z.infer<typeof LiquidacionPersonalSchema>;

/** Detalle de una liquidación: la cabecera + las designaciones que saldó. */
export const LiquidacionPersonalDetalleSchema = LiquidacionPersonalSchema.extend(
  {
    detalle: z.array(DesignacionPendientePagoSchema),
  },
);
export type LiquidacionPersonalDetalle = z.infer<
  typeof LiquidacionPersonalDetalleSchema
>;

/**
 * Crear una liquidación. `designacionIds` deben ser todas de la misma persona,
 * en estado ASISTIO y sin liquidar; el backend valida y calcula el `total`
 * como snapshot (no se confía en un total provisto por el cliente).
 */
export const CrearLiquidacionSchema = z.object({
  personalId: z.uuid(),
  designacionIds: z.array(z.uuid()).min(1),
  metodoPago: z.enum(METODO_PAGO_LIQUIDACION),
  comprobante: z.string().max(200).optional().nullable(),
  observaciones: z.string().max(500).optional().nullable(),
  // YYYY-MM-DD. Si se omite, el backend usa la fecha de hoy (America/Santiago).
  fechaPago: z.string().min(10).max(10).optional(),
});
export type CrearLiquidacionRequest = z.infer<typeof CrearLiquidacionSchema>;

// ─── F49: Nómina de pago (pago masivo por período) ──────────────────

/**
 * Línea por persona dentro de una nómina (preview o detalle): cuánto se le
 * paga en el período + sus datos bancarios para el archivo del banco.
 */
export const NominaPersonaLineaSchema = z.object({
  personalId: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  rut: z.string().nullable(),
  rol: z.enum(ROL_PERSONAL),
  banco: z.string().nullable(),
  tipoCuenta: z.enum(TIPO_CUENTA_BANCARIA).nullable(),
  numeroCuenta: z.string().nullable(),
  titularNombre: z.string().nullable(),
  titularRut: z.string().nullable(),
  designacionesCount: z.number().int(),
  total: z.number().int(),
  // Tiene banco + tipo + número de cuenta completos (transferible).
  tieneCuenta: z.boolean(),
});
export type NominaPersonaLinea = z.infer<typeof NominaPersonaLineaSchema>;

/**
 * Preview (dry-run) de una nómina para un período: a quién se le pagaría y
 * cuánto, sin persistir. Filtra las asistencias por la fecha del partido.
 */
export const NominaPreviewSchema = z.object({
  desde: z.string(), // YYYY-MM-DD
  hasta: z.string(),
  personas: z.array(NominaPersonaLineaSchema),
  totalGlobal: z.number().int(),
  personasCount: z.number().int(),
  // Personas elegibles sin cuenta bancaria completa (no transferibles).
  sinCuentaCount: z.number().int(),
});
export type NominaPreview = z.infer<typeof NominaPreviewSchema>;

/** Cabecera de una nómina emitida (lote de pago). */
export const NominaPagoSchema = z.object({
  id: z.uuid(),
  periodoDesde: z.string(),
  periodoHasta: z.string(),
  fechaPago: z.string(),
  metodoPago: z.enum(METODO_PAGO_LIQUIDACION),
  total: z.number().int(),
  cantidadPersonas: z.number().int(),
  observaciones: z.string().nullable(),
  createdByNombre: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type NominaPago = z.infer<typeof NominaPagoSchema>;

/** Detalle de una nómina: cabecera + las líneas (una por persona pagada). */
export const NominaPagoDetalleSchema = NominaPagoSchema.extend({
  lineas: z.array(NominaPersonaLineaSchema),
});
export type NominaPagoDetalle = z.infer<typeof NominaPagoDetalleSchema>;

/**
 * Emitir una nómina: registra el pago (crea las liquidaciones) de las
 * personas seleccionadas, por las asistencias ASISTIO sin liquidar cuyo
 * partido cae en [desde, hasta]. El backend recalcula montos como snapshot.
 */
export const EmitirNominaSchema = z.object({
  desde: z.string().min(10).max(10), // YYYY-MM-DD
  hasta: z.string().min(10).max(10),
  personalIds: z.array(z.uuid()).min(1),
  metodoPago: z.enum(METODO_PAGO_LIQUIDACION),
  // Si se omite, el backend usa la fecha de hoy (America/Santiago).
  fechaPago: z.string().min(10).max(10).optional(),
  observaciones: z.string().max(500).optional().nullable(),
});
export type EmitirNominaRequest = z.infer<typeof EmitirNominaSchema>;
