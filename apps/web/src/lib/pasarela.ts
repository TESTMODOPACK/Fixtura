/**
 * Redirección segura a la pasarela de pago (B6 — defensa contra open-redirect).
 *
 * La URL de redirección viene de la respuesta del backend (la pasarela), no de
 * un parámetro controlable por el usuario, así que el riesgo es bajo. Pero un
 * backend comprometido o una respuesta de pasarela manipulada podría mandar al
 * usuario a un sitio de phishing. Antes de redirigir validamos:
 *  - protocolo http(s) — bloquea javascript:/data:
 *  - host contra una allowlist de pasarelas chilenas conocidas, o el mismo
 *    origen (modo mock, que retorna a /pago/retorno de la propia app).
 */
const HOSTS_PASARELA = [
  'flow.cl',
  'transbank.cl',
  'webpay.cl',
  'mercadopago.cl',
  'mercadopago.com',
  'mercadolibre.com',
];

export function redirectToPasarela(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.origin);
  } catch {
    throw new Error('La URL de pago recibida es inválida.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('La URL de pago usa un protocolo no permitido.');
  }

  const host = url.hostname.toLowerCase();
  const esMismoOrigen = url.origin === window.location.origin;
  const esPasarela = HOSTS_PASARELA.some(
    (h) => host === h || host.endsWith(`.${h}`),
  );

  if (!esMismoOrigen && !esPasarela) {
    throw new Error(`Destino de pago no autorizado (${host}).`);
  }

  window.location.href = url.href;
}
