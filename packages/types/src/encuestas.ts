import { z } from 'zod';

/**
 * Encuestas configurables (ADR-0011, módulo M5 etapa 3).
 *
 * Reemplaza el NPS fijo: el administrador arma sus propias preguntas en
 * plantillas reutilizables y las dispara por torneo a los clubes. Una pregunta
 * de tipo `NPS_0_10` marcada `esNps` conserva el score NPS clásico.
 */

// ── Tipos de pregunta ──────────────────────────────────────────────
export const TIPO_PREGUNTA = [
  'NPS_0_10', // escala 0-10 (la marcada esNps alimenta el score NPS)
  'ESCALA_1_5', // estrellas / escala 1-5
  'SI_NO', // booleano (se guarda 1=sí, 0=no)
  'OPCION_UNICA', // radio: elige una opción
  'OPCION_MULTIPLE', // checkbox: elige varias
  'TEXTO', // texto libre
] as const;
export type TipoPregunta = (typeof TIPO_PREGUNTA)[number];

/** Tipos cuyo valor es una escala numérica (admiten promedio). */
export const TIPOS_ESCALA: readonly TipoPregunta[] = ['NPS_0_10', 'ESCALA_1_5'];
/** Tipos que usan la lista `opciones`. */
export const TIPOS_OPCION: readonly TipoPregunta[] = ['OPCION_UNICA', 'OPCION_MULTIPLE'];

export const ESTADO_PLANTILLA = ['BORRADOR', 'ACTIVA', 'ARCHIVADA'] as const;
export type EstadoPlantilla = (typeof ESTADO_PLANTILLA)[number];

// ── Pregunta ───────────────────────────────────────────────────────
export const PreguntaEncuestaSchema = z.object({
  id: z.uuid(),
  orden: z.number().int().nonnegative(),
  texto: z.string().min(1).max(300),
  tipo: z.enum(TIPO_PREGUNTA),
  // Solo para OPCION_UNICA / OPCION_MULTIPLE; vacío en los demás tipos.
  opciones: z.array(z.string().min(1).max(120)),
  obligatoria: z.boolean(),
  // Marca la pregunta NPS_0_10 cuyo valor alimenta el score. Máx una por plantilla.
  esNps: z.boolean(),
});
export type PreguntaEncuesta = z.infer<typeof PreguntaEncuestaSchema>;

// ── Plantilla ──────────────────────────────────────────────────────
export const PlantillaEncuestaSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  estado: z.enum(ESTADO_PLANTILLA),
  preguntas: z.array(PreguntaEncuestaSchema),
  totalEnviadas: z.number().int().nonnegative(),
  totalRespondidas: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type PlantillaEncuesta = z.infer<typeof PlantillaEncuestaSchema>;

// ── Crear / editar plantilla (admin) ───────────────────────────────
export const CreatePlantillaSchema = z.object({
  nombre: z.string().min(2).max(150),
  descripcion: z.string().max(1000).nullable().optional(),
});
export type CreatePlantillaRequest = z.infer<typeof CreatePlantillaSchema>;

export const UpdatePlantillaSchema = z.object({
  nombre: z.string().min(2).max(150).optional(),
  descripcion: z.string().max(1000).nullable().optional(),
  estado: z.enum(ESTADO_PLANTILLA).optional(),
});
export type UpdatePlantillaRequest = z.infer<typeof UpdatePlantillaSchema>;

// ── Crear / editar pregunta (admin) ────────────────────────────────
// Validación cruzada: las preguntas de opción necesitan ≥2 opciones; solo una
// pregunta NPS_0_10 puede marcarse esNps.
export const UpsertPreguntaSchema = z
  .object({
    texto: z.string().min(1, 'Escribe el texto de la pregunta.').max(300),
    tipo: z.enum(TIPO_PREGUNTA),
    opciones: z.array(z.string().min(1).max(120)).max(20).default([]),
    obligatoria: z.boolean().default(false),
    esNps: z.boolean().default(false),
  })
  .refine(
    (p) => !TIPOS_OPCION.includes(p.tipo) || p.opciones.length >= 2,
    { message: 'Las preguntas de opción necesitan al menos 2 opciones.', path: ['opciones'] },
  )
  .refine((p) => !p.esNps || p.tipo === 'NPS_0_10', {
    message: 'Solo una pregunta de tipo nota 0–10 puede ser la pregunta NPS.',
    path: ['esNps'],
  });
export type UpsertPreguntaRequest = z.infer<typeof UpsertPreguntaSchema>;

/** Reordenar: lista de ids de pregunta en el orden nuevo. */
export const ReordenarPreguntasSchema = z.object({
  preguntaIds: z.array(z.uuid()).min(1),
});
export type ReordenarPreguntasRequest = z.infer<typeof ReordenarPreguntasSchema>;

// ── Disparo (admin) ────────────────────────────────────────────────
export const DispararEncuestaSchema = z.object({
  plantillaId: z.uuid(),
  torneoId: z.uuid(),
});
export type DispararEncuestaRequest = z.infer<typeof DispararEncuestaSchema>;

export const DispararEncuestaResultadoSchema = z.object({
  enviadas: z.number().int().nonnegative(),
  sinEmail: z.number().int().nonnegative(),
  yaEnviadas: z.number().int().nonnegative(),
});
export type DispararEncuestaResultado = z.infer<typeof DispararEncuestaResultadoSchema>;

// ── Respuesta pública (lo que ve y envía el delegado) ──────────────
/** Info al abrir el link: la plantilla con sus preguntas a renderizar. */
export const EncuestaPublicaSchema = z.object({
  liga: z.string(),
  club: z.string(),
  torneo: z.string(),
  yaRespondida: z.boolean(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  preguntas: z.array(PreguntaEncuestaSchema),
});
export type EncuestaPublica = z.infer<typeof EncuestaPublicaSchema>;

/** Respuesta a una pregunta. El campo relevante depende del tipo de pregunta. */
export const RespuestaItemSchema = z.object({
  preguntaId: z.uuid(),
  // NPS_0_10, ESCALA_1_5, SI_NO (0|1). null = sin responder.
  valorNumero: z.number().int().nullable().optional(),
  // TEXTO.
  valorTexto: z.string().max(2000).nullable().optional(),
  // OPCION_UNICA (1 elemento) / OPCION_MULTIPLE (varios).
  valorOpciones: z.array(z.string().max(120)).optional(),
});
export type RespuestaItem = z.infer<typeof RespuestaItemSchema>;

export const ResponderEncuestaSchema = z.object({
  respuestas: z.array(RespuestaItemSchema),
});
export type ResponderEncuesta = z.infer<typeof ResponderEncuestaSchema>;

// ── Resumen admin (por pregunta + score NPS) ───────────────────────
/** Barra de distribución: etiqueta (opción / valor) + cantidad de respuestas. */
export const DistribucionItemSchema = z.object({
  etiqueta: z.string(),
  cantidad: z.number().int().nonnegative(),
});
export type DistribucionItem = z.infer<typeof DistribucionItemSchema>;

export const ResumenPreguntaSchema = z.object({
  preguntaId: z.uuid(),
  texto: z.string(),
  tipo: z.enum(TIPO_PREGUNTA),
  respondidas: z.number().int().nonnegative(),
  // Promedio para escalas (NPS/1-5); null para opciones y texto.
  promedio: z.number().nullable(),
  // Distribución para opciones / sí-no / buckets de escala; vacío para texto.
  distribucion: z.array(DistribucionItemSchema),
  // Respuestas de texto libre; vacío para los demás tipos.
  textos: z.array(z.string()),
});
export type ResumenPregunta = z.infer<typeof ResumenPreguntaSchema>;

export const ResumenEncuestaSchema = z.object({
  plantillaId: z.uuid(),
  nombre: z.string(),
  totalEnviadas: z.number().int().nonnegative(),
  totalRespondidas: z.number().int().nonnegative(),
  // Score NPS solo si la plantilla tiene una pregunta esNps con respuestas.
  scoreNps: z.number().nullable(),
  promotores: z.number().int().nonnegative(),
  pasivos: z.number().int().nonnegative(),
  detractores: z.number().int().nonnegative(),
  preguntas: z.array(ResumenPreguntaSchema),
});
export type ResumenEncuesta = z.infer<typeof ResumenEncuestaSchema>;
