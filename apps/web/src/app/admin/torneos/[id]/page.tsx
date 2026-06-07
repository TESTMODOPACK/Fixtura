'use client';

import {
  ArrowLeft,
  Ban,
  CalendarRange,
  Check,
  CircleDollarSign,
  ListOrdered,
  type LucideIcon,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  MotivoSuspensionEquipoLabel,
  type CategoriaJugadores,
  type TorneoAdmin,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ApiError } from '@/lib/api';
import {
  useCategorias,
  useDeleteEquipo,
  useDeleteTorneo,
  useEquipos,
  useReactivarEquipo,
  useResyncPlanteles,
  useTablaAdmin,
  useTorneo,
  useUpdateTorneo,
} from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';

import { GenerarFixtureForm } from './_generar-fixture-form';
import { NuevoEquipoForm } from './_nuevo-equipo-form';
import { SuspenderEquipoModal } from './_suspender-equipo-modal';

type Tab = 'equipos' | 'fixture' | 'posiciones' | 'configuracion';

export default function TorneoDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const [tab, setTab] = useState<Tab>('equipos');
  const { data: torneo, isLoading } = useTorneo(id);
  const { data: equipos } = useEquipos(id);
  const { data: categorias } = useCategorias();

  if (isLoading) {
    return (
      <div className="font-serif italic text-ink-mute">Cargando torneo...</div>
    );
  }
  if (!torneo) {
    return (
      <Card padding="roomy">
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          TORNEO NO ENCONTRADO
        </div>
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al listado
          </Button>
        </Link>
      </Card>
    );
  }

  // Sprint 41 — Combos efectivos: usar categoriasSeries del Sprint 26D;
  // si está vacío y hay categoriaId legacy, sintetizar (mismo patrón que
  // hace el backend en toDto).
  const combos = computeCombosEfectivos(torneo);

  return (
    <>
      <PageHead
        eyebrow={`Torneo · ${torneo.temporadaNombre}${eyebrowCategoria(torneo, categorias ?? [])}`}
        title={torneo.nombre}
        sub={`${torneo.tipoFormato.replace('_', ' ')} · ${torneo.ruedas === 2 ? 'ida y vuelta' : 'solo ida'} · ${torneo.puntosVictoria}/${torneo.puntosEmpate}/${torneo.puntosDerrota} pts`}
      >
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver
          </Button>
        </Link>
      </PageHead>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Equipos" value={torneo.equiposCount} icon={Users} />
        <StatCard label="Fechas" value={torneo.fechasCount} icon={CalendarRange} />
        <StatCard label="Estado" value={torneo.estado} icon={Trophy} highlight={torneo.estado === 'ACTIVO'} />
        <StatCard label="Slug" value={torneo.slug} icon={Trophy} mono />
      </div>

      {/* Tabs */}
      <div className="border-b border-line mb-6 -mx-6 md:-mx-10 px-6 md:px-10">
        <nav className="flex gap-1">
          <TabButton active={tab === 'equipos'} onClick={() => setTab('equipos')}>
            Equipos <span className="text-ink-mute">({torneo.equiposCount})</span>
          </TabButton>
          {/* Si el torneo ya tiene fixture generado, el tab navega DIRECTO
              al detalle (sin pasar por una card intermedia con un botón
              "Ver detalle"). Si todavía no hay fixture, queda como tab
              interno que muestra el botón de generación. */}
          {torneo.fechasCount > 0 ? (
            <Link
              href={`/admin/torneos/${id}/fixture`}
              className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink"
            >
              Fixture <span className="text-ink-mute">({torneo.fechasCount})</span> →
            </Link>
          ) : (
            <TabButton active={tab === 'fixture'} onClick={() => setTab('fixture')}>
              Fixture <span className="text-ink-mute">({torneo.fechasCount})</span>
            </TabButton>
          )}
          <TabButton active={tab === 'posiciones'} onClick={() => setTab('posiciones')}>
            Posiciones
          </TabButton>
          <TabButton active={tab === 'configuracion'} onClick={() => setTab('configuracion')}>
            Configuración
          </TabButton>
          <Link
            href={`/admin/torneos/${id}/designaciones`}
            className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink ml-auto"
          >
            Designaciones →
          </Link>
          <Link
            href={`/admin/torneos/${id}/tribunal`}
            className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink"
          >
            Tribunal →
          </Link>
          <Link
            href={`/admin/torneos/${id}/tarifario`}
            className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink"
            title="Configurar matrícula, cuota, multas y demás cobros del torneo"
          >
            Tarifario →
          </Link>
          <Link
            href={`/admin/torneos/${id}/horarios`}
            className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink"
            title="Plantilla de horarios por día de semana que usa el generador del fixture"
          >
            Horarios →
          </Link>
        </nav>
      </div>

      {tab === 'equipos' && (
        <EquiposTab
          torneoId={id}
          estadoTorneo={torneo.estado}
          // Sprint 44 fix — usar la categoría efectiva de los combos
          // (Sprint 26D/42), no torneo.categoriaId (legacy Sprint 25).
          // En torneos creados con el flujo nuevo, categoriaId puede
          // estar null pero categoriasSeries[0].categoriaId tiene el ID
          // real. Si hay multi-cat (>1 combo), no filtramos.
          categoriaId={
            combos.length === 1
              ? combos[0]!.categoriaId
              : torneo.categoriaId
          }
          categoriaNombre={torneo.categoriaNombre}
          combos={combos}
        />
      )}
      {tab === 'fixture' && (
        <FixtureTab
          torneoId={id}
          hasFechas={torneo.fechasCount > 0}
          hasEquipos={(equipos?.length ?? 0) >= 2}
        />
      )}
      {tab === 'posiciones' && <PosicionesTab torneoId={id} />}
      {tab === 'configuracion' && (
        <ConfiguracionTab
          torneoId={id}
          estado={torneo.estado}
          fechasCount={torneo.fechasCount}
          equiposCount={torneo.equiposCount}
          categoriaId={torneo.categoriaId}
          duracionPeriodoMinutos={torneo.duracionPeriodoMinutos}
          duracionEntretiempoMinutos={torneo.duracionEntretiempoMinutos}
        />
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
  mono,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  highlight?: boolean;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'border border-line rounded-card p-4',
        highlight ? 'bg-green-lime/20 border-green-bright' : 'bg-chalk',
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-1.5">
        <Icon size={12} /> {label}
      </div>
      <div
        className={cn(
          'text-green-deep tracking-display',
          mono ? 'font-mono text-sm' : 'font-display text-2xl',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-ink-mute hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function EquiposTab({
  torneoId,
  estadoTorneo,
  categoriaId,
  categoriaNombre: _categoriaNombre,
  combos,
}: {
  torneoId: string;
  estadoTorneo: 'DRAFT' | 'ACTIVO' | 'CERRADO';
  categoriaId: string | null;
  categoriaNombre: string | null;
  combos: ComboEfectivo[];
}): React.ReactElement {
  const { data: equipos, isLoading } = useEquipos(torneoId);
  const { data: categorias } = useCategorias();
  const [adding, setAdding] = useState(false);
  const [suspendiendo, setSuspendiendo] = useState<
    { id: string; nombre: string } | null
  >(null);
  const deleteEquipo = useDeleteEquipo(torneoId);
  const reactivarEquipo = useReactivarEquipo(torneoId);
  const resyncPlanteles = useResyncPlanteles(torneoId);
  // Solo se pueden inscribir equipos en DRAFT.
  const puedeInscribir = estadoTorneo === 'DRAFT';
  // Sprint 44 — suspender solo aplica con torneo ACTIVO (en DRAFT no hay
  // fixture; en CERRADO el torneo terminó).
  const puedeSuspender = estadoTorneo === 'ACTIVO';

  const handleReactivar = async (id: string, nombre: string): Promise<void> => {
    const ok = window.confirm(
      `¿Reactivar "${nombre}"?\n\nVuelve a INSCRITO. Los walkovers ya disparados al ` +
        `suspenderlo NO se revierten — siguen como historia. Si querés que vuelva ` +
        `a jugar fechas futuras, lo hacés desde el fixture.`,
    );
    if (!ok) return;
    try {
      await reactivarEquipo.mutateAsync(id);
      toastSuccess(`"${nombre}" reactivado.`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleEliminar = async (
    id: string,
    nombre: string,
    jugadoresCount: number,
  ): Promise<void> => {
    const advertencia =
      jugadoresCount > 0
        ? `\n\nATENCIÓN: este equipo tiene ${jugadoresCount} jugador(es) inscrito(s). Se borrarán todos junto con el equipo.`
        : '';
    const ok = window.confirm(
      `¿Eliminar "${nombre}" de este torneo?${advertencia}\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    try {
      await deleteEquipo.mutateAsync(id);
      toastSuccess(`"${nombre}" eliminado del torneo.`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleResync = async (): Promise<void> => {
    const ok = window.confirm(
      'Sincronizar planteles desde los clubes.\n\n' +
        'Recorre los clubes inscritos y carga en este torneo a los jugadores ' +
        'que cargaste DESPUÉS de inscribirlos. No borra ni duplica nada — es seguro ' +
        'correrlo las veces que quieras.\n\n¿Continuar?',
    );
    if (!ok) return;
    try {
      const res = await resyncPlanteles.mutateAsync();
      toastSuccess(
        `Sincronización lista: ${res.jugadoresSincronizados} jugador(es) en ` +
          `${res.inscripcionesProcesadas} equipo(s).`,
      );
    } catch (err) {
      toastError(err);
    }
  };

  const hayEquiposVacios = (equipos ?? []).some((e) => e.jugadoresCount === 0);

  // Series disponibles según la categoría del torneo. Si el torneo no tiene
  // categoría, no mostramos selector de serie en el form.
  const categoria = categoriaId
    ? categorias?.find((c) => c.id === categoriaId)
    : null;
  const series =
    categoria?.series?.filter((s) => s.activa).map((s) => ({
      slug: s.slug,
      nombre: s.nombre,
    })) ?? [];

  // Sprint 44 — los torneos multi-categoría legacy (combos.length > 1)
  // siguen existiendo pero el flujo unificado del tab Equipos cubre el
  // caso: el operador inscribe clubes y, si necesita serie específica,
  // la asigna desde el detalle del equipo. La página /inscripciones
  // dedicada quedó eliminada como duplicada del tab Equipos.
  const esMultiCategoria = combos.length > 1;
  const inscribirHabilitado = puedeInscribir;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card padding="none" className="lg:col-span-2 overflow-hidden">
        {esMultiCategoria && (
          <div className="px-5 py-4 bg-accent/10 border-b border-accent/30">
            <div className="text-sm text-ink">
              <strong>Torneo multi-categoría legacy</strong> ({combos.length} combos).
              Si necesitás asignar serie específica a un equipo, hacelo desde
              el detalle del equipo (click en la fila).
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <CardLabel>Equipos inscritos</CardLabel>
          <div className="flex items-center gap-2">
            {equipos && equipos.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResync}
                disabled={resyncPlanteles.isPending}
                title="Carga al torneo los jugadores que cargaste en los clubes después de inscribirlos"
              >
                <RefreshCw
                  size={14}
                  className={resyncPlanteles.isPending ? 'animate-spin' : undefined}
                />
                {resyncPlanteles.isPending ? 'Sincronizando…' : 'Sincronizar planteles'}
              </Button>
            )}
            {inscribirHabilitado ? (
              <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
                <Plus size={14} /> {adding ? 'Cancelar' : 'Inscribir equipo'}
              </Button>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded bg-ink-mute/10 text-ink-mute">
                Torneo {estadoTorneo.toLowerCase()} · inscripciones cerradas
              </span>
            )}
          </div>
        </div>

        {hayEquiposVacios && (
          <div className="px-5 py-4 bg-accent/10 border-b border-accent/30">
            <div className="text-sm text-ink">
              <strong>Hay equipos con 0 jugadores.</strong> Si ya cargaste los planteles
              en los clubes (vista Clubes), tocá{' '}
              <button
                type="button"
                onClick={handleResync}
                disabled={resyncPlanteles.isPending}
                className="font-semibold text-accent underline underline-offset-2 disabled:opacity-50"
              >
                Sincronizar planteles
              </button>{' '}
              para traerlos a este torneo.
            </div>
          </div>
        )}

        {adding && inscribirHabilitado && (
          <div className="px-5 py-4 bg-paper-dark border-b border-line">
            <NuevoEquipoForm
              torneoId={torneoId}
              series={series}
              categoriaIdTorneo={categoriaId}
              onDone={() => setAdding(false)}
            />
          </div>
        )}

        {isLoading && (
          <div className="p-6 font-serif italic text-ink-mute">Cargando...</div>
        )}

        {equipos && equipos.length === 0 && !adding && (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              Inscribí los primeros equipos para poder generar el fixture.
            </p>
          </div>
        )}

        {equipos && equipos.length > 0 && (
          <div className="divide-y divide-line">
            {equipos.map((e) => {
              const suspendido = e.estado === 'SUSPENDIDO';
              const tooltipMotivo = suspendido && e.motivoSuspension
                ? `${MotivoSuspensionEquipoLabel[e.motivoSuspension]}${
                    e.observacionesSuspension ? `\n\n${e.observacionesSuspension}` : ''
                  }`
                : undefined;
              return (
                <div
                  key={e.id}
                  className={cn(
                    'px-5 py-3 flex items-center gap-3 hover:bg-paper transition-colors',
                    suspendido && 'bg-danger/5',
                  )}
                >
                  <Link
                    href={`/admin/equipos/${e.id}`}
                    className="flex-1 min-w-0 flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex-shrink-0 border border-line',
                        suspendido && 'opacity-50 grayscale',
                      )}
                      style={{ backgroundColor: e.colorPrimario ?? '#888278' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          'font-semibold truncate',
                          suspendido ? 'text-ink-mute line-through' : 'text-ink',
                        )}
                      >
                        {e.nombre}
                      </div>
                      <div className="text-xs text-ink-mute font-mono">{e.slug}</div>
                    </div>
                    {suspendido && (
                      <span
                        title={tooltipMotivo}
                        className="text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-0.5 rounded bg-danger/15 text-danger"
                      >
                        Suspendido
                      </span>
                    )}
                    {!suspendido && e.serieNombre && (
                      <span className="text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-0.5 rounded bg-green-deep/10 text-green-deep">
                        {e.serieNombre}
                      </span>
                    )}
                    <div className="text-xs text-ink-mute">
                      {e.jugadoresCount} jugadores
                    </div>
                  </Link>
                  {!suspendido && puedeSuspender && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuspendiendo({ id: e.id, nombre: e.nombre })
                      }
                      title="Suspender del torneo (walkover 3-0 a rivales)"
                      className="flex-shrink-0 p-2 rounded text-ink-mute hover:bg-accent/10 hover:text-accent transition-colors"
                    >
                      <Ban size={14} />
                    </button>
                  )}
                  {suspendido && (
                    <button
                      type="button"
                      onClick={() => handleReactivar(e.id, e.nombre)}
                      disabled={reactivarEquipo.isPending}
                      title="Reactivar (vuelve a INSCRITO)"
                      className={cn(
                        'flex-shrink-0 p-2 rounded text-ink-mute hover:bg-green-bright/10 hover:text-green-deep transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                  {puedeInscribir && !suspendido && (
                    <button
                      type="button"
                      onClick={() => handleEliminar(e.id, e.nombre, e.jugadoresCount)}
                      disabled={deleteEquipo.isPending}
                      title="Eliminar del torneo"
                      className={cn(
                        'flex-shrink-0 p-2 rounded text-ink-mute hover:bg-danger/10 hover:text-danger transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {suspendiendo && (
          <SuspenderEquipoModal
            torneoId={torneoId}
            equipoId={suspendiendo.id}
            equipoNombre={suspendiendo.nombre}
            onClose={() => setSuspendiendo(null)}
          />
        )}
      </Card>

      <div className="space-y-4">
        <CombosCard combos={combos} categorias={categorias ?? []} />

        <Card variant="lime" padding="comfortable">
          <CardLabel tone="mute">Recordatorio</CardLabel>
          <div className="font-display text-lg text-green-deep tracking-display mb-2">
            MÍNIMO 2 EQUIPOS
          </div>
          <p className="text-sm text-green-deep/85">
            Para generar el fixture necesitás al menos 2 equipos. Para una liga real,
            recomendamos inscribir todos los equipos antes de generar el fixture — agregar
            equipos después requiere regenerar.
          </p>
        </Card>
      </div>
    </div>
  );
}

function FixtureTab({
  torneoId,
  hasFechas,
  hasEquipos,
}: {
  torneoId: string;
  hasFechas: boolean;
  hasEquipos: boolean;
}): React.ReactElement {
  const router = useRouter();

  // Si el torneo YA tiene fixture, redirigimos directo al detalle.
  // Evita la card intermedia "FIXTURE ACTIVO + Ver detalle" que era ruido
  // (el header del tab ya navega derecho, esto es defensivo si llegan acá
  // por deeplink o por estado interno preservado).
  useEffect(() => {
    if (hasFechas) {
      router.replace(`/admin/torneos/${torneoId}/fixture`);
    }
  }, [hasFechas, router, torneoId]);

  if (hasFechas) {
    return (
      <Card padding="roomy">
        <p className="font-serif italic text-ink-mute text-center">Abriendo el fixture…</p>
      </Card>
    );
  }

  if (!hasEquipos) {
    return (
      <Card padding="roomy" className="text-center">
        <CalendarRange size={36} className="mx-auto text-line mb-3" />
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          INSCRIBÍ EQUIPOS PRIMERO
        </div>
        <p className="font-serif italic text-ink-mute">
          Para generar el fixture necesitás al menos 2 equipos inscritos.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="roomy">
      <CardLabel>Generar calendario de partidos</CardLabel>
      <div className="font-display text-2xl text-green-deep tracking-display mb-2">
        TODOS CONTRA TODOS
      </div>
      <p className="font-serif italic text-ink-mute mb-6">
        Genera el calendario completo del torneo: cada equipo juega contra
        todos los demás. Si la cantidad de equipos es impar, en cada fecha uno
        descansa. Después podés editar partidos a mano (cambiar cancha, hora o
        fecha) desde el detalle de cada partido.
      </p>
      <GenerarFixtureForm torneoId={torneoId} />
    </Card>
  );
}

// ─── Tab: Tabla de posiciones ──────────────────────────────────────
function PosicionesTab({ torneoId }: { torneoId: string }): React.ReactElement {
  const { data, isLoading, error } = useTablaAdmin(torneoId);
  const apiError = error as ApiError | undefined;

  if (isLoading) {
    return (
      <Card padding="roomy" className="text-center">
        <p className="font-serif italic text-ink-mute">Cargando tabla…</p>
      </Card>
    );
  }
  if (apiError) {
    return (
      <Card padding="roomy" className="border-danger/40 bg-danger/5">
        <p className="text-sm text-danger">{apiError.message}</p>
      </Card>
    );
  }
  if (!data || data.filas.length === 0) {
    return (
      <Card padding="roomy" className="text-center">
        <ListOrdered size={36} className="mx-auto text-line mb-3" />
        <p className="font-serif italic text-ink-mute">
          Todavía no hay equipos en este torneo. La tabla se arma con los
          equipos inscriptos y los resultados de las actas cerradas.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div>
          <CardLabel tone="mute">Tabla de posiciones</CardLabel>
          <div className="font-display text-lg text-green-deep tracking-display">
            {data.filas.length} EQUIPOS
          </div>
        </div>
        {!data.hayResultados && (
          <span className="text-xs font-serif italic text-ink-mute">
            Aún sin partidos jugados — la tabla arranca en cero y se actualiza
            al cerrar cada acta.
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-mute border-b border-line">
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Equipo</th>
              <th className="px-2 py-2 text-center font-semibold" title="Partidos jugados">PJ</th>
              <th className="px-2 py-2 text-center font-semibold" title="Ganados">G</th>
              <th className="px-2 py-2 text-center font-semibold" title="Empatados">E</th>
              <th className="px-2 py-2 text-center font-semibold" title="Perdidos">P</th>
              <th className="px-2 py-2 text-center font-semibold" title="Goles a favor">GF</th>
              <th className="px-2 py-2 text-center font-semibold" title="Goles en contra">GC</th>
              <th className="px-2 py-2 text-center font-semibold" title="Diferencia de gol">DG</th>
              <th className="px-3 py-2 text-center font-semibold" title="Puntos">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.filas.map((f) => (
              <tr key={f.equipoId} className="hover:bg-paper/50">
                <td className="px-3 py-2 font-mono text-ink-mute">{f.posicion}</td>
                <td className="px-3 py-2 font-semibold text-ink">{f.equipoNombre}</td>
                <td className="px-2 py-2 text-center text-ink-mute">{f.pj}</td>
                <td className="px-2 py-2 text-center text-ink-mute">{f.pg}</td>
                <td className="px-2 py-2 text-center text-ink-mute">{f.pe}</td>
                <td className="px-2 py-2 text-center text-ink-mute">{f.pp}</td>
                <td className="px-2 py-2 text-center text-ink-mute">{f.gf}</td>
                <td className="px-2 py-2 text-center text-ink-mute">{f.gc}</td>
                <td className="px-2 py-2 text-center text-ink-mute">
                  {f.dg > 0 ? `+${f.dg}` : f.dg}
                </td>
                <td className="px-3 py-2 text-center font-display text-lg text-green-deep tracking-display">
                  {f.pts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-line text-[11px] font-serif italic text-ink-mute">
        PJ jugados · G/E/P ganados, empatados, perdidos · GF/GC goles a favor y
        en contra · DG diferencia · Pts puntos. Desempate por:{' '}
        {data.tiebreakers.join(' → ')}.
      </div>
    </Card>
  );
}

function ConfiguracionTab({
  torneoId,
  estado,
  fechasCount,
  equiposCount,
  categoriaId,
  duracionPeriodoMinutos,
  duracionEntretiempoMinutos,
}: {
  torneoId: string;
  estado: string;
  fechasCount: number;
  equiposCount: number;
  categoriaId: string | null;
  duracionPeriodoMinutos: number;
  duracionEntretiempoMinutos: number;
}): React.ReactElement {
  const mutation = useUpdateTorneo(torneoId);
  const deleteTorneo = useDeleteTorneo();
  const router = useRouter();
  const error = mutation.error as ApiError | undefined;
  const { data: categorias } = useCategorias();
  const [seleccion, setSeleccion] = useState<string>(categoriaId ?? '');

  const onEliminarTorneo = (): void => {
    const ok = window.confirm(
      '¿Eliminar este torneo? Esto borra el torneo y todo lo que tenga ' +
        'cargado en borrador (equipos, configuración, etc.). No se puede ' +
        'deshacer.',
    );
    if (!ok) return;
    deleteTorneo.mutate(torneoId, {
      onSuccess: () => {
        toastSuccess('Torneo eliminado correctamente.');
        router.push('/admin/torneos');
      },
    });
  };

  // Sprint 29A — duración del partido editable.
  const [duracionPeriodo, setDuracionPeriodo] = useState<number>(duracionPeriodoMinutos);
  const [duracionEntretiempo, setDuracionEntretiempo] = useState<number>(
    duracionEntretiempoMinutos,
  );
  useEffect(() => {
    setDuracionPeriodo(duracionPeriodoMinutos);
    setDuracionEntretiempo(duracionEntretiempoMinutos);
  }, [duracionPeriodoMinutos, duracionEntretiempoMinutos]);

  const cambioDuracion =
    duracionPeriodo !== duracionPeriodoMinutos ||
    duracionEntretiempo !== duracionEntretiempoMinutos;

  const guardarDuracion = (): void => {
    if (!cambioDuracion) return;
    mutation.mutate({
      duracionPeriodoMinutos: duracionPeriodo,
      duracionEntretiempoMinutos: duracionEntretiempo,
    });
  };

  // Mantener el select sincronizado si el torneo se recarga (ej. después
  // de un save remoto). Sin esto, el dropdown muestra la selección vieja.
  useEffect(() => {
    setSeleccion(categoriaId ?? '');
  }, [categoriaId]);

  const cambioCategoria = seleccion !== (categoriaId ?? '');

  const guardarCategoria = (): void => {
    // Confirm si ya hay equipos inscritos — el backend les borra el
    // serie_slug, vale la pena avisarle al admin antes.
    if (cambioCategoria && equiposCount > 0) {
      const ok = confirm(
        `Hay ${equiposCount} equipo(s) inscriptos. Cambiar la categoría va a borrar la serie asignada a esos equipos (vas a tener que reasignarla manualmente).\n\n¿Continuar?`,
      );
      if (!ok) return;
    }
    mutation.mutate({ categoriaId: seleccion || null });
  };

  const transitions: Record<string, { label: string; next: 'DRAFT' | 'ACTIVO' | 'CERRADO'; disabled?: string }> = {
    DRAFT: {
      label: 'Activar torneo',
      next: 'ACTIVO',
      disabled:
        fechasCount === 0
          ? 'Primero generá el fixture (mínimo 1 fecha)'
          : undefined,
    },
    ACTIVO: { label: 'Cerrar torneo', next: 'CERRADO' },
    CERRADO: { label: 'Reabrir como ACTIVO', next: 'ACTIVO' },
  };

  const transition = transitions[estado];

  // Sprint 45 — al activar el torneo (DRAFT→ACTIVO) se generan los cobros
  // del tarifario (matrícula + cuotas) para todos los equipos. Confirmamos
  // para que el operador sepa que es una acción con efecto financiero.
  const ejecutarTransicion = (): void => {
    if (!transition) return;
    if (estado === 'DRAFT' && transition.next === 'ACTIVO') {
      const ok = window.confirm(
        `Al activar el torneo se van a generar los cobros del tarifario ` +
          `(matrícula y cuotas) para los ${equiposCount} equipo(s) inscriptos.\n\n` +
          `Asegurate de tener el tarifario configurado antes de continuar. ` +
          `Si todavía no cargaste matrícula ni cuotas, podés activarlo igual y ` +
          `no se genera ningún cobro.\n\n¿Activar el torneo ahora?`,
      );
      if (!ok) return;
    }
    mutation.mutate({ estado: transition.next });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card padding="roomy">
        <CardLabel>Estado del torneo</CardLabel>
        <div className="font-display text-3xl text-green-deep tracking-display my-2">{estado}</div>
        <p className="font-serif italic text-ink-mute text-sm mb-6">
          {estado === 'DRAFT' &&
            'En borrador. Solo visible desde el panel admin. Activá el torneo para que aparezca en el portal público.'}
          {estado === 'ACTIVO' &&
            'Torneo activo. Visible en el portal público. Los hinchas pueden ver tabla, fixture y rankings.'}
          {estado === 'CERRADO' &&
            'Torneo cerrado. No se aceptan nuevas actas. Sigue visible como histórico en el portal.'}
        </p>

        {/* Sprint 45 — aviso de cobros antes de activar. */}
        {estado === 'DRAFT' && (
          <div className="mb-4 text-xs font-serif text-ink-mute bg-accent/5 border border-accent/30 rounded-card p-3 flex items-start gap-2">
            <CircleDollarSign size={14} className="text-accent flex-shrink-0 mt-0.5" />
            <span>
              Al activar el torneo se generan los cobros del{' '}
              <Link href={`/admin/torneos/${torneoId}/tarifario`} className="text-accent underline">
                tarifario
              </Link>{' '}
              (matrícula y cuotas) para los {equiposCount} equipo(s). Dejá el
              tarifario listo antes de activar.
            </span>
          </div>
        )}

        {transition && (
          <div className="space-y-2">
            <Button
              variant="accent"
              onClick={ejecutarTransicion}
              loading={mutation.isPending}
              disabled={!!transition.disabled}
            >
              <Check size={14} /> {transition.label}
            </Button>
            {transition.disabled && (
              <p className="text-xs text-ink-mute font-serif italic">{transition.disabled}</p>
            )}
            {error && (
              <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">{error.message}</p>
            )}
          </div>
        )}

        {/* Sprint 31 — eliminar torneo. Solo permitido en DRAFT, después
            de activar el torneo ya hay data en juego (designaciones,
            actas, posibles cobros) y borrarlo perdería historial. */}
        {estado === 'DRAFT' && (
          <div className="mt-6 pt-5 border-t border-line">
            <CardLabel tone="mute">Zona peligrosa</CardLabel>
            <p className="font-serif italic text-ink-mute text-xs mt-2 mb-3">
              Si este torneo fue creado por error, podés eliminarlo mientras
              esté en borrador. Una vez activo, no se puede borrar — usá
              &ldquo;Cerrar torneo&rdquo; para mantenerlo como histórico.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={onEliminarTorneo}
              loading={deleteTorneo.isPending}
              className="text-danger border-danger/40 hover:bg-danger/5"
            >
              <Trash2 size={14} /> Eliminar torneo
            </Button>
          </div>
        )}
      </Card>

      <Card variant="lime" padding="roomy">
        <CardLabel tone="mute">Flujo de estados</CardLabel>
        <div className="space-y-3 mt-3 text-sm text-green-deep/90">
          <div className="flex items-start gap-3">
            <span className="font-display text-lg text-green-deep tracking-display">DRAFT</span>
            <span className="font-serif italic">Configuración inicial: equipos, plantillas, fixture.</span>
          </div>
          <div className="ml-12 text-green-deep">↓</div>
          <div className="flex items-start gap-3">
            <span className="font-display text-lg text-green-deep tracking-display">ACTIVO</span>
            <span className="font-serif italic">El torneo se juega: actas, designaciones, portal público.</span>
          </div>
          <div className="ml-12 text-green-deep">↓</div>
          <div className="flex items-start gap-3">
            <span className="font-display text-lg text-green-deep tracking-display">CERRADO</span>
            <span className="font-serif italic">Histórico. Datos congelados para consulta.</span>
          </div>
        </div>
      </Card>

      <Card padding="roomy" className="lg:col-span-2">
        <CardLabel>Categoría de jugadores</CardLabel>
        <p className="text-sm text-ink-mute font-serif italic mt-2 mb-4">
          La categoría define la edad mínima y las series disponibles. Si lo cambiás,
          los equipos pierden su serie asignada (la tendrás que reasignar).
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <select
              className="input"
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
            >
              <option value="">Sin categoría (libre)</option>
              {categorias
                ?.filter((c) => c.activa || c.id === categoriaId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · mín. {c.edadMinimaGeneral} años
                    {!c.activa ? ' (inactiva)' : ''}
                  </option>
                ))}
            </select>
          </div>
          <Button
            variant="accent"
            size="sm"
            onClick={guardarCategoria}
            disabled={!cambioCategoria}
            loading={mutation.isPending}
          >
            <Check size={14} /> Guardar
          </Button>
        </div>
      </Card>

      {/* Sprint 29A — Duración del partido */}
      <Card padding="roomy" className="lg:col-span-2">
        <CardLabel>Duración del partido</CardLabel>
        <p className="text-sm text-ink-mute font-serif italic mt-2 mb-4">
          Cuánto dura cada tiempo y el descanso. El match center y la vista en
          vivo van a heredar estos valores al arrancar el cronómetro.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs uppercase tracking-wider text-ink-mute font-semibold mb-1">
              Minutos por tiempo
            </label>
            <input
              type="number"
              min={1}
              max={120}
              className="input w-full"
              value={duracionPeriodo}
              onChange={(e) => setDuracionPeriodo(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-ink-mute font-semibold mb-1">
              Minutos de entretiempo
            </label>
            <input
              type="number"
              min={0}
              max={60}
              className="input w-full"
              value={duracionEntretiempo}
              onChange={(e) => setDuracionEntretiempo(Number(e.target.value))}
            />
          </div>
          <Button
            variant="accent"
            size="sm"
            onClick={guardarDuracion}
            disabled={!cambioDuracion}
            loading={mutation.isPending}
          >
            <Check size={14} /> Guardar
          </Button>
        </div>
        <p className="text-xs font-serif italic text-ink-mute mt-3">
          Default: 40 min / 10 min entretiempo. El cambio aplica solo a
          partidos que todavía no arrancaron el match center.
        </p>
      </Card>
    </div>
  );
}

// ─── Sprint 41 — Multi-categoría helpers ─────────────────────────────

type ComboEfectivo = {
  categoriaId: string;
  serieSlug: string | null;
  cupoEquipos: number;
};

/**
 * Devuelve los combos (categoría + serie) efectivos del torneo.
 * Prioridad: categoriasSeries del Sprint 26D. Si está vacío y hay
 * categoriaId legacy, sintetizamos un combo único (mismo patrón que el
 * backend usa en toDto).
 */
function computeCombosEfectivos(torneo: TorneoAdmin): ComboEfectivo[] {
  if (torneo.categoriasSeries && torneo.categoriasSeries.length > 0) {
    return torneo.categoriasSeries.map((c) => ({
      categoriaId: c.categoriaId,
      serieSlug: c.serieSlug ?? null,
      cupoEquipos: c.cupoEquipos,
    }));
  }
  if (torneo.categoriaId) {
    return [{ categoriaId: torneo.categoriaId, serieSlug: null, cupoEquipos: 99 }];
  }
  return [];
}

/**
 * Texto que se concatena al eyebrow del header. Soporta los 3 casos:
 *   - Sin categoría → ''
 *   - Una sola → ' · Senior'
 *   - Multi-categoría → ' · MULTI-CATEGORÍA (4 combos)'
 */
function eyebrowCategoria(
  torneo: TorneoAdmin,
  categorias: CategoriaJugadores[],
): string {
  const combos = computeCombosEfectivos(torneo);
  if (combos.length === 0) return '';
  if (combos.length === 1) {
    const c = categorias.find((cat) => cat.id === combos[0]!.categoriaId);
    return c ? ` · ${c.nombre}` : '';
  }
  // Más de uno: contar categorías únicas
  const catsUnicas = new Set(combos.map((c) => c.categoriaId));
  return ` · ${catsUnicas.size} categorías (${combos.length} combos)`;
}

/**
 * Card del sidebar con la lista de combinaciones categoría+serie+cupo.
 * Reemplaza la card legacy que solo mostraba una categoría.
 */
function CombosCard({
  combos,
  categorias,
}: {
  combos: ComboEfectivo[];
  categorias: CategoriaJugadores[];
}): React.ReactElement {
  if (combos.length === 0) {
    return (
      <Card variant="lime" padding="comfortable">
        <CardLabel tone="mute">Sin categoría</CardLabel>
        <div className="font-display text-lg text-green-deep tracking-display mb-2">
          LIBRE
        </div>
        <p className="text-sm text-green-deep/85">
          Este torneo no tiene categorías asignadas — no se valida edad de
          jugadores. Asignalas desde la pestaña{' '}
          <span className="font-semibold">Configuración</span>.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="lime" padding="comfortable">
      <CardLabel tone="mute">
        {combos.length === 1 ? 'Categoría del torneo' : `Categorías del torneo (${combos.length})`}
      </CardLabel>
      <div className="mt-2 space-y-2">
        {combos.map((combo, idx) => {
          const categoria = categorias.find((c) => c.id === combo.categoriaId);
          const nombreCat = categoria?.nombre ?? 'Categoría desconocida';
          const serie = combo.serieSlug
            ? categoria?.series?.find((s) => s.slug === combo.serieSlug)
            : null;
          return (
            <div
              key={`${combo.categoriaId}-${combo.serieSlug ?? 'null'}-${idx}`}
              className="border-l-2 border-green-bright/40 pl-3 py-1"
            >
              <div className="font-display text-base text-green-deep tracking-display">
                {nombreCat.toUpperCase()}
                {serie && (
                  <span className="ml-2 text-xs uppercase tracking-[0.15em] font-semibold px-2 py-0.5 rounded bg-green-deep/10 text-green-deep">
                    {serie.nombre}
                  </span>
                )}
              </div>
              {categoria && (
                <div className="text-xs text-green-deep/85 mt-0.5">
                  Edad mínima:{' '}
                  <span className="font-semibold">{categoria.edadMinimaGeneral} años</span>
                  {' · '}
                  Cupo:{' '}
                  <span className="font-semibold">{combo.cupoEquipos} equipos</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
