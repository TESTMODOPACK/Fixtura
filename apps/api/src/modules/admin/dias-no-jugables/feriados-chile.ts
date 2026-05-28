import type { FeriadoChile } from '@fixtura/types';

/**
 * Feriados nacionales de Chile con fecha fija.
 *
 * No incluyo los móviles (Viernes Santo, Sábado Santo, San Pedro y
 * San Pablo, Asunción de la Virgen, Reformación, Todos los Santos)
 * porque su cálculo requiere ya sea la regla de Pascua o una tabla
 * por año oficial. Para una v1 confiable, devolvemos los fijos y el
 * admin agrega los móviles a mano cuando los necesite. Si después
 * conectamos un servicio (api.feriadosapp.com o similar) cubrimos
 * todos.
 *
 * Fuente: Ley 19.973 + DS oficiales que rigen el calendario laboral.
 */
const FERIADOS_FIJOS: ReadonlyArray<{ mes: number; dia: number; motivo: string }> = [
  { mes: 1, dia: 1, motivo: 'Año Nuevo' },
  { mes: 5, dia: 1, motivo: 'Día del Trabajo' },
  { mes: 5, dia: 21, motivo: 'Glorias Navales (Combate de Iquique)' },
  { mes: 6, dia: 20, motivo: 'Día Nacional de los Pueblos Indígenas' },
  { mes: 7, dia: 16, motivo: 'Virgen del Carmen' },
  { mes: 9, dia: 18, motivo: 'Independencia Nacional' },
  { mes: 9, dia: 19, motivo: 'Día de las Glorias del Ejército' },
  { mes: 10, dia: 12, motivo: 'Encuentro de Dos Mundos' },
  { mes: 12, dia: 8, motivo: 'Inmaculada Concepción' },
  { mes: 12, dia: 25, motivo: 'Navidad' },
];

export function getFeriadosFijosChile(anio: number): FeriadoChile[] {
  return FERIADOS_FIJOS.map((f) => ({
    fecha: `${anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`,
    motivo: f.motivo,
  }));
}
