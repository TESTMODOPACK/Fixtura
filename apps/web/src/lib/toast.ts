import { toast as sonner, type ExternalToast } from 'sonner';

import { parseApiErrorMessage } from '@/lib/api';

/**
 * Sprint 27 — Helpers de toast con shape Fixtura.
 *
 * Usar siempre estos en vez de `sonner.toast(...)` directo para que:
 *  - Los errores se parsean con parseApiErrorMessage (entiende
 *    ApiError + body.message array de class-validator + 401/403).
 *  - El estilo es consistente con el sistema visual.
 *  - Es fácil swapear la librería en el futuro si hace falta.
 *
 * Patrones:
 *  - toastSuccess('Club creado'): feedback inmediato post-mutación.
 *  - toastError(err): para catch de mutaciones, sin parseo manual.
 *  - toastPromise(promise, {loading, success, error}): atajo para
 *    mutaciones onClick que no usan TanStack (ej. download de
 *    archivo, copiar al portapapeles).
 */

const baseOptions: ExternalToast = {
  duration: 4000,
};

export function toastSuccess(message: string, opts?: ExternalToast): void {
  sonner.success(message, { ...baseOptions, ...opts });
}

export function toastError(err: unknown, opts?: ExternalToast): void {
  const message = parseApiErrorMessage(err);
  sonner.error(message, { ...baseOptions, duration: 6000, ...opts });
}

export function toastInfo(message: string, opts?: ExternalToast): void {
  sonner.info(message, { ...baseOptions, ...opts });
}

export function toastWarning(message: string, opts?: ExternalToast): void {
  sonner.warning(message, { ...baseOptions, ...opts });
}

/**
 * Versión simplificada de sonner.promise que usa parseApiErrorMessage
 * para el caso de error (cualquier shape de error queda legible).
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string | ((data: T) => string); error?: string },
): Promise<T> {
  sonner.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: (err: unknown) => messages.error ?? parseApiErrorMessage(err),
  });
  return promise;
}
