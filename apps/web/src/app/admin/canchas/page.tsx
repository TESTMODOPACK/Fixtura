'use client';

import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import {
  ESTADO_CANCHA_LABEL,
  type CanchaAdmin,
  type EstadoCancha,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useCambiarEstadoCancha,
  useCanchas,
  useCreateCancha,
  useDeactivateCancha,
  useUpdateCancha,
} from '@/hooks/use-admin';
import { toastError, toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/cn';

/**
 * Sprint 40 — Canchas simplificadas. El operador solo carga el nombre de
 * las canchas del complejo; opcional observaciones. Cada cancha tiene un
 * estado DISPONIBLE/NO_DISPONIBLE para deshabilitarla temporalmente sin
 * borrarla (mantenimiento, daño, lluvia, etc).
 *
 * Las canchas DISPONIBLES se usan en la plantilla de horarios del torneo
 * (Sprint 39) y en el generador del fixture.
 */
export default function CanchasPage(): React.ReactElement {
  const { data, isLoading } = useCanchas();
  const [editar, setEditar] = useState<CanchaAdmin | null>(null);
  const [cambiarEstadoTarget, setCambiarEstadoTarget] = useState<CanchaAdmin | null>(null);

  const disponibles = (data ?? []).filter((c) => c.estado === 'DISPONIBLE').length;
  const noDisponibles = (data ?? []).filter((c) => c.estado === 'NO_DISPONIBLE').length;

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Canchas"
        sub="Catálogo de canchas del complejo. Se usan al armar la plantilla de horarios del torneo y al generar el fixture."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <StatChip label="Total" value={(data ?? []).length} tone="default" />
        <StatChip label="Disponibles" value={disponibles} tone="ok" />
        <StatChip label="No disponibles" value={noDisponibles} tone="warn" />
      </div>

      <FormularioAgregar />

      <div className="mt-5">
        {isLoading && (
          <div className="font-serif italic text-ink-mute">Cargando canchas…</div>
        )}

        {data && data.length === 0 && (
          <Card padding="roomy" className="text-center">
            <div className="font-display tracking-display text-2xl text-green-deep">
              SIN CANCHAS CARGADAS
            </div>
            <div className="text-sm text-ink-mute mt-1 font-serif italic">
              Carga tu primera cancha arriba.
            </div>
          </Card>
        )}

        {data && data.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3 bg-paper-dark border-b border-line">
              <CardLabel>Canchas del complejo</CardLabel>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-paper border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">
                    Nombre
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-44">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">
                    Observaciones
                  </th>
                  <th className="px-4 py-3 w-32 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((c) => (
                  <FilaCancha
                    key={c.id}
                    cancha={c}
                    onEditar={() => setEditar(c)}
                    onCambiarEstado={() => setCambiarEstadoTarget(c)}
                  />
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>

      {editar && (
        <ModalEditar cancha={editar} onClose={() => setEditar(null)} />
      )}

      {cambiarEstadoTarget && (
        <ModalCambiarEstado
          cancha={cambiarEstadoTarget}
          onClose={() => setCambiarEstadoTarget(null)}
        />
      )}
    </>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'ok' | 'warn';
}): React.ReactElement {
  return (
    <Card padding="comfortable" variant={tone === 'ok' ? 'lime' : undefined}>
      <CardLabel tone="mute">{label}</CardLabel>
      <div
        className={cn(
          'font-display text-3xl tracking-display mt-1',
          tone === 'ok' && 'text-green-bright',
          tone === 'warn' && 'text-accent',
          tone === 'default' && 'text-green-deep',
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function FormularioAgregar(): React.ReactElement {
  const crear = useCreateCancha();
  const [nombre, setNombre] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const handleCrear = (): void => {
    if (!nombre.trim()) return;
    crear.mutate(
      { nombre: nombre.trim(), observaciones: observaciones.trim() || null },
      {
        onSuccess: () => {
          toastSuccess('Cancha creada.');
          setNombre('');
          setObservaciones('');
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Card padding="comfortable">
      <CardLabel>Agregar cancha</CardLabel>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
        <label className="block">
          <span className="text-xs font-semibold text-ink-mute mb-1 block">
            Nombre <span className="text-danger">*</span>
          </span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Cancha 1"
            className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCrear();
            }}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-mute mb-1 block">
            Observaciones <span className="text-ink-mute font-normal">(opcional)</span>
          </span>
          <input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej: cancha 1 sin riego automático"
            className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCrear();
            }}
          />
        </label>
        <Button onClick={handleCrear} disabled={crear.isPending || !nombre.trim()}>
          <Plus size={14} className="mr-2" />
          Crear
        </Button>
      </div>
    </Card>
  );
}

function FilaCancha({
  cancha,
  onEditar,
  onCambiarEstado,
}: {
  cancha: CanchaAdmin;
  onEditar: () => void;
  onCambiarEstado: () => void;
}): React.ReactElement {
  const eliminar = useDeactivateCancha();

  const handleEliminar = (): void => {
    if (!confirm(`¿Eliminar la cancha "${cancha.nombre}"?`)) return;
    eliminar.mutate(cancha.id, {
      onSuccess: () => toastSuccess('Cancha eliminada.'),
      onError: (err) => toastError(err),
    });
  };

  const esNoDispo = cancha.estado === 'NO_DISPONIBLE';

  return (
    <tr className={esNoDispo ? 'bg-accent/5' : ''}>
      <td className="px-4 py-3 font-semibold text-ink">{cancha.nombre}</td>
      <td className="px-4 py-3">
        <button
          onClick={onCambiarEstado}
          className={cn(
            'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded inline-flex items-center gap-1',
            esNoDispo
              ? 'bg-accent/15 text-accent hover:bg-accent/25'
              : 'bg-green-bright/15 text-green-bright hover:bg-green-bright/25',
          )}
          title="Cambiar estado"
        >
          {esNoDispo ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
          {ESTADO_CANCHA_LABEL[cancha.estado]}
        </button>
        {esNoDispo && cancha.motivoNoDisponible && (
          <div className="text-xs text-ink-mute italic mt-1 max-w-xs truncate">
            {cancha.motivoNoDisponible}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-ink-mute text-xs">
        {cancha.observaciones ?? <em className="text-ink-mute/60">—</em>}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={onEditar}
          className="text-ink-mute hover:text-green-deep p-1 rounded mr-1"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
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

function ModalEditar({
  cancha,
  onClose,
}: {
  cancha: CanchaAdmin;
  onClose: () => void;
}): React.ReactElement {
  const actualizar = useUpdateCancha(cancha.id);
  const [nombre, setNombre] = useState(cancha.nombre);
  const [observaciones, setObservaciones] = useState(cancha.observaciones ?? '');

  const handleGuardar = (): void => {
    actualizar.mutate(
      { nombre: nombre.trim(), observaciones: observaciones.trim() || null },
      {
        onSuccess: () => {
          toastSuccess('Cancha actualizada.');
          onClose();
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-card max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <CardLabel>Editar cancha</CardLabel>
            <div className="font-display text-2xl tracking-display text-green-deep mt-1">
              {cancha.nombre}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-mute hover:text-ink">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-ink-mute mb-1 block">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-mute mb-1 block">
              Observaciones
            </span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={actualizar.isPending || !nombre.trim()}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalCambiarEstado({
  cancha,
  onClose,
}: {
  cancha: CanchaAdmin;
  onClose: () => void;
}): React.ReactElement {
  const cambiar = useCambiarEstadoCancha();
  const [estado, setEstado] = useState<EstadoCancha>(
    cancha.estado === 'DISPONIBLE' ? 'NO_DISPONIBLE' : 'DISPONIBLE',
  );
  const [motivo, setMotivo] = useState(cancha.motivoNoDisponible ?? '');

  const handleAplicar = (): void => {
    cambiar.mutate(
      { id: cancha.id, estado, motivo: motivo.trim() || null },
      {
        onSuccess: () => {
          toastSuccess(
            estado === 'DISPONIBLE'
              ? 'Cancha marcada como disponible.'
              : 'Cancha marcada como no disponible.',
          );
          onClose();
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-card max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <CardLabel>Estado de la cancha</CardLabel>
            <div className="font-display text-2xl tracking-display text-green-deep mt-1">
              {cancha.nombre}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-mute hover:text-ink">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setEstado('DISPONIBLE')}
              className={cn(
                'flex-1 px-3 py-2 text-xs uppercase tracking-[0.18em] font-semibold rounded border-2 transition-colors',
                estado === 'DISPONIBLE'
                  ? 'border-green-bright bg-green-bright/10 text-green-bright'
                  : 'border-line text-ink-mute hover:border-green-bright/50',
              )}
            >
              Disponible
            </button>
            <button
              onClick={() => setEstado('NO_DISPONIBLE')}
              className={cn(
                'flex-1 px-3 py-2 text-xs uppercase tracking-[0.18em] font-semibold rounded border-2 transition-colors',
                estado === 'NO_DISPONIBLE'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-ink-mute hover:border-accent/50',
              )}
            >
              No disponible
            </button>
          </div>

          {estado === 'NO_DISPONIBLE' && (
            <label className="block">
              <span className="text-xs font-semibold text-ink-mute mb-1 block">
                Motivo <span className="text-ink-mute font-normal">(opcional)</span>
              </span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej: mantenimiento del pasto, problema de iluminación, etc."
                className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
              />
              <p className="text-xs text-ink-mute mt-1 font-serif italic">
                El generador del fixture asigna partidos a la cancha aún si está
                no disponible, pero deja un aviso para que decidas re-programar.
              </p>
            </label>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleAplicar} disabled={cambiar.isPending}>
            Aplicar
          </Button>
        </div>
      </div>
    </div>
  );
}
