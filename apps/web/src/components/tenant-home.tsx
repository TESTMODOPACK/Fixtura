'use client';

import { Calendar, Flame, TableProperties, Trophy } from 'lucide-react';
import Link from 'next/link';

import type { PartidoPublico } from '@fixtura/types';

import { PublicHeader } from '@/components/public-header';
import { Card, CardLabel } from '@/components/ui/card';
import { useResumenLiga } from '@/hooks/use-portal';
import { cn } from '@/lib/cn';

export function TenantHome(): React.ReactElement {
  const { data, isLoading, error } = useResumenLiga();

  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError message={String(error)} />;

  return (
    <>
      <PublicHeader ligaNombre={data.liga.nombre} active="home" />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <section className="mb-8">
          <div className="eyebrow mb-2">→ Torneo en curso</div>
          <h1 className="font-display_alt text-5xl md:text-6xl text-green-deep tracking-tight leading-none">
            {data.torneoActivo?.nombre.toUpperCase() ?? 'SIN TORNEO ACTIVO'}
          </h1>
          {data.torneoActivo && (
            <p className="font-serif italic text-ink-mute mt-2 text-lg">
              Fecha {data.torneoActivo.fechaActual} de {data.torneoActivo.fechasTotales} ·
              Temporada {data.torneoActivo.temporada}
            </p>
          )}
        </section>

        {data.proximaFecha && (
          <section className="mb-10">
            <Card variant="dark" padding="roomy">
              <CardLabel tone="lime">
                Próxima fecha · {data.proximaFecha.etiqueta}
              </CardLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                {data.proximaFecha.partidos.slice(0, 4).map((p) => (
                  <PartidoCardDark key={p.id} partido={p} />
                ))}
              </div>
            </Card>
          </section>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
          <Link href="/tabla" className="contents">
            <Card className="hover:bg-paper transition-colors cursor-pointer">
              <CardLabel>Posiciones</CardLabel>
              <div className="flex items-center gap-3">
                <TableProperties size={28} className="text-green-bright" />
                <div className="font-display text-xl text-green-deep tracking-display">
                  TABLA COMPLETA
                </div>
              </div>
              <p className="text-sm text-ink-mute mt-2">
                Diferencia de gol, puntos y posición de cada equipo.
              </p>
            </Card>
          </Link>

          <Link href="/fixture" className="contents">
            <Card className="hover:bg-paper transition-colors cursor-pointer">
              <CardLabel>Calendario</CardLabel>
              <div className="flex items-center gap-3">
                <Calendar size={28} className="text-green-bright" />
                <div className="font-display text-xl text-green-deep tracking-display">
                  FIXTURE COMPLETO
                </div>
              </div>
              <p className="text-sm text-ink-mute mt-2">
                Todas las fechas, partidos por equipo y cancha.
              </p>
            </Card>
          </Link>

          <Link href="/goleadores" className="contents">
            <Card variant="lime" className="cursor-pointer hover:bg-green-lime/80 transition-colors">
              <CardLabel tone="mute">Top scorers</CardLabel>
              <div className="flex items-center gap-3">
                <Flame size={28} className="text-green-deep" />
                <div className="font-display text-xl text-green-deep tracking-display">
                  GOLEADORES
                </div>
              </div>
              <p className="text-sm text-green-deep/80 mt-2">
                Los pichichi del torneo, actualizados al cierre de cada acta.
              </p>
            </Card>
          </Link>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="eyebrow mb-3">→ Resultados de la fecha pasada</div>
            <Card padding="none" className="overflow-hidden divide-y divide-line">
              {data.resultadosRecientes.map((p) => (
                <PartidoRowResultado key={p.id} partido={p} />
              ))}
              {data.resultadosRecientes.length === 0 && (
                <div className="p-6 text-sm text-ink-mute font-serif italic">
                  Aún no se jugaron partidos en este torneo.
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="eyebrow mb-3">→ Top 5 goleadores</div>
            <Card padding="none" className="overflow-hidden divide-y divide-line">
              {data.topGoleadores.map((g) => (
                <div key={g.jugadorId} className="px-4 py-3 flex items-center gap-3">
                  <Trophy
                    size={16}
                    className={cn(
                      g.posicion === 1 && 'text-accent',
                      g.posicion === 2 && 'text-ink-mute',
                      g.posicion === 3 && 'text-orange-700',
                      g.posicion > 3 && 'text-line',
                    )}
                  />
                  <span className="font-mono text-xs text-ink-mute w-4">{g.posicion}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{g.jugadorNombre}</div>
                    <div className="text-xs text-ink-mute truncate">{g.equipoNombre}</div>
                  </div>
                  <div className="font-display text-2xl text-green-deep tracking-display">
                    {g.valor}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-chalk mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-ink-mute">
          <div>
            <span className="font-display tracking-[0.18em] text-green-deep">
              {data.liga.nombre.toUpperCase()}
            </span>{' '}
            · Powered by <span className="text-accent">Fixtura</span>
          </div>
          <div className="font-serif italic">la cancha, organizada.</div>
        </div>
      </footer>
    </>
  );
}

function PartidoCardDark({ partido }: { partido: PartidoPublico }): React.ReactElement {
  const hora = new Date(partido.fechaHora).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dia = new Date(partido.fechaHora).toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  return (
    <div className="bg-green-mid/40 border border-green-mid rounded-card p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-green-lime mb-1.5">
        {dia} · {hora}
      </div>
      <div className="text-xs font-semibold truncate">{partido.local.nombre}</div>
      <div className="text-[10px] text-chalk/60 my-0.5 font-serif italic">vs</div>
      <div className="text-xs font-semibold truncate">{partido.visita.nombre}</div>
      {partido.canchaNombre && (
        <div className="text-[10px] text-green-lime/70 mt-1.5">{partido.canchaNombre}</div>
      )}
    </div>
  );
}

function PartidoRowResultado({ partido }: { partido: PartidoPublico }): React.ReactElement {
  return (
    <div className="px-5 py-4 flex items-center gap-4">
      <div className="flex-1 min-w-0 text-right">
        <div className="font-semibold truncate">{partido.local.nombre}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 font-display tracking-display text-2xl text-green-deep">
        <span>{partido.local.goles ?? '-'}</span>
        <span className="text-ink-mute">:</span>
        <span>{partido.visita.goles ?? '-'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{partido.visita.nombre}</div>
      </div>
    </div>
  );
}

function PageLoading(): React.ReactElement {
  return (
    <>
      <PublicHeader ligaNombre="Cargando…" />
      <main className="max-w-7xl mx-auto px-6 py-20 text-center font-serif italic text-ink-mute">
        Cargando datos de la liga...
      </main>
    </>
  );
}

function PageError({ message }: { message: string }): React.ReactElement {
  return (
    <>
      <PublicHeader ligaNombre="Error" />
      <main className="max-w-3xl mx-auto px-6 py-20">
        <Card variant="paper" padding="roomy">
          <CardLabel tone="mute">Error</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            NO PUDIMOS CARGAR LA LIGA
          </div>
          <p className="text-sm text-ink-mute">{message}</p>
        </Card>
      </main>
    </>
  );
}
