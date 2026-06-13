'use client';

import { AlertTriangle } from 'lucide-react';
import { forwardRef } from 'react';

import { parseApiErrorMessage } from '@/lib/api';
import { toastWarning } from '@/lib/toast';

/**
 * Sprint 27 — componentes reusables de feedback de errores en forms.
 *
 * Patrón:
 *   1. <FormErrorBanner /> arriba del form: muestra errores de
 *      validación cliente (Zod) y errores del backend (ApiError).
 *      Con ref para scrollIntoView cuando hay submit fallido.
 *   2. <FormErrorChip /> junto al botón submit: micro-feedback
 *      "Revisa los campos marcados arriba (N)". Visible solo cuando
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
   * Ej: "Revisa los campos antes de crear el club:".
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
      validationTitle = 'Revisa los siguientes campos:',
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
        ? `Revisa los campos marcados arriba (${fieldErrors.length})`
        : 'Revisa el mensaje arriba'}
    </span>
  );
}

/**
 * Helper para convertir el shape de errores de react-hook-form a
 * FormFieldError[]. Permite pasar un mapeo opcional name → label
 * legible. Si no se da label, usa el name.
 *
 * Soporta:
 *  - Campos planos: `nombre.message`
 *  - FieldArrays (e.g. delegados, categoriasSeries):
 *    `delegados: [{nombre: {message}, email: {message}}, ...]`
 *    Cada error nested se aplana como `<label> #N · <subcampo>`.
 *  - Objetos nested: `direccion: {calle: {message}}`.
 */
export function rhfErrorsToBanner(
  errors: Record<string, unknown>,
  labelMap?: Record<string, string>,
): FormFieldError[] {
  const result: FormFieldError[] = [];
  for (const [name, err] of Object.entries(errors)) {
    if (err == null) continue;
    const label = labelMap?.[name] ?? name;

    // Caso 1: error plano con .message
    if (
      typeof err === 'object' &&
      'message' in (err as Record<string, unknown>) &&
      typeof (err as { message?: unknown }).message === 'string'
    ) {
      result.push({ label, mensaje: (err as { message: string }).message });
      continue;
    }

    // Caso 2: FieldArray — array de objetos con sub-errores
    if (Array.isArray(err)) {
      err.forEach((item, idx) => {
        if (item == null || typeof item !== 'object') return;
        for (const [sub, subErr] of Object.entries(item)) {
          const subMsg = (subErr as { message?: unknown } | undefined)?.message;
          if (typeof subMsg === 'string') {
            result.push({
              label: `${label} #${idx + 1} · ${sub}`,
              mensaje: subMsg,
            });
          }
        }
      });
      continue;
    }

    // Caso 3: objeto nested con sub-errores
    if (typeof err === 'object') {
      for (const [sub, subErr] of Object.entries(err as Record<string, unknown>)) {
        const subMsg = (subErr as { message?: unknown } | undefined)?.message;
        if (typeof subMsg === 'string') {
          result.push({ label: `${label} · ${sub}`, mensaje: subMsg });
        }
      }
    }
  }
  return result;
}

/**
 * Sprint 30 — handler reusable para `react-hook-form.handleSubmit(_, onError)`.
 *
 * Cuando los errores de validacion cliente (Zod) hacen que `handleSubmit`
 * llame a onError en lugar de onSubmit, este helper garantiza que SIEMPRE
 * haya feedback visible:
 *   - toastWarning con los primeros campos invalidos.
 *   - Si hay un bannerRef, scrollea al banner.
 *
 * Uso:
 *   const onError = makeRhfErrorHandler({
 *     labelMap: FIELD_LABEL,
 *     bannerRef: errorBannerRef,
 *     formName: 'nuevo-torneo',
 *   });
 *   <form onSubmit={form.handleSubmit(onSubmit, onError)}>
 *
 * Reemplaza el patron repetitivo de console.warn + scrollIntoView que
 * estaba copiado en cada form.
 */
export function makeRhfErrorHandler(opts: {
  labelMap?: Record<string, string>;
  bannerRef?: React.RefObject<HTMLDivElement | null>;
  formName?: string;
}) {
  return (errors: Record<string, unknown>): void => {
    if (opts.formName) {
      // eslint-disable-next-line no-console
      console.warn(`[${opts.formName}] validación falló:`, errors);
    }
    const flat = rhfErrorsToBanner(errors, opts.labelMap);
    if (flat.length > 0) {
      toastWarning(
        `Revisa: ${flat
          .slice(0, 3)
          .map((e) => e.label)
          .join(', ')}${flat.length > 3 ? '…' : ''}`,
      );
    } else {
      toastWarning('Hay errores en el formulario. Revisa los campos marcados.');
    }
    if (opts.bannerRef?.current) {
      opts.bannerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };
}
