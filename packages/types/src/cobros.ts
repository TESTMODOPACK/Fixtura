import { z } from 'zod';

/**
 * Cobros: registro financiero MVP. Cada fila es un concepto cobrable
 * (inscripción, cuota mensual, multa, alquiler de cancha). Opcionalmente
 * asociado a un equipo.
 */

export const CATEGORIA_COBRO = [
  'INSCRIPCION',
  'CUOTA',
  'MULTA',
  'ALQUILER_CANCHA',
  'ARBITRAJE',
  'OTRO',
] as const;
export type CategoriaCobro = (typeof CATEGORIA_COBRO)[number];

export const CATEGORIA_LABEL: Record<CategoriaCobro, string> = {
  INSCRIPCION: 'Inscripción',
  CUOTA: 'Cuota mensual',
  MULTA: 'Multa',
  ALQUILER_CANCHA: 'Alquiler cancha',
  ARBITRAJE: 'Arbitraje',
  OTRO: 'Otro',
};

export const METODO_PAGO = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'WEBPAY',
  'MERCADOPAGO',
  'OTRO',
] as const;
export type MetodoPago = (typeof METODO_PAGO)[number];

export const METODO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  WEBPAY: 'Webpay',
  MERCADOPAGO: 'MercadoPago',
  OTRO: 'Otro',
};

export const CobroAdminSchema = z.object({
  id: z.uuid(),
  equipoId: z.uuid().nullable(),
  equipoNombre: z.string().nullable(),
  concepto: z.string(),
  categoria: z.enum(CATEGORIA_COBRO),
  monto: z.number().int(),
  vencimiento: z.string().nullable(),
  pagadoAt: z.iso.datetime().nullable(),
  pagadoMetodo: z.enum(METODO_PAGO).nullable(),
  pagadoReferencia: z.string().nullable(),
  cancelado: z.boolean(),
  notas: z.string().nullable(),
  // Estado derivado para UI (no se persiste)
  estado: z.enum(['PENDIENTE', 'VENCIDO', 'PAGADO', 'CANCELADO']),
  createdAt: z.iso.datetime(),
});
export type CobroAdmin = z.infer<typeof CobroAdminSchema>;

export const CreateCobroSchema = z.object({
  equipoId: z.uuid().optional().nullable(),
  concepto: z.string().min(2).max(200),
  categoria: z.enum(CATEGORIA_COBRO),
  monto: z.number().int().min(0),
  vencimiento: z.string().optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
});
export type CreateCobroRequest = z.infer<typeof CreateCobroSchema>;

export const UpdateCobroSchema = z.object({
  equipoId: z.uuid().optional().nullable(),
  concepto: z.string().min(2).max(200).optional(),
  categoria: z.enum(CATEGORIA_COBRO).optional(),
  monto: z.number().int().min(0).optional(),
  vencimiento: z.string().optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
  cancelado: z.boolean().optional(),
});
export type UpdateCobroRequest = z.infer<typeof UpdateCobroSchema>;

export const MarcarPagadoSchema = z.object({
  metodo: z.enum(METODO_PAGO),
  referencia: z.string().max(150).optional().nullable(),
  pagadoAt: z.iso.datetime().optional(),
});
export type MarcarPagadoRequest = z.infer<typeof MarcarPagadoSchema>;
