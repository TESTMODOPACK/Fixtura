'use client';

import {
  ArrowLeft,
  Flag,
  Pause,
  Play,
  RotateCcw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useArrancarCentro,
  useAjustarGolesCentro,
  useFinalizarCentro,
  useMatchCenter,
  usePausarCentro,
  useReanudarCentro,
  useSiguientePeriodoCentro,
  useSumarGolCentro,
} from '@/hooks/use-match-center';

export default function CentroPage({
  params,
}: {
  // Next.js 14 — params es síncrono.
  params: { id: string; partidoId: string };
}): React.ReactElement {
  const { id: torneoId, partidoId } = params;
  const { snapshot, conectado, error } = useMatchCenter(partidoId);
  const arrancar = useArrancarCentro(partidoId);
  const pausar = usePausarCentro(partidoId);
  const reanudar = useReanudarCentro(partidoId);
  const sumarGol = useSumarGolCentro(partidoId);
  const ajustar = useAjustarGolesCentro(partidoId);
  const siguientePeriodo = useSiguientePeriodoCentro(partidoId);
  const finalizar = useFinalizarCentro(partidoId);

  const segundos = snapshot?.segundosTranscurridos ?? 0;
  const minutosVisibles = Math.floor(segundos / 60);
  const segundosVisibles = segundos % 60;
  const cronometro = `${String(minutosVisibles).padStart(2, '0')}:${String(segundosVisibles).padStart(2, '0')}`;

  return (
    <>
      <PageHead
        eyebrow="Match Center"
        title={snapshot ? `${snapshot.equipoLocalNombre} vs ${snapshot.equipoVisitaNombre}` : 'Cargando…'}
        sub="Panel del cronista — marcador y cronómetro en vivo."
      >
        <Link href={`/admin/torneos/${torneoId}/partidos/${partidoId}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Detalle partido
          </Button>
        </Link>
        <span
          className="text-xs uppercase tracking-[0.18em] font-semibold flex items-center gap-1"
          title={conectado ? 'WebSocket conectado' : 'Sin conexión — usando polling'}
        >
          {conectado ? (
            <Wifi size={14} className="text-green-bright" />
          ) : (
            <WifiOff size={14} className="text-orange-700" />
          )}
          <span className={conectado ? 'text-green-bright' : 'text-orange-700'}>
            {conectado ? 'En vivo' : 'Polling'}
          </span>
        </span>
      </PageHead>

      {error && (
        <Card padding="comfortable" className="mb-5 border-2 border-danger/40 bg-danger/5">
          <div className="text-sm text-danger">{error}</div>
        </Card>
      )}

      {!snapshot && !error && (
        <Card padding="roomy">
          <p className="font-serif italic text-ink-mute">Cargando snapshot…</p>
        </Card>
      )}

      {snapshot && (
        <>
          {/* Marcador principal */}
          <Card padding="roomy" className="mb-5">
            <div className="grid grid-cols-3 items-center gap-4">
              <EquipoColumn
                nombre={snapshot.equipoLocalNombre}
                goles={snapshot.golesLocal}
                onMas={() => sumarGol.mutate('LOCAL')}
                onMenos={() =>
                  ajustar.mutate({
                    golesLocal: Math.max(0, snapshot.golesLocal - 1),
                    golesVisita: snapshot.golesVisita,
                  })
                }
                disabled={sumarGol.isPending || ajustar.isPending}
              />
              <div className="text-center">
                <div className="font-mono text-6xl md:text-7xl text-ink font-bold tabular-nums">
                  {cronometro}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute">
                  Período {snapshot.periodo || '—'} de {snapshot.minutosPorPeriodo} min
                  {snapshot.minutosEntretiempo > 0 && (
                    <span className="ml-2 text-ink-mute/70">
                      · descanso {snapshot.minutosEntretiempo}&nbsp;min
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider font-semibold inline-block px-2 py-0.5 rounded bg-paper-dark text-ink-mute">
                  {snapshot.estado.replace('_', ' ')}
                </div>
              </div>
              <EquipoColumn
                nombre={snapshot.equipoVisitaNombre}
                goles={snapshot.golesVisita}
                onMas={() => sumarGol.mutate('VISITA')}
                onMenos={() =>
                  ajustar.mutate({
                    golesLocal: snapshot.golesLocal,
                    golesVisita: Math.max(0, snapshot.golesVisita - 1),
                  })
                }
                disabled={sumarGol.isPending || ajustar.isPending}
              />
            </div>
          </Card>

          {/* Controles cronómetro */}
          <Card padding="roomy">
            <CardLabel>Controles del cronómetro</CardLabel>
            <div className="mt-4 flex flex-wrap gap-3">
              {snapshot.estado === 'IDLE' && (
                <Button
                  variant="accent"
                  onClick={() => arrancar.mutate({})}
                  disabled={arrancar.isPending}
                >
                  <Play size={16} /> Iniciar partido
                </Button>
              )}
              {snapshot.estado === 'EN_VIVO' && (
                <Button onClick={() => pausar.mutate()} disabled={pausar.isPending}>
                  <Pause size={16} /> Pausar
                </Button>
              )}
              {snapshot.estado === 'PAUSADO' && (
                <>
                  <Button
                    variant="accent"
                    onClick={() => reanudar.mutate()}
                    disabled={reanudar.isPending}
                  >
                    <Play size={16} /> Reanudar
                  </Button>
                  <Button
                    onClick={() => siguientePeriodo.mutate()}
                    disabled={siguientePeriodo.isPending}
                  >
                    <RotateCcw size={16} /> Siguiente período
                  </Button>
                  {snapshot.minutosEntretiempo > 0 && (
                    <div className="basis-full text-xs font-serif italic text-ink-mute mt-2">
                      Pausa en período {snapshot.periodo}. El reglamento del
                      torneo prevé {snapshot.minutosEntretiempo} min de descanso
                      antes del siguiente período.
                    </div>
                  )}
                </>
              )}
              {(snapshot.estado === 'EN_VIVO' || snapshot.estado === 'PAUSADO') && (
                <Button
                  onClick={() => {
                    if (
                      window.confirm(
                        '¿Finalizar el Match Center? Aún tenés que cerrar el acta para registrar el resultado oficial.',
                      )
                    ) {
                      finalizar.mutate();
                    }
                  }}
                  disabled={finalizar.isPending}
                >
                  <Flag size={16} /> Finalizar centro
                </Button>
              )}
              {snapshot.estado === 'FINALIZADO_CENTRO' && (
                <div className="text-sm font-serif italic text-ink-mute">
                  El partido en vivo terminó. Cerrá el acta desde la vista detalle.
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function EquipoColumn({
  nombre,
  goles,
  onMas,
  onMenos,
  disabled,
}: {
  nombre: string;
  goles: number;
  onMas: () => void;
  onMenos: () => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-2 truncate">
        {nombre}
      </div>
      <div className="font-display text-7xl md:text-8xl text-green-deep tracking-display tabular-nums">
        {goles}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={onMenos}
          disabled={disabled || goles === 0}
          className="px-3 py-1 rounded border border-line text-ink-mute text-lg leading-none disabled:opacity-30 hover:bg-paper-dark"
        >
          −
        </button>
        <button
          type="button"
          onClick={onMas}
          disabled={disabled}
          className="px-3 py-1 rounded bg-accent text-chalk text-lg leading-none disabled:opacity-50 hover:bg-accent/80"
        >
          + GOL
        </button>
      </div>
    </div>
  );
}
