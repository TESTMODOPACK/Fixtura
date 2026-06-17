import { z } from 'zod';

/**
 * Informes para visibilidad del administrador (y delegados, acotado al
 * club). Todos son de SOLO LECTURA. Fase 1: Disciplina.
 */

/** Acumulación de amarillas que dispara una fecha de suspensión. */
export const AMARILLAS_PARA_SUSPENSION = 5;

/** Estado de la multa asociada a una sanción, derivado del cobro. */
export const ESTADO_MULTA_INFORME = ['PAGADO', 'PENDIENTE', 'VENCIDO'] as const;
export type EstadoMultaInforme = (typeof ESTADO_MULTA_INFORME)[number];

// ─── Informe 1: expulsados de una fecha ──────────────────────────────
export const ExpulsadoFechaSchema = z.object({
  incidenciaId: z.uuid(),
  fechaNumero: z.number().int(),
  partidoId: z.uuid(),
  partidoLabel: z.string(), // "Local vs Visita"
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  // 'ROJA' (directa) | 'AMARILLA_ROJA' (doble amarilla)
  tipo: z.enum(['ROJA', 'AMARILLA_ROJA']),
  minuto: z.number().int().nullable(),
  // Sanción generada (si la hay) y su multa.
  fechasSancion: z.number().int().nullable(),
  multaMonto: z.number().int().nullable(),
  multaEstado: z.enum(ESTADO_MULTA_INFORME).nullable(),
});
export type ExpulsadoFecha = z.infer<typeof ExpulsadoFechaSchema>;

// ─── Informe 2: sancionados vigentes ─────────────────────────────────
export const SancionVigenteSchema = z.object({
  sancionId: z.uuid(),
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  torneoNombre: z.string().nullable(),
  motivo: z.string(),
  fechasTotales: z.number().int(),
  fechasCumplidas: z.number().int(),
  fechasPendientes: z.number().int(),
  desdeFechaNumero: z.number().int(),
  // Fecha (número) en la que vuelve a estar habilitado.
  vuelveEnFecha: z.number().int(),
  cumplida: z.boolean(),
  multaMonto: z.number().int().nullable(),
  multaEstado: z.enum(ESTADO_MULTA_INFORME).nullable(),
});
export type SancionVigente = z.infer<typeof SancionVigenteSchema>;

// ─── Informe 3: en riesgo de suspensión por amarillas ────────────────
export const EnRiesgoAmarillaSchema = z.object({
  jugadorId: z.uuid(),
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  amarillas: z.number().int(),
  // Cuántas amarillas más para la próxima fecha de suspensión.
  faltanParaSuspension: z.number().int(),
});
export type EnRiesgoAmarilla = z.infer<typeof EnRiesgoAmarillaSchema>;

// ─── Fase 2: Finanzas ────────────────────────────────────────────────

/** Estado de cuenta agregado por club. */
export const EstadoCuentaClubSchema = z.object({
  clubId: z.uuid().nullable(),
  clubNombre: z.string().nullable(),
  total: z.number().int(),
  pagado: z.number().int(),
  pendiente: z.number().int(),
  vencido: z.number().int(),
  saldo: z.number().int(), // pendiente + vencido
});
export type EstadoCuentaClub = z.infer<typeof EstadoCuentaClubSchema>;

/** Multa pendiente de pago (disciplina × cobros). */
export const MultaPendienteSchema = z.object({
  cobroId: z.uuid(),
  concepto: z.string(),
  clubNombre: z.string().nullable(),
  torneoNombre: z.string().nullable(),
  monto: z.number().int(),
  vencimiento: z.string().nullable(),
  estado: z.enum(['PENDIENTE', 'VENCIDO']),
});
export type MultaPendiente = z.infer<typeof MultaPendienteSchema>;

/** Cobro vencido (moroso). */
export const MorosoSchema = z.object({
  cobroId: z.uuid(),
  clubNombre: z.string().nullable(),
  concepto: z.string(),
  monto: z.number().int(),
  vencimiento: z.string().nullable(),
  diasMora: z.number().int(),
  estadoDunning: z.string(),
  avisos: z.number().int(),
});
export type Moroso = z.infer<typeof MorosoSchema>;

/** Recaudación por concepto (categoría de cobro). */
export const RecaudacionConceptoSchema = z.object({
  categoria: z.string(),
  cobrado: z.number().int(),
  porCobrar: z.number().int(),
  total: z.number().int(),
  cantidad: z.number().int(),
});
export type RecaudacionConcepto = z.infer<typeof RecaudacionConceptoSchema>;

// ─── Fase 3: Competición ─────────────────────────────────────────────

/** Fila de la tabla de posiciones (informe exportable por torneo). */
export const FilaPosicionInformeSchema = z.object({
  posicion: z.number().int(),
  clubNombre: z.string(),
  pj: z.number().int(),
  pg: z.number().int(),
  pe: z.number().int(),
  pp: z.number().int(),
  gf: z.number().int(),
  gc: z.number().int(),
  dg: z.number().int(),
  pts: z.number().int(),
});
export type FilaPosicionInforme = z.infer<typeof FilaPosicionInformeSchema>;

/** Goleador acumulado del torneo. */
export const GoleadorInformeSchema = z.object({
  posicion: z.number().int(),
  jugadorNombre: z.string(),
  rut: z.string().nullable(),
  clubNombre: z.string().nullable(),
  goles: z.number().int(),
});
export type GoleadorInforme = z.infer<typeof GoleadorInformeSchema>;

/** Resultado de un partido (informe de resultados por fecha). */
export const ResultadoPartidoInformeSchema = z.object({
  partidoId: z.uuid(),
  fechaNumero: z.number().int(),
  localNombre: z.string().nullable(),
  visitaNombre: z.string().nullable(),
  golesLocal: z.number().int().nullable(),
  golesVisita: z.number().int().nullable(),
  estado: z.string(),
  fechaHora: z.string().nullable(),
  canchaNombre: z.string().nullable(),
});
export type ResultadoPartidoInforme = z.infer<typeof ResultadoPartidoInformeSchema>;

// ─── Fase 4: Arbitraje / operación ───────────────────────────────────

/** Estado de la designación (igual que EstadoDesignacion del backend). */
export const ESTADO_DESIGNACION_INFORME = [
  'PROPUESTA',
  'CONFIRMADA',
  'RECHAZADA',
  'ASISTIO',
  'AUSENTE',
] as const;
export type EstadoDesignacionInforme = (typeof ESTADO_DESIGNACION_INFORME)[number];

/** Designación de un árbitro / personal a un partido. */
export const DesignacionInformeSchema = z.object({
  designacionId: z.uuid(),
  fechaNumero: z.number().int(),
  partidoId: z.uuid(),
  partidoLabel: z.string(), // "Local vs Visita"
  fechaHora: z.string().nullable(),
  canchaNombre: z.string().nullable(),
  personalNombre: z.string(),
  rut: z.string().nullable(),
  // Rol asignado en el partido (ARBITRO_PRINCIPAL | ARBITRO_ASISTENTE | PLANILLERO).
  rol: z.string(),
  estado: z.enum(ESTADO_DESIGNACION_INFORME),
  monto: z.number().int().nullable(),
});
export type DesignacionInforme = z.infer<typeof DesignacionInformeSchema>;

/** Cobertura arbitral de un partido: slots cubiertos por rol. */
export const CoberturaPartidoSchema = z.object({
  partidoId: z.uuid(),
  fechaNumero: z.number().int(),
  partidoLabel: z.string(),
  fechaHora: z.string().nullable(),
  canchaNombre: z.string().nullable(),
  estado: z.string(),
  // Conteo de designaciones vigentes (no rechazadas ni ausentes) por rol.
  arbitroPrincipal: z.number().int(),
  arbitroAsistente: z.number().int(),
  planillero: z.number().int(),
  // Gap crítico: el partido no tiene árbitro principal asignado.
  tieneArbitroPrincipal: z.boolean(),
});
export type CoberturaPartido = z.infer<typeof CoberturaPartidoSchema>;

/** Pagos a un miembro del personal (cuentas por pagar). */
export const PagoPersonalSchema = z.object({
  personalId: z.uuid(),
  personalNombre: z.string(),
  rut: z.string().nullable(),
  rol: z.string(),
  // Designaciones con asistencia (devengo generado).
  designaciones: z.number().int(),
  devengado: z.number().int(),
  pagado: z.number().int(),
  pendiente: z.number().int(),
});
export type PagoPersonal = z.infer<typeof PagoPersonalSchema>;
