'use client';

import { RefreshCw, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useMiCarnet } from '@/hooks/use-jugador';

function formatVigencia(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CarnetJugadorPage(): React.ReactElement {
  const { data: carnet, isLoading, error, refetch, isRefetching } = useMiCarnet();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!carnet?.qr || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, carnet.qr, {
      width: 232,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F2A1F', light: '#FFFFFF' },
    });
  }, [carnet?.qr]);

  if (isLoading) {
    return <p className="text-ink-mute">Cargando tu carnet…</p>;
  }
  if (error || !carnet) {
    return (
      <Card padding="comfortable">
        <p className="text-danger font-semibold">No pudimos generar tu carnet.</p>
        <p className="text-sm text-ink-mute mt-1">
          Reintenta más tarde o avísale a tu liga si el problema persiste.
        </p>
      </Card>
    );
  }

  const j = carnet.jugador;

  return (
    <>
      <PageHead
        eyebrow="Mi carnet"
        title="Carnet digital"
        sub="Muéstralo en el paso de jugadores antes del partido"
      />

      <div className="max-w-sm">
        {/* Credencial */}
        <div className="rounded-2xl overflow-hidden bg-green-deep text-chalk shadow-lg">
          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-green-mid">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-green-lime font-semibold">
                {carnet.ligaNombre}
              </div>
              <div className="font-display text-lg tracking-display truncate">
                Carnet de jugador
              </div>
            </div>
            {j.clubEscudoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={j.clubEscudoUrl}
                alt={j.clubNombre}
                className="w-10 h-10 rounded-full object-cover bg-chalk flex-shrink-0"
              />
            ) : (
              <ShieldCheck size={26} className="text-green-lime flex-shrink-0" />
            )}
          </div>

          <div className="p-5 flex flex-col items-center">
            <div className="bg-white rounded-xl p-3">
              <canvas ref={canvasRef} className="block" />
            </div>
            <div className="mt-4 text-center">
              <div className="font-display text-xl tracking-display leading-tight">
                {j.nombres} {j.apellidos}
              </div>
              <div className="text-sm text-chalk/80 mt-0.5">{j.rut}</div>
              <div className="text-xs text-green-lime mt-2">
                {j.clubNombre} · {j.categoriaNombre}
                {j.numeroCamiseta != null ? ` · #${j.numeroCamiseta}` : ''}
              </div>
            </div>
          </div>

          <div className="px-5 py-3 bg-green-mid/40 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-chalk/70">
              Vigente hasta {formatVigencia(carnet.expiraAt)}
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="flex items-center gap-1 text-green-lime hover:text-chalk font-semibold uppercase tracking-wider disabled:opacity-50"
            >
              <RefreshCw size={11} className={isRefetching ? 'animate-spin' : ''} />
              Renovar
            </button>
          </div>
        </div>

        <Card padding="comfortable" className="mt-4">
          <p className="text-sm text-ink">
            El árbitro o planillero escanea este QR desde su portal y confirma al
            instante tu identidad y habilitación (planilla, sanciones y vetos).
          </p>
          <p className="text-xs text-ink-mute mt-2">
            El código se renueva solo cada vez que abres esta pantalla; no sirve
            impreso ni compartido como pantallazo viejo.
          </p>
        </Card>
      </div>
    </>
  );
}
