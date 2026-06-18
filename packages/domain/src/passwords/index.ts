/**
 * Política de contraseñas del sistema (perfil "equilibrado", alineado a
 * NIST 800-63B / OWASP):
 *
 *   - Longitud entre PASSWORD_MIN_LENGTH y PASSWORD_MAX_LENGTH.
 *   - No puede estar en la lista de contraseñas comunes/débiles.
 *   - No puede ser un solo carácter repetido ni una secuencia trivial.
 *   - Debe tener un piso mínimo de variedad (caracteres distintos) — esto
 *     es un piso de entropía, NO una regla rígida de composición (no se
 *     exige mayúscula/símbolo, desaconsejado por NIST).
 *   - No puede contener el email, nombre o apellido del propio usuario.
 *
 * El mismo validador se usa en el backend (antes de hashear, en TODAS las
 * rutas que setean contraseña) y en el frontend (validación + medidor de
 * fortaleza), para que la regla sea única y consistente.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Lista de contraseñas y patrones comunes/débiles. No pretende ser
 * exhaustiva (eso requeriría una base tipo HaveIBeenPwned); cubre los
 * candidatos que un atacante prueba primero y los términos propios del
 * dominio (ligaplus, fixtura, futbol…). Comparación case-insensitive.
 */
const COMMON_PASSWORDS = new Set<string>([
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwertyui',
  'qwertyuiop',
  'qwerty123',
  '1234qwer',
  '11111111',
  '00000000',
  'abcd1234',
  'abc12345',
  'a1b2c3d4',
  'iloveyou',
  'administrator',
  'adminadmin',
  'letmein123',
  'welcome1',
  'welcome123',
  'changeme',
  'changeme1',
  'football',
  'futbol123',
  'baseball',
  'superman',
  'ligaplus',
  'ligaplus1',
  'ligaplus123',
  'fixtura123',
  'contrasena',
  'contraseña',
  'clave1234',
  'clave12345',
  '1q2w3e4r',
  '1qaz2wsx',
  'zaq12wsx',
  'q1w2e3r4',
  'asdfghjk',
  'asdfasdf',
  'asdf1234',
  'sunshine',
  'princess',
  'trustno1',
]);

const TRIVIAL_SEQUENCES = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

export interface PasswordContext {
  email?: string | null;
  nombre?: string | null;
  apellido?: string | null;
}

function emailLocalPart(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  return (at > 0 ? email.slice(0, at) : email).toLowerCase();
}

function contarClasesDeCaracter(pwd: string): number {
  let n = 0;
  if (/[a-z]/.test(pwd)) n++;
  if (/[A-Z]/.test(pwd)) n++;
  if (/[0-9]/.test(pwd)) n++;
  if (/[^a-zA-Z0-9]/.test(pwd)) n++;
  return n;
}

function caracteresDistintos(pwd: string): number {
  return new Set(pwd.split('')).size;
}

function esSecuenciaTrivial(lower: string): boolean {
  if (lower.length < 6) return false;
  for (const seq of TRIVIAL_SEQUENCES) {
    const rev = seq.split('').reverse().join('');
    if (seq.includes(lower) || rev.includes(lower)) return true;
  }
  return false;
}

/**
 * Valida la fortaleza de una contraseña. Devuelve `null` si es válida, o
 * un mensaje de error en español (listo para mostrar al usuario) si no.
 */
export function validarPasswordSegura(
  password: string,
  ctx: PasswordContext = {},
): string | null {
  const pwd = password ?? '';

  if (pwd.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (pwd.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña es demasiado larga (máximo ${PASSWORD_MAX_LENGTH} caracteres).`;
  }

  const lower = pwd.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    return 'Esa contraseña es demasiado común. Elige una más difícil de adivinar.';
  }
  if (/^(.)\1+$/.test(pwd)) {
    return 'La contraseña no puede ser un solo carácter repetido.';
  }
  if (esSecuenciaTrivial(lower)) {
    return 'La contraseña es una secuencia demasiado predecible.';
  }
  if (caracteresDistintos(pwd) < 4) {
    return 'La contraseña es muy repetitiva. Usa más caracteres distintos.';
  }

  const piezas = [emailLocalPart(ctx.email), ctx.nombre, ctx.apellido]
    .map((p) => (p ?? '').trim().toLowerCase())
    .filter((p) => p.length >= 3);
  for (const pieza of piezas) {
    if (lower.includes(pieza)) {
      return 'La contraseña no puede contener tu nombre ni tu correo.';
    }
  }

  return null;
}

export type FortalezaScore = 0 | 1 | 2 | 3 | 4;

export interface FortalezaPassword {
  score: FortalezaScore;
  etiqueta: string;
}

/**
 * Puntaje 0–4 de fortaleza para el medidor visual. Una contraseña que NO
 * pasa la validación dura queda como "Débil" (score 1); a partir de ahí
 * suma por longitud y variedad. score 0 = campo vacío.
 */
export function calcularFortalezaPassword(
  password: string,
  ctx: PasswordContext = {},
): FortalezaPassword {
  const pwd = password ?? '';
  if (pwd.length === 0) return { score: 0, etiqueta: '' };
  if (validarPasswordSegura(pwd, ctx)) return { score: 1, etiqueta: 'Débil' };

  let score = 2;
  if (pwd.length >= 12) score++;
  if (pwd.length >= 16 || caracteresDistintos(pwd) >= 8 || contarClasesDeCaracter(pwd) >= 3) {
    score++;
  }
  const s = Math.min(4, score) as FortalezaScore;
  const etiqueta = s >= 4 ? 'Fuerte' : s === 3 ? 'Buena' : 'Aceptable';
  return { score: s, etiqueta };
}
