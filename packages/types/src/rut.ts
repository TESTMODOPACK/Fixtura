/**
 * Validación y formateo de RUT chileno.
 *
 * El RUT chileno se compone de un número correlativo (7-8 dígitos) y un
 * dígito verificador (0-9 o K) calculado con módulo 11.
 *
 * Formato canónico: "12.345.678-9" o sin puntos "12345678-9". Aceptamos
 * cualquier variante de espaciado/puntuación y normalizamos.
 */

/** Limpia el RUT dejando solo dígitos + K, en mayúscula. */
export function limpiarRut(rut: string): string {
  return rut.replace(/[^\dkK]/g, '').toUpperCase();
}

/**
 * Calcula el dígito verificador esperado para un número correlativo.
 * Algoritmo módulo 11 estándar.
 */
export function calcularDigitoVerificador(numero: string): string {
  let suma = 0;
  let multiplicador = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    suma += Number(numero[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = suma % 11;
  const dv = 11 - resto;
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/**
 * Valida un RUT chileno. Acepta cualquier formato razonable:
 *   "12.345.678-9", "12345678-9", "123456789", "12345678-K"
 * Tolerante con espacios y mayúsculas/minúsculas.
 */
export function validarRut(rut: string): boolean {
  if (!rut) return false;
  const limpio = limpiarRut(rut);
  if (limpio.length < 2 || limpio.length > 9) return false;
  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  // El correlativo debe ser solo dígitos
  if (!/^\d+$/.test(numero)) return false;
  // Largo razonable del correlativo: 7-8 dígitos para personas
  if (numero.length < 7 || numero.length > 8) return false;
  return calcularDigitoVerificador(numero) === dv;
}

/**
 * Formatea un RUT como "12.345.678-9". Si el input es inválido, devuelve
 * el input original sin modificar (para que la UI no oculte data).
 */
export function formatearRut(rut: string): string {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return rut;
  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(numero)) return rut;
  // Insertar puntos cada 3 dígitos desde la derecha
  const numeroConPuntos = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${numeroConPuntos}-${dv}`;
}
