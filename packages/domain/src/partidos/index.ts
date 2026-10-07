import type { EstadoPartido } from '@fixtura/types';

/**
 * Máquina de estados de partido/fecha (T20, auditoría A-4).
 *
 * Una sola fuente de verdad para dos preguntas distintas que el código
 * mezclaba (con 7+ copias divergentes):
 *   - ¿El partido está RESUELTO? → la fecha puede cerrarse aunque haya un
 *     NO_JUGADO o un suspendido: ya no se espera un acta de ese partido.
 *   - ¿El partido CUENTA para la tabla? → solo los que terminaron con
 *     marcador válido (FINALIZADO, WALKOVER).
 *
 * Confundirlas era el bug A-4: una fecha con un NO_JUGADO nunca se
 * finalizaba y las suspensiones no se descontaban jamás.
 */

export const ESTADOS_PARTIDO_RESUELTO = [
  'FINALIZADO',
  'WALKOVER',
  'NO_JUGADO',
  'SUSPENDIDO_FUERZA_MAYOR',
  'REPROGRAMADO',
] as const;

export const ESTADOS_PARTIDO_CUENTAN_TABLA = ['FINALIZADO', 'WALKOVER'] as const;

/** El partido ya no espera acta: terminó, o quedó fuera de juego para su fecha. */
export function esPartidoResuelto(estado: EstadoPartido): boolean {
  return (ESTADOS_PARTIDO_RESUELTO as readonly string[]).includes(estado);
}

/** El partido aporta puntos/goles a la tabla de posiciones. */
export function cuentaParaTabla(estado: EstadoPartido): boolean {
  return (ESTADOS_PARTIDO_CUENTAN_TABLA as readonly string[]).includes(estado);
}

/**
 * La fecha está completa cuando TODOS sus partidos están resueltos.
 * Una fecha sin partidos NO está completa: finalizarla dispararía el
 * descuento de sanciones sin que se haya jugado nada.
 */
export function fechaCompleta(estadosDePartidos: readonly EstadoPartido[]): boolean {
  return estadosDePartidos.length > 0 && estadosDePartidos.every(esPartidoResuelto);
}
