/**
 * Formatea una fecha a DD-MM-YYYY (formato chileno).
 * Acepta Date o string ISO. Para fechas date-only ("2026-09-04") fija el
 * mediodía, así evita el corrimiento de día por zona horaria.
 */
export function formatFecha(value?: string | Date | null): string {
  if (!value) return '';
  const d =
    typeof value === 'string'
      ? new Date(value.length <= 10 ? `${value}T12:00:00` : value)
      : value;
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Igual que formatFecha pero agrega la hora: DD-MM-YYYY HH:mm. */
export function formatFechaHora(value?: string | Date | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatFecha(d)} ${hh}:${min}`;
}
