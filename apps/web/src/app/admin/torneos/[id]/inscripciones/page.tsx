'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Plus,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { Club, InscripcionTorneo } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useCategorias,
  useClubes,
  useDesinscribir,
  useInscribirClub,
  useInscripcionesTorneo,
  useTorneo,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { PlanillaTorneoDrawer } from './_planilla-drawer';

/**
 * Sprint 26E — Inscripciones del torneo agrupadas por combo
 * categoría+serie con cupo. Cada inscripción permite gestionar la
 * planilla del torneo (subset del plantel del club en esa categoría).
 */
export default function TorneoInscripcionesPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const { data: torneo, isLoading: loadingT } = useTorneo(id);
  const { data: categorias } = useCategorias();
  const { data: inscripciones, isLoading: loadingI } =
    useInscripcionesTorneo(id);
  const { data: clubes } = useClubes();
  const inscribir = useInscribirClub(id);
  const desinscribir = useDesinscribir(id);

  const [comboParaInscribir, setComboParaInscribir] = useState<{
    categoriaId: string;
    serieSlug: string | null;
    categoriaNombre: string;
    serieNombre: string | null;
  } | null>(null);
  const [planillaInsc, setPlanillaInsc] = useState<InscripcionTorneo | null>(
    null,
  );

  // Agrupamos las inscripciones por (categoriaId, serieSlug) para
  // renderizar el bloque de cada combo con su cupo + listado de clubes.
  const inscripcionesPorCombo = useMemo(() => {
    const map = new Map<string, InscripcionTorneo[]>();
    for (const i of inscripciones ?? []) {
      const k = `${i.categoriaId}::${i.serieSlug ?? ''}`;
      const arr = map.get(k) ?? [];
      arr.push(i);
      map.set(k, arr);
    }
    return map;
  }, [inscripciones]);

  if (loadingT) {
    return <p className="font-serif italic text-ink-mute">Cargando torneo…</p>;
  }
  if (!torneo) {
    return (
      <Card padding="roomy">
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          TORNEO NO ENCONTRADO
        </div>
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver
          </Button>
        </Link>
      </Card>
    );
  }

  const combos = torneo.categoriasSeries ?? [];
  const puedeInscribir = torneo.estado === 'DRAFT';

  return (
    <>
      <PageHead
        eyebrow={`Torneo · ${torneo.nombre}`}
        title="Inscripciones"
        sub={
          puedeInscribir
            ? 'Asigná clubes a cada categoría+serie del torneo. Después cargá la planilla por inscripción.'
            : `Torneo ${torneo.estado.toLowerCase()} — las inscripciones están cerradas. Sólo se pueden editar planillas (refuerzos) si están habilitados.`
        }
      >
        <Link href={`/admin/torneos/${id}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al torneo
          </Button>
        </Link>
      </PageHead>

      {combos.length === 0 && (
        <Card padding="roomy" className="text-center">
          <AlertTriangle
            size={36}
            className="mx-auto text-accent mb-3"
          />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            TORNEO SIN CATEGORÍAS
          </div>
          <p className="font-serif italic text-ink-mute">
            Este torneo no tiene categorías+series definidas. Editalo desde
            su pestaña Configuración para agregarlas.
          </p>
        </Card>
      )}

      {combos.length > 0 && (
        <div className="space-y-5">
          {combos.map((combo, i) => {
            const cat = categorias?.find((c) => c.id === combo.categoriaId);
            const serieNombre = combo.serieSlug
              ? (cat?.series?.find((s) => s.slug === combo.serieSlug)?.nombre ??
                combo.serieSlug)
              : null;
            const k = `${combo.categoriaId}::${combo.serieSlug ?? ''}`;
            const inscritos = inscripcionesPorCombo.get(k) ?? [];
            const cupoLleno = inscritos.length >= combo.cupoEquipos;

            return (
              <Card key={i} padding="none" className="overflow-hidden">
                <div className="px-5 py-3 border-b border-line flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardLabel>
                      {cat?.nombre ?? '…'}
                      {serieNombre ? ` · ${serieNombre}` : ''}
                    </CardLabel>
                    <div
                      className={cn(
                        'font-display text-2xl tracking-display',
                        cupoLleno ? 'text-accent' : 'text-green-deep',
                      )}
                    >
                      {inscritos.length}/{combo.cupoEquipos} EQUIPOS
                    </div>
                  </div>
                  {puedeInscribir && !cupoLleno && (
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() =>
                        setComboParaInscribir({
                          categoriaId: combo.categoriaId,
                          serieSlug: combo.serieSlug ?? null,
                          categoriaNombre: cat?.nombre ?? '',
                          serieNombre,
                        })
                      }
                    >
                      <Plus size={12} /> Inscribir club
                    </Button>
                  )}
                  {puedeInscribir && cupoLleno && (
                    <span className="text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-1 rounded bg-accent/15 text-accent">
                      Cupo completo
                    </span>
                  )}
                </div>

                {loadingI && (
                  <div className="p-4 font-serif italic text-ink-mute text-sm">
                    Cargando…
                  </div>
                )}

                {!loadingI && inscritos.length === 0 && (
                  <div className="p-8 text-center">
                    <Shield size={28} className="mx-auto text-line mb-2" />
                    <p className="font-serif italic text-ink-mute text-sm">
                      Sin clubes inscritos en este combo.
                    </p>
                  </div>
                )}

                {inscritos.length > 0 && (
                  <div className="divide-y divide-line">
                    {inscritos.map((insc) => (
                      <div
                        key={insc.id}
                        className="px-5 py-3 grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center"
                      >
                        <div className="w-9 h-9 rounded-full bg-paper-dark border border-line flex items-center justify-center">
                          {insc.clubEscudoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={insc.clubEscudoUrl}
                              alt={insc.clubNombre}
                              className="w-full h-full object-contain rounded-full"
                            />
                          ) : (
                            <Shield size={16} className="text-ink-mute" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink truncate">
                            {insc.clubNombre}
                          </div>
                          <div className="text-xs text-ink-mute">
                            Inscrito {new Date(insc.createdAt).toLocaleDateString('es-CL')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-ink-mute">
                          <Users size={12} /> {insc.jugadoresEnPlanilla}/
                          {insc.topeJugadores}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPlanillaInsc(insc)}
                          className="text-xs text-accent font-semibold hover:underline flex items-center gap-1"
                        >
                          Planilla <ChevronRight size={12} />
                        </button>
                        {puedeInscribir && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = confirm(
                                `¿Desinscribir a "${insc.clubNombre}" de ${cat?.nombre ?? ''}` +
                                  (serieNombre ? ` ${serieNombre}` : '') +
                                  '? Esto borra también su planilla del torneo.',
                              );
                              if (!ok) return;
                              try {
                                await desinscribir.mutateAsync(insc.id);
                              } catch (e) {
                                const err = e as ApiError;
                                alert(err.message ?? 'Error al desinscribir');
                              }
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
                            aria-label="Desinscribir"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de inscripción */}
      {comboParaInscribir && (
        <InscribirClubModal
          combo={comboParaInscribir}
          clubes={clubes ?? []}
          inscripciones={inscripciones ?? []}
          onCancel={() => setComboParaInscribir(null)}
          onSubmit={async (clubId) => {
            try {
              await inscribir.mutateAsync({
                clubId,
                categoriaId: comboParaInscribir.categoriaId,
                serieSlug: comboParaInscribir.serieSlug,
              });
              setComboParaInscribir(null);
            } catch (e) {
              const err = e as ApiError;
              alert(err.message ?? 'Error al inscribir');
            }
          }}
          loading={inscribir.isPending}
        />
      )}

      {/* Drawer de planilla del torneo */}
      {planillaInsc && (
        <PlanillaTorneoDrawer
          inscripcion={planillaInsc}
          onClose={() => setPlanillaInsc(null)}
        />
      )}
    </>
  );
}

function InscribirClubModal({
  combo,
  clubes,
  inscripciones,
  onCancel,
  onSubmit,
  loading,
}: {
  combo: {
    categoriaId: string;
    serieSlug: string | null;
    categoriaNombre: string;
    serieNombre: string | null;
  };
  clubes: Club[];
  inscripciones: InscripcionTorneo[];
  onCancel: () => void;
  onSubmit: (clubId: string) => Promise<void>;
  loading: boolean;
}): React.ReactElement {
  // Filtramos a clubes que:
  //   - tienen la categoría asignada (combo.categoriaId está en sus categoriaIds)
  //   - están activos
  //   - NO están ya inscritos en este combo del torneo
  const yaInscritosEnCombo = new Set(
    inscripciones
      .filter(
        (i) =>
          i.categoriaId === combo.categoriaId &&
          (i.serieSlug ?? null) === combo.serieSlug,
      )
      .map((i) => i.clubId),
  );

  const elegibles = clubes.filter(
    (c) =>
      c.estado === 'ACTIVO' &&
      c.categoriaIds.includes(combo.categoriaId) &&
      !yaInscritosEnCombo.has(c.id),
  );

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center px-4">
      <div className="bg-chalk rounded-card border border-line max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-line">
          <CardLabel>
            Inscribir club en {combo.categoriaNombre}
            {combo.serieNombre ? ` · ${combo.serieNombre}` : ''}
          </CardLabel>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {elegibles.length === 0 && (
            <div className="text-center p-6">
              <AlertTriangle
                size={28}
                className="mx-auto text-accent mb-2"
              />
              <p className="text-sm font-serif italic text-ink-mute">
                No hay clubes elegibles. Necesitás clubes activos con la
                categoría {combo.categoriaNombre} asignada y que aún no
                estén inscritos en este combo.{' '}
                <Link
                  href="/admin/clubes"
                  className="text-accent font-semibold hover:underline"
                >
                  Ver clubes
                </Link>
                .
              </p>
            </div>
          )}
          {elegibles.length > 0 && (
            <ul className="space-y-1">
              {elegibles.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSubmit(c.id)}
                    disabled={loading}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-card hover:bg-paper transition-colors disabled:opacity-50"
                  >
                    <div
                      className="w-8 h-8 rounded-full border border-line flex-shrink-0"
                      style={{ backgroundColor: c.colorPrimario ?? '#888278' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink truncate">
                        {c.nombre}
                      </div>
                      <div className="text-xs text-ink-mute font-mono">
                        {c.slug} · {c.jugadoresCount} jugadores
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
