import { z } from 'zod';

/**
 * Vista cross-tenant de jugadores: listado plano con info de equipo y
 * torneo + stats agregados del torneo de cada uno. Sirve para que el
 * admin de liga busque rápido cualquier jugador, en cualquier club.
 */

export const JugadorGlobalSchema = z.object({
  jugadorId: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  apodo: z.string().nullable(),
  rut: z.string().nullable(),
  numeroCamiseta: z.number().int().nullable(),
  posicion: z.string().nullable(),
  capitan: z.boolean(),
  activo: z.boolean(),
  equipoId: z.uuid(),
  equipoNombre: z.string(),
  equipoSlug: z.string(),
  torneoId: z.uuid(),
  torneoNombre: z.string(),
  torneoEstado: z.string(),
  // Stats del jugador en su torneo actual
  goles: z.number().int(),
  amarillas: z.number().int(),
  rojas: z.number().int(),
  mvps: z.number().int(),
  partidosJugados: z.number().int(),
  // Si hay sanción activa, mostramos warning
  tieneSancionActiva: z.boolean(),
});
export type JugadorGlobal = z.infer<typeof JugadorGlobalSchema>;

export const JugadoresGlobalQuerySchema = z.object({
  search: z.string().optional(),
  torneoId: z.uuid().optional(),
  equipoId: z.uuid().optional(),
  // 'activos' = solo activos, 'todos' = incluye inactivos
  estado: z.enum(['activos', 'todos']).optional(),
});
export type JugadoresGlobalQuery = z.infer<typeof JugadoresGlobalQuerySchema>;
