'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';

import { cn } from '@/lib/cn';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

/**
 * Input de contraseña con botón ojo para mostrar/ocultar el texto. Mismo
 * styling que <Input> regular, pero con el toggle a la derecha.
 *
 * Notas de accesibilidad:
 * - El botón tiene aria-label que cambia según el estado actual.
 * - Mantiene el tipo "password" en autocomplete, NO cambiamos el name.
 * - Cuando el usuario muestra la contraseña, el navegador puede mostrar
 *   warning de seguridad — eso es esperado.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, className, id, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    // useId garantiza un ID único por instancia incluso cuando hay
    // múltiples PasswordInput en la misma página sin `name` distinto
    // (caso real: /reset-password tiene "Nueva contraseña" + "Repetir").
    const generatedId = useId();
    const autoId = id ?? `${generatedId}-${rest.name ?? 'password'}`;
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={autoId} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={autoId}
            type={visible ? 'text' : 'password'}
            className={cn(
              'input pr-10',
              error && 'border-danger focus:border-danger',
              className,
            )}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={rest.disabled}
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute hover:text-ink rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </div>
    );
  },
);
