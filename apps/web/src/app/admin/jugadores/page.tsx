'use client';

import {
  AlertTriangle,
  ChevronRight,
  Mail,
  Search,
  Shield,
  ShieldOff,
  Star,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';

import type { JugadorGlobal } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useCategorias, useClubes, useJugadoresGlobal } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

/**
 * Sprint 28' (ADR-0004) — Página cross-tenant de jugadores basada en
 * el modelo Clubes. Reemplaza la versión que mostraba "Equipo · Torneo"
 * por una vista de "Club · Categoría" con estado consolidado (ACTIVO,
 * INACTIVO, VETADO) y stats agregadas vía match por RUT al modelo
 * viejo (que se mantiene sincronizado por el shim del 26G.2).
 */

// Ordenamiento del ranking. 'default' = orden que devuelve el backend
// (club → categoría → apellido). Las demás claves ordenan por la stat
// (desc por defecto: es un ranking).
type StatSortKey = 'partidosJugados' | 'goles' | 'amarillas' | 'rojas' | 'mvps';
type SortKey = 'default' | StatSortKey;

const SORT_LABEL: Record<SortKey, string> = {
  default: 'Club · Nombre',
  goles: 'Más goles',
  amarillas: 'Más amarillas',
  rojas: 'Más rojas',
  mvps: 'Más MVP',
  partidosJugados: 'Más partidos',
};

export default function JugadoresGlobalPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const [clubId, setClubId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [estado, setEstado] = useState<'activos' | 'todos' | 'vetados'>(
    'activos',
  );
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Deferred para que el input no dispare query en cada tecla.
  const deferredSearch = useDeferredValue(search);

  const { data: clubes } = useClubes();
  const { data: categorias } = useCategorias();
  const { data: jugadores, isLoading } = useJugadoresGlobal({
    search: deferredSearch.trim() || undefined,
    clubId: clubId || undefined,
    categoriaId: categoriaId || undefined,
    estado,
  });

  const stats = useMemo(() => {
    const all = jugadores ?? [];
    return {
      total: all.length,
      activos: all.filter((j) => j.estado === 'ACTIVO').length,
      vetados: all.filter((j) => j.estado === 'VETADO').length,
      sancionados: all.filter((j) => j.tieneSancionActiva).length,
      goleadores: all.filter((j) => j.goles > 0).length,
    };
  }, [jugadores]);

  // El club depende de la categoría: si hay una categoría elegida, solo
  // ofrecemos los clubes que compiten en ella (club.categoriaIds). Así el
  // segundo filtro queda subordinado al primero (categoría → club).
  const clubesFiltrados = useMemo(() => {
    const all = clubes ?? [];
    if (!categoriaId) return all;
    return all.filter((c) => c.categoriaIds.includes(categoriaId));
  }, [clubes, categoriaId]);

  // Ranking client-side sobre la lista ya filtrada (el backend trae todas
  // las filas, sin paginar). 'default' respeta el orden del backend; una
  // stat ordena por ese valor con desempate estable por apellido/nombre.
  const jugadoresOrdenados = useMemo(() => {
    const all = jugadores ?? [];
    if (sortKey === 'default') return all;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...all].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      if (diff !== 0) return diff * factor;
      const porApellido = a.apellidos.localeCompare(b.apellidos);
      return porApellido !== 0 ? porApellido : a.nombres.localeCompare(b.nombres);
    });
  }, [jugadores, sortKey, sortDir]);

  const toggleSort = (k: StatSortKey): void => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Jugadores & ranking"
        sub="Busca a cualquier jugador del plantel global de la liga. Las stats se calculan sobre todos los torneos donde participó (match por RUT)."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
          <CardLabel>Vetados</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.vetados > 0 ? 'text-danger' : 'text-ink-mute',
            )}
          >
            {isLoading ? '…' : stats.vetados}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Con sanción</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.sancionados > 0 ? 'text-accent' : 'text-green-bright',
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
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 mb-4">
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
          value={categoriaId}
          onChange={(e) => {
            setCategoriaId(e.target.value);
            // El club elegido puede no competir en la nueva categoría: lo
            // limpiamos para que no quede un filtro incoherente.
            setClubId('');
          }}
        >
          <option value="">Todas las categorías</option>
          {categorias?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          className="input text-sm"
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
        >
          <option value="">
            {categoriaId ? 'Todos los clubes de la categoría' : 'Todos los clubes'}
          </option>
          {clubesFiltrados.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          className="input text-sm"
          value={estado}
          onChange={(e) =>
            setEstado(e.target.value as 'activos' | 'todos' | 'vetados')
          }
        >
          <option value="activos">Solo activos</option>
          <option value="todos">Activos + inactivos + vetados</option>
          <option value="vetados">Solo vetados</option>
        </select>
      </div>

      {/* Orden del ranking (en desktop también se ordena clickeando la
          columna; este selector sirve para móvil y descubribilidad). */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-ink-mute font-semibold">
          Ordenar por
        </span>
        <select
          className="input text-sm w-auto"
          value={sortKey}
          onChange={(e) => {
            setSortKey(e.target.value as SortKey);
            setSortDir('desc');
          }}
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">
            Cargando…
          </div>
        )}
        {!isLoading && (jugadores?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              {deferredSearch
                ? `No hay jugadores que coincidan con "${deferredSearch}".`
                : 'No hay jugadores cargados. Carga clubes y sus planteles desde '}
              {!deferredSearch && (
                <Link
                  href="/admin/clubes"
                  className="text-accent font-semibold hover:underline"
                >
                  /admin/clubes
                </Link>
              )}
              {!deferredSearch && '.'}
            </p>
          </div>
        )}
        {!isLoading && jugadores && jugadores.length > 0 && (
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-paper-dark border-b border-line">
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink-mute font-semibold">
                  <th className="px-4 py-2.5">Jugador</th>
                  <th className="px-3 py-2.5">Club · Categoría</th>
                  <th className="px-3 py-2.5">Pos</th>
                  <SortTh k="partidosJugados" label="PJ" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh k="goles" label="⚽" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh k="amarillas" label="🟨" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh k="rojas" label="🟥" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh k="mvps" label="MVP" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jugadoresOrdenados.map((j) => (
                  <JugadorRow key={j.jugadorId} jugador={j} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && jugadores && jugadores.length > 0 && (
          <div className="md:hidden divide-y divide-line">
            {jugadoresOrdenados.map((j) => (
              <JugadorCard key={j.jugadorId} jugador={j} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// Encabezado de columna numérica que ordena el ranking al clickearlo.
// Muestra ▲/▼ en la columna activa. Reusa el estilo uppercase del <tr>.
function SortTh({
  k,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  k: StatSortKey;
  label: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: StatSortKey) => void;
}): React.ReactElement {
  const active = sortKey === k;
  return (
    <th className="px-3 py-2.5 text-right">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-0.5 uppercase tracking-[0.15em] font-semibold hover:text-ink transition-colors',
          active ? 'text-accent' : 'text-ink-mute',
        )}
        title={`Ordenar por ${label}`}
      >
        {label}
        {active && <span aria-hidden>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}

function JugadorRow({ jugador }: { jugador: JugadorGlobal }): React.ReactElement {
  const esVetado = jugador.estado === 'VETADO';
  const esInactivo = jugador.estado === 'INACTIVO';

  return (
    <tr
      className={cn(
        'transition-colors',
        esVetado
          ? 'bg-danger/5 hover:bg-danger/10'
          : esInactivo
            ? 'opacity-60 hover:bg-paper'
            : 'hover:bg-paper',
      )}
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {jugador.numeroCamiseta != null && (
            <span className="font-mono text-xs text-ink-mute w-7">
              #{jugador.numeroCamiseta}
            </span>
          )}
          <div>
            <div className="font-semibold flex items-center gap-1">
              <Link
                href={`/admin/jugadores/${jugador.jugadorId}`}
                className="hover:text-accent hover:underline"
              >
                {jugador.nombres} {jugador.apellidos}
              </Link>
              {jugador.capitan && (
                <Star size={12} className="text-accent fill-accent" />
              )}
            </div>
            <div className="text-xs text-ink-mute flex flex-wrap gap-2">
              {jugador.apodo && <span>« {jugador.apodo} »</span>}
              <span className="font-mono">{jugador.rut}</span>
              {jugador.email && (
                <span className="flex items-center gap-0.5">
                  <Mail size={10} /> {jugador.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={`/admin/clubes/${jugador.clubId}`}
          className="font-semibold hover:underline flex items-center gap-1.5"
        >
          <Shield size={12} className="text-ink-mute flex-shrink-0" />
          {jugador.clubNombre}
        </Link>
        <div className="text-xs text-ink-mute">{jugador.categoriaNombre}</div>
      </td>
      <td className="px-3 py-2.5 text-xs uppercase">
        {jugador.posicion ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono">
        {jugador.partidosJugados}
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold">
        {jugador.goles}
      </td>
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
        <div className="flex flex-col gap-0.5">
          {esVetado && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-danger/15 text-danger w-fit"
              title={jugador.vetoMotivo ?? 'Vetado'}
            >
              <ShieldOff size={10} /> vetado
            </span>
          )}
          {esInactivo && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-ink-mute/15 text-ink-mute w-fit">
              inactivo
            </span>
          )}
          {jugador.tieneSancionActiva && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-accent/15 text-accent w-fit">
              <AlertTriangle size={10} /> sanción
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <Link
          href={`/admin/jugadores/${jugador.jugadorId}`}
          className="inline-flex items-center gap-1 text-accent font-semibold text-xs hover:underline whitespace-nowrap"
          title="Ver información del jugador"
        >
          Detalle <ChevronRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

// Versión móvil de la fila: la tabla de 10 columnas no cabe en un teléfono,
// así que en <md mostramos cada jugador como tarjeta apilada.
function JugadorCard({ jugador }: { jugador: JugadorGlobal }): React.ReactElement {
  const esVetado = jugador.estado === 'VETADO';
  const esInactivo = jugador.estado === 'INACTIVO';

  return (
    <Link
      href={`/admin/jugadores/${jugador.jugadorId}`}
      className={cn(
        'block p-4 transition-colors',
        esVetado ? 'bg-danger/5' : esInactivo ? 'opacity-60 hover:bg-paper' : 'hover:bg-paper',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold flex items-center gap-1.5">
            {jugador.numeroCamiseta != null && (
              <span className="font-mono text-xs text-ink-mute flex-shrink-0">
                #{jugador.numeroCamiseta}
              </span>
            )}
            <span className="truncate">
              {jugador.nombres} {jugador.apellidos}
            </span>
            {jugador.capitan && (
              <Star size={12} className="text-accent fill-accent flex-shrink-0" />
            )}
          </div>
          <div className="text-xs text-ink-mute mt-0.5 flex flex-wrap gap-x-2">
            {jugador.apodo && <span>« {jugador.apodo} »</span>}
            <span className="font-mono">{jugador.rut}</span>
          </div>
        </div>
        <ChevronRight size={18} className="text-accent flex-shrink-0 mt-0.5" />
      </div>

      <div className="text-sm mt-2 flex items-center gap-1.5">
        <Shield size={12} className="text-ink-mute flex-shrink-0" />
        <span className="font-semibold truncate">{jugador.clubNombre}</span>
        <span className="text-ink-mute flex-shrink-0">· {jugador.categoriaNombre}</span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-mute mt-2 font-mono">
        <span>{jugador.partidosJugados} PJ</span>
        <span className="text-ink font-semibold">{jugador.goles} ⚽</span>
        <span>{jugador.amarillas} 🟨</span>
        {jugador.rojas > 0 && <span className="text-danger">{jugador.rojas} 🟥</span>}
        {jugador.mvps > 0 && <span>{jugador.mvps} MVP</span>}
        {jugador.posicion && <span className="uppercase">{jugador.posicion}</span>}
      </div>

      {(esVetado || esInactivo || jugador.tieneSancionActiva) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {esVetado && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-danger/15 text-danger">
              <ShieldOff size={10} /> vetado
            </span>
          )}
          {esInactivo && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-ink-mute/15 text-ink-mute">
              inactivo
            </span>
          )}
          {jugador.tieneSancionActiva && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-accent/15 text-accent">
              <AlertTriangle size={10} /> sanción
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
