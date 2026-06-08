'use client';

import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useDelegadoPartidos } from '@/hooks/use-delegado';
import { cn } from '@/lib/cn';

function fmt(iso: string | null): string {
  if (!iso) return 'Por confirmar';
  return new Date(iso).toLocaleString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RESULTADO_CLASS: Record<string, string> = {
  GANADO: 'bg-green-bright/15 text-green-bright',
  EMPATADO: 'bg-ink-mute/15 text-ink-mute',
  PERDIDO: 'bg-danger/15 text-danger',
};

export default function ClubPartidosPage(): React.ReactElement {
  const { data, isLoading } = useDelegadoPartidos();

  return (
    <div>
      <PageHead
        eyebrow="Mi club"
        title="Partidos y resultados"
        sub="Todos los partidos de tu club: jugados y por jugar."
      />

      {isLoading && <p className="text-ink-mute">Cargando…</p>}
      {data && data.length === 0 && (
        <p className="text-ink-mute italic">Tu club todavía no tiene partidos en el fixture.</p>
      )}

      <div className="space-y-2">
        {data?.map((p) => {
          const jugado = p.resultado !== null;
          return (
            <Card key={p.partidoId} padding="tight" className="flex items-center gap-4 flex-wrap">
              <div className="text-xs text-ink-mute w-32 shrink-0">
                {p.fechaNumero != null ? `Fecha ${p.fechaNumero} · ` : ''}
                {fmt(p.fechaHora)}
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium text-ink">
                  {p.esLocal ? 'vs' : '@'} {p.rivalNombre}
                </div>
                <div className="text-[11px] text-ink-mute">
                  {p.torneoNombre}
                  {p.categoriaNombre ? ` · ${p.categoriaNombre}` : ''}
                  {p.canchaNombre ? ` · ${p.canchaNombre}` : ''}
                </div>
              </div>
              {jugado ? (
                <div className="flex items-center gap-2">
                  <span className="font-display text-2xl text-green-deep tabular-nums">
                    {p.golesFavor}–{p.golesContra}
                  </span>
                  {p.resultado && (
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold',
                        RESULTADO_CLASS[p.resultado],
                      )}
                    >
                      {p.resultado === 'GANADO'
                        ? 'Ganado'
                        : p.resultado === 'EMPATADO'
                          ? 'Empate'
                          : 'Perdido'}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-paper-dark text-ink-mute">
                  {p.estado}
                </span>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
