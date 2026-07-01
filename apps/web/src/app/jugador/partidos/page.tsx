'use client';

import type { PartidoDelegado } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ReprogramadaBadge } from '@/components/ui/reprogramada-badge';
import { useMisPartidos } from '@/hooks/use-jugador';

function fmtFecha(iso: string | null): string {
  if (!iso) return 'Por definir';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} · ${hora}`;
}

const RESULTADO_STYLE: Record<'GANADO' | 'EMPATADO' | 'PERDIDO', string> = {
  GANADO: 'bg-green-bright/15 text-green-bright',
  EMPATADO: 'bg-ink-mute/15 text-ink-mute',
  PERDIDO: 'bg-danger/15 text-danger',
};

function PartidoRow({ p }: { p: PartidoDelegado }): React.ReactElement {
  const jugado = p.golesFavor != null && p.golesContra != null;
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-line/60 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-ink-mute">
            {p.esLocal ? 'Local' : 'Visita'}
          </span>
          {p.fechaNumero != null && (
            <span className="text-[11px] text-ink-mute">· Fecha {p.fechaNumero}</span>
          )}
          {p.fechaReprogramada && <ReprogramadaBadge />}
        </div>
        <div className="font-semibold text-ink truncate">vs {p.rivalNombre}</div>
        <div className="text-xs text-ink-mute truncate">
          {fmtFecha(p.fechaHora)}
          {p.canchaNombre ? ` · ${p.canchaNombre}` : ''}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {jugado ? (
          <div className="font-display text-2xl tracking-display text-green-deep">
            {p.golesFavor}<span className="text-ink-mute mx-0.5">-</span>{p.golesContra}
          </div>
        ) : (
          <div className="text-xs text-ink-mute">{p.estado.replace(/_/g, ' ').toLowerCase()}</div>
        )}
        {p.resultado && (
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${RESULTADO_STYLE[p.resultado]}`}
          >
            {p.resultado.toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
}

export default function JugadorPartidosPage(): React.ReactElement {
  const { data: partidos, isLoading, error } = useMisPartidos();

  if (isLoading) {
    return <p className="text-ink-mute">Cargando tus partidos…</p>;
  }
  if (error) {
    return (
      <Card padding="comfortable">
        <p className="text-danger font-semibold">No pudimos cargar los partidos.</p>
      </Card>
    );
  }

  const lista = partidos ?? [];
  const jugados = lista.filter((p) => p.resultado !== null);
  const proximos = lista.filter((p) => p.resultado === null);

  return (
    <>
      <PageHead eyebrow="Partidos" title="Partidos de mi club" />

      {lista.length === 0 && (
        <Card padding="comfortable">
          <p className="text-ink-mute">Todavía no hay partidos programados para tu club.</p>
        </Card>
      )}

      {proximos.length > 0 && (
        <Card padding="comfortable" className="mb-5">
          <CardLabel>Próximos / pendientes</CardLabel>
          <div className="mt-2">
            {proximos.map((p) => (
              <PartidoRow key={p.partidoId} p={p} />
            ))}
          </div>
        </Card>
      )}

      {jugados.length > 0 && (
        <Card padding="comfortable">
          <CardLabel>Resultados</CardLabel>
          <div className="mt-2">
            {jugados.map((p) => (
              <PartidoRow key={p.partidoId} p={p} />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
