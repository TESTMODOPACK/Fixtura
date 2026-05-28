import { z } from 'zod';

/**
 * Documentos tributarios electrónicos (DTE) emitidos ante el SII chileno.
 *
 * Por cada transaccion APROBADA, se debe emitir un documento tributario
 * (boleta por defecto). Open Factura o LibreDTE como provider.
 *
 * Retención legal: 6 años. NO borrar nunca.
 */

export const TIPO_DOCUMENTO_TRIBUTARIO = [
  'BOLETA',
  'FACTURA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
] as const;
export type TipoDocumentoTributario = (typeof TIPO_DOCUMENTO_TRIBUTARIO)[number];

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumentoTributario, string> = {
  BOLETA: 'Boleta electrónica',
  FACTURA: 'Factura electrónica',
  NOTA_CREDITO: 'Nota de crédito',
  NOTA_DEBITO: 'Nota de débito',
};

export const ESTADO_DOCUMENTO_TRIBUTARIO = [
  'PENDIENTE_EMISION',
  'EMITIDO',
  'RECHAZADO_SII',
  'FALLIDO',
] as const;
export type EstadoDocumentoTributario =
  (typeof ESTADO_DOCUMENTO_TRIBUTARIO)[number];

export const ESTADO_DOCUMENTO_LABEL: Record<EstadoDocumentoTributario, string> = {
  PENDIENTE_EMISION: 'Pendiente de emisión',
  EMITIDO: 'Emitido',
  RECHAZADO_SII: 'Rechazado por SII',
  FALLIDO: 'Falló — revisar',
};

export const DocumentoTributarioAdminSchema = z.object({
  id: z.uuid(),
  transaccionId: z.uuid().nullable(),
  cobroId: z.uuid().nullable(),
  cobroConcepto: z.string().nullable(),
  tipo: z.enum(TIPO_DOCUMENTO_TRIBUTARIO),
  monto: z.number().int(),
  rutReceptor: z.string().nullable(),
  razonSocial: z.string().nullable(),
  folioSii: z.string().nullable(),
  urlPdf: z.string().nullable(),
  urlXml: z.string().nullable(),
  estado: z.enum(ESTADO_DOCUMENTO_TRIBUTARIO),
  intentos: z.number().int(),
  emitidoAt: z.iso.datetime().nullable(),
  ultimoError: z.string().nullable(),
  ultimoIntentoAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type DocumentoTributarioAdmin = z.infer<typeof DocumentoTributarioAdminSchema>;
