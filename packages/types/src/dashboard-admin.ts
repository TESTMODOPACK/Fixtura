import { z } from 'zod';

/**
 * Dashboard del admin de liga — agregados cross-torneo para vista de
 * un solo vistazo. El backend computa todo esto en una sola request
 * (varias queries paralelas internamente).
 */

export const DashboardTopGoleadorSchema = z.object({
  jugadorId: z.uuid(),
  nombre: z.string(),
  apellido: z.string(),
  equipoNombre: z.string(),
  goles: z.number().int(),
});
export type DashboardTopGoleador = z.infer<typeof DashboardTopGoleadorSchema>;

export const DashboardTopEquipoSchema = z.object({
  equipoId: z.uuid(),
  nombre: z.string(),
  partidosJugados: z.number().int(),
  victorias: z.number().int(),
  empates: z.number().int(),
  derrotas: z.number().int(),
  golesFavor: z.number().int(),
  golesContra: z.number().int(),
  puntos: z.number().int(),
});
export type DashboardTopEquipo = z.infer<typeof DashboardTopEquipoSchema>;

export const DashboardAdminSchema = z.object({
  // ─── Contexto ──────────────────────────────────────────────────────
  torneoActivo: z
    .object({
      id: z.uuid(),
      nombre: z.string(),
      temporadaNombre: z.string(),
      equiposCount: z.number().int(),
      fechasCount: z.number().int(),
    })
    .nullable(),

  // ─── Operación corriente ──────────────────────────────────────────
  proximaFecha: z
    .object({
      numero: z.number().int(),
      etiqueta: z.string().nullable(),
      partidosCount: z.number().int(),
      arbitrosAsignados: z.number().int(),
      // % de partidos con árbitro principal asignado (estado != RECHAZADA/AUSENTE)
      cobertura: z.number().int().min(0).max(100),
    })
    .nullable(),

  // Partidos con fecha_hora pasada que no tienen acta cerrada todavía
  actasPendientes: z.number().int(),

  // ─── Alertas ──────────────────────────────────────────────────────
  sancionesActivas: z.number().int(),
  carnetVencido: z.number().int(),
  carnetPorVencer: z.number().int(), // <30 días

  // ─── Cuentas globales ─────────────────────────────────────────────
  torneosActivos: z.number().int(),
  torneosDraft: z.number().int(),
  equiposTotales: z.number().int(),
  jugadoresTotales: z.number().int(),
  personalActivo: z.number().int(),

  // ─── Mini-rankings del torneo activo ──────────────────────────────
  topGoleadores: z.array(DashboardTopGoleadorSchema),
  topEquipos: z.array(DashboardTopEquipoSchema),
});
export type DashboardAdmin = z.infer<typeof DashboardAdminSchema>;
