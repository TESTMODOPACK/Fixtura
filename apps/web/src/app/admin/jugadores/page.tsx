'use client';

import {
  AlertTriangle,
  ChevronRight,
  Search,
  Star,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';

import type { JugadorGlobal } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useJugadoresGlobal, useTorneos } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

export default function JugadoresGlobalPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const [torneoId, setTorneoId] = useState('');
  const [estado, setEstado] = useState<'activos' | 'todos'>('activos');

  // Deferred para que el input no dispare query en cada tecla
  const deferredSearch = useDeferredValue(search);

  const { data: torneos } = useTorneos();
  const { data: jugadores, isLoading } = useJugadoresGlobal({
    search: deferredSearch.trim() || undefined,
    torneoId: torneoId || undefined,
    estado,
  });

  const stats = useMemo(() => {
    const all = jugadores ?? [];
    return {
      total: all.length,
      activos: all.filter((j) => j.activo).length,
      sancionados: all.filter((j) => j.tieneSancionActiva).length,
      goleadores: all.filter((j) => j.goles > 0).length,
    };
  }, [jugadores]);

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Jugadores & ranking"
        sub="Buscá a cualquier jugador del tenant. Las stats se calculan sobre el torneo del equipo al que está inscrito."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Visibles</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Activos</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : stats.activos}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Con sanción</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.sancionados > 0 ? 'text-danger' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.sancionados}
          </div>
        </Card>
        <Card padding="comfortable" variant="lime">
          <CardLabel tone="mute">Goleadores</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.goleadores}
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-4">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute"
          />
          <input
            type="text"
            className="input pl-8 w-full"
            placeholder="Buscar por nombre, apellido, apodo o RUT…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm"
          value={torneoId}
          onChange={(e) => setTorneoId(e.target.value)}
        >
          <option value="">Todos los torneos</option>
          {torneos?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select
          className="input text-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value as 'activos' | 'todos')}
        >
          <option value="activos">Solo activos</option>
          <option value="todos">Incluir inactivos</option>
        </select>
      </div>

      {/* Tabla */}
      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
        )}
        {!isLoading && (jugadores?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              {deferredSearch
                ? `No hay jugadores que coincidan con "${deferredSearch}".`
                : 'No hay jugadores cargados.'}
            </p>
          </div>
        )}
        {!isLoading && jugadores && jugadores.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper-dark border-b border-line">
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink-mute font-semibold">
                  <th className="px-4 py-2.5">Jugador</th>
                  <th className="px-3 py-2.5">Equipo · Torneo</th>
                  <th className="px-3 py-2.5">Pos</th>
                  <th className="px-3 py-2.5 text-right">PJ</th>
                  <th className="px-3 py-2.5 text-right">⚽</th>
                  <th className="px-3 py-2.5 text-right">🟨</th>
                  <th className="px-3 py-2.5 text-right">🟥</th>
                  <th className="px-3 py-2.5 text-right">MVP</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jugadores.map((j) => (
                  <JugadorRow key={j.jugadorId} jugador={j} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function JugadorRow({ jugador }: { jugador: JugadorGlobal }): React.ReactElement {
  return (
    <tr className="hover:bg-paper transition-colors">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {jugador.numeroCamiseta != null && (
            <span className="font-mono text-xs text-ink-mute w-7">
              #{jugador.numeroCamiseta}
            </span>
          )}
          <div>
            <div className="font-semibold flex items-center gap-1">
              {jugador.nombre} {jugador.apellido}
              {jugador.capitan && <Star size={12} className="text-accent fill-accent" />}
            </div>
            <div className="text-xs text-ink-mute">
              {jugador.apodo && <span>« {jugador.apodo} » · </span>}
              {jugador.rut && <span className="font-mono">{jugador.rut}</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={`/admin/equipos/${jugador.equipoId}`}
          className="font-semibold hover:underline"
        >
          {jugador.equipoNombre}
        </Link>
        <div className="text-xs text-ink-mute">{jugador.torneoNombre}</div>
      </td>
      <td className="px-3 py-2.5 text-xs uppercase">{jugador.posicion ?? '—'}</td>
      <td className="px-3 py-2.5 text-right font-mono">{jugador.partidosJugados}</td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold">{jugador.goles}</td>
      <td className="px-3 py-2.5 text-right font-mono">{jugador.amarillas}</td>
      <td
        className={cn(
          'px-3 py-2.5 text-right font-mono',
          jugador.rojas > 0 && 'text-danger font-semibold',
        )}
      >
        {jugador.rojas}
      </td>
      <td className="px-3 py-2.5 text-right font-mono">{jugador.mvps}</td>
      <td className="px-3 py-2.5">
        {!jugador.activo && (
          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-ink-mute/15 text-ink-mute">
            inactivo
          </span>
        )}
        {jugador.activo && jugador.tieneSancionActiva && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-danger/15 text-danger">
            <AlertTriangle size={10} /> sanción
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={`/admin/equipos/${jugador.equipoId}`}
          className="text-line hover:text-ink-mute"
        >
          <ChevronRight size={14} />
        </Link>
      </td>
    </tr>
  );
}
