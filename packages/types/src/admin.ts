import { z } from 'zod';

/**
 * DTOs admin — compartidos cliente↔servidor para evitar drift.
 * Validados con Zod en ambos lados.
 */

// ─── Temporadas ──────────────────────────────────────────────────────
export const CreateTemporadaSchema = z.object({
  nombre: z.string().min(2).max(100),
  anio: z.number().int().min(2000).max(2100),
  fechaInicio: z.iso.date().nullable().optional(),
  fechaFin: z.iso.date().nullable().optional(),
});
export type CreateTemporadaRequest = z.infer<typeof CreateTemporadaSchema>;

export const TemporadaSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  anio: z.number().int(),
  fechaInicio: z.string().nullable(),
  fechaFin: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Temporada = z.infer<typeof TemporadaSchema>;

// ─── Torneos ─────────────────────────────────────────────────────────
export const TipoFormatoSchema = z.enum(['ROUND_ROBIN', 'PLAYOFFS', 'GROUPS', 'MIXTO']);
export type TipoFormato = z.infer<typeof TipoFormatoSchema>;

export const EstadoTorneoSchema = z.enum(['DRAFT', 'ACTIVO', 'CERRADO']);
export type EstadoTorneo = z.infer<typeof EstadoTorneoSchema>;

export const CreateTorneoSchema = z.object({
  temporadaId: z.uuid(),
  nombre: z.string().min(2).max(200),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  tipoFormato: TipoFormatoSchema.default('ROUND_ROBIN'),
  ruedas: z.union([z.literal(1), z.literal(2)]).default(1),
  puntosVictoria: z.number().int().min(0).max(10).default(3),
  puntosEmpate: z.number().int().min(0).max(10).default(1),
  puntosDerrota: z.number().int().min(0).max(10).default(0),
  fechaInicio: z.iso.date().nullable().optional(),
  fechaFin: z.iso.date().nullable().optional(),
  reglamentoUrl: z.url().nullable().optional(),
  tablaTiebreakers: z.array(z.string()).optional(),
});
export type CreateTorneoRequest = z.infer<typeof CreateTorneoSchema>;

export const UpdateTorneoSchema = CreateTorneoSchema.partial().extend({
  estado: EstadoTorneoSchema.optional(),
});
export type UpdateTorneoRequest = z.infer<typeof UpdateTorneoSchema>;

export const TorneoAdminSchema = z.object({
  id: z.uuid(),
  temporadaId: z.uuid(),
  temporadaNombre: z.string(),
  nombre: z.string(),
  slug: z.string(),
  tipoFormato: TipoFormatoSchema,
  ruedas: z.union([z.literal(1), z.literal(2)]),
  puntosVictoria: z.number().int(),
  puntosEmpate: z.number().int(),
  puntosDerrota: z.number().int(),
  tablaTiebreakers: z.array(z.string()),
  estado: EstadoTorneoSchema,
  fechaInicio: z.string().nullable(),
  fechaFin: z.string().nullable(),
  reglamentoUrl: z.string().nullable(),
  equiposCount: z.number().int().min(0),
  fechasCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type TorneoAdmin = z.infer<typeof TorneoAdminSchema>;

// ─── Equipos ─────────────────────────────────────────────────────────
export const CreateEquipoSchema = z.object({
  nombre: z.string().min(2).max(150),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  escudoUrl: z.url().nullable().optional(),
  colorPrimario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  colorSecundario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  delegadoUserId: z.uuid().nullable().optional(),
});
export type CreateEquipoRequest = z.infer<typeof CreateEquipoSchema>;

export const EquipoAdminSchema = z.object({
  id: z.uuid(),
  torneoId: z.uuid(),
  nombre: z.string(),
  slug: z.string(),
  escudoUrl: z.string().nullable(),
  colorPrimario: z.string().nullable(),
  colorSecundario: z.string().nullable(),
  delegadoUserId: z.uuid().nullable(),
  estado: z.enum(['INSCRITO', 'ACTIVO', 'RETIRADO', 'SUSPENDIDO']),
  jugadoresCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type EquipoAdmin = z.infer<typeof EquipoAdminSchema>;

// ─── Jugadores ───────────────────────────────────────────────────────
export const CreateJugadorSchema = z
  .object({
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(100),
    apodo: z.string().max(50).nullable().optional(),
    rut: z.string().max(20).nullable().optional(),
    numeroCamiseta: z.number().int().min(0).max(99).nullable().optional(),
    posicion: z.enum(['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO']).nullable().optional(),
    pieHabil: z.enum(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO']).nullable().optional(),
    fechaNac: z.iso.date().nullable().optional(),
    capitan: z.boolean().default(false),
  })
  // AUDIT-8: si es capitán, el RUT es obligatorio. Esto garantiza que
  // las sanciones por RUT × torneo siempre puedan localizar al capitán
  // (que es la cara visible del equipo en tribunal). Además, los
  // capitanes suelen ser los firmantes del acta.
  .refine((data) => !data.capitan || (data.rut && data.rut.trim().length > 0), {
    message: 'El RUT es obligatorio para capitanes',
    path: ['rut'],
  });
export type CreateJugadorRequest = z.infer<typeof CreateJugadorSchema>;

export const JugadorAdminSchema = z.object({
  id: z.uuid(),
  equipoId: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  apodo: z.string().nullable(),
  rut: z.string().nullable(),
  numeroCamiseta: z.number().int().nullable(),
  posicion: z.string().nullable(),
  pieHabil: z.string().nullable(),
  fechaNac: z.string().nullable(),
  capitan: z.boolean(),
  activo: z.boolean(),
});
export type JugadorAdmin = z.infer<typeof JugadorAdminSchema>;

export const BulkCreateJugadoresSchema = z.object({
  jugadores: z.array(CreateJugadorSchema).min(1).max(50),
});
export type BulkCreateJugadoresRequest = z.infer<typeof BulkCreateJugadoresSchema>;

// ─── Fixture ─────────────────────────────────────────────────────────
export const GenerarFixtureSchema = z.object({
  fechaInicio: z.iso.date(),
  diasEntreFechas: z.number().int().min(1).max(30).default(7),
  horariosPorFecha: z
    .array(z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'))
    .min(1)
    .default(['10:00', '12:00', '14:00', '16:00']),
  canchas: z.array(z.string()).min(1).default(['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4']),
});
export type GenerarFixtureRequest = z.infer<typeof GenerarFixtureSchema>;

export const FixtureGenerationResultSchema = z.object({
  fechasCreadas: z.number().int(),
  partidosCreados: z.number().int(),
  equiposLibres: z.array(z.object({ fechaNumero: z.number().int(), equipoId: z.string() })),
  // Sprint 16 — RF-13: días bloqueados que el generator tuvo que correr.
  // El frontend los muestra como info para que el admin sepa qué se movió.
  diasNoJugablesAjustados: z
    .array(
      z.object({
        fechaNumero: z.number().int(),
        fechaOriginal: z.string(),
        fechaAjustada: z.string(),
        motivo: z.string(),
      }),
    )
    .default([]),
});
export type FixtureGenerationResult = z.infer<typeof FixtureGenerationResultSchema>;
