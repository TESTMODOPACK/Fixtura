'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { apiFetch } from '@/lib/api';

interface Resultado {
  aprobado: boolean;
  facturaId: string | null;
  estadoFactura: string | null;
}

function RetornoInner(): React.ReactElement {
  const params = useSearchParams();
  const tokenWs = params.get('token_ws');
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenWs) {
      setEstado('error');
      setErrorMsg('Token de Webpay ausente en la URL.');
      return;
    }
    apiFetch<Resultado>(`/admin/mi-suscripcion/retorno?token_ws=${encodeURIComponent(tokenWs)}`, {
      method: 'POST',
    })
      .then((r) => {
        setResultado(r);
        setEstado(r.aprobado ? 'ok' : 'error');
        if (!r.aprobado) setErrorMsg('La pasarela rechazó el pago.');
      })
      .catch((e: Error) => {
        setEstado('error');
        setErrorMsg(e.message);
      });
  }, [tokenWs]);

  return (
    <>
      <PageHead eyebrow="Pago" title="Procesando pago" />

      {estado === 'cargando' && (
        <Card padding="roomy">
          <div className="text-center py-8 text-ink-mute">
            <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
            Estamos confirmando tu pago con Webpay…
          </div>
        </Card>
      )}

      {estado === 'ok' && resultado && (
        <Card padding="roomy" className="border-2 border-green-bright/40 bg-green-bright/5">
          <div className="text-center py-8">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-green-bright" />
            <div className="font-display tracking-display text-3xl text-green-bright mb-2">
              ¡PAGO CONFIRMADO!
            </div>
            <p className="text-ink-mute mb-4">
              Tu factura quedó marcada como pagada. La boleta electrónica te llega
              por email en unos minutos.
            </p>
            <Link href="/admin/mi-suscripcion">
              <Button>Volver a mi suscripción</Button>
            </Link>
          </div>
        </Card>
      )}

      {estado === 'error' && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="text-center py-8">
            <XCircle size={48} className="mx-auto mb-3 text-danger" />
            <div className="font-display tracking-display text-3xl text-danger mb-2">
              EL PAGO NO SE COMPLETÓ
            </div>
            <p className="text-ink-mute mb-2">{errorMsg ?? 'Error desconocido.'}</p>
            <p className="text-ink-mute mb-4 text-sm">
              No te preocupes — tu factura sigue pendiente y puedes intentarlo de nuevo.
            </p>
            <Link href="/admin/mi-suscripcion">
              <Button>Volver a mi suscripción</Button>
            </Link>
          </div>
        </Card>
      )}
    </>
  );
}

export default function RetornoPagoPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <Card padding="roomy">
          <div className="text-center py-8 text-ink-mute">
            <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
            Cargando…
          </div>
        </Card>
      }
    >
      <RetornoInner />
    </Suspense>
  );
}
