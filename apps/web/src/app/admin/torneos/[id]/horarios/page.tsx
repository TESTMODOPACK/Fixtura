'use client';

import { Calendar, Info, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DIAS_SEMANA, type HorarioTorneo } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useCanchas } from '@/hooks/use-admin';
import {
  useActualizarHorarioTorneo,
  useCrearHorarioTorneo,
  useEliminarHorarioTorneo,
  useHorariosTorneo,
} from '@/hooks/use-admin';
import { useTorneo } from '@/hooks/use-admin';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 39 — Mantenedor de la plantilla de horarios del torneo.
 * Cada slot es (día de semana, hora, cancha). Al generar el fixture,
 * los partidos se asignan a slots cuyo día coincida con la fecha.
 */
export default function HorariosTorneoPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const { data: torneo } = useTorneo(id);
  const { data: horarios, isLoading } = useHorariosTorneo(id);
  const { data: canchas } = useCanchas(true);

  return (
    <>
      <PageHead
        eyebrow={torneo?.nombre ?? 'Torneo'}
        title="Horarios del torneo"
        sub="Plantilla de horarios por día de semana. Cuando generes el fixture, los partidos se asignan automáticamente a estos slots."
      />

      <div className="mb-4">
        <Link
          href={`/admin/torneos/${id}`}
          className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute hover:text-green-deep"
        >
          ← Volver al torneo
        </Link>
      </div>

      <Card padding="roomy" className="mb-5 bg-paper-dark border-l-4 border-accent">
        <div className="flex gap-3">
          <Info size={18} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-mute leading-relaxed">
            <strong className="text-ink">¿Cómo funciona?</strong> Cargá un slot por cada
            combinación de día + hora + cancha que se va a usar. Ejemplo: si tenés{' '}
            <em>4 partidos por fecha los domingos</em>, cargá 4 slots (Domingo 09:00 Cancha 1,
            Domingo 11:00 Cancha 1, Domingo 13:00 Cancha 1, Domingo 15:00 Cancha 1).
            <br />
            El generador del fixture toma los partidos de cada fecha y los pone en orden
            sobre los slots disponibles. Si hay más partidos que slots, los excedentes quedan
            sin horario y los asignás manualmente.
          </div>
        </div>
      </Card>

      <FormularioAgregar
        torneoId={id}
        canchas={(canchas ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      <div className="mt-6">
        {isLoading && (
          <div className="font-serif italic text-ink-mute">Cargando horarios…</div>
        )}

        {horarios && horarios.length === 0 && (
          <Card padding="roomy" className="text-center">
            <Calendar size={32} className="mx-auto text-ink-mute mb-2" />
            <div className="font-display tracking-display text-2xl text-green-deep">
              SIN HORARIOS CARGADOS
            </div>
            <div className="text-sm text-ink-mute mt-1 font-serif italic">
              Mientras no cargues slots, el fixture usa el modo legacy
              (horarios y canchas del formulario de generación).
            </div>
          </Card>
        )}

        {horarios && horarios.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between">
              <CardLabel>Slots cargados</CardLabel>
              <div className="text-xs text-ink-mute">{horarios.length} slot(s)</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-paper border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">
                    Día
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">
                    Hora
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">
                    Cancha
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-24">
                    Estado
                  </th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {horarios.map((h) => (
                  <FilaHorario key={h.id} torneoId={id} horario={h} />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

function FormularioAgregar({
  torneoId,
  canchas,
}: {
  torneoId: string;
  canchas: Array<{ id: string; nombre: string }>;
}): React.ReactElement {
  const crearMutation = useCrearHorarioTorneo(torneoId);

  const [diaSemana, setDiaSemana] = useState<number>(7); // Domingo
  const [hora, setHora] = useState<string>('10:00');
  const [canchaId, setCanchaId] = useState<string>('');

  const handleAgregar = (): void => {
    crearMutation.mutate(
      {
        diaSemana,
        hora,
        canchaId: canchaId || null,
        orden: 0,
        activo: true,
      },
      {
        onSuccess: () => {
          toastSuccess('Slot agregado.');
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Card padding="comfortable" className="mb-5">
      <CardLabel>Agregar slot</CardLabel>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        <label className="block">
          <span className="text-xs font-semibold text-ink-mute mb-1 block">Día de semana</span>
          <select
            value={diaSemana}
            onChange={(e) => setDiaSemana(Number(e.target.value))}
            className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
          >
            {DIAS_SEMANA.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-mute mb-1 block">Hora</span>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-mute mb-1 block">Cancha</span>
          <select
            value={canchaId}
            onChange={(e) => setCanchaId(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
          >
            <option value="">— Sin cancha asignada —</option>
            {canchas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={handleAgregar} disabled={crearMutation.isPending}>
          <Plus size={14} className="mr-2" />
          Agregar
        </Button>
      </div>
    </Card>
  );
}

function FilaHorario({
  torneoId,
  horario,
}: {
  torneoId: string;
  horario: HorarioTorneo;
}): React.ReactElement {
  const eliminarMutation = useEliminarHorarioTorneo(torneoId);
  const actualizarMutation = useActualizarHorarioTorneo(torneoId);

  const dia = DIAS_SEMANA.find((d) => d.value === horario.diaSemana)?.label ?? '?';

  const handleToggleActivo = (): void => {
    actualizarMutation.mutate(
      { id: horario.id, body: { activo: !horario.activo } },
      {
        onSuccess: () =>
          toastSuccess(horario.activo ? 'Slot desactivado.' : 'Slot activado.'),
        onError: (err) => toastError(err),
      },
    );
  };

  const handleEliminar = (): void => {
    if (!confirm(`¿Eliminar el slot ${dia} ${horario.hora}?`)) return;
    eliminarMutation.mutate(horario.id, {
      onSuccess: () => toastSuccess('Slot eliminado.'),
      onError: (err) => toastError(err),
    });
  };

  return (
    <tr className={horario.activo ? '' : 'opacity-50'}>
      <td className="px-4 py-3 font-semibold">{dia}</td>
      <td className="px-4 py-3 font-mono">{horario.hora}</td>
      <td className="px-4 py-3 text-ink-mute">
        {horario.canchaNombre ?? <em>Sin asignar</em>}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleToggleActivo}
          className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded ${
            horario.activo
              ? 'bg-green-bright/10 text-green-bright'
              : 'bg-ink-mute/10 text-ink-mute'
          }`}
        >
          {horario.activo ? 'Activo' : 'Inactivo'}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleEliminar}
          className="text-danger hover:bg-danger/10 p-1 rounded"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
