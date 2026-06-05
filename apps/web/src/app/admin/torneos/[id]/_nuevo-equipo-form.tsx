'use client';

import { ArrowRight, Plus, Shield } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { FormErrorBanner } from '@/components/ui/form-errors';
import { useClubes, useCreateEquipo } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';

interface SerieOption {
  slug: string;
  nombre: string;
}

/**
 * Form de inscripción de un club existente como equipo del torneo.
 *
 * Post Sprint 26 — los equipos del torneo se generan a partir de la ficha
 * de Club registrada en /admin/clubes. No permitimos crear "equipos desde
 * cero" desde acá porque generaba datos huérfanos (sin ficha de club
 * reutilizable). Si el operador necesita un club nuevo, el botón "Crear
 * un club nuevo" lo lleva al flujo /admin/clubes/nuevo.
 *
 * Sprint 43 fix — filtra los clubes por la categoría del torneo si está
 * definida (Sprint 25 paso 3). Un torneo Super Senior solo lista clubes
 * que tengan SUPER SENIOR habilitada en categoriaIds.
 */
export function NuevoEquipoForm({
  torneoId,
  series: _series,
  categoriaIdTorneo,
  onDone,
}: {
  torneoId: string;
  /** Reservado para compatibilidad con el caller — el flujo actual no lo usa. */
  series?: SerieOption[];
  categoriaIdTorneo?: string | null;
  onDone: () => void;
}): React.ReactElement {
  const mutation = useCreateEquipo(torneoId);
  const { data: clubes, isLoading: loadingClubes } = useClubes();

  const clubesActivos = (clubes ?? []).filter((c) => {
    if (c.estado !== 'ACTIVO') return false;
    if (categoriaIdTorneo) {
      return c.categoriaIds.includes(categoriaIdTorneo);
    }
    return true;
  });

  const inscribirDesdeClub = async (clubId: string): Promise<void> => {
    const club = clubesActivos.find((c) => c.id === clubId);
    if (!club) return;
    try {
      await mutation.mutateAsync({
        nombre: club.nombre,
        slug: club.slug,
        colorPrimario: club.colorPrimario ?? '#1B4332',
        colorSecundario: club.colorSecundario ?? null,
        escudoUrl: club.escudoUrl ?? null,
        serieSlug: null,
      });
      toastSuccess(`"${club.nombre}" inscrito en el torneo.`);
      onDone();
    } catch (err) {
      toastError(err);
    }
  };

  const error = mutation.error;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-green-deep">
          → Inscribir un club existente
        </div>
        <Link href="/admin/clubes/nuevo">
          <Button type="button" variant="default" size="sm">
            <Plus size={12} /> Crear un club nuevo
          </Button>
        </Link>
      </div>

      {loadingClubes && (
        <p className="font-serif italic text-ink-mute text-sm">
          Cargando clubes…
        </p>
      )}

      {!loadingClubes && clubesActivos.length === 0 && (
        <Card padding="comfortable" variant="lime">
          {categoriaIdTorneo ? (
            <>
              <CardLabel>→ Sin clubes en esta categoría</CardLabel>
              <p className="text-sm text-green-deep/85 mt-2">
                No hay clubes activos que compitan en la categoría de este
                torneo. Para inscribir uno:
              </p>
              <ul className="text-sm text-green-deep/85 mt-2 list-disc pl-5 space-y-1">
                <li>
                  Andá a{' '}
                  <Link
                    href="/admin/clubes"
                    className="text-accent font-semibold hover:underline"
                  >
                    /admin/clubes
                  </Link>{' '}
                  y habilitá la categoría en un club existente, o
                </li>
                <li>
                  <Link
                    href="/admin/clubes/nuevo"
                    className="text-accent font-semibold hover:underline"
                  >
                    Creá un club nuevo
                  </Link>{' '}
                  con esa categoría asignada.
                </li>
              </ul>
            </>
          ) : (
            <>
              <CardLabel>→ Sin clubes cargados</CardLabel>
              <p className="text-sm text-green-deep/85 mt-2">
                Todavía no hay clubes activos en la liga.{' '}
                <Link
                  href="/admin/clubes/nuevo"
                  className="text-accent font-semibold hover:underline"
                >
                  Creá el primer club
                </Link>{' '}
                — sus datos quedan disponibles para todos los torneos.
              </p>
            </>
          )}
        </Card>
      )}

      {clubesActivos.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-card overflow-hidden">
          {clubesActivos.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => inscribirDesdeClub(c.id)}
                disabled={mutation.isPending}
                className={cn(
                  'w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-paper transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div
                  className="w-9 h-9 rounded-full flex-shrink-0 border border-line flex items-center justify-center"
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
                    <Shield size={14} className="text-chalk" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">
                    {c.nombre}
                  </div>
                  <div className="text-xs text-ink-mute font-mono">
                    {c.slug} · {c.jugadoresCount} jugador
                    {c.jugadoresCount === 1 ? '' : 'es'}
                  </div>
                </div>
                <ArrowRight size={14} className="text-accent flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FormErrorBanner
        apiError={error}
        apiTitle="No se pudo inscribir el club al torneo"
      />
    </div>
  );
}
