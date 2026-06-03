'use client';

import { AlertTriangle } from 'lucide-react';
import { forwardRef } from 'react';

import { parseApiErrorMessage } from '@/lib/api';

/**
 * Sprint 27 — componentes reusables de feedback de errores en forms.
 *
 * Patrón:
 *   1. <FormErrorBanner /> arriba del form: muestra errores de
 *      validación cliente (Zod) y errores del backend (ApiError).
 *      Con ref para scrollIntoView cuando hay submit fallido.
 *   2. <FormErrorChip /> junto al botón submit: micro-feedback
 *      "Revisá los campos marcados arriba (N)". Visible solo cuando
 *      el banner está fuera del viewport.
 *
 * El submit handler de RHF llama scrollToBanner() en onError.
 */

export type FormFieldError = { label: string; mensaje: string };

interface FormErrorBannerProps {
  /** Errores de validación cliente (zod), uno por campo. */
  fieldErrors?: FormFieldError[];
  /** Error del backend (cualquier shape). Se parsea con parseApiErrorMessage. */
  apiError?: unknown;
  /**
   * Texto del título cuando hay errores de validación cliente.
   * Ej: "Revisá los campos antes de crear el club:".
   */
  validationTitle?: string;
  /**
   * Texto del título cuando hay error de backend.
   * Ej: "No se pudo crear el club".
   */
  apiTitle?: string;
  className?: string;
}

export const FormErrorBanner = forwardRef<HTMLDivElement, FormErrorBannerProps>(
  function FormErrorBanner(
    {
      fieldErrors = [],
      apiError,
      validationTitle = 'Revisá los siguientes campos:',
      apiTitle = 'No se pudo completar la operación',
      className,
    },
    ref,
  ) {
    const tieneErrores = fieldErrors.length > 0 || apiError != null;
    if (!tieneErrores) return null;

    return (
      <div
        ref={ref}
        className={
          'mb-5 bg-danger/10 border-2 border-danger/40 rounded-card px-4 py-3 ' +
          (className ?? '')
        }
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-start gap-2 text-danger">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <div className="font-semibold">
              {apiError != null ? apiTitle : validationTitle}
            </div>
            {apiError != null && (
              <div className="mt-1">{parseApiErrorMessage(apiError)}</div>
            )}
            {fieldErrors.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {fieldErrors.map((e, i) => (
                  <li key={i}>
                    <span className="font-semibold">{e.label}:</span> {e.mensaje}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  },
);

/**
 * Chip de feedback inline al lado del botón submit.
 * Visible solo cuando hay errores. El número refleja la cantidad de
 * campos con error (no cuenta el apiError).
 */
export function FormErrorChip({
  fieldErrors = [],
  hasApiError = false,
}: {
  fieldErrors?: FormFieldError[];
  hasApiError?: boolean;
}): React.ReactElement | null {
  const total = fieldErrors.length + (hasApiError ? 1 : 0);
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger">
      <AlertTriangle size={12} />
      {fieldErrors.length > 0
        ? `Revisá los campos marcados arriba (${fieldErrors.length})`
        : 'Revisá el mensaje arriba'}
    </span>
  );
}

/**
 * Helper para convertir el shape de errores de react-hook-form a
 * FormFieldError[]. Permite pasar un mapeo opcional name → label
 * legible. Si no se da label, usa el name.
 */
export function rhfErrorsToBanner(
  errors: Record<string, { message?: string } | undefined>,
  labelMap?: Record<string, string>,
): FormFieldError[] {
  const result: FormFieldError[] = [];
  for (const [name, err] of Object.entries(errors)) {
    if (!err?.message) continue;
    result.push({
      label: labelMap?.[name] ?? name,
      mensaje: err.message,
    });
  }
  return result;
}
