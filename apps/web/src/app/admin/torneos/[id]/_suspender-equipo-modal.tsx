'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Ban, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  MOTIVO_SUSPENSION_EQUIPO,
  MotivoSuspensionEquipoLabel,
  type MotivoSuspensionEquipo,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { useSuspenderEquipo } from '@/hooks/use-admin';
import { toastError, toastSuccess } from '@/lib/toast';

const Schema = z.object({
  motivo: z.enum(MOTIVO_SUSPENSION_EQUIPO),
  observaciones: z.string().trim().max(500).optional(),
  aplicarMultaWalkover: z.boolean().optional(),
});
type FormValues = z.infer<typeof Schema>;

/**
 * Sprint 44 — Modal para suspender un equipo del torneo. Avisa al
 * operador que se van a generar walkover 3-0 en partidos pendientes.
 */
export function SuspenderEquipoModal({
  torneoId,
  equipoId,
  equipoNombre,
  onClose,
}: {
  torneoId: string;
  equipoId: string;
  equipoNombre: string;
  onClose: () => void;
}): React.ReactElement {
  const mutation = useSuspenderEquipo(torneoId);
  const [resultado, setResultado] = useState<{
    partidosWalkover: number;
    partidosCancelados: number;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      motivo: 'ECONOMICA',
      observaciones: '',
      aplicarMultaWalkover: false,
    },
  });

  const onSubmit = async (vals: FormValues): Promise<void> => {
    try {
      const r = await mutation.mutateAsync({
        equipoId,
        motivo: vals.motivo as MotivoSuspensionEquipo,
        observaciones: vals.observaciones?.trim() || null,
        aplicarMultaWalkover: vals.aplicarMultaWalkover === true,
      });
      setResultado({
        partidosWalkover: r.partidosWalkover,
        partidosCancelados: r.partidosCancelados,
      });
      toastSuccess(`"${equipoNombre}" suspendido del torneo.`);
    } catch (err) {
      toastError(err);
    }
  };

  // Una vez suspendido, mostramos el resumen y cerramos al hacer click.
  if (resultado) {
    return (
      <Overlay onClose={onClose}>
        <Card padding="comfortable" className="max-w-md w-full">
          <CardLabel>→ Equipo suspendido</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mt-1 mb-3">
            {equipoNombre.toUpperCase()}
          </div>
          <div className="space-y-2 text-sm text-ink mb-4">
            <p>
              <strong>{resultado.partidosWalkover}</strong> partido(s)
              registrados como walkover 3-0 a favor del rival.
            </p>
            {resultado.partidosCancelados > 0 && (
              <p className="text-ink-mute">
                {resultado.partidosCancelados} partido(s) quedaron cancelados
                porque el rival también está suspendido.
              </p>
            )}
            {resultado.partidosWalkover === 0 && resultado.partidosCancelados === 0 && (
              <p className="font-serif italic text-ink-mute">
                No había partidos pendientes para procesar.
              </p>
            )}
          </div>
          <Button variant="accent" onClick={onClose}>
            Cerrar
          </Button>
        </Card>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <Card padding="comfortable" className="max-w-md w-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <CardLabel>→ Suspender equipo del torneo</CardLabel>
            <div className="font-display text-xl text-green-deep tracking-display mt-1">
              {equipoNombre.toUpperCase()}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-ink transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-accent/10 border border-accent/30 rounded-card px-3 py-2 mb-4 flex items-start gap-2 text-sm">
          <AlertTriangle size={14} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-ink leading-snug">
            Se declarará <strong>walkover 3-0</strong> automático en todos los
            partidos pendientes del equipo. Los partidos ya jugados se
            preservan. Esta acción es reversible (los walkovers ya disparados
            quedan como historia).
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Motivo
            </label>
            <select
              {...form.register('motivo')}
              className="w-full border border-line rounded-card px-3 py-2 text-sm bg-paper"
            >
              {MOTIVO_SUSPENSION_EQUIPO.map((m) => (
                <option key={m} value={m}>
                  {MotivoSuspensionEquipoLabel[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Observaciones (opcional)
            </label>
            <textarea
              {...form.register('observaciones')}
              rows={3}
              maxLength={500}
              placeholder="Ej.: Adeuda mensualidades de marzo, abril y mayo. Notificado el 15/05."
              className="w-full border border-line rounded-card px-3 py-2 text-sm bg-paper font-serif"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              {...form.register('aplicarMultaWalkover')}
              className="mt-0.5"
            />
            <span className="leading-snug">
              <strong>También cobrar multa por walkover</strong> en cada partido
              pendiente (si el torneo tiene tarifa MULTA_WALKOVER configurada).
              <span className="block text-xs text-ink-mute mt-0.5">
                Deja apagado si el motivo es ECONÓMICA — sumaría multas a la
                deuda original.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" loading={mutation.isPending}>
              <Ban size={14} /> Suspender equipo
            </Button>
          </div>
        </form>
      </Card>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
