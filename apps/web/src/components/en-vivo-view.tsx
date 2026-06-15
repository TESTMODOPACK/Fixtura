'use client';

import { MapPin, Radio } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { PartidoEnVivo } from '@fixtura/types';

import { PublicHeader } from '@/components/public-header';
import { Card } from '@/components/ui/card';
import { useEnVivo, useResumenLiga } from '@/hooks/use-portal';
import { cn } from '@/lib/cn';

function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Pestaña "En vivo" del portal de hinchas. Lista los partidos con el Match
 * Center corriendo en toda la liga. El endpoint se poll-ea cada 10s (hook)
 * para detectar partidos que arrancan/terminan; entre polls, el cronómetro
 * avanza local (un tick por segundo) y se resincroniza con `dataUpdatedAt`.
 */
export function EnVivoView(): React.ReactElement {
  const { data, dataUpdatedAt, isLoading } = useEnVivo();
  const { data: resumen } = useResumenLiga();

  // Tick local: fuerza re-render cada segundo para avanzar el reloj.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const partidos = data?.partidos ?? [];

  return (
    <>
      <PublicHeader ligaNombre={resumen?.liga.nombre ?? 'En vivo'} active="envivo" />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
          <div className="eyebrow">→ Partidos en este momento</div>
        </div>
        <h1 className="font-display text-4xl text-green-deep tracking-display mb-6">
          EN VIVO
        </h1>

        {isLoading && partidos.length === 0 && (
          <div className="font-serif italic text-ink-mute">Buscando partidos…</div>
        )}

        {!isLoading && partidos.length === 0 && (
          <Card variant="paper" padding="roomy" className="text-center">
            <Radio size={32} className="mx-auto text-ink-mute mb-3" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-1">
              NO HAY PARTIDOS EN VIVO
            </div>
            <p className="font-serif italic text-ink-mute">
              Cuando un partido esté en juego, su marcador aparece acá y se
              actualiza solo. Mientras tanto, mira el fixture o la tabla.
            </p>
          </Card>
        )}

        {partidos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {partidos.map((p) => (
              <PartidoEnVivoCard key={p.partidoId} partido={p} baseAt={dataUpdatedAt} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function PartidoEnVivoCard({
  partido,
  baseAt,
}: {
  partido: PartidoEnVivo;
  baseAt: number;
}): React.ReactElement {
  const enVivo = partido.estado === 'EN_VIVO';
  // Reloj: el server manda segundosTranscurridos al momento `baseAt`; si está
  // EN_VIVO seguimos sumando localmente. PAUSA (entretiempo) queda fijo.
  const segundos = enVivo
    ? partido.segundosTranscurridos + Math.max(0, Math.floor((Date.now() - baseAt) / 1000))
    : partido.segundosTranscurridos;

  return (
    <Link href={`/partidos/${partido.partidoId}/vivo`} className="contents">
      <Card className="cursor-pointer hover:shadow-elev transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] font-semibold',
              enVivo ? 'bg-accent text-chalk' : 'bg-ink-mute/15 text-ink-mute',
            )}
          >
            {enVivo && <span className="inline-block w-1.5 h-1.5 rounded-full bg-chalk animate-pulse" />}
            {enVivo ? 'En vivo' : 'Entretiempo'}
          </span>
          <span className="font-mono text-sm font-semibold text-green-deep tabular-nums">
            T{partido.periodo || '—'} · {mmss(segundos)}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right min-w-0">
            <div className="font-semibold text-green-deep truncate">
              {partido.equipoLocalNombre}
            </div>
          </div>
          <div className="flex items-center gap-2 font-display text-4xl text-green-deep tracking-display tabular-nums">
            <span>{partido.golesLocal}</span>
            <span className="text-ink-mute text-2xl">:</span>
            <span>{partido.golesVisita}</span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-green-deep truncate">
              {partido.equipoVisitaNombre}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-[11px] text-ink-mute">
          <span className="truncate">{partido.torneoNombre}</span>
          {partido.canchaNombre && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <MapPin size={11} /> {partido.canchaNombre}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
