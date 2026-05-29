'use client';

import { ArrowLeft, CircleDollarSign } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { usePlanesSuscripcion } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Sprint 23 — Vista de planes. CRUD completo será incremental;
 * por ahora solo listado read-only con seed inicial (Starter/Growth/Pro/Enterprise).
 */
export default function PlanesPage(): React.ReactElement {
  const { data, isLoading, error } = usePlanesSuscripcion();
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Planes de suscripción"
        sub="Catálogo de planes que un tenant puede tener asignado."
      >
        <Link href="/admin/super">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Panel
          </Button>
        </Link>
      </PageHead>

      {apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5 mb-5">
          <div className="text-sm text-danger">{apiError.message}</div>
        </Card>
      )}

      {isLoading && <p className="font-serif italic text-ink-mute">Cargando…</p>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.map((plan) => (
            <Card key={plan.id} padding="roomy" className={cn(!plan.activo && 'opacity-50')}>
              <div className="flex items-center justify-between mb-2">
                <CardLabel>{plan.nombre}</CardLabel>
                <CircleDollarSign size={18} className="text-accent" />
              </div>
              <div className="font-display text-3xl text-green-deep tracking-display">
                ${plan.precioMensualClp.toLocaleString('es-CL')}
                <span className="text-sm text-ink-mute font-mono">/mes</span>
              </div>
              {plan.descripcion && (
                <p className="font-serif italic text-ink-mute text-xs mt-2">
                  {plan.descripcion}
                </p>
              )}
              <div className="mt-4 border-t border-line pt-3 space-y-1 text-xs">
                <div className="text-ink-mute uppercase tracking-wider font-semibold mb-1">Límites</div>
                <div>
                  Torneos:{' '}
                  <span className="font-mono">
                    {plan.limites.maxTorneos ?? '∞'}
                  </span>
                </div>
                <div>
                  Equipos:{' '}
                  <span className="font-mono">
                    {plan.limites.maxEquipos ?? '∞'}
                  </span>
                </div>
                <div>
                  Partidos/mes:{' '}
                  <span className="font-mono">
                    {plan.limites.maxPartidosMes ?? '∞'}
                  </span>
                </div>
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <div className="text-ink-mute uppercase tracking-wider font-semibold mb-1 text-xs">
                  Features
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(plan.features)
                    .filter(([, v]) => v === true)
                    .map(([k]) => (
                      <span
                        key={k}
                        className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-green-bright/15 text-green-bright"
                      >
                        {k}
                      </span>
                    ))}
                </div>
              </div>
              {!plan.activo && (
                <div className="mt-3 text-[10px] uppercase tracking-wider font-semibold text-danger">
                  ⛔ Inactivo
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
