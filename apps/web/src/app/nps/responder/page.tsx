'use client';

import { AlertTriangle, CheckCircle2, Star } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import type { EncuestaNpsInfo } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { apiFetch, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

type Estado =
  | { kind: 'loading' }
  | { kind: 'form'; info: EncuestaNpsInfo }
  | { kind: 'ya' }
  | { kind: 'gracias' }
  | { kind: 'error'; mensaje: string };

function ResponderContent(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get('token');
  const [estado, setEstado] = useState<Estado>({ kind: 'loading' });

  // Form state
  const [nps, setNps] = useState<number | null>(null);
  const [arbitraje, setArbitraje] = useState(0);
  const [recinto, setRecinto] = useState(0);
  const [organizacion, setOrganizacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      setEstado({ kind: 'error', mensaje: 'El enlace no tiene un token válido.' });
      return;
    }
    apiFetch<EncuestaNpsInfo>(`/public/nps/info?token=${encodeURIComponent(token)}`)
      .then((info) => {
        setEstado(info.yaRespondida ? { kind: 'ya' } : { kind: 'form', info });
      })
      .catch((err) => {
        const apiErr = err as ApiError;
        setEstado({ kind: 'error', mensaje: apiErr.message ?? 'No pudimos abrir la encuesta.' });
      });
  }, [token]);

  const enviar = (): void => {
    if (!token || nps == null) return;
    setEnviando(true);
    const body: Record<string, unknown> = { nps };
    if (arbitraje > 0) body.evalArbitraje = arbitraje;
    if (recinto > 0) body.evalRecinto = recinto;
    if (organizacion > 0) body.evalOrganizacion = organizacion;
    if (comentario.trim()) body.comentario = comentario.trim();

    apiFetch<{ ok: boolean; yaRespondida: boolean }>(
      `/public/nps/responder?token=${encodeURIComponent(token)}`,
      { method: 'POST', body },
    )
      .then(() => setEstado({ kind: 'gracias' }))
      .catch((err) => {
        const apiErr = err as ApiError;
        setEstado({ kind: 'error', mensaje: apiErr.message ?? 'No pudimos registrar tu respuesta.' });
      })
      .finally(() => setEnviando(false));
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <Card padding="roomy" className="w-full max-w-lg">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup />
        </div>

        {estado.kind === 'loading' && (
          <div className="text-center">
            <CardLabel>Abriendo encuesta…</CardLabel>
          </div>
        )}

        {estado.kind === 'ya' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-bright mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              YA RESPONDISTE
            </div>
            <p className="font-serif italic text-ink-mute">
              Gracias, ya teníamos tu respuesta registrada.
            </p>
          </div>
        )}

        {estado.kind === 'gracias' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-bright mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              ¡GRACIAS POR TU OPINIÓN!
            </div>
            <p className="font-serif italic text-ink-mute">
              Tu respuesta nos ayuda a mejorar la liga temporada a temporada.
            </p>
          </div>
        )}

        {estado.kind === 'error' && (
          <div className="text-center">
            <AlertTriangle size={48} className="mx-auto text-danger mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              ALGO NO FUNCIONÓ
            </div>
            <p className="font-serif italic text-ink-mute mb-4">{estado.mensaje}</p>
            <p className="text-sm text-ink-mute">
              Los enlaces expiran después de 30 días. Si pasó eso, avisa a la liga.
            </p>
          </div>
        )}

        {estado.kind === 'form' && (
          <div>
            <div className="text-center mb-6">
              <div className="text-[11px] tracking-[2px] uppercase text-green-deep font-bold mb-1">
                {estado.info.torneo}
              </div>
              <div className="font-display text-2xl text-green-deep tracking-display">
                {estado.info.club}, ¿cómo lo viviste?
              </div>
              <p className="font-serif italic text-ink-mute text-sm mt-1">
                Tus respuestas ayudan a {estado.info.liga} a mejorar cada temporada.
              </p>
            </div>

            {/* NPS 0-10 */}
            <div className="mb-6">
              <CardLabel>
                ¿Qué tan probable es que recomiendes la liga a otro club? *
              </CardLabel>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    onClick={() => setNps(n)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-sm font-display border transition-colors',
                      nps === n
                        ? 'bg-orange text-white border-orange'
                        : 'bg-white text-green-deep border-line hover:border-orange',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-ink-mute mt-1.5 px-0.5">
                <span>Nada probable</span>
                <span>Muy probable</span>
              </div>
            </div>

            {/* Sub-evaluaciones */}
            <div className="space-y-3 mb-6">
              <Estrellas label="Arbitraje" valor={arbitraje} onChange={setArbitraje} />
              <Estrellas label="Recinto / canchas" valor={recinto} onChange={setRecinto} />
              <Estrellas label="Organización" valor={organizacion} onChange={setOrganizacion} />
              <p className="text-[11px] font-serif italic text-ink-mute">
                Las valoraciones por estrellas son opcionales.
              </p>
            </div>

            {/* Comentario */}
            <div className="mb-6">
              <CardLabel>¿Algo que quieras contarnos? (opcional)</CardLabel>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Lo que salió bien, lo que podemos mejorar…"
                className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-green-deep resize-none focus:outline-none focus:border-orange"
              />
            </div>

            <Button onClick={enviar} disabled={nps == null || enviando} className="w-full">
              {enviando ? 'Enviando…' : 'Enviar mi respuesta'}
            </Button>
          </div>
        )}

        {(estado.kind === 'ya' || estado.kind === 'gracias' || estado.kind === 'error') && (
          <div className="mt-8 flex justify-center">
            <Link href="/">
              <Button variant="default" size="sm">
                Ir al inicio
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

function Estrellas({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: number;
  onChange: (n: number) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-green-deep">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(valor === n ? 0 : n)} aria-label={`${n} estrellas`}>
            <Star
              size={22}
              className={n <= valor ? 'text-orange' : 'text-line'}
              fill={n <= valor ? '#E76F26' : 'none'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ResponderNpsPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <ResponderContent />
    </Suspense>
  );
}
