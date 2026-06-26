import { z } from 'zod';

/**
 * NPS — encuestas de satisfacción (módulo M5, etapa 2).
 *
 * El admin dispara una encuesta por (torneo, club). El delegado del club la
 * responde desde un link con token firmado (sin login). Mide:
 *  - NPS 0-10 ("¿qué tan probable es que recomiendes la liga?")
 *  - tres sub-notas 1-5 opcionales (arbitraje, recinto, organización)
 *  - un comentario libre opcional.
 */

const evalEstrella = z.number().int().min(1).max(5);

/** Lo que envía el delegado desde la página pública. */
export const ResponderNpsSchema = z.object({
  nps: z.number().int().min(0).max(10),
  evalArbitraje: evalEstrella.optional(),
  evalRecinto: evalEstrella.optional(),
  evalOrganizacion: evalEstrella.optional(),
  comentario: z.string().trim().max(1000).optional(),
});
export type ResponderNps = z.infer<typeof ResponderNpsSchema>;

/** Info que ve el delegado al abrir el link (página pública). */
export const EncuestaNpsInfoSchema = z.object({
  liga: z.string(),
  club: z.string(),
  torneo: z.string(),
  yaRespondida: z.boolean(),
});
export type EncuestaNpsInfo = z.infer<typeof EncuestaNpsInfoSchema>;

/** El admin dispara las encuestas de un torneo. */
export const DispararNpsSchema = z.object({
  torneoId: z.string().uuid(),
});
export type DispararNps = z.infer<typeof DispararNpsSchema>;

/** Resultado del disparo: cuántas se enviaron / faltó email / ya existían. */
export const DispararNpsResultadoSchema = z.object({
  enviadas: z.number().int().nonnegative(),
  sinEmail: z.number().int().nonnegative(),
  yaEnviadas: z.number().int().nonnegative(),
});
export type DispararNpsResultado = z.infer<typeof DispararNpsResultadoSchema>;

export const NpsComentarioSchema = z.object({
  club: z.string(),
  torneo: z.string(),
  nps: z.number().int(),
  comentario: z.string(),
  fecha: z.string(),
});
export type NpsComentario = z.infer<typeof NpsComentarioSchema>;

/** Tablero de resultados que ve el admin. */
export const NpsResumenAdminSchema = z.object({
  // Score NPS = %promotores − %detractores, en el rango [-100, 100].
  score: z.number().int(),
  totalEnviadas: z.number().int().nonnegative(),
  totalRespondidas: z.number().int().nonnegative(),
  promotores: z.number().int().nonnegative(), // nps 9-10
  pasivos: z.number().int().nonnegative(), // nps 7-8
  detractores: z.number().int().nonnegative(), // nps 0-6
  // Promedio de cada sub-evaluación (1-5); null si nadie la respondió.
  promArbitraje: z.number().nullable(),
  promRecinto: z.number().nullable(),
  promOrganizacion: z.number().nullable(),
  comentarios: z.array(NpsComentarioSchema),
});
export type NpsResumenAdmin = z.infer<typeof NpsResumenAdminSchema>;
