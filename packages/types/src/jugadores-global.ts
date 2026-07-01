import { z } from 'zod';

import type { MotivoSancion } from './sanciones';

/**
 * Vista cross-tenant del plantel global de la liga.
 *
 * Sprint 28' (ADR-0004) — Refactor: ahora lee del modelo Clubes
 * (tabla jugadores con club_id + categoria_id) en vez del modelo viejo
 * (jugadores_inscritos con equipo_id).
 *
 * Stats agregados (goles, amarillas, etc.) se calculan por RUT match
 * contra incidencias_partido del modelo viejo — el shim de
 * coexistencia (Sprint 26G.2) mantiene jugadores_inscritos con mismo
 * RUT para que las stats no se pierdan al migrar.
 */

export type EstadoJugadorGlobal = 'ACTIVO' | 'INACTIVO' | 'VETADO';

export const JugadorGlobalSchema = z.object({
  jugadorId: z.uuid(),
  nombres: z.string(),
  apellidos: z.string(),
  apodo: z.string().nullable(),
  rut: z.string(),
  email: z.string().nullable(),
  telefono: z.string().nullable(),
  numeroCamiseta: z.number().int().nullable(),
  posicion: z.string().nullable(),
  fechaNac: z.string().nullable(),
  // Calculados al vuelo desde fechaNac (no persistidos).
  edad: z.number().int().nullable(),
  edadCalendario: z.number().int().nullable(),
  capitan: z.boolean(),

  // Estado consolidado: ACTIVO (plantel activo), INACTIVO (dado de
  // baja del plantel del club) o VETADO (RUT en lista negra del tenant).
  // VETADO tiene prioridad sobre INACTIVO en la visualización.
  estado: z.enum(['ACTIVO', 'INACTIVO', 'VETADO']),
  // Motivo del veto, si aplica.
  vetoMotivo: z.string().nullable(),

  // Club al que pertenece el jugador. clubId puede ser null si por
  // alguna razón quedó huérfano (CASCADE debería evitar este caso).
  clubId: z.uuid(),
  clubNombre: z.string(),
  clubSlug: z.string(),
  clubEscudoUrl: z.string().nullable(),

  // Categoría dentro del club (Senior, Super Senior, etc.).
  categoriaId: z.uuid(),
  categoriaNombre: z.string(),

  // Stats agregados (todos los torneos del tenant donde participó).
  // Calculados vía RUT match al modelo viejo (jugadores_inscritos →
  // incidencias_partido).
  goles: z.number().int(),
  amarillas: z.number().int(),
  rojas: z.number().int(),
  mvps: z.number().int(),
  partidosJugados: z.number().int(),

  // Sanción activa (fechas_pendientes > 0, cumplida=false). Match por
  // rut a sanciones_activas. Si tiene, la UI muestra warning.
  tieneSancionActiva: z.boolean(),
});
export type JugadorGlobal = z.infer<typeof JugadorGlobalSchema>;

/**
 * Stats de un jugador desglosadas por torneo donde participó (match por
 * RUT). El total agregado de JugadorGlobal es la suma de estos rubros.
 */
export interface JugadorTorneoStats {
  torneoId: string;
  torneoNombre: string;
  goles: number;
  amarillas: number;
  rojas: number;
  mvps: number;
  partidos: number;
}

/** Sanción activa del jugador (fechas_pendientes > 0), con su torneo. */
export interface JugadorSancionDetalle {
  id: string;
  torneoId: string;
  torneoNombre: string;
  motivo: MotivoSancion;
  fechasPendientes: number;
  fechasTotales: number | null;
  desdeFechaNumero: number;
  descripcion: string | null;
  createdAt: string;
}

/**
 * Ficha completa de un jugador para la página de detalle
 * (/admin/jugadores/[id]). Extiende la fila del listado con datos de
 * ficha (pie hábil, contacto de emergencia), el desglose de stats por
 * torneo y las sanciones activas vigentes.
 */
export type JugadorGlobalDetalle = JugadorGlobal & {
  pieHabil: string | null;
  nombreContacto: string | null;
  telefonoContacto: string | null;
  porTorneo: JugadorTorneoStats[];
  sanciones: JugadorSancionDetalle[];
};

export const JugadoresGlobalQuerySchema = z.object({
  search: z.string().optional(),
  clubId: z.uuid().optional(),
  categoriaId: z.uuid().optional(),
  // 'activos' = solo ACTIVO. 'todos' = incluye INACTIVO + VETADO.
  // 'vetados' = solo los VETADO. Útil para reporte específico.
  estado: z.enum(['activos', 'todos', 'vetados']).optional(),
});
export type JugadoresGlobalQuery = z.infer<typeof JugadoresGlobalQuerySchema>;
