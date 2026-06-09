'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

import { toastError } from '@/lib/toast';

export function Providers({ children }: { children: React.ReactNode }): React.ReactElement {
  const [client] = useState(
    () =>
      new QueryClient({
        // Sprint 30 fix — toast global para CUALQUIER mutación fallida
        // que el caller no haya manejado explícitamente. Cubre el caso
        // de mutate() (sin try/catch) y mutateAsync() cuando RHF se
        // traga la excepción.
        //
        // Para silenciar (caso raro: la mutación tiene UI específica
        // de error y el toast sería ruido), pasar
        //   useMutation({ meta: { silentError: true }, ... })
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.silentError === true) return;
            toastError(error);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* Sprint 27 — Toaster global. Posición bottom-right para no
          tapar la nav superior. richColors usa la paleta semántica
          de sonner (verde/rojo/amarillo) que pega bien con LigaPlus. */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            fontFamily: 'var(--font-space-grotesk), sans-serif',
          },
        }}
      />
    </QueryClientProvider>
  );
}
