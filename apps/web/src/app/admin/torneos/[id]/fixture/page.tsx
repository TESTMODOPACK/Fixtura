'use client';

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  CloudRain,
  GripVertical,
  Lock,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  ESTRATEGIA_LABEL,
  ESTRATEGIA_SUSPENSION_FECHA,
  MOTIVO_SUSPENSION,
  MOTIVO_SUSPENSION_LABEL,
  type EstrategiaSuspensionFecha,
  type FechaAdmin,
  type MotivoSuspension,
  type PartidoAdmin,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { apiFetch, ApiError } from '@/lib/api';
import { formatFecha } from '@/lib/format';
import {
  useFixtureDetail,
  useReactivarFecha,
  useResetFixture,
  useSuspenderFecha,
  useTorneo,
} from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';

export default function FixtureAdminPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const torneoId = params.id;
  const { data, isLoading } = useFixtureDetail(torneoId);
  const { data: torneo } = useTorneo(torneoId);
  const resetFixture = useResetFixture(torneoId);
  const qc = useQueryClient();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Borrar el fixture completo. Solo se ofrece en DRAFT: una vez que el
  // torneo arrancó (ACTIVO) hay actas/sanciones colgando del fixture y
  // borrarlo a ciegas perdería historia. El backend igual valida.
  const puedeBorrarFixture = torneo?.estado === 'DRAFT' && (data?.fechas.length ?? 0) > 0;

  const handleBorrarFixture = async (): Promise<void> => {
    const ok = window.confirm(
      '¿Borrar todo el calendario de partidos de este torneo?\n\n' +
        'Se eliminan todas las fechas y partidos generados. Los equipos ' +
        'inscritos NO se tocan. Después podés volver a generar el ' +
        'calendario.\n\nEsta acción no se puede deshacer.',
    );
    if (!ok) return;
    try {
      const r = await resetFixture.mutateAsync();
      toastSuccess(
        `Calendario borrado (${r.deleted} fecha${r.deleted === 1 ? '' : 's'}). ` +
          'Podés generarlo de nuevo desde el torneo.',
      );
    } catch (err) {
      toastError(err);
    }
  };

  // PointerSensor con activationConstraint para evitar capturar clicks
  // accidentales — solo arrastra cuando el usuario mueve ≥6px.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const moverPartido = async (partidoId: string, nuevaFechaId: string): Promise<void> => {
    setMoveError(null);
    setMovingId(partidoId);
    try {
      await apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}`, {
        method: 'PATCH',
        body: { fechaId: nuevaFechaId },
      });
      await qc.invalidateQueries({
        queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'],
      });
      await qc.invalidateQueries({ queryKey: ['public'] });
    } catch (err) {
      const apiErr = err as ApiError;
      setMoveError(apiErr.message ?? 'No se pudo mover el partido');
    } finally {
      setMovingId(null);
    }
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const partidoId = String(event.active.id);
    const target = event.over?.id;
    if (!target) return;
    const targetStr = String(target);
    if (!targetStr.startsWith('fecha-')) return;
    const nuevaFechaId = targetStr.replace('fecha-', '');
    // Buscar la fecha actual del partido para evitar PATCH sin cambio
    const fechaActual = data?.fechas.find((f) =>
      f.partidos.some((p) => p.id === partidoId),
    );
    if (!fechaActual || fechaActual.id === nuevaFechaId) return;
    void moverPartido(partidoId, nuevaFechaId);
  };

  return (
    <>
      <PageHead
        eyebrow={data ? `Torneo · ${data.torneoNombre}` : 'Fixture'}
        title="Fixture completo"
        sub="Cargá actas, editá horarios y canchas. Arrastrá un partido a otra fecha para reprogramarlo."
      >
        <div className="flex items-center gap-2">
          {puedeBorrarFixture && (
            <Button
              variant="default"
              size="sm"
              onClick={handleBorrarFixture}
              loading={resetFixture.isPending}
              className="text-danger hover:bg-danger/10"
              title="Borra todas las fechas y partidos. Solo disponible mientras el torneo está en borrador."
            >
              <Trash2 size={14} /> Borrar calendario
            </Button>
          )}
          <Link href={`/admin/torneos/${torneoId}`}>
            <Button variant="default" size="sm">
              <ArrowLeft size={14} /> Volver al torneo
            </Button>
          </Link>
        </div>
      </PageHead>

      {moveError && (
        <div className="mb-4 text-sm text-danger bg-danger/10 px-4 py-2 rounded-card">
          {moveError}
        </div>
      )}

      {isLoading && <div className="font-serif italic text-ink-mute">Cargando fixture...</div>}

      {data && data.fechas.length === 0 && (
        <Card padding="roomy" className="text-center">
          <CalendarRange size={48} className="mx-auto text-line mb-4" />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            FIXTURE VACÍO
          </div>
          <p className="font-serif italic text-ink-mute">
            Volvé al torneo y generá el fixture con Berger.
          </p>
        </Card>
      )}

      {data && data.fechas.length > 0 && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="space-y-5">
            {data.fechas.map((fecha) => (
              <FechaCard
                key={fecha.id}
                torneoId={torneoId}
                fecha={fecha}
                todasLasFechas={data.fechas}
                movingId={movingId}
              />
            ))}
          </div>
        </DndContext>
      )}
    </>
  );
}

function FechaCard({
  torneoId,
  fecha,
  todasLasFechas,
  movingId,
}: {
  torneoId: string;
  fecha: FechaAdmin;
  todasLasFechas: FechaAdmin[];
  movingId: string | null;
}): React.ReactElement {
  const finalizadas = fecha.partidos.filter(
    (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
  ).length;
  const total = fecha.partidos.length;
  const [suspendiendo, setSuspendiendo] = useState(false);
  const suspender = useSuspenderFecha(torneoId);
  const reactivar = useReactivarFecha(torneoId);
  const susErr =
    (suspender.error as ApiError | undefined) ?? (reactivar.error as ApiError | undefined);
  const estaSuspendida = fecha.estado === 'SUSPENDIDA';

  const { setNodeRef, isOver } = useDroppable({ id: `fecha-${fecha.id}` });

  const estadoBadgeText = estaSuspendida
    ? 'Suspendida'
    : fecha.estado === 'FINALIZADA'
      ? 'Finalizada'
      : `${finalizadas}/${total} jugados`;
  const estadoBadgeClass = estaSuspendida
    ? 'bg-danger/10 text-danger'
    : fecha.estado === 'FINALIZADA'
      ? 'bg-green-bright/10 text-green-bright'
      : finalizadas > 0
        ? 'bg-accent/10 text-accent'
        : 'bg-ink-mute/10 text-ink-mute';

  return (
    <div ref={setNodeRef}>
    <Card
      padding="none"
      className={cn(
        'overflow-hidden transition-colors',
        isOver && 'ring-2 ring-accent ring-offset-2 ring-offset-paper',
        estaSuspendida && 'opacity-90',
      )}
    >
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between flex-wrap gap-2">
        <div>
          <CardLabel tone="mute">
            Fecha {fecha.numero}
            {fecha.tipoReprogramacion === 'REPROGRAMADA' && (
              <span className="ml-2 text-[9px] uppercase tracking-[0.18em] font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                Reprogramada
              </span>
            )}
            {fecha.tipoReprogramacion === 'ORIGINAL' && estaSuspendida && (
              <span className="ml-2 text-[9px] uppercase tracking-[0.18em] font-bold px-1.5 py-0.5 rounded bg-ink-mute/20 text-ink-mute">
                Original
              </span>
            )}
          </CardLabel>
          <div className="font-display text-lg text-green-deep tracking-display">
            {(fecha.etiqueta ?? `Fecha ${fecha.numero}`).toUpperCase()}
          </div>
          {fecha.fechaInicio && (
            <div className="text-xs text-ink-mute mt-0.5">
              {new Date(fecha.fechaInicio + 'T12:00:00').toLocaleDateString('es-CL', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {fecha.estado !== 'FINALIZADA' && !estaSuspendida && (
            <button
              type="button"
              onClick={() => setSuspendiendo(true)}
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border border-line text-ink-mute hover:border-danger hover:text-danger transition-colors"
              title="Suspender la fecha completa"
            >
              <CloudRain size={11} className="inline mr-1" /> Suspender
            </button>
          )}
          {estaSuspendida && (
            <button
              type="button"
              onClick={() => reactivar.mutate(fecha.id)}
              disabled={reactivar.isPending}
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border border-line text-ink-mute hover:border-green-bright hover:text-green-bright transition-colors disabled:opacity-50"
              title="Reactivar la fecha"
            >
              <Play size={11} className="inline mr-1" /> Reactivar
            </button>
          )}
          <span
            className={cn(
              'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
              estadoBadgeClass,
            )}
          >
            {estadoBadgeText}
          </span>
        </div>
      </div>

      {estaSuspendida && fecha.motivoSuspension && (
        <div className="px-5 py-2 bg-danger/5 border-b border-danger/20 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-danger">
              {MOTIVO_SUSPENSION_LABEL[fecha.motivoSuspension]}
            </span>
            {fecha.observacionesSuspension && (
              <span className="text-ink-mute italic"> · {fecha.observacionesSuspension}</span>
            )}
          </div>
        </div>
      )}

      {susErr && (
        <div className="px-5 py-2 bg-danger/5 border-b border-danger/20 text-xs text-danger">
          {susErr.message}
        </div>
      )}

      {suspendiendo && (
        <SuspenderFechaForm
          fecha={fecha}
          fechasDisponibles={todasLasFechas}
          onSubmit={async (vals) => {
            try {
              await suspender.mutateAsync({ fechaId: fecha.id, input: vals });
              setSuspendiendo(false);
            } catch {
              // Mantener el form abierto si falla, el error se muestra
              // arriba via susErr — el usuario puede ajustar y reintentar.
            }
          }}
          onCancel={() => setSuspendiendo(false)}
          loading={suspender.isPending}
        />
      )}
      <div className="divide-y divide-line">
        {fecha.partidos.map((p) => (
          <PartidoRow
            key={p.id}
            torneoId={torneoId}
            partido={p}
            moving={movingId === p.id}
          />
        ))}
        {fecha.partidos.length === 0 && (
          <div className="px-5 py-6 text-center text-xs text-ink-mute font-serif italic">
            Soltá un partido acá para moverlo a esta fecha
          </div>
        )}
      </div>
    </Card>
    </div>
  );
}

function PartidoRow({
  torneoId,
  partido,
  moving,
}: {
  torneoId: string;
  partido: PartidoAdmin;
  moving: boolean;
}): React.ReactElement {
  const cerrada = !!partido.actaCerradaAt;
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: partido.id,
    disabled: cerrada, // No mover partidos con acta cerrada
  });

  const fecha = partido.fechaHora ? new Date(partido.fechaHora) : null;
  const dia = fecha?.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const hora = fecha?.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'px-5 py-4 grid grid-cols-[auto_auto_1fr_auto_1fr_auto_auto] gap-4 items-center transition-colors',
        isDragging
          ? 'bg-accent/5 shadow-lg cursor-grabbing'
          : 'hover:bg-paper',
        moving && 'opacity-50 pointer-events-none',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title={cerrada ? 'Acta cerrada · no se puede mover' : 'Arrastrá para mover de fecha'}
        disabled={cerrada}
        className={cn(
          'p-1 rounded text-ink-mute',
          cerrada
            ? 'opacity-30 cursor-not-allowed'
            : 'cursor-grab hover:text-ink hover:bg-line/50 active:cursor-grabbing',
        )}
      >
        <GripVertical size={14} />
      </button>

      <div className="text-xs text-ink-mute font-mono text-right w-28">
        <div>{dia ?? 'Sin fecha'}</div>
        <div className="font-semibold text-ink">{hora ?? '—'}</div>
        {partido.canchaNombre && (
          <div className="text-[10px] text-green-deep/70 truncate" title={partido.canchaNombre}>
            {partido.canchaNombre}
          </div>
        )}
      </div>

      <Link
        href={`/admin/torneos/${torneoId}/partidos/${partido.id}`}
        className="text-right font-semibold truncate hover:underline"
      >
        {partido.equipoLocalNombre}
      </Link>

      <div className="flex items-center gap-2 font-display tracking-display text-xl text-green-deep min-w-[60px] justify-center">
        {partido.estado === 'FINALIZADO' || partido.estado === 'WALKOVER' ? (
          <>
            <span>{partido.golesLocal ?? '-'}</span>
            <span className="text-ink-mute">:</span>
            <span>{partido.golesVisita ?? '-'}</span>
          </>
        ) : (
          <span className="text-ink-mute font-serif italic text-xs">vs</span>
        )}
      </div>

      <Link
        href={`/admin/torneos/${torneoId}/partidos/${partido.id}`}
        className="font-semibold truncate hover:underline"
      >
        {partido.equipoVisitaNombre}
      </Link>

      <div className="flex items-center gap-2 text-xs">
        {cerrada && <Lock size={12} className="text-green-bright" />}
        <span
          className={cn(
            'uppercase tracking-wider font-semibold px-2 py-0.5 rounded text-[10px]',
            partido.estado === 'FINALIZADO' && 'bg-green-bright/10 text-green-bright',
            partido.estado === 'PROGRAMADO' && 'bg-ink-mute/10 text-ink-mute',
            partido.estado === 'EN_CURSO' && 'bg-accent/10 text-accent',
            partido.estado === 'WALKOVER' && 'bg-orange-700/10 text-orange-700',
            (partido.estado === 'SUSPENDIDO_FUERZA_MAYOR' ||
              partido.estado === 'REPROGRAMADO') &&
              'bg-danger/10 text-danger',
          )}
        >
          {partido.estado.replace('_', ' ')}
        </span>
      </div>

      <Link
        href={`/admin/torneos/${torneoId}/partidos/${partido.id}`}
        className="text-line hover:text-ink-mute"
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}

// ─── Sprint 19: Modal suspender fecha v2 ──────────────────────────
function SuspenderFechaForm({
  fecha,
  fechasDisponibles,
  onSubmit,
  onCancel,
  loading,
}: {
  fecha: FechaAdmin;
  fechasDisponibles: FechaAdmin[];
  onSubmit: (vals: {
    motivo: MotivoSuspension;
    observaciones: string | null;
    estrategia: EstrategiaSuspensionFecha;
    diasCorrimiento?: number;
    fechaDestinoId?: string;
    fechaInicioReprogramada?: string;
  }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}): React.ReactElement {
  const [motivo, setMotivo] = useState<MotivoSuspension>('LLUVIA');
  const [observaciones, setObservaciones] = useState('');
  const [diasCorrimiento, setDiasCorrimiento] = useState(7);
  const [fechaInicioReprogramada, setFechaInicioReprogramada] = useState('');
  const [fechaDestinoId, setFechaDestinoId] = useState('');

  // Candidatas para REUSAR_EXISTENTE: distintas de la actual, no
  // SUSPENDIDA/FINALIZADA, mismo torneo. Para el v1 mostramos todas las
  // PROGRAMADAS / EN_CURSO. El service valida el resto.
  const candidatasReusar = fechasDisponibles.filter(
    (f) =>
      f.id !== fecha.id &&
      (f.estado === 'PROGRAMADA' || f.estado === 'EN_CURSO'),
  );

  // ─── Cálculo de estrategias inválidas (espejo de las validaciones
  // del backend, ver FechasAdminService.suspenderFecha). Si no podemos
  // crear una REPROGRAMADA encima, deshabilitamos AL_FINAL y
  // TRASNOCHE_DOMINO desde el front para que el admin no llegue a
  // confirmar y luego reciba un 409.
  const yaEsReprogramada = fecha.tipoReprogramacion === 'REPROGRAMADA';
  const existeReproParalela = fechasDisponibles.some(
    (f) =>
      f.id !== fecha.id &&
      f.numero === fecha.numero &&
      f.tipoReprogramacion === 'REPROGRAMADA',
  );
  const bloquearCrearRepro = yaEsReprogramada || existeReproParalela;

  const razonBloqueo = yaEsReprogramada
    ? 'Esta fecha ya es una reprogramación previa. No se puede crear otra reprogramación encima.'
    : existeReproParalela
      ? `Ya existe una Fecha ${fecha.numero} reprogramada en este torneo. Eliminala primero o usá "Reusar una fecha existente".`
      : null;

  const estrategiaInvalida = (e: EstrategiaSuspensionFecha): string | null => {
    if (e === 'AL_FINAL' || e === 'TRASNOCHE_DOMINO') {
      return razonBloqueo;
    }
    if (e === 'REUSAR_EXISTENTE' && candidatasReusar.length === 0) {
      return 'No hay fechas existentes disponibles para reusar en este torneo.';
    }
    return null; // válida
  };

  // Default: primera estrategia válida (para que el form arranque "limpio"
  // y no en una opción que va a fallar al confirmar).
  const primeraValida =
    ESTRATEGIA_SUSPENSION_FECHA.find((e) => !estrategiaInvalida(e)) ?? 'MANUAL';
  const [estrategia, setEstrategia] = useState<EstrategiaSuspensionFecha>(primeraValida);

  const descripciones: Record<EstrategiaSuspensionFecha, string> = {
    AL_FINAL:
      'Crea una nueva fecha "REPROGRAMADA" después de la última del calendario. La fecha original queda como SUSPENDIDA pero mantiene su número (ej. Fecha 3 SUSPENDIDA + Fecha 3 REPROGRAMADA).',
    TRASNOCHE_DOMINO:
      'Intercala una nueva fecha REPROGRAMADA inmediatamente después y corre las siguientes N días para hacer espacio. Las afectadas quedan marcadas como REPROGRAMADAS.',
    REUSAR_EXISTENTE:
      'No crea fecha nueva. Mueve los partidos no jugados a una fecha existente que vos elijas. Esa fecha pasa a quedar marcada REPROGRAMADA.',
    MANUAL:
      'Solo marca la fecha como SUSPENDIDA. Vos reprogramás cada partido a mano desde el detalle. No crea fecha nueva.',
  };

  return (
    <div className="p-5 bg-paper border-b border-line">
      <div className="flex items-center gap-2 mb-3">
        <CloudRain size={16} className="text-danger" />
        <CardLabel className="text-danger">Suspender Fecha {fecha.numero}</CardLabel>
      </div>

      {razonBloqueo && (
        <div className="mb-3 p-3 rounded-card border border-orange-700/40 bg-orange-700/5 text-xs text-orange-700 flex items-start gap-2">
          <span className="font-semibold">Aviso:</span>
          <span>{razonBloqueo} Las estrategias que crean fecha nueva quedan deshabilitadas.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Motivo</label>
          <select
            className="input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoSuspension)}
            disabled={loading}
          >
            {MOTIVO_SUSPENSION.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_SUSPENSION_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Observaciones (opcional)</label>
          <input
            type="text"
            className="input"
            placeholder="Detalle visible para árbitros y delegados"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            disabled={loading}
            maxLength={1000}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="label">Estrategia de reprogramación</label>
        <div className="space-y-2 mt-2">
          {ESTRATEGIA_SUSPENSION_FECHA.map((e) => {
            const razon = estrategiaInvalida(e);
            const disabled = loading || !!razon;
            return (
            <label
              key={e}
              className={cn(
                'block p-3 rounded-card border transition-colors',
                disabled
                  ? 'cursor-not-allowed opacity-60 bg-paper-dark/40 border-line'
                  : 'cursor-pointer',
                !disabled && estrategia === e
                  ? 'border-accent bg-accent/5'
                  : !disabled && 'border-line hover:border-ink-mute',
              )}
            >
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="estrategia"
                  value={e}
                  checked={estrategia === e}
                  onChange={() => !razon && setEstrategia(e)}
                  disabled={disabled}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink flex items-center gap-2 flex-wrap">
                    {ESTRATEGIA_LABEL[e]}
                    {razon && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
                        No disponible
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-mute mt-1">
                    {razon ?? descripciones[e]}
                  </div>

                  {e === 'AL_FINAL' && estrategia === 'AL_FINAL' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs">Fecha de inicio (opcional):</span>
                      <input
                        type="date"
                        className="input h-8 text-xs"
                        value={fechaInicioReprogramada}
                        onChange={(ev) => setFechaInicioReprogramada(ev.target.value)}
                        disabled={loading}
                      />
                    </div>
                  )}

                  {e === 'TRASNOCHE_DOMINO' && estrategia === 'TRASNOCHE_DOMINO' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs">Corrimiento:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        className="input w-20 h-8 text-xs"
                        value={diasCorrimiento}
                        onChange={(ev) =>
                          setDiasCorrimiento(parseInt(ev.target.value, 10) || 7)
                        }
                        disabled={loading}
                      />
                      <span className="text-xs text-ink-mute">días</span>
                      <span className="text-xs ml-2">Inicio nueva fecha (opcional):</span>
                      <input
                        type="date"
                        className="input h-8 text-xs"
                        value={fechaInicioReprogramada}
                        onChange={(ev) => setFechaInicioReprogramada(ev.target.value)}
                        disabled={loading}
                      />
                    </div>
                  )}

                  {e === 'REUSAR_EXISTENTE' && estrategia === 'REUSAR_EXISTENTE' && (
                    <div className="mt-2">
                      <label className="text-xs block mb-1">
                        Fecha destino:
                      </label>
                      <select
                        className="input h-8 text-xs w-full"
                        value={fechaDestinoId}
                        onChange={(ev) => setFechaDestinoId(ev.target.value)}
                        disabled={loading || candidatasReusar.length === 0}
                      >
                        <option value="">Elegí una fecha…</option>
                        {candidatasReusar.map((f) => (
                          <option key={f.id} value={f.id}>
                            Fecha {f.numero}
                            {f.fechaInicio ? ` · ${formatFecha(f.fechaInicio)}` : ''}
                            {f.etiqueta ? ` (${f.etiqueta})` : ''}
                          </option>
                        ))}
                      </select>
                      {candidatasReusar.length === 0 && (
                        <p className="text-xs text-ink-mute italic mt-1">
                          No hay fechas existentes disponibles para reusar.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </label>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={() => {
            // Defensa en profundidad: el radio inválido no debería estar
            // seleccionable, pero por las dudas validamos antes del submit.
            const razon = estrategiaInvalida(estrategia);
            if (razon) {
              alert(razon);
              return;
            }
            if (estrategia === 'REUSAR_EXISTENTE' && !fechaDestinoId) {
              alert('Tenés que elegir una fecha destino.');
              return;
            }
            const msg =
              estrategia === 'AL_FINAL'
                ? `Vas a crear una NUEVA fecha ${fecha.numero} REPROGRAMADA al final del calendario. ¿Confirmás?`
                : estrategia === 'TRASNOCHE_DOMINO'
                  ? `Vas a crear una NUEVA fecha ${fecha.numero} REPROGRAMADA intercalada y correr ${diasCorrimiento} días las siguientes. ¿Confirmás?`
                  : estrategia === 'REUSAR_EXISTENTE'
                    ? `Vas a mover los partidos a la fecha destino seleccionada. La fecha actual queda SUSPENDIDA. ¿Confirmás?`
                    : 'Vas a marcar esta fecha como SUSPENDIDA sin crear nueva. Vos reprogramás partido por partido. ¿Confirmás?';
            if (!window.confirm(msg)) return;
            onSubmit({
              motivo,
              observaciones: observaciones.trim() || null,
              estrategia,
              ...(estrategia === 'TRASNOCHE_DOMINO' && { diasCorrimiento }),
              ...(estrategia === 'REUSAR_EXISTENTE' && { fechaDestinoId }),
              ...((estrategia === 'AL_FINAL' || estrategia === 'TRASNOCHE_DOMINO') &&
                fechaInicioReprogramada && {
                  fechaInicioReprogramada,
                }),
            });
          }}
          loading={loading}
        >
          <CloudRain size={14} /> Confirmar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          <X size={14} /> Cancelar
        </Button>
      </div>
    </div>
  );
}
