import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifrado simétrico para secretos en reposo (credenciales de pasarela de
 * pago por liga). AES-256-GCM con clave de 32 bytes en `PAGOS_ENC_KEY`
 * (base64). Generarla con: `openssl rand -base64 32`.
 *
 * Formato del blob: base64( iv(12) | authTag(16) | ciphertext ).
 *
 * Sin la env var, `cifrar` falla loud (no guardamos secretos sin protección)
 * y `descifrar` devuelve null (el caller decide cómo degradar).
 */
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer | null {
  const raw = process.env.PAGOS_ENC_KEY;
  if (!raw || raw.trim().length === 0) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'PAGOS_ENC_KEY inválida: debe ser 32 bytes en base64 (openssl rand -base64 32).',
    );
  }
  return key;
}

export function cifrarSecreto(plaintext: string): string {
  const key = getKey();
  if (!key) {
    throw new Error(
      'PAGOS_ENC_KEY no configurada — no se pueden guardar credenciales de pasarela.',
    );
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function descifrarSecreto(blob: string): string | null {
  const key = getKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
