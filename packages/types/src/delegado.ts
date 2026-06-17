import { z } from 'zod';

import { CobroAdminSchema } from './cobros';

/**
 * Portal del Delegado (F55) — vistas de SOLO LECTURA acotadas al club del
 * delegado, más el pago online de sus deudas. El delegado es un `user` con
 * rol DELEGADO_EQUIPO (scope TEAM, scopeId = clubId). El backend nunca recibe
 * el clubId por parámetro: lo deriva del JWT y filtra todo por él.
 */

// ─── Invitación / activación ─────────────────────────────────────────

export const CANAL_INVITACION_DELEGADO = ['EMAIL', 'WHATSAPP', 'AMBOS'] as const;
export type CanalInvitacionDelegado = (typeof CANAL_INVITACION_DELEGADO)[number];

export const InvitarDelegadoSchema = z.object({
  nombre: z.string().min(2).max(150),
  email: z.string().email().max(150).optional().nullable(),
  telefono: z.string().max(50).optional().nullable(),
  canal: z.enum(CANAL_INVITACION_DELEGADO).optional(),
});
export type InvitarDelegadoRequest = z.infer<typeof InvitarDelegadoSchema>;

export const InvitarDelegadoResponseSchema = z.object({
  ok: z.boolean(),
  emailEnviado: z.boolean(),
  whatsappEnviado: z.boolean(),
  mensaje: z.string(),
});
export type InvitarDelegadoResponse = z.infer<typeof InvitarDelegadoResponseSchema>;

/** Estado de la invitación de delegado, para mostrar en la ficha del club. */
export const DelegadoCuentaSchema = z.object({
  userId: z.uuid().nullable(),
  nombre: z.string().nullable(),
  email: z.string().nullable(),
  // PENDIENTE = invitado, no activó | ACTIVA = ya tiene cuenta | SIN_INVITAR
  estado: z.enum(['SIN_INVITAR', 'PENDIENTE', 'ACTIVA']),
  invitadoAt: z.iso.datetime().nullable(),
  activadoAt: z.iso.datetime().nullable(),
});
export type DelegadoCuenta = z.infer<typeof DelegadoCuentaSchema>;

/** Token de activación → info para que el delegado fije su contraseña. */
export const ActivarDelegadoInfoSchema = z.object({
  nombre: z.string(),
  email: z.string().nullable(),
  clubNombre: z.string(),
  ligaNombre: z.string(),
});
export type ActivarDelegadoInfo = z.infer<typeof ActivarDelegadoInfoSchema>;

export const ActivarDelegadoSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});
export type ActivarDelegadoRequest = z.infer<typeof ActivarDelegadoSchema>;

// ─── Mi club (perfil + inscripciones) ────────────────────────────────

export const InscripcionDelegadoSchema = z.object({
  inscripcionId: z.uuid(),
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  categoriaNombre: z.string().nullable(),
  serieNombre: z.string().nullable(),
  estado: z.string(),
});
export type InscripcionDelegado = z.infer<typeof InscripcionDelegadoSchema>;

export const MiClubDelegadoSchema = z.object({
  clubId: z.uuid(),
  nombre: z.string(),
  escudoUrl: z.string().nullable(),
  colorPrimario: z.string().nullable(),
  colorSecundario: z.string().nullable(),
  ligaNombre: z.string(),
  inscripciones: z.array(InscripcionDelegadoSchema),
});
export type MiClubDelegado = z.infer<typeof MiClubDelegadoSchema>;

// ─── Plantel ─────────────────────────────────────────────────────────

export const JugadorDelegadoSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  rut: z.string().nullable(),
  numeroCamiseta: z.number().int().nullable(),
  posicion: z.string().nullable(),
  estado: z.string(),
});
export type JugadorDelegado = z.infer<typeof JugadorDelegadoSchema>;

/** El plantel del club se agrupa por categoría (Jugador es club+categoría). */
export const PlantelCategoriaDelegadoSchema = z.object({
  categoriaId: z.uuid(),
  categoriaNombre: z.string().nullable(),
  jugadores: z.array(JugadorDelegadoSchema),
});
export type PlantelCategoriaDelegado = z.infer<typeof PlantelCategoriaDelegadoSchema>;

// ─── Partidos / resultados ───────────────────────────────────────────

export const PartidoDelegadoSchema = z.object({
  partidoId: z.uuid(),
  torneoNombre: z.string(),
  categoriaNombre: z.string().nullable(),
  fechaNumero: z.number().int().nullable(),
  fechaReprogramada: z.boolean(),
  fechaHora: z.iso.datetime().nullable(),
  canchaNombre: z.string().nullable(),
  esLocal: z.boolean(),
  rivalNombre: z.string(),
  golesFavor: z.number().int().nullable(),
  golesContra: z.number().int().nullable(),
  estado: z.string(),
  // PG / PE / PP / null (si no jugado o no aplica)
  resultado: z.enum(['GANADO', 'EMPATADO', 'PERDIDO']).nullable(),
});
export type PartidoDelegado = z.infer<typeof PartidoDelegadoSchema>;

// ─── Estadísticas ────────────────────────────────────────────────────

export const EstadisticasInscripcionSchema = z.object({
  inscripcionId: z.uuid(),
  torneoNombre: z.string(),
  categoriaNombre: z.string().nullable(),
  pj: z.number().int(),
  pg: z.number().int(),
  pe: z.number().int(),
  pp: z.number().int(),
  gf: z.number().int(),
  gc: z.number().int(),
  puntos: z.number().int(),
  amarillas: z.number().int(),
  rojas: z.number().int(),
});
export type EstadisticasInscripcion = z.infer<typeof EstadisticasInscripcionSchema>;

export const SancionDelegadoSchema = z.object({
  id: z.uuid(),
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  torneoNombre: z.string().nullable(),
  motivo: z.string(),
  fechasPendientes: z.number().int(),
  cumplida: z.boolean(),
});
export type SancionDelegado = z.infer<typeof SancionDelegadoSchema>;

export const EstadisticasDelegadoSchema = z.object({
  porInscripcion: z.array(EstadisticasInscripcionSchema),
  sanciones: z.array(SancionDelegadoSchema),
});
export type EstadisticasDelegado = z.infer<typeof EstadisticasDelegadoSchema>;

// ─── Finanzas / deudas ───────────────────────────────────────────────

/** El delegado ve la misma forma de cobro que el admin (read-only). */
export const CobroDelegadoSchema = CobroAdminSchema;
export type CobroDelegado = z.infer<typeof CobroDelegadoSchema>;

export const FinanzasDelegadoSchema = z.object({
  cobros: z.array(CobroDelegadoSchema),
  totalPendiente: z.number().int(),
  totalVencido: z.number().int(),
});
export type FinanzasDelegado = z.infer<typeof FinanzasDelegadoSchema>;

// ─── Panel / resumen ─────────────────────────────────────────────────

export const ResumenDelegadoSchema = z.object({
  clubNombre: z.string(),
  escudoUrl: z.string().nullable(),
  totalPendiente: z.number().int(),
  cobrosPendientes: z.number().int(),
  sancionesActivas: z.number().int(),
  proximoPartido: PartidoDelegadoSchema.nullable(),
});
export type ResumenDelegado = z.infer<typeof ResumenDelegadoSchema>;
