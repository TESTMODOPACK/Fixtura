'use client';

import type { PartidoPublico } from '@fixtura/types';

import { PublicHeader } from '@/components/public-header';
import { Card, CardLabel } from '@/components/ui/card';
import { useFixture } from '@/hooks/use-portal';
import { cn } from '@/lib/cn';

interface FixtureViewProps {
  /** Sprint 36C — si está, filtra por torneo específico y los tabs del header navegan dentro del torneo. */
  torneoSlug?: string;
}

export function FixtureView({ torneoSlug }: FixtureViewProps): React.ReactElement {
  const { data, isLoading } = useFixture(torneoSlug);

  return (
    <>
      <PublicHeader ligaNombre={data?.torneo.nombre ?? 'Cargando…'} active="fixture" torneoSlug={torneoSlug} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="eyebrow mb-2">→ {data?.torneo.nombre ?? '...'}</div>
        <h1 className="font-display text-4xl text-green-deep tracking-display mb-6">
          FIXTURE COMPLETO
        </h1>

        {isLoading && <div className="font-serif italic text-ink-mute">Cargando fixture...</div>}

        {data && (
          <div className="space-y-6">
            {data.fechas.map((fecha) => (
              <Card key={fecha.numero} padding="none" className="overflow-hidden">
                <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between">
                  <div>
                    <CardLabel tone="mute">Fecha {fecha.numero}</CardLabel>
                    <div className="font-display text-lg text-green-deep tracking-display">
                      {fecha.etiqueta.toUpperCase()}
                    </div>
                  </div>
                  <FechaEstadoBadge partidos={fecha.partidos} />
                </div>
                <div className="divide-y divide-line">
                  {fecha.partidos.map((p) => (
                    <PartidoRow key={p.id} partido={p} />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function FechaEstadoBadge({ partidos }: { partidos: PartidoPublico[] }): React.ReactElement {
  const finalizados = partidos.filter((p) => p.estado === 'FINALIZADO').length;
  const total = partidos.length;
  const allDone = finalizados === total;
  return (
    <div
      className={cn(
        'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
        allDone ? 'bg-green-bright/10 text-green-bright' : finalizados > 0 ? 'bg-accent/10 text-accent' : 'bg-ink-mute/10 text-ink-mute',
      )}
    >
      {allDone ? 'Finalizada' : `${finalizados}/${total} jugados`}
    </div>
  );
}

function PartidoRow({ partido }: { partido: PartidoPublico }): React.ReactElement {
  const fecha = new Date(partido.fechaHora);
  const dia = fecha.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
  const hora = fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="px-5 py-4 grid grid-cols-[auto_1fr_auto_1fr_auto] gap-4 items-center">
      <div className="text-xs text-ink-mute font-mono text-right w-24">
        <div>{dia}</div>
        <div className="font-semibold text-ink">{hora}</div>
      </div>
      <div className="text-right font-semibold truncate">{partido.local.nombre}</div>
      <div className="flex items-center gap-2 font-display tracking-display text-xl text-green-deep min-w-[60px] justify-center">
        {partido.estado === 'FINALIZADO' ? (
          <>
            <span>{partido.local.goles ?? '-'}</span>
            <span className="text-ink-mute">:</span>
            <span>{partido.visita.goles ?? '-'}</span>
          </>
        ) : (
          <span className="text-ink-mute font-serif italic text-xs">vs</span>
        )}
      </div>
      <div className="font-semibold truncate">{partido.visita.nombre}</div>
      <div className="text-[10px] text-ink-mute uppercase tracking-wider hidden md:block">
        {partido.canchaNombre}
      </div>
    </div>
  );
}
