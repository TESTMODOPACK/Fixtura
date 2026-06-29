'use client';

import type { Club, ClubCategoriaDetalle } from '@fixtura/types';
import {
  ChevronRight,
  Plus,
  Search,
  Shield,
  ShieldOff,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useCategorias, useClubes, useLevantarVetoClub } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 32 — listado de clubes expandido por (club, categoría).
 *
 * Cada card representa UN combo (club, categoría) — un club con N
 * categorías aparece como N entradas. Cada combo tiene su propia
 * directiva + plantel editables desde la ficha. Los datos transversales
 * del club (nombre, escudo, colores) viven en otro lado y son los
 * mismos para todas las categorías del club.
 */

type ClubCategoriaEntry = {
  club: Club;
  detalle: ClubCategoriaDetalle;
};

export default function ClubesPage(): React.ReactElement {
  const { data: clubes, isLoading } = useClubes();
  const { data: categorias } = useCategorias();
  const levantarVeto = useLevantarVetoClub();

  const [search, setSearch] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>(''); // '' = todas
  const [soloActivos, setSoloActivos] = useState(true);

  const deferredSearch = useDeferredValue(search);
  const searchLower = deferredSearch.trim().toLowerCase();

  // Expandir clubes → (club, categoría) entries.
  const entries: ClubCategoriaEntry[] = useMemo(() => {
    const out: ClubCategoriaEntry[] = [];
    for (const c of clubes ?? []) {
      // Si soloActivos está prendido y el club está INACTIVO, no entra.
      if (soloActivos && c.estado === 'INACTIVO') continue;
      for (const det of c.categoriasDetalle) {
        out.push({ club: c, detalle: det });
      }
    }
    return out;
  }, [clubes, soloActivos]);

  // Conteos por categoría (sobre lo que actualmente cuenta como visible).
  const conteoCategorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      m.set(e.detalle.categoriaNombre, (m.get(e.detalle.categoriaNombre) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  // Categorías ordenadas por edad mínima — solo las que tienen ≥1 entry.
  const categoriasOrdenadas = useMemo(() => {
    const presentes = new Set(conteoCategorias.keys());
    const todas = categorias ?? [];
    return todas
      .filter((c) => presentes.has(c.nombre))
      .sort((a, b) => a.edadMinimaGeneral - b.edadMinimaGeneral);
  }, [categorias, conteoCategorias]);

  // Filtro principal.
  const filtrados = useMemo(() => {
    return entries
      .filter((e) =>
        categoriaFiltro ? e.detalle.categoriaNombre === categoriaFiltro : true,
      )
      .filter((e) => {
        if (!searchLower) return true;
        return (
          e.club.nombre.toLowerCase().includes(searchLower) ||
          e.club.slug.toLowerCase().includes(searchLower) ||
          e.detalle.categoriaNombre.toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => {
        const byNombre = a.club.nombre.localeCompare(b.club.nombre, 'es');
        if (byNombre !== 0) return byNombre;
        return a.detalle.edadMinimaGeneral - b.detalle.edadMinimaGeneral;
      });
  }, [entries, categoriaFiltro, searchLower]);

  const totalMostrados = filtrados.length;
  const totalGlobal = entries.length;
  const totalClubesGlobal = clubes?.length ?? 0;
  const hayFiltrosActivos =
    search.trim() !== '' || categoriaFiltro !== '' || !soloActivos;

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Clubes"
        sub="Catálogo de clubes por categoría. Cada combo (club, categoría) tiene su propia directiva y plantel — los datos generales del club (nombre, escudo, colores) son compartidos."
      >
        <Link href="/admin/clubes/nuevo">
          <Button variant="accent" size="sm">
            <Plus size={14} /> Nuevo club
          </Button>
        </Link>
      </PageHead>

      {isLoading && (
        <Card padding="roomy">
          <p className="font-serif italic text-ink-mute">Cargando clubes…</p>
        </Card>
      )}

      {!isLoading && totalClubesGlobal === 0 && (
        <Card padding="roomy" className="text-center">
          <Shield size={36} className="mx-auto text-line mb-3" />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            TODAVÍA NO HAY CLUBES
          </div>
          <p className="font-serif italic text-ink-mute mb-4">
            Carga el primer club para empezar a inscribirlo en torneos.
          </p>
          <Link href="/admin/clubes/nuevo">
            <Button variant="accent" size="sm">
              <Plus size={14} /> Crear primer club
            </Button>
          </Link>
        </Card>
      )}

      {!isLoading && totalClubesGlobal > 0 && (
        <>
          {/* Buscador + toggle */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute"
              />
              <input
                type="text"
                className="input pl-8 pr-8 w-full"
                placeholder="Buscar por nombre del club, slug o categoría…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm px-3 py-2 rounded border border-line bg-paper cursor-pointer">
              <input
                type="checkbox"
                checked={soloActivos}
                onChange={(e) => setSoloActivos(e.target.checked)}
              />
              Solo activos
            </label>
          </div>

          {/* Tabs por categoría */}
          {categoriasOrdenadas.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setCategoriaFiltro('')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  categoriaFiltro === ''
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-paper border-line text-ink-mute hover:border-ink hover:text-ink',
                )}
              >
                Todas{' '}
                <span className="font-mono text-[10px] opacity-70">
                  ({totalGlobal})
                </span>
              </button>
              {categoriasOrdenadas.map((cat) => {
                const count = conteoCategorias.get(cat.nombre) ?? 0;
                const activa = categoriaFiltro === cat.nombre;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoriaFiltro(cat.nombre)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                      activa
                        ? 'bg-green-deep text-chalk border-green-deep'
                        : 'bg-paper border-line text-ink-mute hover:border-green-deep hover:text-green-deep',
                    )}
                    title={`Mínimo ${cat.edadMinimaGeneral} años`}
                  >
                    {cat.nombre}{' '}
                    <span className="font-mono text-[10px] opacity-70">
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Stat + reset */}
          <div className="flex items-center justify-between mb-3 text-xs text-ink-mute">
            <div>
              Mostrando <span className="font-semibold text-ink">{totalMostrados}</span>{' '}
              {totalMostrados === 1 ? 'plantel' : 'planteles'}
              {totalMostrados !== totalGlobal && (
                <span> de {totalGlobal} visibles</span>
              )}
              <span className="ml-2 text-ink-mute/70">
                · {totalClubesGlobal} {totalClubesGlobal === 1 ? 'club' : 'clubes'} en la liga
              </span>
              {hayFiltrosActivos && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCategoriaFiltro('');
                    setSoloActivos(true);
                  }}
                  className="ml-3 text-accent hover:underline font-semibold"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Empty filtrado */}
          {totalMostrados === 0 && (
            <Card padding="roomy" className="text-center">
              <Search size={32} className="mx-auto text-line mb-3" />
              <div className="font-display text-xl text-green-deep tracking-display mb-2">
                NADA COINCIDE
              </div>
              <p className="font-serif italic text-ink-mute text-sm">
                Prueba cambiando la búsqueda o quitando algún filtro.
              </p>
            </Card>
          )}

          {/* Grid de (club, categoría) */}
          {totalMostrados > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtrados.map((e) => (
                <Link
                  key={`${e.club.id}::${e.detalle.categoriaId}`}
                  href={`/admin/clubes/${e.club.id}/${e.detalle.categoriaId}`}
                  className="block"
                >
                  <Card
                    padding="comfortable"
                    className="hover:border-green-deep transition-colors h-full"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-12 h-12 rounded-full flex-shrink-0 border-2 border-line flex items-center justify-center"
                        style={{ backgroundColor: e.club.colorPrimario ?? '#888278' }}
                      >
                        {e.club.escudoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={e.club.escudoUrl}
                            alt={e.club.nombre}
                            className="w-full h-full object-contain rounded-full"
                          />
                        ) : (
                          <Shield size={20} className="text-chalk" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardLabel>{e.club.slug}</CardLabel>
                        <div className="font-display text-lg text-green-deep tracking-display leading-tight truncate">
                          {e.club.nombre.toUpperCase()}
                        </div>
                        <div className="text-xs text-ink-mute mt-0.5 truncate">
                          {e.detalle.categoriaNombre}
                        </div>
                      </div>
                      {e.club.estado === 'INACTIVO' && (
                        <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
                          Inactivo
                        </span>
                      )}
                      {e.club.vetadoAt && (
                        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-danger/15 text-danger">
                          <ShieldOff size={10} /> Vetado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-ink-mute mt-3">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {e.detalle.jugadoresCount} jugador
                        {e.detalle.jugadoresCount === 1 ? '' : 'es'}
                      </span>
                      {e.detalle.presidente?.nombre && (
                        <span className="text-ink-mute truncate">
                          · Pres. {e.detalle.presidente.nombre}
                        </span>
                      )}
                    </div>

                    {e.club.vetadoAt && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          if (
                            confirm(
                              `¿Levantar el veto de ${e.club.nombre}? El club volverá a poder ` +
                                'inscribirse en torneos de la liga.',
                            )
                          ) {
                            levantarVeto.mutate(e.club.id, {
                              onSuccess: () => toastSuccess('Veto del club levantado.'),
                              onError: (err) =>
                                toastError(
                                  (err as ApiError).message ?? 'No se pudo levantar el veto.',
                                ),
                            });
                          }
                        }}
                        className="mt-3 w-full text-xs font-semibold text-danger border border-danger/30 rounded py-1.5 hover:bg-danger/5 transition-colors"
                      >
                        Levantar veto del club
                      </button>
                    )}

                    <div className="flex items-center justify-end mt-3 text-accent text-xs font-semibold">
                      Ver ficha <ChevronRight size={14} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
