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
