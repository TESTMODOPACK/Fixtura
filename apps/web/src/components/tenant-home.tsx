'use client';

import {
  Calendar,
  Flame,
  History,
  TableProperties,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import type { PartidoPublico, TorneoListaPublico } from '@fixtura/types';

import { PublicHeader } from '@/components/public-header';
import { SponsorBanner } from '@/components/sponsor-banner';
import { Card, CardLabel } from '@/components/ui/card';
import { usePublicTorneos, useResumenLiga } from '@/hooks/use-portal';
import { cn } from '@/lib/cn';

/**
 * Sprint 36B — `torneoSlug` opcional: si se pasa, la vista se arma con
 * los datos de ese torneo específico (usado en `/torneos/[slug]`). Si no,
 * comportamiento original: el activo más reciente + grid de "Más torneos".
 */
export function TenantHome({
  torneoSlug,
}: {
  torneoSlug?: string;
} = {}): React.ReactElement {
  const { data, isLoading, error } = useResumenLiga(torneoSlug);
  // El listado de "otros torneos" solo se muestra en la home (sin slug).
  const { data: todosTorneos } = usePublicTorneos();

  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError message={String(error)} />;

  const torneosOtros = (todosTorneos ?? []).filter(
    (t) => t.id !== data.torneoActivo?.id,
  );
  const mostrarMasTorneos = !torneoSlug && torneosOtros.length > 0;

  // Prefijo para las rutas internas: si estamos en `/torneos/[slug]`, los
  // links a tabla/fixture/goleadores deben quedar bajo el mismo prefijo
  // para preservar el contexto del torneo elegido.
  const prefix = torneoSlug ? `/torneos/${torneoSlug}` : '';

  return (
    <>
      <PublicHeader ligaNombre={data.liga.nombre} active="home" torneoSlug={torneoSlug} />

      {/* Banner sponsors HEADER — full width debajo del header */}
      <SponsorBanner
        posicion="HEADER"
        className="bg-paper-dark border-b border-line py-3 px-6"
      />

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
          {/* Sponsors HOME_HERO — dentro del hero */}
          <SponsorBanner posicion="HOME_HERO" className="mt-6" maxItems={4} />
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
          <Link href={`${prefix}/tabla`} className="contents">
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

          <Link href={`${prefix}/fixture`} className="contents">
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

          <Link href={`${prefix}/goleadores`} className="contents">
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
        {mostrarMasTorneos && (
          <section className="mt-12">
            <div className="eyebrow mb-3">
              → Otros torneos de {data.liga.nombre}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {torneosOtros.map((t) => (
                <TorneoCard key={t.id} torneo={t} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-line bg-chalk mt-12">
        {/* Sponsors FOOTER — antes del copyright */}
        <SponsorBanner posicion="FOOTER" className="px-6 py-6 border-b border-line" />

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

function TorneoCard({ torneo }: { torneo: TorneoListaPublico }): React.ReactElement {
  const esActivo = torneo.estado === 'ACTIVO';
  const fechaRef = esActivo ? torneo.proximoPartidoAt : torneo.ultimoPartidoAt;
  const fechaFormat = fechaRef
    ? new Date(fechaRef).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;
  return (
    <Link href={`/torneos/${torneo.slug}`} className="contents">
      <Card
        className={cn(
          'cursor-pointer transition-colors',
          esActivo ? 'hover:bg-paper' : 'opacity-90 hover:opacity-100 hover:bg-paper',
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <CardLabel>{torneo.temporadaNombre}</CardLabel>
          <span
            className={cn(
              'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded',
              esActivo
                ? 'bg-green-bright/15 text-green-bright'
                : 'bg-ink-mute/15 text-ink-mute',
            )}
          >
            {esActivo ? 'En curso' : 'Cerrado'}
          </span>
        </div>
        <div className="font-display text-xl text-green-deep tracking-display mb-3">
          {torneo.nombre.toUpperCase()}
        </div>
        {torneo.categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {torneo.categorias.map((c) => (
              <span
                key={c.categoriaId}
                className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-green-deep/10 text-green-deep"
              >
                {c.nombre}
              </span>
            ))}
          </div>
        )}
        <div className="text-xs text-ink-mute font-serif italic flex flex-wrap gap-3">
          <span className="flex items-center gap-1">
            <Users size={11} /> {torneo.equiposCount} equipos
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            Fecha {torneo.fechaActual} de {torneo.fechasTotales}
          </span>
        </div>
        {fechaFormat && (
          <div className="text-[11px] text-ink-mute mt-2 flex items-center gap-1">
            {esActivo ? (
              <>
                <Calendar size={10} /> Próxima: {fechaFormat}
              </>
            ) : (
              <>
                <History size={10} /> Última fecha: {fechaFormat}
              </>
            )}
          </div>
        )}
      </Card>
    </Link>
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
