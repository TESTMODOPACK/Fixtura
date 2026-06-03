'use client';

import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Sprint 27 — ErrorBoundary global de Next.js App Router.
 *
 * Se dispara cuando un componente cliente tira un error no atrapado
 * (crash de render, throw en effect, etc.). Mostramos pantalla de
 * "algo se rompió" con botón de retry. En paralelo reportamos a
 * Sentry con tags útiles para debug.
 *
 * Hay una versión más específica en /app/admin/error.tsx que mantiene
 * el layout admin (sidebar, header). Esta es el fallback raíz.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    // Reportar a Sentry con contexto. Si Sentry no está inicializado
    // (sin DSN), captureException es un no-op seguro.
    try {
      Sentry.captureException(error, {
        tags: {
          scope: 'app-error-boundary',
        },
        extra: {
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : '',
        },
      });
    } catch {
      // No bloquear el render si Sentry falla.
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto bg-danger/15 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={32} className="text-danger" />
        </div>
        <h1 className="font-display text-3xl text-green-deep tracking-display mb-2">
          Algo se rompió
        </h1>
        <p className="font-serif italic text-ink-mute mb-6">
          Tuvimos un error inesperado y no pudimos completar tu acción. El
          incidente quedó registrado para revisarlo.
        </p>

        {error.message && (
          <details className="text-left bg-paper-dark border border-line rounded-card px-3 py-2 mb-5">
            <summary className="text-xs text-ink-mute cursor-pointer hover:text-ink">
              Detalle técnico
            </summary>
            <div className="mt-2 text-xs font-mono text-ink-mute break-words">
              {error.message}
              {error.digest && (
                <div className="mt-1 text-[10px]">
                  ID: <span className="font-semibold">{error.digest}</span>
                </div>
              )}
            </div>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="accent" onClick={() => reset()}>
            <RefreshCcw size={14} /> Reintentar
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/';
            }}
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    </div>
  );
}
