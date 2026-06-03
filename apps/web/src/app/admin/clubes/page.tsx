'use client';

import {
  ChevronRight,
  Plus,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useCategorias, useClubes } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

/**
 * Sprint 31 — Catálogo de clubes con filtros para ligas grandes (100+).
 *
 * Combina:
 *   - Buscador por nombre/slug con deferred value para no laggear.
 *   - Tabs/pills por categoría (incluye conteo por categoría).
 *   - Toggle "solo activos" (default ON — inactivos suelen ser ruido
 *     hasta que el admin los necesita ver).
 *   - Sort alfabético por nombre.
 *   - Stats arriba (X clubes mostrados de Y totales).
 */
export default function ClubesPage(): React.ReactElement {
  const { data: clubes, isLoading } = useClubes();
  const { data: categorias } = useCategorias();

  const [search, setSearch] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>(''); // '' = todas
  const [soloActivos, setSoloActivos] = useState(true);

  const deferredSearch = useDeferredValue(search);
  const searchLower = deferredSearch.trim().toLowerCase();

  // Conteos por categoría (para mostrar en cada tab). Solo cuenta clubes
  // activos si el toggle está prendido — coherente con lo que se ve.
  const conteoCategorias = useMemo(() => {
    const m = new Map<string, number>();
    const fuente = soloActivos
      ? (clubes ?? []).filter((c) => c.estado === 'ACTIVO')
      : (clubes ?? []);
    for (const c of fuente) {
      for (const nom of c.categoriaNombres) {
        m.set(nom, (m.get(nom) ?? 0) + 1);
      }
    }
    return m;
  }, [clubes, soloActivos]);

  // Categorías presentes en al menos un club + nombres ordenados.
  // Solo mostramos las categorías que tienen ≥1 club (sino el filtro
  // estaría siempre vacío y confunde).
  const categoriasOrdenadas = useMemo(() => {
    const presentes = new Set(conteoCategorias.keys());
    const todas = categorias ?? [];
    return todas
      .filter((c) => presentes.has(c.nombre))
      .sort((a, b) => a.edadMinimaGeneral - b.edadMinimaGeneral);
  }, [categorias, conteoCategorias]);

  // Filtro principal
  const filtrados = useMemo(() => {
    const todos = clubes ?? [];
    return todos
      .filter((c) => (soloActivos ? c.estado === 'ACTIVO' : true))
      .filter((c) =>
        categoriaFiltro ? c.categoriaNombres.includes(categoriaFiltro) : true,
      )
      .filter((c) => {
        if (!searchLower) return true;
        return (
          c.nombre.toLowerCase().includes(searchLower) ||
          c.slug.toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [clubes, soloActivos, categoriaFiltro, searchLower]);

  const totalMostrados = filtrados.length;
  const totalGlobal = clubes?.length ?? 0;
  const totalActivos =
    clubes?.filter((c) => c.estado === 'ACTIVO').length ?? 0;
  const hayFiltrosActivos =
    search.trim() !== '' || categoriaFiltro !== '' || !soloActivos;

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Clubes"
        sub="Catálogo de clubes (equipos) de la liga. Cada club mantiene su identidad, directiva, plantel por categoría y se inscribe a los torneos que la liga organiza."
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

      {!isLoading && totalGlobal === 0 && (
        <Card padding="roomy" className="text-center">
          <Shield size={36} className="mx-auto text-line mb-3" />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            TODAVÍA NO HAY CLUBES
          </div>
          <p className="font-serif italic text-ink-mute mb-4">
            Cargá el primer club para empezar a inscribirlo en torneos.
          </p>
          <Link href="/admin/clubes/nuevo">
            <Button variant="accent" size="sm">
              <Plus size={14} /> Crear primer club
            </Button>
          </Link>
        </Card>
      )}

      {!isLoading && totalGlobal > 0 && (
        <>
          {/* Barra de búsqueda + toggle */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute"
              />
              <input
                type="text"
                className="input pl-8 pr-8 w-full"
                placeholder="Buscar por nombre o slug…"
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
              <span className="text-xs text-ink-mute font-mono">
                ({totalActivos}/{totalGlobal})
              </span>
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
                  ({soloActivos ? totalActivos : totalGlobal})
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

          {/* Stat de resultados + reset */}
          <div className="flex items-center justify-between mb-3 text-xs text-ink-mute">
            <div>
              Mostrando <span className="font-semibold text-ink">{totalMostrados}</span>{' '}
              {totalMostrados === 1 ? 'club' : 'clubes'}
              {totalMostrados !== totalGlobal && (
                <span> de {totalGlobal} totales</span>
              )}
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

          {/* Empty state filtrado */}
          {totalMostrados === 0 && (
            <Card padding="roomy" className="text-center">
              <Search size={32} className="mx-auto text-line mb-3" />
              <div className="font-display text-xl text-green-deep tracking-display mb-2">
                NINGÚN CLUB COINCIDE
              </div>
              <p className="font-serif italic text-ink-mute text-sm">
                Probá cambiando la búsqueda o quitando algún filtro.
              </p>
            </Card>
          )}

          {/* Grid de clubes */}
          {totalMostrados > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtrados.map((c) => (
                <Link key={c.id} href={`/admin/clubes/${c.id}`} className="block">
                  <Card
                    padding="comfortable"
                    className="hover:border-green-deep transition-colors h-full"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-12 h-12 rounded-full flex-shrink-0 border-2 border-line flex items-center justify-center"
                        style={{ backgroundColor: c.colorPrimario ?? '#888278' }}
                      >
                        {c.escudoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.escudoUrl}
                            alt={c.nombre}
                            className="w-full h-full object-contain rounded-full"
                          />
                        ) : (
                          <Shield size={20} className="text-chalk" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardLabel>{c.slug}</CardLabel>
                        <div className="font-display text-lg text-green-deep tracking-display leading-tight truncate">
                          {c.nombre.toUpperCase()}
                        </div>
                      </div>
                      {c.estado === 'INACTIVO' && (
                        <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
                          Inactivo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-ink-mute mt-3">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {c.jugadoresCount} jugador
                        {c.jugadoresCount === 1 ? '' : 'es'}
                      </span>
                    </div>

                    {c.categoriaNombres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {c.categoriaNombres.map((nom, i) => (
                          <span
                            key={`${c.id}-cat-${i}`}
                            className={cn(
                              'text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-0.5 rounded',
                              nom === categoriaFiltro
                                ? 'bg-green-deep text-chalk'
                                : 'bg-green-deep/10 text-green-deep',
                            )}
                          >
                            {nom}
                          </span>
                        ))}
                      </div>
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
