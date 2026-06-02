/**
 * Helpers de edad para inscripción y validación de categorías por edad.
 *
 * Se exportan dos cálculos:
 *
 *   - calcularEdad(fechaNacimiento, hoy?): edad CUMPLIDA al día de hoy.
 *     Si todavía no cumplió años este año, devuelve la edad del año pasado.
 *
 *   - calcularEdadCalendario(fechaNacimiento, anioRef?): edad que TENDRÁ
 *     al 31-dic del año de referencia (o del año actual). Es la regla
 *     típica de las ligas para asignar categoría: el año en que cumplís
 *     X define en qué categoría jugás todo ese año, sin importar el mes.
 *
 *     Ejemplos (anioRef=2026):
 *       nacido 30-06-2000 → edadCalendario = 26 (cumple 26 en 2026)
 *       nacido 30-04-2000 → edadCalendario = 26
 *       nacido 30-12-2000 → edadCalendario = 26
 *       nacido 01-01-1990 → edadCalendario = 36
 *
 *     A diferencia de calcularEdad (que mira el día), edadCalendario solo
 *     mira el año.
 *
 * Las funciones aceptan tanto string ISO ('YYYY-MM-DD') como Date.
 * Devuelven null si el input es inválido o futuro (nacimiento > hoy).
 */

function parseFecha(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function calcularEdad(
  fechaNacimiento: string | Date | null | undefined,
  hoy: Date = new Date(),
): number | null {
  const nac = parseFecha(fechaNacimiento);
  if (!nac) return null;
  if (nac.getTime() > hoy.getTime()) return null; // fecha futura

  let edad = hoy.getUTCFullYear() - nac.getUTCFullYear();
  const mesHoy = hoy.getUTCMonth();
  const mesNac = nac.getUTCMonth();
  if (mesHoy < mesNac || (mesHoy === mesNac && hoy.getUTCDate() < nac.getUTCDate())) {
    edad -= 1;
  }
  return edad >= 0 ? edad : null;
}

export function calcularEdadCalendario(
  fechaNacimiento: string | Date | null | undefined,
  anioRef: number = new Date().getUTCFullYear(),
): number | null {
  const nac = parseFecha(fechaNacimiento);
  if (!nac) return null;
  const anioNac = nac.getUTCFullYear();
  const edad = anioRef - anioNac;
  return edad >= 0 ? edad : null;
}
