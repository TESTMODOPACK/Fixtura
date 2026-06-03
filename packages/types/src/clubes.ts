import { z } from 'zod';

/**
 * Clubes (Sprint 26A, ADR-0004).
 *
 * Un club es la entidad de primera clase a nivel tenant que reemplaza
 * al concepto viejo "equipo por torneo". El club tiene identidad
 * propia (escudo, colores, directiva), participa en una o más
 * categorías (Senior, Super Senior...) y se inscribe a torneos a
 * través de la tabla pivote `inscripciones_torneo`.
 *
 * Los planteles viven en `jugadores` (tabla nueva, NO confundir con
 * `jugadores_inscritos` del modelo viejo) y se vinculan al club +
 * categoría. La regla "un jugador = un solo equipo en toda la liga"
 * se enforza con UNIQUE (tenant_id, rut) en jugadores.
 */

// ── Subobjetos ──────────────────────────────────────────────────────

export const ContactoDirectivaSchema = z.object({
  nombre: z.string().min(2).max(150),
  email: z.email().nullable().optional(),
  telefono: z.string().max(50).nullable().optional(),
});
export type ContactoDirectiva = z.infer<typeof ContactoDirectivaSchema>;

// ── Club ────────────────────────────────────────────────────────────

export const EstadoClubSchema = z.enum(['ACTIVO', 'INACTIVO']);
export type EstadoClub = z.infer<typeof EstadoClubSchema>;

/**
 * Sprint 32 — detalle por (club, categoría). Cada combo tiene su
 * propia directiva (puede ser distinta entre categorías del mismo
 * club) y su propio plantel. El listado /admin/clubes muestra una
 * fila por cada uno de estos para que sean editables aparte.
 */
export const ClubCategoriaDetalleSchema = z.object({
  categoriaId: z.uuid(),
  categoriaNombre: z.string(),
  categoriaSlug: z.string().nullable(),
  edadMinimaGeneral: z.number().int(),
  presidente: ContactoDirectivaSchema.nullable(),
  delegados: z.array(ContactoDirectivaSchema),
  jugadoresCount: z.number().int().nonnegative(),
});
export type ClubCategoriaDetalle = z.infer<typeof ClubCategoriaDetalleSchema>;

export const ClubSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  slug: z.string(),
  nombre: z.string(),
  escudoUrl: z.string().nullable(),
  colorPrimario: z.string().nullable(),
  colorSecundario: z.string().nullable(),
  paginaWeb: z.string().nullable(),
  resena: z.string().nullable(),
  // Directiva "madre" del club. Se mantiene para back-compat y como
  // valor por defecto al crear nuevas (club, categoría). La directiva
  // efectiva por categoría vive en categoriasDetalle[].
  presidente: ContactoDirectivaSchema.nullable(),
  delegados: z.array(ContactoDirectivaSchema),
  historialManual: z.string().nullable(),
  estado: EstadoClubSchema,
  // IDs de categorías en las que el club compite. Se cargan via
  // tabla pivote `club_categorias` y se exponen como array en el DTO.
  categoriaIds: z.array(z.uuid()),
  // Cache para listados (nombres de las categorías). Calculado en
  // backend para evitar N+1 desde la UI.
  categoriaNombres: z.array(z.string()),
  // Sprint 32 — detalle por (club, categoría): directiva + plantel
  // específicos. Tiene un entry por cada categoría asignada al club.
  categoriasDetalle: z.array(ClubCategoriaDetalleSchema),
  jugadoresCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type Club = z.infer<typeof ClubSchema>;

/**
 * Sprint 32 — request para editar la directiva de un (club, categoría)
 * específico, sin tocar los datos transversales del club.
 */
export const UpdateDirectivaClubCategoriaSchema = z.object({
  presidente: ContactoDirectivaSchema.nullable().optional(),
  delegados: z.array(ContactoDirectivaSchema).optional(),
});
export type UpdateDirectivaClubCategoriaRequest = z.infer<
  typeof UpdateDirectivaClubCategoriaSchema
>;

export const CreateClubSchema = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones.'),
    nombre: z.string().min(2).max(150),
    escudoUrl: z.url().nullable().optional(),
    colorPrimario: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato hex #RRGGBB')
      .nullable()
      .optional(),
    colorSecundario: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato hex #RRGGBB')
      .nullable()
      .optional(),
    paginaWeb: z.url().max(500).nullable().optional(),
    resena: z.string().max(2000).nullable().optional(),
    presidente: ContactoDirectivaSchema.nullable().optional(),
    delegados: z.array(ContactoDirectivaSchema).default([]),
    historialManual: z.string().max(5000).nullable().optional(),
    // Categorías en las que el club compite. Al menos UNA para que
    // tenga sentido (sin categoría no se puede armar plantel).
    categoriaIds: z.array(z.uuid()).min(1, 'Elegí al menos una categoría.'),
  });
export type CreateClubRequest = z.infer<typeof CreateClubSchema>;

export const UpdateClubSchema = z.object({
  nombre: z.string().min(2).max(150).optional(),
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
  paginaWeb: z.url().max(500).nullable().optional(),
  resena: z.string().max(2000).nullable().optional(),
  presidente: ContactoDirectivaSchema.nullable().optional(),
  delegados: z.array(ContactoDirectivaSchema).optional(),
  historialManual: z.string().max(5000).nullable().optional(),
  // Permite editar el set de categorías. Si se quita una categoría
  // que tiene jugadores cargados, el backend rechaza con detalle.
  categoriaIds: z.array(z.uuid()).min(1).optional(),
  estado: EstadoClubSchema.optional(),
});
export type UpdateClubRequest = z.infer<typeof UpdateClubSchema>;

// ── Jugador (plantel global por club + categoría) ──────────────────

export const PosicionJugadorSchema = z.enum([
  'ARQUERO',
  'DEFENSA',
  'MEDIO',
  'DELANTERO',
]);
export type PosicionJugador = z.infer<typeof PosicionJugadorSchema>;

export const PieHabilSchema = z.enum(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO']);
export type PieHabil = z.infer<typeof PieHabilSchema>;

export const JugadorSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  clubId: z.uuid(),
  categoriaId: z.uuid(),
  rut: z.string(),
  nombres: z.string(),
  apellidos: z.string(),
  fechaNac: z.iso.date().nullable(),
  email: z.email().nullable(),
  telefono: z.string().nullable(),
  numeroCamiseta: z.number().int().min(0).max(99).nullable(),
  posicion: PosicionJugadorSchema.nullable(),
  pieHabil: PieHabilSchema.nullable(),
  apodo: z.string().nullable(),
  capitan: z.boolean(),
  estado: z.enum(['ACTIVO', 'INACTIVO']),
  // Calculados al vuelo desde fechaNac (ADR-0004). NO se persisten.
  edad: z.number().int().nullable(),
  edadCalendario: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
export type Jugador = z.infer<typeof JugadorSchema>;

export const CreateJugadorClubSchema = z.object({
  categoriaId: z.uuid(),
  rut: z.string().min(7).max(20),
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  fechaNac: z.iso.date().nullable().optional(),
  email: z.email().nullable().optional(),
  telefono: z.string().max(50).nullable().optional(),
  numeroCamiseta: z.number().int().min(0).max(99).nullable().optional(),
  posicion: PosicionJugadorSchema.nullable().optional(),
  pieHabil: PieHabilSchema.nullable().optional(),
  apodo: z.string().max(50).nullable().optional(),
  capitan: z.boolean().default(false),
  /**
   * Si true, el backend acepta el jugador aunque caiga en excepción
   * de edad (entre edadMinimaExcepcion y edadMinimaGeneral). Sin este
   * flag, el backend devuelve 409 con detalle para que la UI muestre
   * el modal de confirmación.
   */
  aceptarExcepcionEdad: z.boolean().default(false),
});
export type CreateJugadorClubRequest = z.infer<typeof CreateJugadorClubSchema>;

export const UpdateJugadorClubSchema = CreateJugadorClubSchema.partial().extend(
  {
    estado: z.enum(['ACTIVO', 'INACTIVO']).optional(),
  },
);
export type UpdateJugadorClubRequest = z.infer<typeof UpdateJugadorClubSchema>;

// ── Vetados ─────────────────────────────────────────────────────────

export const OrigenVetoSchema = z.enum(['TRIBUNAL', 'MANUAL']);
export type OrigenVeto = z.infer<typeof OrigenVetoSchema>;

export const JugadorVetadoSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  rut: z.string(),
  motivo: z.string().nullable(),
  origen: OrigenVetoSchema,
  creadoPorUserId: z.uuid().nullable(),
  creadoPorNombre: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type JugadorVetado = z.infer<typeof JugadorVetadoSchema>;

export const CreateJugadorVetadoSchema = z.object({
  rut: z.string().min(7).max(20),
  motivo: z.string().max(1000).nullable().optional(),
});
export type CreateJugadorVetadoRequest = z.infer<
  typeof CreateJugadorVetadoSchema
>;

// ── Inscripción al torneo + planilla ───────────────────────────────

export const EstadoInscripcionSchema = z.enum([
  'INSCRITO',
  'ACTIVO',
  'RETIRADO',
  'SUSPENDIDO',
]);
export type EstadoInscripcion = z.infer<typeof EstadoInscripcionSchema>;

export const InscripcionTorneoSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  clubId: z.uuid(),
  clubNombre: z.string(),
  clubEscudoUrl: z.string().nullable(),
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  categoriaId: z.uuid(),
  categoriaNombre: z.string(),
  serieSlug: z.string().nullable(),
  serieNombre: z.string().nullable(),
  estado: EstadoInscripcionSchema,
  jugadoresEnPlanilla: z.number().int().nonnegative(),
  topeJugadores: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type InscripcionTorneo = z.infer<typeof InscripcionTorneoSchema>;

export const CreateInscripcionTorneoSchema = z.object({
  clubId: z.uuid(),
  categoriaId: z.uuid(),
  serieSlug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .nullable()
    .optional(),
});
export type CreateInscripcionTorneoRequest = z.infer<
  typeof CreateInscripcionTorneoSchema
>;

// Agregar/quitar jugador en la planilla del torneo (subset del plantel).
export const ModificarPlanillaSchema = z.object({
  jugadorIds: z.array(z.uuid()).min(1),
});
export type ModificarPlanillaRequest = z.infer<typeof ModificarPlanillaSchema>;

// ── Categorías + serie + cupo dentro de un torneo ──────────────────

export const CategoriaSerieTorneoSchema = z.object({
  categoriaId: z.uuid(),
  serieSlug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .nullable()
    .optional(),
  cupoEquipos: z.number().int().min(1).max(100),
});
export type CategoriaSerieTorneo = z.infer<typeof CategoriaSerieTorneoSchema>;
