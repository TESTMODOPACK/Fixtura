import { z } from 'zod';

/**
 * Portal del Jugador (MOV-2) — el jugador es un `user` con rol JUGADOR
 * (scope PERSONAL, scopeId = jugadorId), igual que árbitro/planillero. El
 * backend nunca recibe el jugadorId por parámetro: lo deriva del JWT.
 *
 * Vistas de SOLO LECTURA de sus propios datos: perfil + stats + sanciones
 * (reusa JugadorGlobalDetalle) y los partidos de su club (reusa
 * PartidoDelegado). Este archivo solo define la invitación/activación.
 */

export const CANAL_INVITACION_JUGADOR = ['EMAIL', 'WHATSAPP', 'AMBOS'] as const;
export type CanalInvitacionJugador = (typeof CANAL_INVITACION_JUGADOR)[number];

/**
 * El nombre del jugador sale de su ficha (no se tipea). El email es opcional:
 * si no viene, se usa el de la ficha del jugador. Es el identificador de
 * login, así que tiene que existir uno u otro.
 */
export const InvitarJugadorSchema = z.object({
  email: z.string().email().max(150).optional().nullable(),
  telefono: z.string().max(50).optional().nullable(),
  canal: z.enum(CANAL_INVITACION_JUGADOR).optional(),
});
export type InvitarJugadorRequest = z.infer<typeof InvitarJugadorSchema>;

export const InvitarJugadorResponseSchema = z.object({
  ok: z.boolean(),
  emailEnviado: z.boolean(),
  whatsappEnviado: z.boolean(),
  mensaje: z.string(),
});
export type InvitarJugadorResponse = z.infer<typeof InvitarJugadorResponseSchema>;

/**
 * Resultado de la invitación MASIVA del plantel de un club (todas las
 * categorías). Solo se invita por email a los jugadores activos que aún no
 * tienen cuenta; los que ya la tienen se saltan y los sin email se listan
 * aparte para que el admin los complete.
 */
export const InvitarPlantelMasivoResponseSchema = z.object({
  total: z.number().int(), // jugadores activos del club considerados
  invitados: z.number().int(), // se les envió la invitación por email
  yaActivos: z.number().int(), // ya tenían cuenta → saltados
  sinEmail: z.number().int(), // sin email en la ficha → no se puede invitar
  fallidos: z.number().int(), // el email no pudo enviarse (best-effort)
  saltadosSinEmail: z.array(
    z.object({
      jugadorId: z.uuid(),
      nombre: z.string(),
      categoriaNombre: z.string(),
    }),
  ),
});
export type InvitarPlantelMasivoResponse = z.infer<
  typeof InvitarPlantelMasivoResponseSchema
>;

/** Estado de la cuenta del jugador, para la ficha admin del plantel. */
export const JugadorCuentaSchema = z.object({
  userId: z.uuid().nullable(),
  nombre: z.string().nullable(),
  email: z.string().nullable(),
  estado: z.enum(['SIN_INVITAR', 'PENDIENTE', 'ACTIVA']),
  invitadoAt: z.iso.datetime().nullable(),
  activadoAt: z.iso.datetime().nullable(),
});
export type JugadorCuenta = z.infer<typeof JugadorCuentaSchema>;

/** Token de activación → info para que el jugador fije su contraseña. */
export const ActivarJugadorInfoSchema = z.object({
  nombre: z.string(),
  email: z.string().nullable(),
  clubNombre: z.string(),
  ligaNombre: z.string(),
});
export type ActivarJugadorInfo = z.infer<typeof ActivarJugadorInfoSchema>;

export const ActivarJugadorSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});
export type ActivarJugadorRequest = z.infer<typeof ActivarJugadorSchema>;

// ─── Carnet digital con QR ────────────────────────────────────────────
// El jugador muestra su carnet (QR firmado, TTL corto) desde /jugador; el
// árbitro/planillero lo escanea desde /personal y ve al instante si está
// habilitado (ficha activa, sin veto, sin sanción vigente, en planilla).

/** Datos visibles del carnet (los mismos que ve el verificador). */
export const CarnetJugadorDatosSchema = z.object({
  id: z.uuid(),
  nombres: z.string(),
  apellidos: z.string(),
  rut: z.string(),
  clubNombre: z.string(),
  clubEscudoUrl: z.string().nullable(),
  categoriaNombre: z.string(),
  numeroCamiseta: z.number().int().nullable(),
});
export type CarnetJugadorDatos = z.infer<typeof CarnetJugadorDatosSchema>;

export const CarnetJugadorSchema = z.object({
  /** Token firmado (HMAC) que se codifica en el QR. */
  qr: z.string(),
  expiraAt: z.iso.datetime(),
  ligaNombre: z.string(),
  jugador: CarnetJugadorDatosSchema,
});
export type CarnetJugador = z.infer<typeof CarnetJugadorSchema>;

/** Verificación: por QR escaneado o por RUT manual (uno de los dos). */
export const VerificarCarnetSchema = z.object({
  qr: z.string().max(500).optional(),
  rut: z.string().max(20).optional(),
  /** Contexto opcional: valida además la planilla de este torneo. */
  torneoId: z.uuid().optional(),
});
export type VerificarCarnetRequest = z.infer<typeof VerificarCarnetSchema>;

export const VerificacionCarnetSchema = z.object({
  encontrado: z.boolean(),
  /** null = verificación por RUT (sin QR). false = QR inválido/vencido. */
  qrValido: z.boolean().nullable(),
  habilitado: z.boolean(),
  /** Razones cuando NO está habilitado (sanción, veto, ficha, planilla). */
  motivos: z.array(z.string()),
  jugador: CarnetJugadorDatosSchema.nullable(),
  /** Torneos activos donde el jugador figura en planilla. */
  torneosEnPlanilla: z.array(z.string()),
});
export type VerificacionCarnet = z.infer<typeof VerificacionCarnetSchema>;
