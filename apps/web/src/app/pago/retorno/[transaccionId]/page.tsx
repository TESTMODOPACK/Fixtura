'use client';

import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ConfirmarPagoResponse, EstadoTransaccion } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Página de retorno post-Webpay. La pasarela redirige al usuario aquí
 * con el `transaccionId` en el path. El componente llama al endpoint
 * público de confirmación y muestra el resultado.
 *
 * Esta página NO requiere auth — corre con el UUID de la transacción
 * (no enumerable) como única credencial.
 */

interface PageProps {
  params: { transaccionId: string };
}

type EstadoUI =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; data: ConfirmarPagoResponse }
  | { tipo: 'error'; mensaje: string };

const ESTADO_VISUAL: Record<
  EstadoTransaccion,
  { color: string; icon: typeof CheckCircle2; titulo: string }
> = {
  APROBADO: { color: 'text-green-bright', icon: CheckCircle2, titulo: '¡Pago aprobado!' },
  RECHAZADO: { color: 'text-danger', icon: XCircle, titulo: 'Pago rechazado' },
  EXPIRADO: { color: 'text-orange-700', icon: Clock, titulo: 'Pago expirado' },
  REVERSADO: { color: 'text-orange-700', icon: AlertTriangle, titulo: 'Pago reversado' },
  PENDIENTE: { color: 'text-ink-mute', icon: Clock, titulo: 'Pago pendiente' },
  PAGO_EN_TRANSITO: { color: 'text-accent', icon: Clock, titulo: 'Pago en proceso' },
};

function formatCLP(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

export default function PagoRetornoPage({ params }: PageProps): React.ReactElement {
  const [estado, setEstado] = useState<EstadoUI>({ tipo: 'cargando' });

  useEffect(() => {
    const { transaccionId } = params;
    // Llamada directa sin store de auth — endpoint público.
    fetch(`${API_URL}/public/pagos/${transaccionId}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ message: 'Error desconocido' }));
          throw new Error(body.message ?? 'Error confirmando el pago');
        }
        return r.json() as Promise<ConfirmarPagoResponse>;
      })
      .then((data) => setEstado({ tipo: 'ok', data }))
      .catch((err) =>
        setEstado({ tipo: 'error', mensaje: (err as Error).message }),
      );
  }, [params]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <Card padding="roomy" className="max-w-lg w-full">
        {estado.tipo === 'cargando' && (
          <div className="text-center py-8">
            <Clock size={48} className="mx-auto text-ink-mute animate-pulse mb-4" />
            <p className="font-serif italic text-ink-mute">Confirmando tu pago…</p>
          </div>
        )}

        {estado.tipo === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle size={48} className="mx-auto text-danger mb-4" />
            <CardLabel className="text-danger">No pudimos confirmar el pago</CardLabel>
            <p className="text-ink mt-3">{estado.mensaje}</p>
            <p className="text-sm text-ink-mute font-serif italic mt-4">
              Si el cargo apareció en tu tarjeta pero ves este error, contactá a
              la liga con el ID de transacción para resolverlo.
            </p>
            <div className="text-xs text-ink-mute mt-2 font-mono">
              Transacción: {params.transaccionId}
            </div>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-block px-4 py-2 rounded-card text-sm font-semibold bg-green-deep text-chalk hover:bg-green-deep/90"
              >
                Volver al portal
              </Link>
            </div>
          </div>
        )}

        {estado.tipo === 'ok' && (() => {
          const visual = ESTADO_VISUAL[estado.data.estado];
          const Icon = visual.icon;
          return (
            <div className="text-center py-4">
              <Icon size={56} className={cn('mx-auto mb-4', visual.color)} />
              <CardLabel className={visual.color}>{visual.titulo}</CardLabel>

              <div className="font-display text-4xl text-green-deep tracking-display mt-4">
                {formatCLP(estado.data.monto)}
              </div>

              <p className="text-ink mt-4 max-w-sm mx-auto">
                {estado.data.mensaje}
              </p>

              <div className="text-xs text-ink-mute mt-6 font-mono">
                ID transacción: {estado.data.transaccionId.slice(0, 8)}…
              </div>

              <div className="mt-6 flex gap-2 justify-center">
                <Link
                  href="/"
                  className="px-4 py-2 rounded-card text-sm font-semibold bg-green-deep text-chalk hover:bg-green-deep/90"
                >
                  Volver al portal
                </Link>
                {estado.data.estado === 'RECHAZADO' && (
                  <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
                    Reintentar
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
