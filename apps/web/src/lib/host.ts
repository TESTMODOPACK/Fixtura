/**
 * Helpers para detectar si el hostname actual corresponde a:
 *   - Marketing (fixtura.cl, www.fixtura.cl) → muestra landing del SaaS
 *   - Tenant (cualquier otro dominio configurado) → muestra portal de la liga
 *
 * En desarrollo (localhost, IPs, sin dominio) el comportamiento default es
 * "tenant" para que el VPS sin dominio sirva el portal de la liga demo.
 * Para forzar la vista de marketing en dev, agregar `?marketing=1` o usar
 * el dominio fixtura.local en /etc/hosts.
 */

const MARKETING_HOSTS = new Set([
  'fixtura.cl',
  'www.fixtura.cl',
  'fixtura.local',
  'www.fixtura.local',
]);

export function normalizeHost(rawHost: string | null | undefined): string {
  if (!rawHost) return '';
  return rawHost.toLowerCase().trim().replace(/:\d+$/, '');
}

export function isMarketingHost(rawHost: string | null | undefined): boolean {
  return MARKETING_HOSTS.has(normalizeHost(rawHost));
}

/**
 * Detecta si estamos en localhost / IP cruda — útil para dev sin dominio.
 * En estos casos default a "tenant" (portal de liga demo).
 */
export function isLocalOrIpHost(rawHost: string | null | undefined): boolean {
  const h = normalizeHost(rawHost);
  return h === 'localhost' || h === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(h);
}
