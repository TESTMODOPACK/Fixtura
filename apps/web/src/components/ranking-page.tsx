'use client';

import { Flame, Star, Trophy } from 'lucide-react';

import { PublicHeader } from '@/components/public-header';
import { Card } from '@/components/ui/card';
import { useRanking } from '@/hooks/use-portal';
import { cn } from '@/lib/cn';

interface RankingPageProps {
  tipo: 'goleadores' | 'asistencias' | 'mvp';
  titulo: string;
  subtitulo: string;
  metricaLabel: string;
}

const ICONS = {
  goleadores: Flame,
  asistencias: Star,
  mvp: Trophy,
};

export function RankingPage({ tipo, titulo, subtitulo, metricaLabel }: RankingPageProps): React.ReactElement {
  const { data, isLoading } = useRanking(tipo);
  const Icon = ICONS[tipo];

  return (
    <>
      <PublicHeader ligaNombre={data?.torneo.nombre ?? 'Cargando…'} active={tipo} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="eyebrow mb-2">→ {data?.torneo.nombre ?? '...'}</div>
        <h1 className="font-display text-4xl text-green-deep tracking-display flex items-center gap-3">
          <Icon size={36} className="text-accent" />
          {titulo}
        </h1>
        <p className="font-serif italic text-ink-mute mt-2 mb-6">{subtitulo}</p>

        {isLoading && <div className="font-serif italic text-ink-mute">Cargando ranking...</div>}

        {data && (
          <Card padding="none" className="overflow-hidden divide-y divide-line">
            {data.items.map((item) => (
              <div key={item.jugadorId} className="px-5 py-4 flex items-center gap-4">
                <div
                  className={cn(
                    'font-display text-2xl tracking-display w-10 text-center',
                    item.posicion === 1 && 'text-accent',
                    item.posicion === 2 && 'text-ink-mute',
                    item.posicion === 3 && 'text-orange-700',
                    item.posicion > 3 && 'text-line',
                  )}
                >
                  {item.posicion}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.jugadorNombre}</div>
                  <div className="text-xs text-ink-mute truncate">{item.equipoNombre}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl text-green-deep tracking-display">
                    {item.valor}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                    {metricaLabel}
                  </div>
                </div>
              </div>
            ))}
            {data.items.length === 0 && (
              <div className="p-6 text-sm text-ink-mute font-serif italic">
                Aún no hay datos para este torneo.
              </div>
            )}
          </Card>
        )}
      </main>
    </>
  );
}
