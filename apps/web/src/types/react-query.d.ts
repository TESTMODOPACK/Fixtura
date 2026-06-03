/**
 * Sprint 30 — extender el tipo `meta` de TanStack Query para soportar
 * el opt-out del toast global de errores.
 *
 * Por defecto, MutationCache.onError dispara toastError. Si una
 * mutación renderiza el error en su propia UI (ej. forms con banner
 * inline) y el toast sería ruido, puede silenciarlo:
 *
 *   useMutation({
 *     meta: { silentError: true },
 *     mutationFn: ...,
 *   });
 *
 * Lo mismo aplica a queries con `meta: { silentError: true }` por si
 * en el futuro queremos un toast en QueryCache.onError.
 */
import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      silentError?: boolean;
    };
    queryMeta: {
      silentError?: boolean;
    };
  }
}
