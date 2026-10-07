import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

/**
 * T28 — validación y verificación de dominios personalizados de liga.
 * El dominio entra a la whitelist de CORS y a la resolución de tenant por
 * host, así que un valor arbitrario era un vector de phishing/takeover.
 */

// Hostname DNS: labels a-z0-9 con guiones internos + TLD alfabético.
const HOSTNAME_RE =
  /^(?=.{4,255}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// Dominios de la plataforma y del VPS compartido: nunca asignables a una liga.
const RESERVADOS_EXACTOS = new Set([
  'ligaplus.cl',
  'eva360.cl',
  'localhost',
]);
const SUFIJOS_RESERVADOS = [
  '.ligaplus.cl',
  '.eva360.cl',
  '.localhost',
  '.test',
  '.local',
  '.internal',
  '.example',
];

/**
 * Normaliza (trim/lowercase/sin punto final) y valida el hostname.
 * '' o null → null (quitar el dominio). Lanza BadRequest si es inválido.
 * Se rechaza el prefijo www.: findByHost lo quita del Host entrante, así
 * que un dominio guardado con www. jamás haría match.
 */
export function normalizarCustomDomain(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!limpio) return null;
  if (!HOSTNAME_RE.test(limpio)) {
    throw new BadRequestException(
      `"${limpio}" no es un hostname válido (formato esperado: miliga.cl, sin https:// ni rutas).`,
    );
  }
  if (limpio.startsWith('www.')) {
    throw new BadRequestException(
      'Configura el dominio sin "www." — el www se resuelve solo.',
    );
  }
  if (
    RESERVADOS_EXACTOS.has(limpio) ||
    SUFIJOS_RESERVADOS.some((s) => limpio.endsWith(s))
  ) {
    throw new BadRequestException(`El dominio "${limpio}" está reservado.`);
  }
  return limpio;
}

/**
 * Token determinístico por tenant (HMAC con JWT_SECRET): no requiere
 * columna nueva y no expira. Es público por diseño — probar su posesión
 * no sirve de nada; lo que prueba el control del dominio es poder crear
 * el registro TXT.
 */
export function tokenVerificacionDominio(tenantId: string): string {
  const secret = process.env.JWT_SECRET ?? 'dev-secret';
  return createHmac('sha256', secret)
    .update(`customdomain:${tenantId}`)
    .digest('hex')
    .slice(0, 32);
}

export function registroTxtEsperado(dominio: string, tenantId: string): {
  host: string;
  valor: string;
} {
  return {
    host: `_ligaplus-verif.${dominio}`,
    valor: `ligaplus-verif=${tokenVerificacionDominio(tenantId)}`,
  };
}

/**
 * Verifica por DNS que el dueño del dominio creó el TXT esperado.
 * CUSTOM_DOMAIN_SKIP_DNS=true lo salta (dev/local sin DNS real).
 */
export async function verificarTxtDominio(
  dominio: string,
  tenantId: string,
): Promise<void> {
  if (process.env.CUSTOM_DOMAIN_SKIP_DNS === 'true') return;
  const { host, valor } = registroTxtEsperado(dominio, tenantId);
  let registros: string[][];
  try {
    registros = await resolveTxt(host);
  } catch {
    throw new BadRequestException(
      `No encontramos el registro TXT "${host}". Crea un TXT ahí con el valor "${valor}" y reintenta (la propagación DNS puede tardar).`,
    );
  }
  const valores = registros.map((r) => r.join('').trim());
  if (!valores.includes(valor)) {
    throw new BadRequestException(
      `El TXT de "${host}" no coincide. Valor esperado: "${valor}".`,
    );
  }
}
