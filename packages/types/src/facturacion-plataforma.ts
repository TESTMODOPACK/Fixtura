import { z } from 'zod';

/**
 * Sprint 24A — Facturación de las ligas (clientes de Fixtura).
 *
 * NO confundir con `Cobro` (sprint 7C): los Cobros son del LIGA_ADMIN
 * cobrando a sus equipos. Las FacturasPlataforma son de Fixtura
 * cobrando la suscripción a las ligas.
 */

export const EstadoFacturaPlataformaSchema = z.enum([
  'PENDIENTE',
  'PAGADA',
  'VENCIDA',
  'ANULADA',
]);
export type EstadoFacturaPlataforma = z.infer<typeof EstadoFacturaPlataformaSchema>;

export const MetodoPagoPlataformaSchema = z.enum([
  'WEBPAY',
  'MERCADOPAGO',
  'TRANSFERENCIA',
  'MANUAL',
  'ONECLICK',
]);
export type MetodoPagoPlataforma = z.infer<typeof MetodoPagoPlataformaSchema>;

export const ESTADO_FACTURA_LABEL: Record<EstadoFacturaPlataforma, string> = {
  PENDIENTE: 'Pendiente de pago',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
  ANULADA: 'Anulada',
};

export const METODO_PAGO_LABEL: Record<MetodoPagoPlataforma, string> = {
  WEBPAY: 'Webpay (Transbank)',
  MERCADOPAGO: 'MercadoPago',
  TRANSFERENCIA: 'Transferencia bancaria',
  MANUAL: 'Registro manual',
  ONECLICK: 'Suscripción recurrente (Oneclick)',
};

export const FacturaPlataformaSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  tenantNombre: z.string(),
  tenantSlug: z.string(),
  planId: z.uuid().nullable(),
  planNombre: z.string().nullable(),
  periodoMes: z.number().int().min(1).max(12),
  periodoAnio: z.number().int().min(2000).max(2100),
  monto: z.number().int().min(0),
  fechaEmision: z.iso.date(),
  fechaVencimiento: z.iso.date(),
  fechaPago: z.iso.datetime().nullable(),
  estado: EstadoFacturaPlataformaSchema,
  metodoPago: MetodoPagoPlataformaSchema.nullable(),
  transaccionId: z.uuid().nullable(),
  docTributarioId: z.uuid().nullable(),
  observaciones: z.string().nullable(),
  diasMora: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type FacturaPlataforma = z.infer<typeof FacturaPlataformaSchema>;

// Registrar pago manual (super admin marca como pagada con metodo TRANSFERENCIA/MANUAL).
export const RegistrarPagoManualSchema = z.object({
  metodoPago: z.enum(['TRANSFERENCIA', 'MANUAL']),
  observaciones: z.string().max(500).optional(),
  fechaPago: z.iso.date().optional(),
});
export type RegistrarPagoManualRequest = z.infer<typeof RegistrarPagoManualSchema>;

// Anular factura (con motivo).
export const AnularFacturaSchema = z.object({
  motivo: z.string().min(2).max(500),
});
export type AnularFacturaRequest = z.infer<typeof AnularFacturaSchema>;

// Estado de cuenta de una liga: facturas + total adeudado + última al día.
export const EstadoCuentaLigaSchema = z.object({
  tenantId: z.uuid(),
  tenantNombre: z.string(),
  estadoSuscripcion: z.string(),
  plan: z
    .object({
      id: z.uuid(),
      nombre: z.string(),
      precioMensualClp: z.number().int(),
    })
    .nullable(),
  totalAdeudado: z.number().int(),
  facturasPendientes: z.number().int(),
  facturasVencidas: z.number().int(),
  diasMaxMora: z.number().int(),
  ultimaFacturaPagada: z
    .object({
      id: z.uuid(),
      periodoMes: z.number().int(),
      periodoAnio: z.number().int(),
      fechaPago: z.iso.datetime(),
    })
    .nullable(),
});
export type EstadoCuentaLiga = z.infer<typeof EstadoCuentaLigaSchema>;
