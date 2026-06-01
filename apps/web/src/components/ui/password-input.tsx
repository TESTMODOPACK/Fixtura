'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';

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
    const autoId = id ?? `input-${rest.name ?? 'password'}`;
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
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute hover:text-ink rounded transition-colors"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </div>
    );
  },
);
