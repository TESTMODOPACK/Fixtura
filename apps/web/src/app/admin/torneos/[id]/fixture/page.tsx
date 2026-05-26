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
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  GripVertical,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { FechaAdmin, PartidoAdmin } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { apiFetch, ApiError } from '@/lib/api';
import { useFixtureDetail } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { useQueryClient } from '@tanstack/react-query';

export default function FixtureAdminPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const torneoId = params.id;
  const { data, isLoading } = useFixtureDetail(torneoId);
  const qc = useQueryClient();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

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
        <Link href={`/admin/torneos/${torneoId}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al torneo
          </Button>
        </Link>
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
  movingId,
}: {
  torneoId: string;
  fecha: FechaAdmin;
  movingId: string | null;
}): React.ReactElement {
  const finalizadas = fecha.partidos.filter(
    (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
  ).length;
  const total = fecha.partidos.length;

  const { setNodeRef, isOver } = useDroppable({ id: `fecha-${fecha.id}` });

  return (
    <div ref={setNodeRef}>
    <Card
      padding="none"
      className={cn(
        'overflow-hidden transition-colors',
        isOver && 'ring-2 ring-accent ring-offset-2 ring-offset-paper',
      )}
    >
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between">
        <div>
          <CardLabel tone="mute">Fecha {fecha.numero}</CardLabel>
          <div className="font-display text-lg text-green-deep tracking-display">
            {(fecha.etiqueta ?? `Fecha ${fecha.numero}`).toUpperCase()}
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
            fecha.estado === 'FINALIZADA'
              ? 'bg-green-bright/10 text-green-bright'
              : finalizadas > 0
                ? 'bg-accent/10 text-accent'
                : 'bg-ink-mute/10 text-ink-mute',
          )}
        >
          {fecha.estado === 'FINALIZADA' ? 'Finalizada' : `${finalizadas}/${total} jugados`}
        </span>
      </div>
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

      <div className="text-xs text-ink-mute font-mono text-right w-24">
        <div>{dia ?? 'Sin fecha'}</div>
        <div className="font-semibold text-ink">{hora ?? '—'}</div>
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
