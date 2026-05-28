'use client';

import { use } from 'react';

import { useMatchCenter } from '@/hooks/use-match-center';

/**
 * Sprint 18 — RF-17: vista pública del Match Center.
 *
 * Pensada para embeber en sitios externos (iframe) o linkear desde
 * social media. Sin auth, sin nav admin — solo el marcador y el
 * cronómetro en vivo. Estilo compacto, contraste alto.
 */
export default function PartidoVivoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>;
}): React.ReactElement {
  const { partidoId } = use(params);
  const { snapshot, conectado, error } = useMatchCenter(partidoId);

  if (error && !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl text-danger tracking-display mb-2">
            NO PUDIMOS CARGAR EL PARTIDO
          </h1>
          <p className="font-serif italic text-ink-mute">{error}</p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <p className="font-serif italic text-ink-mute">Conectando…</p>
      </div>
    );
  }

  const segundos = snapshot.segundosTranscurridos;
  const minutosVisibles = Math.floor(segundos / 60);
  const segundosVisibles = segundos % 60;
  const cronometro = `${String(minutosVisibles).padStart(2, '0')}:${String(segundosVisibles).padStart(2, '0')}`;
  const estadoLabel =
    snapshot.estado === 'EN_VIVO'
      ? 'EN VIVO'
      : snapshot.estado === 'PAUSADO'
        ? 'PAUSADO'
        : snapshot.estado === 'FINALIZADO_CENTRO'
          ? 'FINAL'
          : '—';

  return (
    <div className="min-h-screen bg-green-deep text-chalk flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-6">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs uppercase tracking-[0.18em] font-semibold"
            style={{
              backgroundColor:
                snapshot.estado === 'EN_VIVO' ? '#E76F26' : 'rgba(255,255,255,0.15)',
            }}
          >
            {snapshot.estado === 'EN_VIVO' && (
              <span className="inline-block w-2 h-2 rounded-full bg-chalk animate-pulse" />
            )}
            {estadoLabel}
            <span className="opacity-60">·</span>
            <span>{conectado ? 'live' : 'polling'}</span>
          </span>
        </div>

        <div className="grid grid-cols-3 items-center gap-4">
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.18em] font-semibold text-chalk/60 mb-3 truncate">
              {snapshot.equipoLocalNombre}
            </div>
            <div className="font-display text-7xl md:text-9xl tracking-display text-chalk tabular-nums">
              {snapshot.golesLocal}
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-5xl md:text-6xl font-bold tabular-nums">
              {cronometro}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] font-semibold text-chalk/60">
              T{snapshot.periodo || '—'} · {snapshot.minutosPorPeriodo}&apos;
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.18em] font-semibold text-chalk/60 mb-3 truncate">
              {snapshot.equipoVisitaNombre}
            </div>
            <div className="font-display text-7xl md:text-9xl tracking-display text-chalk tabular-nums">
              {snapshot.golesVisita}
            </div>
          </div>
        </div>

        <div className="mt-10 text-center text-xs uppercase tracking-[0.18em] text-chalk/40">
          Powered by Fixtura
        </div>
      </div>
    </div>
  );
}
