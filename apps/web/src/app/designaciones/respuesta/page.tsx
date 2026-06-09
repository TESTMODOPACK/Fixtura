'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { apiFetch, ApiError } from '@/lib/api';

interface RespuestaResult {
  ok: boolean;
  estado: string;
}

function RespuestaContent(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ok'; estado: string } | { kind: 'error'; mensaje: string }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', mensaje: 'El enlace no tiene un token válido.' });
      return;
    }
    apiFetch<RespuestaResult>(
      `/public/designaciones/respuesta?token=${encodeURIComponent(token)}`,
    )
      .then((res) => {
        if (!res.ok) {
          setState({
            kind: 'error',
            mensaje: 'No pudimos registrar tu respuesta. Avisá al responsable de designaciones.',
          });
          return;
        }
        setState({ kind: 'ok', estado: res.estado });
      })
      .catch((err) => {
        const apiErr = err as ApiError;
        setState({
          kind: 'error',
          mensaje: apiErr.message ?? 'Error al procesar el enlace.',
        });
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <Card padding="roomy" className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup />
        </div>

        {state.kind === 'loading' && (
          <div className="text-center">
            <CardLabel>Procesando…</CardLabel>
            <p className="font-serif italic text-ink-mute mt-2">
              Verificando tu respuesta.
            </p>
          </div>
        )}

        {state.kind === 'ok' && state.estado === 'CONFIRMADA' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-bright mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              CONFIRMASTE LA DESIGNACIÓN
            </div>
            <p className="font-serif italic text-ink-mute">
              Listo. El responsable de la liga ya tiene tu confirmación.
            </p>
          </div>
        )}

        {state.kind === 'ok' && state.estado === 'RECHAZADA' && (
          <div className="text-center">
            <XCircle size={48} className="mx-auto text-orange-700 mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              REGISTRAMOS QUE NO PODÉS
            </div>
            <p className="font-serif italic text-ink-mute">
              Gracias por avisar. El responsable buscará un reemplazo.
            </p>
          </div>
        )}

        {state.kind === 'ok' && state.estado === 'ASISTIO' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-bright mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              YA ESTABAS CONFIRMADO
            </div>
            <p className="font-serif italic text-ink-mute">
              Tu confirmación ya estaba registrada. No es necesario hacer nada más.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="text-center">
            <AlertTriangle size={48} className="mx-auto text-danger mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              ALGO NO FUNCIONÓ
            </div>
            <p className="font-serif italic text-ink-mute mb-4">{state.mensaje}</p>
            <p className="text-sm text-ink-mute">
              Los enlaces expiran después de 7 días. Si pasó eso, contactá al responsable
              de la liga directamente.
            </p>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <Link href="/">
            <Button variant="default" size="sm">
              Volver al inicio
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function RespuestaPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <RespuestaContent />
    </Suspense>
  );
}
