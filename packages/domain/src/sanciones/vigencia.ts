/**
 * Criterio ÚNICO de vigencia de una sanción disciplinaria (T20, A-4).
 * Estaba copiado con variantes en 7 servicios; la divergencia concreta que
 * motivó esto: el carnet QR ignoraba `desdeFechaNumero` y bloqueaba a un
 * jugador cuya sanción recién empieza en una fecha futura.
 */

export interface SancionVigenciaInput {
  fechasPendientes: number;
  cumplida: boolean;
  /** Marcada por el tribunal al revocar; una revocada jamás revive (T21). */
  revocada?: boolean;
  desdeFechaNumero?: number | null;
}

/**
 * ¿La sanción bloquea jugar la fecha `fechaNumero`?
 *
 * Sin `fechaNumero` (no se sabe qué fecha se evalúa) la pregunta degrada a
 * "¿tiene fechas pendientes por cumplir?" — vigente aunque empiece en el
 * futuro. Con `fechaNumero`, una sanción que arranca después NO bloquea.
 */
export function sancionVigente(
  s: SancionVigenciaInput,
  fechaNumero?: number | null,
): boolean {
  if (s.cumplida || s.revocada) return false;
  if (s.fechasPendientes <= 0) return false;
  if (
    fechaNumero != null &&
    s.desdeFechaNumero != null &&
    s.desdeFechaNumero > fechaNumero
  ) {
    return false;
  }
  return true;
}
