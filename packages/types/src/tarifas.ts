import { z } from 'zod';

/**
 * Sprint 34A — Tarifario por torneo.
 *
 * Define los montos a cobrar dentro de un torneo: matrícula, cuota
 * recurrente (semanal/mensual/anual), multas automáticas por sanciones
 * (tarjeta amarilla, roja, fechas de suspensión), walkover y "otros".
 *
 * Reglas:
 *   - UNIQUE (torneo_id, tipo): una sola tarifa por concepto.
 *   - `frecuencia` solo tiene sentido para tipo=CUOTA. Para el resto
 *     vive en UNICO.
 *   - `dia_vencimiento`:
 *       MENSUAL/ANUAL → día del mes (1..31).
 *       SEMANAL       → día de la semana (1=lunes .. 7=domingo).
 *       UNICO         → null (no aplica).
 */

export const TIPO_TARIFA = [
  'MATRICULA',
  'CUOTA',
  'MULTA_AMARILLA',
  'MULTA_ROJA',
  'MULTA_WALKOVER',
  'OTRO',
] as const;
export type TipoTarifa = (typeof TIPO_TARIFA)[number];

export const TIPO_TARIFA_LABEL: Record<TipoTarifa, string> = {
  MATRICULA: 'Matrícula',
  CUOTA: 'Cuota',
  MULTA_AMARILLA: 'Multa por tarjeta amarilla',
  MULTA_ROJA: 'Multa por tarjeta roja',
  MULTA_WALKOVER: 'Multa por walkover (no se presentó)',
  OTRO: 'Otro',
};

export const FRECUENCIA_CUOTA = ['UNICO', 'SEMANAL', 'MENSUAL', 'ANUAL'] as const;
export type FrecuenciaCuota = (typeof FRECUENCIA_CUOTA)[number];

export const FRECUENCIA_CUOTA_LABEL: Record<FrecuenciaCuota, string> = {
  UNICO: 'Pago único',
  SEMANAL: 'Semanal',
  MENSUAL: 'Mensual',
  ANUAL: 'Anual',
};

export const TarifaTorneoSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  torneoId: z.uuid(),
  tipo: z.enum(TIPO_TARIFA),
  descripcion: z.string().nullable(),
  monto: z.number().int().min(0),
  frecuencia: z.enum(FRECUENCIA_CUOTA),
  diaVencimiento: z.number().int().min(1).max(31).nullable(),
  // Sprint 45 — solo CUOTA: cuántas cuotas se generan al activar el torneo.
  cantidadCuotas: z.number().int().min(1).max(60).nullable(),
  // Sprint 45 — solo MATRICULA: días de plazo para pagar desde la activación.
  diasPlazoPago: z.number().int().min(0).max(365).nullable(),
  activo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TarifaTorneo = z.infer<typeof TarifaTorneoSchema>;

export const CreateTarifaSchema = z
  .object({
    tipo: z.enum(TIPO_TARIFA),
    descripcion: z.string().max(200).optional().nullable(),
    monto: z.number().int().min(0).max(100_000_000),
    frecuencia: z.enum(FRECUENCIA_CUOTA).default('UNICO'),
    diaVencimiento: z.number().int().min(1).max(31).optional().nullable(),
    // Sprint 45 — CUOTA: cuántas cuotas se generan al activar el torneo.
    cantidadCuotas: z.number().int().min(1).max(60).optional().nullable(),
    // Sprint 45 — MATRICULA: días de plazo para pagar desde la activación.
    diasPlazoPago: z.number().int().min(0).max(365).optional().nullable(),
    activo: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // CUOTA recurrente requiere dia_vencimiento (excepto UNICO).
    if (data.tipo === 'CUOTA' && data.frecuencia !== 'UNICO') {
      if (data.diaVencimiento == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['diaVencimiento'],
          message:
            'Indica el día de vencimiento (1-31 para mensual/anual; 1-7 lunes-domingo para semanal).',
        });
      }
      if (data.frecuencia === 'SEMANAL' && data.diaVencimiento != null) {
        if (data.diaVencimiento < 1 || data.diaVencimiento > 7) {
          ctx.addIssue({
            code: 'custom',
            path: ['diaVencimiento'],
            message: 'Para frecuencia semanal el día debe ser 1 (lunes) a 7 (domingo).',
          });
        }
      }
      // Sprint 45 — CUOTA recurrente requiere cantidad de cuotas.
      if (data.cantidadCuotas == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['cantidadCuotas'],
          message: 'Indica cuántas cuotas se cobran en total en el torneo.',
        });
      }
    }
    // Frecuencia distinta de UNICO solo aplica a CUOTA.
    if (data.tipo !== 'CUOTA' && data.frecuencia !== 'UNICO') {
      ctx.addIssue({
        code: 'custom',
        path: ['frecuencia'],
        message: 'Solo las cuotas pueden tener frecuencia recurrente.',
      });
    }
  });
export type CreateTarifaRequest = z.infer<typeof CreateTarifaSchema>;

export const UpdateTarifaSchema = z.object({
  descripcion: z.string().max(200).optional().nullable(),
  monto: z.number().int().min(0).max(100_000_000).optional(),
  frecuencia: z.enum(FRECUENCIA_CUOTA).optional(),
  diaVencimiento: z.number().int().min(1).max(31).optional().nullable(),
  cantidadCuotas: z.number().int().min(1).max(60).optional().nullable(),
  diasPlazoPago: z.number().int().min(0).max(365).optional().nullable(),
  activo: z.boolean().optional(),
});
export type UpdateTarifaRequest = z.infer<typeof UpdateTarifaSchema>;
