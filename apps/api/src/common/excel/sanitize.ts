/**
 * Previene formula/CSV injection en exports .xlsx/.csv.
 *
 * Excel y LibreOffice interpretan una celda de TEXTO que empieza con
 * `= + - @` (o tab / retorno de carro) como fórmula al abrir el archivo:
 * `=HYPERLINK(...)`, `=WEBSERVICE(...)` o DDE permiten exfiltrar datos o
 * ejecutar comandos en la máquina de quien abre el archivo. Como los valores
 * (nombres, bancos, n° de cuenta) vienen de datos cargados por delegados o
 * importados, hay que neutralizarlos.
 *
 * Prefijar con comilla simple fuerza a Excel a tratar la celda como texto
 * literal — y la comilla NO se muestra. Solo aplica a strings; números y
 * booleanos pasan intactos.
 */
export function sanitizarCeldaExcel<T>(valor: T): T | string {
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(valor)) {
    return `'${valor}`;
  }
  return valor;
}

/** Sanitiza todos los valores string de una fila (objeto plano) para export. */
export function sanitizarFilaExcel<T extends Record<string, unknown>>(
  fila: T,
): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    salida[k] = sanitizarCeldaExcel(v);
  }
  return salida;
}
