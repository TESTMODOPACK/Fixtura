import { z } from 'zod';

/**
 * Sprint 28 — Importación masiva de planteles desde Excel.
 *
 * Workflow del lado cliente:
 *   1. Admin elige categoría destino (debe ser una del club).
 *   2. Sube .xlsx → frontend lo parsea con SheetJS y arma BulkImportRow[].
 *   3. POST /admin/clubes/:id/import/preview → backend devuelve BulkImportPreview.
 *   4. Admin revisa la tabla con badges (NUEVO/ACTUALIZAR/INACTIVAR/RECHAZADO).
 *   5. POST /admin/clubes/:id/import/confirm con el mismo array → backend ejecuta.
 *   6. Backend devuelve BulkImportResult con counts.
 *
 * Match por RUT a nivel del tenant + categoría:
 *   - Si RUT existe en este club + categoría → ACTUALIZAR (email, teléfono, etc).
 *   - Si RUT existe en otro club del tenant → RECHAZAR ("ya está en X").
 *   - Si RUT no existe → NUEVO.
 *   - Jugadores actuales del club+categoría que NO vienen en el archivo →
 *     se proponen INACTIVAR (estado = INACTIVO; reversible manualmente).
 */

/**
 * Fila tal como viene del Excel después de parseo.
 *
 * IMPORTANTE: este schema es DELIBERADAMENTE PERMISIVO. Acepta filas
 * con campos vacíos, strings cortos, RUT inválido, etc. La validación
 * profunda (rut requerido, nombres/apellidos mínimos, RUT chileno,
 * vetados, edad de categoría) vive en plantel-import.service.ts dentro
 * de `previsualizar()` — cada fila inválida se marca como RECHAZADO
 * con un motivo claro y aparece en la tabla del preview, en vez de
 * tumbar toda la importación con un 400.
 *
 * Si quieres validar estricto en el cliente (RHF), usa las reglas
 * sueltas: nombres.length >= 2, apellidos.length >= 2, etc.
 */
export const BulkImportRowSchema = z.object({
  rut: z.string().optional().nullable(),
  nombres: z.string().optional().nullable(),
  apellidos: z.string().optional().nullable(),
  fechaNac: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  numeroCamiseta: z.union([z.number(), z.string()]).optional().nullable(),
  posicion: z.string().optional().nullable(),
  capitan: z.union([z.boolean(), z.string()]).optional(),
  // Contacto de emergencia (sprint 33A): familiar/responsable para
  // avisar si el jugador se accidenta. Opcional.
  telefonoContacto: z.string().optional().nullable(),
  nombreContacto: z.string().optional().nullable(),
});
export type BulkImportRow = z.infer<typeof BulkImportRowSchema>;

export const ImportRowActionSchema = z.enum([
  'NUEVO',
  'ACTUALIZAR',
  'INACTIVAR',
  'RECHAZADO',
  'EN_EXCEPCION', // sub-tipo de NUEVO/ACTUALIZAR: pasa pero usa cupo de excepción
]);
export type ImportRowAction = z.infer<typeof ImportRowActionSchema>;

/** Resultado de evaluar una fila contra el estado actual. */
export const BulkImportPreviewRowSchema = z.object({
  rut: z.string(),
  nombres: z.string(),
  apellidos: z.string(),
  action: ImportRowActionSchema,
  motivo: z.string().nullable(),
  // Campos derivados útiles para mostrar en el preview
  edadCalendario: z.number().int().nullable(),
  jugadorId: z.uuid().nullable(), // si era ACTUALIZAR
  cambios: z.array(z.string()), // ej. ['email cambió', 'teléfono cambió']
});
export type BulkImportPreviewRow = z.infer<typeof BulkImportPreviewRowSchema>;

export const BulkImportPreviewSchema = z.object({
  clubId: z.uuid(),
  clubNombre: z.string(),
  categoriaId: z.uuid(),
  categoriaNombre: z.string(),
  // Stats agregadas para encabezado del preview
  totalFilas: z.number().int(),
  nuevos: z.number().int(),
  actualizados: z.number().int(),
  inactivados: z.number().int(),
  rechazados: z.number().int(),
  enExcepcion: z.number().int(),
  cupoExcepcionesDisponible: z.number().int(),
  // Detalle por fila para la tabla
  filas: z.array(BulkImportPreviewRowSchema),
  // Filas que se proponen marcar inactivos (jugadores del plantel que no vienen)
  inactivarFilas: z.array(
    z.object({
      jugadorId: z.uuid(),
      rut: z.string(),
      nombres: z.string(),
      apellidos: z.string(),
    }),
  ),
});
export type BulkImportPreview = z.infer<typeof BulkImportPreviewSchema>;

export const BulkImportConfirmRequestSchema = z.object({
  categoriaId: z.uuid(),
  rows: z.array(BulkImportRowSchema),
  // Si true, los jugadores actuales que no vienen en el archivo se marcan INACTIVOS.
  // Si false, se ignora ese paso (admin puede haber dicho 'cancelar' a las bajas).
  inactivarFaltantes: z.boolean().default(true),
});
export type BulkImportConfirmRequest = z.infer<typeof BulkImportConfirmRequestSchema>;

export const BulkImportResultSchema = z.object({
  totalFilas: z.number().int(),
  creados: z.number().int(),
  actualizados: z.number().int(),
  inactivados: z.number().int(),
  rechazados: z.number().int(),
  enExcepcion: z.number().int(),
  errores: z.array(
    z.object({
      rut: z.string(),
      motivo: z.string(),
    }),
  ),
});
export type BulkImportResult = z.infer<typeof BulkImportResultSchema>;

/** Columnas esperadas en el Excel (case-insensitive en el parser). */
export const PLANTEL_COLUMNAS_OBLIGATORIAS = ['rut', 'nombres', 'apellidos'] as const;
export const PLANTEL_COLUMNAS_OPCIONALES = [
  'fechaNac',
  'email',
  'telefono',
  'numeroCamiseta',
  'posicion',
  'capitan',
  'telefonoContacto',
  'nombreContacto',
] as const;
