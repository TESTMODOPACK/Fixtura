import { z } from 'zod';

/**
 * Sprint 16 — RF-13. Días en que la liga NO juega.
 */

export const ScopeDiaNoJugableSchema = z.enum(['GLOBAL', 'TORNEO']);
export type ScopeDiaNoJugable = z.infer<typeof ScopeDiaNoJugableSchema>;

export const OrigenDiaNoJugableSchema = z.enum([
  'MANUAL',
  'FERIADO_CHILE',
  'IMPORT',
]);
export type OrigenDiaNoJugable = z.infer<typeof OrigenDiaNoJugableSchema>;

export const CreateDiaNoJugableSchema = z
  .object({
    fecha: z.iso.date(),
    scope: ScopeDiaNoJugableSchema.optional(),
    torneoId: z.uuid().nullable().optional(),
    motivo: z.string().min(2).max(150),
    origen: OrigenDiaNoJugableSchema.optional(),
  })
  .refine((data) => (data.scope ?? 'GLOBAL') === 'GLOBAL' || !!data.torneoId, {
    message: 'Si el scope es TORNEO, torneoId es obligatorio',
    path: ['torneoId'],
  });
export type CreateDiaNoJugableRequest = z.infer<typeof CreateDiaNoJugableSchema>;

export const BulkCreateDiasNoJugablesSchema = z.object({
  dias: z.array(CreateDiaNoJugableSchema).min(1).max(100),
});
export type BulkCreateDiasNoJugablesRequest = z.infer<
  typeof BulkCreateDiasNoJugablesSchema
>;

export const DiaNoJugableSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  fecha: z.string(),
  scope: ScopeDiaNoJugableSchema,
  torneoId: z.uuid().nullable(),
  torneoNombre: z.string().nullable(),
  motivo: z.string(),
  origen: OrigenDiaNoJugableSchema,
  createdAt: z.iso.datetime(),
});
export type DiaNoJugable = z.infer<typeof DiaNoJugableSchema>;

export const FeriadoChileSchema = z.object({
  fecha: z.iso.date(),
  motivo: z.string(),
});
export type FeriadoChile = z.infer<typeof FeriadoChileSchema>;
