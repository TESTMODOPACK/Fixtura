'use client';

import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';

/**
 * Error boundary del área super admin. Atrapa client-side exceptions
 * (errors de render, accesos a propiedades inexistentes, etc.) que
 * de otra forma muestran la pantalla blanca con "Application error".
 *
 * Next.js App Router invoca este componente automáticamente cuando
 * algo lanza dentro de /admin/super/**.
 */
export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[SuperAdmin] Error capturado:', error);
  }, [error]);

  return (
    <>
      <PageHead eyebrow="Plataforma" title="Algo salió mal" />
      <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={28} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-display tracking-display text-2xl text-danger mb-2">
              SE PRODUJO UN ERROR EN LA APLICACIÓN
            </div>
            <div className="text-sm text-ink mb-3">
              {error.message || 'Error desconocido al renderizar la página.'}
            </div>
            {error.digest && (
              <div className="text-xs text-ink-mute font-mono mb-3">
                Código: {error.digest}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => reset()} size="sm" variant="accent">
                <RefreshCw size={14} /> Reintentar
              </Button>
              <Link href="/admin/super">
                <Button size="sm" variant="default">
                  <ArrowLeft size={14} /> Volver al panel
                </Button>
              </Link>
            </div>
            <div className="mt-4 pt-3 border-t border-line text-xs text-ink-mute">
              Si el problema persiste, contactá al equipo técnico con el código de
              arriba. El detalle completo del error está en la consola del navegador
              (F12 → Console).
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
