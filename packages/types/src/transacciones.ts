import { z } from 'zod';

/**
 * Transacciones de pago: registro inmutable de intentos contra una
 * pasarela. Cada fila representa UN intento de pagar UN cobro.
 *
 * Estados:
 *   PENDIENTE          → creada, antes de redirigir al user
 *   PAGO_EN_TRANSITO   → user redirigido a Webpay, esperando webhook
 *   APROBADO           → webhook confirmó cobro exitoso
 *   EXPIRADO           → pasó expira_at sin webhook
 *   RECHAZADO          → user dijo no o tarjeta fallida
 *   REVERSADO          → aprobada y luego revertida (conflicto/admin)
 */

export const PASARELA_PAGO = ['WEBPAY', 'MERCADOPAGO', 'MACH', 'MOCK'] as const;
export type PasarelaPago = (typeof PASARELA_PAGO)[number];

export const PASARELA_LABEL: Record<PasarelaPago, string> = {
  WEBPAY: 'Webpay',
  MERCADOPAGO: 'MercadoPago',
  MACH: 'MACH',
  MOCK: 'Modo prueba',
};

export const ESTADO_TRANSACCION = [
  'PENDIENTE',
  'PAGO_EN_TRANSITO',
  'APROBADO',
  'EXPIRADO',
  'REVERSADO',
  'RECHAZADO',
] as const;
export type EstadoTransaccion = (typeof ESTADO_TRANSACCION)[number];

export const ESTADO_TRANSACCION_LABEL: Record<EstadoTransaccion, string> = {
  PENDIENTE: 'Pendiente',
  PAGO_EN_TRANSITO: 'En tránsito',
  APROBADO: 'Aprobado',
  EXPIRADO: 'Expirado',
  REVERSADO: 'Reversado',
  RECHAZADO: 'Rechazado',
};

export const TransaccionAdminSchema = z.object({
  id: z.uuid(),
  cobroId: z.uuid().nullable(),
  cobroConcepto: z.string().nullable(),
  monto: z.number().int(),
  pasarela: z.enum(PASARELA_PAGO),
  estado: z.enum(ESTADO_TRANSACCION),
  tokenPasarela: z.string().nullable(),
  urlRedireccion: z.string().nullable(),
  pagadoAt: z.iso.datetime().nullable(),
  expiraAt: z.iso.datetime(),
  notas: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TransaccionAdmin = z.infer<typeof TransaccionAdminSchema>;

/**
 * Respuesta del endpoint que inicia el pago: contiene la URL a la que
 * hay que redirigir al user para que complete el pago en Webpay.
 */
export const IniciarPagoResponseSchema = z.object({
  transaccionId: z.uuid(),
  urlRedireccion: z.string(),
  token: z.string(),
  // En modo mock devolvemos un flag para que el frontend sepa que puede
  // simular el flujo sin abrir una ventana externa.
  modoMock: z.boolean(),
});
export type IniciarPagoResponse = z.infer<typeof IniciarPagoResponseSchema>;

/**
 * Respuesta del retorno: el frontend lo llama con el token recibido
 * desde Webpay y obtiene el estado final.
 */
export const ConfirmarPagoResponseSchema = z.object({
  transaccionId: z.uuid(),
  cobroId: z.uuid().nullable(),
  estado: z.enum(ESTADO_TRANSACCION),
  monto: z.number().int(),
  mensaje: z.string(),
});
export type ConfirmarPagoResponse = z.infer<typeof ConfirmarPagoResponseSchema>;
