'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }): React.ReactElement {
  const [client] = useState(
    () =>
      new QueryClient({
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
          de sonner (verde/rojo/amarillo) que pega bien con Fixtura. */}
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
