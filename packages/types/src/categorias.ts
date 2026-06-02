import { z } from 'zod';

/**
 * Categorías de jugadores por edad para una liga.
 *
 * Modelo:
 *   - Una liga (tenant) define N categorías (Senior, Super Senior, Dorados…).
 *   - Cada categoría tiene una edad mínima general (ej. 35).
 *   - Opcionalmente, cupo de excepciones por equipo: hasta X jugadores
 *     pueden tener edad inferior a la general, hasta una edad mínima
 *     de excepción (ej. en Super Senior 35+, permitir 2 jugadores 33-34).
 *   - Cada categoría tiene una lista de series (Primera, Segunda, Honor…)
 *     embebidas como JSONB. Son divisiones competitivas DENTRO de la
 *     misma categoría — no entidades de primer orden.
 *
 * Las series se modelan EMBEBIDAS (no tabla aparte) porque:
 *   - Ya existe otra tabla `series` para el modelo viejo torneo→serie.
 *   - Son una lista corta de etiquetas (3-5 por categoría).
 *   - No necesitan FK desde otras tablas hoy.
 *
 * La validación del plantel (jugadores en rango / en excepción / bloqueados)
 * usa la edadCalendario del jugador, NO la edad cumplida.
 */

export const SerieEmbeddedSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones.'),
  nombre: z.string().min(2).max(100),
  orden: z.number().int().default(0),
  activa: z.boolean().default(true),
});
export type SerieEmbedded = z.infer<typeof SerieEmbeddedSchema>;

export const CategoriaJugadoresSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  slug: z.string().min(2).max(50),
  nombre: z.string().min(2).max(100),
  descripcion: z.string().nullable(),
  /** Años que el jugador debe cumplir este año para entrar en la categoría. */
  edadMinimaGeneral: z.number().int().min(0).max(99),
  /**
   * Cuántos jugadores por equipo pueden estar por debajo de la edad
   * mínima general (pero arriba de edadMinimaExcepcion). 0 = sin
   * excepciones permitidas (todos deben cumplir la edad mínima general).
   */
  cupoExcepcionesPorEquipo: z.number().int().min(0).max(20),
  /**
   * Piso absoluto: cualquier jugador con edadCalendario menor a esto
   * NUNCA se inscribe, ni siquiera en excepción. Solo aplica cuando
   * cupoExcepcionesPorEquipo > 0. Cuando es null, no hay excepción
   * permitida (el piso es edadMinimaGeneral).
   */
  edadMinimaExcepcion: z.number().int().min(0).max(99).nullable(),
  /** Orden de display en la UI. */
  orden: z.number().int(),
  activa: z.boolean(),
  series: z.array(SerieEmbeddedSchema),
  createdAt: z.iso.datetime(),
});
export type CategoriaJugadores = z.infer<typeof CategoriaJugadoresSchema>;

// ── DTOs de creación / edición ───────────────────────────────────────

export const CreateCategoriaSchema = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones.'),
    nombre: z.string().min(2).max(100),
    descripcion: z.string().max(500).nullable().optional(),
    edadMinimaGeneral: z.number().int().min(0).max(99),
    cupoExcepcionesPorEquipo: z.number().int().min(0).max(20).default(0),
    edadMinimaExcepcion: z.number().int().min(0).max(99).nullable().optional(),
    orden: z.number().int().default(0),
    activa: z.boolean().default(true),
    series: z.array(SerieEmbeddedSchema).default([]),
  })
  .refine(
    (d) =>
      d.cupoExcepcionesPorEquipo === 0 ||
      (d.edadMinimaExcepcion != null &&
        d.edadMinimaExcepcion < d.edadMinimaGeneral),
    {
      message:
        'Si hay cupo de excepciones, la edad mínima de excepción debe ser menor a la general.',
      path: ['edadMinimaExcepcion'],
    },
  )
  .refine(
    (d) => {
      // Series con slug único entre sí.
      const slugs = new Set<string>();
      for (const s of d.series) {
        if (slugs.has(s.slug)) return false;
        slugs.add(s.slug);
      }
      return true;
    },
    { message: 'Hay series con slug duplicado.', path: ['series'] },
  );
export type CreateCategoriaRequest = z.infer<typeof CreateCategoriaSchema>;

export const UpdateCategoriaSchema = z.object({
  nombre: z.string().min(2).max(100).optional(),
  descripcion: z.string().max(500).nullable().optional(),
  edadMinimaGeneral: z.number().int().min(0).max(99).optional(),
  cupoExcepcionesPorEquipo: z.number().int().min(0).max(20).optional(),
  edadMinimaExcepcion: z.number().int().min(0).max(99).nullable().optional(),
  orden: z.number().int().optional(),
  activa: z.boolean().optional(),
  series: z.array(SerieEmbeddedSchema).optional(),
});
export type UpdateCategoriaRequest = z.infer<typeof UpdateCategoriaSchema>;

// ── Validación de plantel contra categoría ───────────────────────────

export const ValidarPlantelResultSchema = z.object({
  validos: z.number().int(),
  enExcepcion: z.number().int(),
  bloqueados: z.number().int(),
  sinFecha: z.number().int(),
  totalJugadores: z.number().int(),
  cupoExcepcionesDisponibles: z.number().int(),
  cupoExcepcionesUsado: z.number().int(),
  apto: z.boolean(),
  motivosRechazo: z.array(z.string()),
});
export type ValidarPlantelResult = z.infer<typeof ValidarPlantelResultSchema>;
