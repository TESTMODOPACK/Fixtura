import { z } from 'zod';

import { FilaTablaSchema, type FilaTabla } from './public';

/**
 * DTOs admin — compartidos cliente↔servidor para evitar drift.
 * Validados con Zod en ambos lados.
 */

// Re-export para que los consumers del admin tengan FilaTabla a mano.
export { FilaTablaSchema };
export type { FilaTabla };

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

/**
 * Categoría + serie + cupo dentro de un torneo. Definidos al crear el
 * torneo y validados al inscribir clubes. Sprint 26D (ADR-0004).
 *
 * Repetido del schema en clubes.ts para no introducir un import
 * circular — admin.ts es importado por casi todo.
 */
const TorneoCategoriaSerieSchema = z.object({
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
  // Fase Grupos (formato GROUPS/MIXTO). La validación cross-field (cuáles son
  // obligatorios según el formato) la hace el backend; acá solo cotas.
  cantidadGrupos: z.number().int().min(2).max(32).nullable().optional(),
  clasificanPorGrupo: z.number().int().min(1).max(16).nullable().optional(),
  gruposAPlayoffs: z.boolean().optional(),
  // Fase Playoffs (formato PLAYOFFS/MIXTO). ida_vuelta: cada cruce a doble
  // partido; tercer_puesto: se juega el 3er puesto entre los perdedores de
  // semis. Configurables por el admin.
  playoffIdaVuelta: z.boolean().optional(),
  playoffTercerPuesto: z.boolean().optional(),
  // Mixto "fase regular + playoffs" (formato ROUND_ROBIN): los mejores N de la
  // tabla pasan a una eliminatoria sembrada por posición.
  roundRobinAPlayoffs: z.boolean().optional(),
  clasificanPlayoffs: z.number().int().min(2).max(64).nullable().optional(),
  puntosVictoria: z.number().int().min(0).max(10).default(3),
  puntosEmpate: z.number().int().min(0).max(10).default(1),
  puntosDerrota: z.number().int().min(0).max(10).default(0),
  fechaInicio: z.iso.date().nullable().optional(),
  fechaFin: z.iso.date().nullable().optional(),
  reglamentoUrl: z.url().nullable().optional(),
  tablaTiebreakers: z.array(z.string()).optional(),
  // Sprint 25 paso 3 — DEPRECADO en favor de categoriasSeries.
  categoriaId: z.uuid().nullable().optional(),
  // Sprint 26D (ADR-0004) — multi-categoría con cupo por combo.
  categoriasSeries: z.array(TorneoCategoriaSerieSchema).optional(),
  topeJugadoresPorEquipo: z.number().int().min(1).max(99).optional(),
  refuerzosHabilitados: z.boolean().optional(),
  fechaLimiteRefuerzosNumero: z.number().int().min(0).max(99).nullable().optional(),
  // Sprint 29A — duración del partido por torneo. El match-center lo hereda.
  duracionPeriodoMinutos: z.number().int().min(1).max(120).optional(),
  duracionEntretiempoMinutos: z.number().int().min(0).max(60).optional(),
  // F46.3 — mínimo de jugadores en planilla por equipo para poder iniciar
  // un partido. Configurable por formato (fútbol 11, baby, senior).
  minJugadoresParaIniciar: z.number().int().min(1).max(30).optional(),
  // Amarillas acumuladas en el torneo que generan una fecha de suspensión.
  amarillasParaSuspension: z.number().int().min(2).max(20).optional(),
  // Cobertura del recinto que el auto-asignar designa por jornada.
  paramedicosPorJornada: z.number().int().min(0).max(20).optional(),
  otrosPorJornada: z.number().int().min(0).max(20).optional(),
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
  // Fase Grupos — null para ROUND_ROBIN/PLAYOFFS.
  cantidadGrupos: z.number().int().nullable(),
  clasificanPorGrupo: z.number().int().nullable(),
  gruposAPlayoffs: z.boolean(),
  // Fase Playoffs — config del bracket.
  playoffIdaVuelta: z.boolean(),
  playoffTercerPuesto: z.boolean(),
  // Mixto fase regular + playoffs (ROUND_ROBIN).
  roundRobinAPlayoffs: z.boolean(),
  clasificanPlayoffs: z.number().int().nullable(),
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
  // Sprint 25 paso 3 — DEPRECADO en favor de categoriasSeries.
  categoriaId: z.uuid().nullable(),
  categoriaNombre: z.string().nullable(),
  categoriaSlug: z.string().nullable(),
  // Sprint 26D — config multi-categoría del torneo.
  categoriasSeries: z.array(TorneoCategoriaSerieSchema),
  topeJugadoresPorEquipo: z.number().int().min(1).max(99),
  refuerzosHabilitados: z.boolean(),
  fechaLimiteRefuerzosNumero: z.number().int().min(0).max(99).nullable(),
  // Sprint 29A
  duracionPeriodoMinutos: z.number().int().min(1).max(120),
  duracionEntretiempoMinutos: z.number().int().min(0).max(60),
  // F46.3 — mínimo de jugadores en planilla por equipo para iniciar.
  minJugadoresParaIniciar: z.number().int().min(1).max(30),
  // Amarillas acumuladas que generan una fecha de suspensión.
  amarillasParaSuspension: z.number().int().min(2).max(20),
  // Cobertura del recinto por jornada (auto-asignar).
  paramedicosPorJornada: z.number().int().min(0).max(20),
  otrosPorJornada: z.number().int().min(0).max(20),
  createdAt: z.iso.datetime(),
});
export type TorneoAdmin = z.infer<typeof TorneoAdminSchema>;

// ─── Fase de grupos (admin) ──────────────────────────────────────────
export const GrupoInscripcionItemSchema = z.object({
  inscripcionId: z.uuid(),
  clubNombre: z.string(),
  serieSlug: z.string().nullable(),
});
export type GrupoInscripcionItem = z.infer<typeof GrupoInscripcionItemSchema>;

export const GrupoTorneoAdminSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  nombre: z.string(),
  inscripciones: z.array(GrupoInscripcionItemSchema),
});
export type GrupoTorneoAdmin = z.infer<typeof GrupoTorneoAdminSchema>;

export const GruposTorneoResponseSchema = z.object({
  sorteado: z.boolean(),
  cantidadGrupos: z.number().int().nullable(),
  grupos: z.array(GrupoTorneoAdminSchema),
  // Inscripciones activas que todavía no están en ningún grupo (ej. un
  // equipo inscrito después del sorteo).
  sinAsignar: z.array(GrupoInscripcionItemSchema),
});
export type GruposTorneoResponse = z.infer<typeof GruposTorneoResponseSchema>;

export const MoverInscripcionGrupoSchema = z.object({
  inscripcionId: z.uuid(),
  grupoId: z.uuid(),
});
export type MoverInscripcionGrupoRequest = z.infer<typeof MoverInscripcionGrupoSchema>;

// Tabla de posiciones de un grupo (mismo cálculo que la tabla global, pero
// solo con los equipos y partidos de ese grupo).
export const TablaGrupoAdminSchema = z.object({
  grupoId: z.uuid(),
  numero: z.number().int(),
  nombre: z.string(),
  filas: z.array(FilaTablaSchema),
});
export type TablaGrupoAdmin = z.infer<typeof TablaGrupoAdminSchema>;

export const TablasPorGrupoAdminSchema = z.object({
  grupos: z.array(TablaGrupoAdminSchema),
  tiebreakers: z.array(z.string()),
  hayResultados: z.boolean(),
});
export type TablasPorGrupoAdmin = z.infer<typeof TablasPorGrupoAdminSchema>;

// ─── Fase de playoffs / bracket (admin) ──────────────────────────────
// Un slot de una llave: el equipo, o null cuando está "por definir" (bye o
// ganador de una llave previa que todavía no se jugó). Reutiliza la forma de
// GrupoInscripcionItem (inscripcionId + clubNombre + serieSlug).
export const LlavePlayoffSlotSchema = GrupoInscripcionItemSchema.nullable();
export type LlavePlayoffSlot = z.infer<typeof LlavePlayoffSlotSchema>;

export const LlavePlayoffAdminSchema = z.object({
  id: z.uuid(),
  ronda: z.number().int(),
  orden: z.number().int(),
  nombre: z.string(),
  esTercerPuesto: z.boolean(),
  local: LlavePlayoffSlotSchema,
  visita: LlavePlayoffSlotSchema,
  ganadorInscripcionId: z.uuid().nullable(),
});
export type LlavePlayoffAdmin = z.infer<typeof LlavePlayoffAdminSchema>;

export const RondaPlayoffAdminSchema = z.object({
  ronda: z.number().int(),
  nombre: z.string(),
  esRondaFinal: z.boolean(),
  llaves: z.array(LlavePlayoffAdminSchema),
});
export type RondaPlayoffAdmin = z.infer<typeof RondaPlayoffAdminSchema>;

export const BracketPlayoffResponseSchema = z.object({
  sembrado: z.boolean(),
  idaVuelta: z.boolean(),
  tercerPuesto: z.boolean(),
  cantidadEquipos: z.number().int(),
  rondas: z.array(RondaPlayoffAdminSchema),
  // Inscripciones activas (para mostrar el listado antes de sembrar y el conteo).
  participantes: z.array(GrupoInscripcionItemSchema),
});
export type BracketPlayoffResponse = z.infer<typeof BracketPlayoffResponseSchema>;

// Override manual del ganador de una llave (resuelve empates: penales, etc.).
export const DefinirGanadorLlaveSchema = z.object({
  ganadorInscripcionId: z.uuid(),
});
export type DefinirGanadorLlaveRequest = z.infer<typeof DefinirGanadorLlaveSchema>;

// ─── Tabla de posiciones (admin) ─────────────────────────────────────
// Reutiliza FilaTabla del portal público — misma forma de fila. El admin
// la ve para cualquier torneo (incluido DRAFT, donde sale en ceros).
export const TablaPosicionesAdminSchema = z.object({
  filas: z.array(FilaTablaSchema),
  // Orden de desempate efectivo usado para calcular la tabla.
  tiebreakers: z.array(z.string()),
  // True si hay al menos un partido jugado (FINALIZADO/WALKOVER).
  hayResultados: z.boolean(),
});
export type TablaPosicionesAdmin = z.infer<typeof TablaPosicionesAdminSchema>;

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
  // Sprint 25 paso 3 — slug de la serie (Primera, Segunda…) dentro de
  // la categoría del torneo. Solo aplica si el torneo tiene categoría.
  // El backend valida que el slug exista en la categoría asociada.
  serieSlug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .nullable()
    .optional(),
});
export type CreateEquipoRequest = z.infer<typeof CreateEquipoSchema>;

/**
 * Sprint 44 — Motivo de la suspensión del equipo:
 *   DEPORTIVA — conducta antideportiva, mal comportamiento del club
 *   ECONOMICA — no pago de cuotas, deuda con la liga
 *   OTRA      — fuerza mayor, renuncia voluntaria, otros
 */
export const MOTIVO_SUSPENSION_EQUIPO = ['DEPORTIVA', 'ECONOMICA', 'OTRA'] as const;
export type MotivoSuspensionEquipo = (typeof MOTIVO_SUSPENSION_EQUIPO)[number];
export const MotivoSuspensionEquipoLabel: Record<MotivoSuspensionEquipo, string> = {
  DEPORTIVA: 'Conducta antideportiva',
  ECONOMICA: 'Razón económica (no pago)',
  OTRA: 'Otra razón',
};

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
  // Sprint 25 paso 3 — serie del equipo dentro del torneo. nombre es
  // cache (lookup en la categoría del torneo) para evitar fetch extra.
  serieSlug: z.string().nullable(),
  serieNombre: z.string().nullable(),
  // Sprint 44 — Solo poblados si estado=SUSPENDIDO. Cuando se reactiva
  // se blanquean a null (los walkovers ya disparados quedan en la historia).
  motivoSuspension: z.enum(MOTIVO_SUSPENSION_EQUIPO).nullable(),
  observacionesSuspension: z.string().nullable(),
  suspendidoEn: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type EquipoAdmin = z.infer<typeof EquipoAdminSchema>;

/**
 * Sprint 44 — Request para suspender un equipo del torneo. Dispara
 * walkover automático 3-0 en todos los partidos PROGRAMADO/EN_CURSO
 * del equipo (los YA jugados se preservan).
 */
export const SuspenderEquipoSchema = z.object({
  motivo: z.enum(MOTIVO_SUSPENSION_EQUIPO),
  observaciones: z.string().trim().max(500).nullable().optional(),
  /**
   * Si true, se cobra MULTA_WALKOVER por cada partido pendiente (si la
   * tarifa está configurada). Default false — la UI deja un checkbox
   * apagado y el operador lo activa explícitamente. Sin esto, suspender
   * por motivo ECONOMICA sumaría multas adicionales sobre la deuda original.
   */
  aplicarMultaWalkover: z.boolean().optional(),
});
export type SuspenderEquipoRequest = z.infer<typeof SuspenderEquipoSchema>;

/**
 * Sprint 44 — Resumen del resultado de suspender. La UI lo usa para
 * informar exactamente cuántos partidos pasaron a walkover.
 */
export const SuspenderEquipoResultSchema = z.object({
  equipoId: z.uuid(),
  partidosWalkover: z.number().int().min(0),
  partidosCancelados: z.number().int().min(0),
});
export type SuspenderEquipoResult = z.infer<typeof SuspenderEquipoResultSchema>;

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
  // Campos derivados (no se guardan en DB — los calcula el backend en
  // cada respuesta). Útiles para la UI: mostrar la edad actual del
  // jugador y la edad que tendrá al cierre del año, que es la regla
  // típica de inscripción por categoría en ligas amateur.
  edad: z.number().int().nullable(),
  edadCalendario: z.number().int().nullable(),
  capitan: z.boolean(),
  activo: z.boolean(),
});
export type JugadorAdmin = z.infer<typeof JugadorAdminSchema>;

export const BulkCreateJugadoresSchema = z.object({
  jugadores: z.array(CreateJugadorSchema).min(1).max(50),
});
export type BulkCreateJugadoresRequest = z.infer<typeof BulkCreateJugadoresSchema>;

// ─── Fixture ─────────────────────────────────────────────────────────
// Sprint 44 — horariosPorFecha y canchas son opcionales: el backend los
// toma de la plantilla del torneo (Sprint 39) y del catálogo de canchas
// (Sprint 40). Si vienen en el body, se usan (modo legacy).
export const GenerarFixtureSchema = z.object({
  fechaInicio: z.iso.date(),
  diasEntreFechas: z.number().int().min(1).max(30).optional(),
  horariosPorFecha: z
    .array(z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'))
    .min(1)
    .optional(),
  canchas: z.array(z.string()).min(1).optional(),
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
  // Sprint 39 — partidos que quedaron sin horario asignado porque la
  // plantilla del torneo no tenia suficientes slots para esa fecha.
  // El admin tiene que cargar mas slots o asignar manualmente.
  partidosSinHorario: z.number().int().default(0),
  slotsUsados: z.number().int().default(0),
  modoGeneracion: z.enum(['HORARIOS_TORNEO', 'INPUT_LEGACY']).default('INPUT_LEGACY'),
  // Sprint 40 — partidos asignados a slots cuya cancha esta marcada
  // como NO_DISPONIBLE. El admin decide si re-programar o esperar a que
  // la cancha vuelva.
  partidosEnCanchaNoDisponible: z
    .array(
      z.object({
        fechaNumero: z.number().int(),
        canchaNombre: z.string(),
        motivo: z.string().nullable(),
      }),
    )
    .default([]),
  // Sprint 44 — si la fecha de inicio del input cae en un día sin
  // slots cargados, el generador la corre al próximo día con slots
  // para evitar partidos sin horario. Avisamos en el response.
  fechaInicioAjustada: z
    .object({
      fechaInicioOriginal: z.string(),
      fechaInicioReal: z.string(),
    })
    .nullable()
    .default(null),
});
export type FixtureGenerationResult = z.infer<typeof FixtureGenerationResultSchema>;

// ─── Sprint 43 — Pre-validación del fixture ─────────────────────────
/**
 * Advertencias y errores detectados antes de generar el fixture.
 * - `ERROR`: bloquea la generación (faltan equipos, sin canchas activas)
 * - `WARN`: permite generar pero advierte (sin horarios, canchas no
 *   disponibles, slots insuficientes, días bloqueados en el rango)
 * - `INFO`: informativo (ej. modo legacy, ajustes de feriados)
 */
export const NIVEL_ADVERTENCIA = ['ERROR', 'WARN', 'INFO'] as const;
export type NivelAdvertencia = (typeof NIVEL_ADVERTENCIA)[number];

export const CODIGO_ADVERTENCIA = [
  'SIN_EQUIPOS_SUFICIENTES',
  'SIN_HORARIOS_TORNEO',
  'SIN_CANCHAS_CATALOGO',
  'SIN_CANCHAS_DISPONIBLES',
  'CANCHAS_NO_DISPONIBLES',
  'SLOTS_SIN_CANCHA',
  'SLOTS_INSUFICIENTES',
  'DIAS_BLOQUEADOS_EN_RANGO',
  'MODO_LEGACY',
  // Sprint 44 — fechaInicio cae en un día sin slots cargados; el
  // generador la corre al próximo día con slots para evitar partidos
  // sin horario.
  'FECHA_INICIO_AJUSTADA_POR_HORARIOS',
] as const;
export type CodigoAdvertencia = (typeof CODIGO_ADVERTENCIA)[number];

export const FixtureAdvertenciaSchema = z.object({
  codigo: z.enum(CODIGO_ADVERTENCIA),
  nivel: z.enum(NIVEL_ADVERTENCIA),
  mensaje: z.string(),
  /** Datos extra opcionales para que la UI pueda render más rico. */
  detalle: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type FixtureAdvertencia = z.infer<typeof FixtureAdvertenciaSchema>;

export const FixturePrevalidacionSchema = z.object({
  /** True si NO hay errores (puede haber WARN/INFO). */
  ok: z.boolean(),
  equiposCount: z.number().int(),
  horariosCount: z.number().int(),
  canchasDisponiblesCount: z.number().int(),
  modoGeneracion: z.enum(['HORARIOS_TORNEO', 'INPUT_LEGACY']),
  advertencias: z.array(FixtureAdvertenciaSchema),
});
export type FixturePrevalidacion = z.infer<typeof FixturePrevalidacionSchema>;
