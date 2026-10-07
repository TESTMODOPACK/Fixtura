/**
 * T27 — base URL del frontend para armar links de emails/WhatsApp.
 * FRONTEND_URL puede ser una lista separada por comas (así la consume el
 * CORS de main.ts); los links usan SIEMPRE el primer origen. Antes cada
 * servicio interpolaba la env cruda y una lista rompía todos los links.
 */
export function frontendBase(): string {
  const raw = process.env.FRONTEND_URL ?? '';
  const primera = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)[0];
  return (primera ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Link a una página del frontend con el token en el FRAGMENT (#token=…),
 * nunca en la query: el fragment no viaja al servidor, así que no queda en
 * access logs de nginx, en pino, en Sentry, en el Referer ni en el cache
 * del service worker.
 */
export function linkConToken(ruta: string, token: string): string {
  return `${frontendBase()}${ruta}#token=${encodeURIComponent(token)}`;
}
