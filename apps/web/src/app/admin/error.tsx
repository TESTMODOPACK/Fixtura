'use client';

import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';

/**
 * Sprint 27 — ErrorBoundary del segmento /admin.
 *
 * Mantiene el layout admin (sidebar/header) y muestra el error inline.
 * Se dispara antes que /app/error.tsx porque Next prioriza el más
 * específico. Reporta a Sentry con scope='admin-error-boundary'.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    try {
      Sentry.captureException(error, {
        tags: {
          scope: 'admin-error-boundary',
        },
        extra: {
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : '',
        },
      });
    } catch {
      // No-op si Sentry no está configurado.
    }
  }, [error]);

  return (
    <>
      <PageHead
        eyebrow="Error"
        title="Algo se rompió"
        sub="Tuvimos un problema cargando esta sección. El incidente quedó registrado."
      />

      <Card padding="roomy" className="max-w-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-danger/15 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-danger" />
          </div>
          <div className="flex-1">
            <CardLabel>Detalle</CardLabel>
            <div className="font-mono text-sm text-ink-mute mt-2 break-words">
              {error.message || 'Error desconocido'}
            </div>
            {error.digest && (
              <div className="text-xs text-ink-mute mt-2">
                ID del incidente:{' '}
                <span className="font-mono font-semibold">{error.digest}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-5">
              <Button variant="accent" size="sm" onClick={() => reset()}>
                <RefreshCcw size={14} /> Reintentar
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/admin';
                  }
                }}
              >
                Ir al panel principal
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
