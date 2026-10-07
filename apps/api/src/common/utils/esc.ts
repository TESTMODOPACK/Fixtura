/**
 * T26 — Escape HTML mínimo para interpolar texto que origina un usuario o
 * tenant (nombres, clubes, ligas, conceptos, motivos) en las plantillas de
 * email. Sin esto, un nombre como `<img src=x onerror=…>` viaja crudo al
 * HTML del correo de otra persona.
 */
export function esc(valor: unknown): string {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
