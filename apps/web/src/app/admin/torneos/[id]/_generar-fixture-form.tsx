'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { FixtureAdvertencia } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { useFixturePrevalidacion, useGenerarFixture } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const FixtureFormSchema = z.object({
  fechaInicio: z.iso.date('Fecha requerida'),
  diasEntreFechas: z.coerce.number().int().min(1).max(30),
  horariosStr: z
    .string()
    .min(1)
    .refine(
      (s) =>
        s
          .split(',')
          .map((h) => h.trim())
          .every((h) => /^\d{2}:\d{2}$/.test(h)),
      'Cada horario en formato HH:mm separados por coma',
    ),
  canchasStr: z.string().min(1),
});
type FixtureForm = z.infer<typeof FixtureFormSchema>;

export function GenerarFixtureForm({ torneoId }: { torneoId: string }): React.ReactElement {
  const mutation = useGenerarFixture(torneoId);

  const form = useForm<FixtureForm>({
    resolver: zodResolver(FixtureFormSchema),
    defaultValues: {
      fechaInicio: new Date().toISOString().slice(0, 10),
      diasEntreFechas: 7,
      horariosStr: '10:00, 12:00, 14:00, 16:00',
      canchasStr: 'Cancha 1, Cancha 2, Cancha 3, Cancha 4',
    },
  });

  // Sprint 43 — Pre-validar al cargar (con la fecha y días default del
  // form). El backend evalúa horarios, días bloqueados, equipos y
  // canchas, y devuelve advertencias para mostrar arriba del botón.
  const fechaInicioValue = form.watch('fechaInicio');
  const diasValue = form.watch('diasEntreFechas');
  const { data: prevalidacion } = useFixturePrevalidacion(torneoId, {
    fechaInicio: fechaInicioValue || undefined,
    diasEntreFechas: diasValue || undefined,
  });
  const tieneError = prevalidacion?.advertencias.some((a) => a.nivel === 'ERROR') ?? false;

  const onSubmit = async (vals: FixtureForm): Promise<void> => {
    await mutation.mutateAsync({
      fechaInicio: vals.fechaInicio,
      diasEntreFechas: vals.diasEntreFechas,
      horariosPorFecha: vals.horariosStr.split(',').map((h) => h.trim()),
      canchas: vals.canchasStr.split(',').map((c) => c.trim()),
    });
  };

  const error = mutation.error as ApiError | undefined;

  return (
    <div>
      {mutation.isSuccess && mutation.data && (
        <div className="bg-green-lime/30 border border-green-bright rounded-card p-4 mb-4">
          <div className="font-display text-lg text-green-deep tracking-display">
            ✓ FIXTURE GENERADO
          </div>
          <p className="text-sm text-green-deep/85 mt-1">
            {mutation.data.fechasCreadas} fechas y {mutation.data.partidosCreados} partidos
            programados. {mutation.data.equiposLibres.length > 0 &&
              `${mutation.data.equiposLibres.length} fechas tienen un equipo libre (número impar).`}
          </p>
          {mutation.data.modoGeneracion === 'HORARIOS_TORNEO' && (
            <p className="text-xs text-green-deep/70 mt-2 font-serif italic">
              Modo: plantilla del torneo · {mutation.data.slotsUsados} slot(s) usado(s).
            </p>
          )}
          {(mutation.data.partidosSinHorario ?? 0) > 0 && (
            <p className="text-xs text-accent font-semibold mt-2">
              ⚠ {mutation.data.partidosSinHorario} partido(s) quedaron sin horario
              porque no había slots suficientes para esa fecha. Cargá más slots
              o asignalos manualmente desde el fixture.
            </p>
          )}
          {(mutation.data.partidosEnCanchaNoDisponible ?? []).length > 0 && (
            <p className="text-xs text-accent font-semibold mt-2">
              ⚠ {mutation.data.partidosEnCanchaNoDisponible.length} partido(s)
              asignados a canchas marcadas como NO DISPONIBLE. Revisá el fixture
              y re-programá manualmente si la cancha no volverá a tiempo.
            </p>
          )}
        </div>
      )}

      {prevalidacion && <PrevalidacionPanel prevalidacion={prevalidacion} />}

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({ formName: 'generar-fixture' }),
        )}
        className="space-y-4 max-w-2xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Fecha de la primera fecha"
            type="date"
            {...form.register('fechaInicio')}
            error={form.formState.errors.fechaInicio?.message}
          />
          <Input
            label="Días entre fechas"
            type="number"
            min={1}
            max={30}
            {...form.register('diasEntreFechas', { valueAsNumber: true })}
            error={form.formState.errors.diasEntreFechas?.message}
          />
        </div>

        <Input
          label="Horarios (separados por coma)"
          placeholder="10:00, 12:00, 14:00, 16:00"
          {...form.register('horariosStr')}
          error={form.formState.errors.horariosStr?.message}
        />

        <Input
          label="Canchas disponibles (separadas por coma)"
          placeholder="Cancha 1, Cancha 2"
          {...form.register('canchasStr')}
          error={form.formState.errors.canchasStr?.message}
        />

        {error && (
          <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <Button
          type="submit"
          variant="accent"
          loading={mutation.isPending}
          disabled={tieneError}
          title={tieneError ? 'Hay errores que bloquean la generación' : undefined}
        >
          <Sparkles size={14} /> Generar fixture con Berger
        </Button>
      </form>
    </div>
  );
}

/**
 * Sprint 43 — Panel con advertencias antes de generar el fixture.
 * Muestra ERROR (bloquea botón), WARN (permite generar pero advierte)
 * e INFO (informativo).
 */
function PrevalidacionPanel({
  prevalidacion,
}: {
  prevalidacion: {
    ok: boolean;
    equiposCount: number;
    horariosCount: number;
    canchasDisponiblesCount: number;
    modoGeneracion: 'HORARIOS_TORNEO' | 'INPUT_LEGACY';
    advertencias: FixtureAdvertencia[];
  };
}): React.ReactElement {
  const { advertencias, ok, equiposCount, horariosCount, canchasDisponiblesCount, modoGeneracion } =
    prevalidacion;
  const errores = advertencias.filter((a) => a.nivel === 'ERROR');
  const warns = advertencias.filter((a) => a.nivel === 'WARN');
  const infos = advertencias.filter((a) => a.nivel === 'INFO');

  if (advertencias.length === 0) {
    return (
      <div className="mb-4 bg-green-bright/10 border border-green-bright/30 rounded-card px-4 py-3 text-sm flex items-center gap-2">
        <CheckCircle2 size={16} className="text-green-bright flex-shrink-0" />
        <span className="text-ink">
          Todo en orden — {equiposCount} equipos · {horariosCount} slot(s) · {canchasDisponiblesCount} cancha(s) disponible(s) ·{' '}
          modo {modoGeneracion === 'HORARIOS_TORNEO' ? 'plantilla' : 'legacy'}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute">
        → Pre-validación: {equiposCount} equipos · {horariosCount} slot(s) ·{' '}
        {canchasDisponiblesCount} cancha(s) disponible(s) · modo{' '}
        {modoGeneracion === 'HORARIOS_TORNEO' ? 'plantilla' : 'legacy'}
      </div>
      {errores.map((a, i) => (
        <AdvertenciaRow key={`err-${i}`} advertencia={a} />
      ))}
      {warns.map((a, i) => (
        <AdvertenciaRow key={`warn-${i}`} advertencia={a} />
      ))}
      {infos.map((a, i) => (
        <AdvertenciaRow key={`info-${i}`} advertencia={a} />
      ))}
      {!ok && (
        <div className="text-xs font-semibold text-danger px-3 py-2">
          Corregí los errores antes de generar el fixture.
        </div>
      )}
    </div>
  );
}

function AdvertenciaRow({
  advertencia,
}: {
  advertencia: FixtureAdvertencia;
}): React.ReactElement {
  const styles = {
    ERROR: {
      bg: 'bg-danger/10 border-danger/30',
      text: 'text-danger',
      Icon: XCircle,
    },
    WARN: {
      bg: 'bg-accent/10 border-accent/30',
      text: 'text-accent',
      Icon: AlertTriangle,
    },
    INFO: {
      bg: 'bg-paper-dark border-line',
      text: 'text-ink-mute',
      Icon: Info,
    },
  } as const;
  const { bg, text, Icon } = styles[advertencia.nivel];
  return (
    <div className={cn('border rounded px-3 py-2 text-sm flex items-start gap-2', bg)}>
      <Icon size={14} className={cn('flex-shrink-0 mt-0.5', text)} />
      <span className="text-ink leading-snug">{advertencia.mensaje}</span>
    </div>
  );
}
