'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Paleta predefinida de colores comunes para clubes/equipos deportivos.
 * Pensada para que el delegado promedio pueda elegir en 1 click sin
 * tener que entender hex codes ni un color picker complejo. Si necesita
 * un color exacto (corporativo del club), el botón "Personalizado"
 * abre el color picker nativo del navegador.
 */
const COLORES_COMUNES: Array<{ hex: string; nombre: string }> = [
  { hex: '#1B4332', nombre: 'Verde LigaPlus' },
  { hex: '#2F855A', nombre: 'Verde claro' },
  { hex: '#1E3A8A', nombre: 'Azul marino' },
  { hex: '#2563EB', nombre: 'Azul' },
  { hex: '#0EA5E9', nombre: 'Celeste' },
  { hex: '#0E7490', nombre: 'Petróleo' },
  { hex: '#B91C1C', nombre: 'Rojo' },
  { hex: '#DC2626', nombre: 'Rojo vivo' },
  { hex: '#EA580C', nombre: 'Naranja' },
  { hex: '#F59E0B', nombre: 'Amarillo' },
  { hex: '#7C3AED', nombre: 'Violeta' },
  { hex: '#DB2777', nombre: 'Rosa' },
  { hex: '#92400E', nombre: 'Café' },
  { hex: '#525252', nombre: 'Gris' },
  { hex: '#000000', nombre: 'Negro' },
  { hex: '#FFFFFF', nombre: 'Blanco' },
];

export interface ColorSwatchPickerProps {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  /**
   * Si true, agrega un swatch "Sin color" que pone el valor en vacío.
   * Útil para campos opcionales como "color secundario".
   */
  allowEmpty?: boolean;
  /** Texto auxiliar debajo del picker. */
  help?: string;
  /** Mensaje de error (si existe, se muestra debajo en rojo). */
  error?: string;
}

/**
 * Selector de color por swatches. Ventajas vs `<input type="color">`:
 *   - Operador elige con 1 click (sin paletas complicadas).
 *   - Colores normalizados a una paleta limitada → más coherencia visual.
 *   - Aún permite color custom para casos especiales (botón al final).
 *   - Accesible: cada swatch tiene aria-label y se puede navegar con tab.
 */
export function ColorSwatchPicker({
  label,
  value,
  onChange,
  allowEmpty = false,
  help,
  error,
}: ColorSwatchPickerProps): React.ReactElement {
  const [showCustom, setShowCustom] = useState(false);

  // Verifica si el valor actual está fuera de la paleta común
  // (cuando lo está, mostramos el botón "Personalizado" como activo).
  const valorEnPaleta = COLORES_COMUNES.some(
    (c) => c.hex.toLowerCase() === value?.toLowerCase(),
  );
  const customActivo = !!value && !valorEnPaleta;

  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}

      <div className="flex flex-wrap gap-1.5">
        {COLORES_COMUNES.map((c) => {
          const selected = value?.toLowerCase() === c.hex.toLowerCase();
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => {
                onChange(c.hex);
                setShowCustom(false);
              }}
              className={cn(
                'w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center',
                'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
                selected
                  ? 'border-ink shadow-md'
                  : 'border-line/50 hover:border-line',
                // Si el color es blanco, agregar borde más visible
                c.hex === '#FFFFFF' && 'border-line',
              )}
              style={{ backgroundColor: c.hex }}
              title={c.nombre}
              aria-label={c.nombre}
              aria-pressed={selected}
            >
              {selected && (
                <Check
                  size={14}
                  // En colores claros (blanco/amarillo) usar tinta oscura.
                  // En oscuros usar chalk.
                  className={
                    ['#FFFFFF', '#F59E0B'].includes(c.hex)
                      ? 'text-ink'
                      : 'text-chalk'
                  }
                />
              )}
            </button>
          );
        })}

        {allowEmpty && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setShowCustom(false);
            }}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center bg-paper',
              'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
              !value
                ? 'border-ink shadow-md'
                : 'border-line/50 hover:border-line',
            )}
            title="Sin color"
            aria-label="Sin color"
          >
            <span className="text-[9px] text-ink-mute font-bold">—</span>
          </button>
        )}

        {/* Custom color picker (oculto detrás de un swatch arcoíris) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center',
              'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
              customActivo
                ? 'border-ink shadow-md'
                : 'border-line/50 hover:border-line',
            )}
            style={{
              background: customActivo
                ? value
                : 'conic-gradient(from 0deg, #ef4444, #f59e0b, #84cc16, #22d3ee, #3b82f6, #a855f7, #ef4444)',
            }}
            title="Color personalizado"
            aria-label="Color personalizado"
          >
            {customActivo && <Check size={14} className="text-chalk drop-shadow" />}
          </button>
          {showCustom && (
            <div className="absolute z-10 mt-1 left-0 bg-chalk border border-line rounded-card p-2 shadow-lg flex items-center gap-2">
              <input
                type="color"
                value={value || '#1B4332'}
                onChange={(e) => onChange(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-line"
                aria-label="Elegir color personalizado"
              />
              <button
                type="button"
                onClick={() => setShowCustom(false)}
                className="text-xs text-ink-mute hover:text-ink px-2 py-1"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>

      {help && (
        <p className="text-xs text-ink-mute font-serif italic">{help}</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
