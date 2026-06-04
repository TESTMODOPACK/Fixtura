'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { useGenerarFixture } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

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

        <Button type="submit" variant="accent" loading={mutation.isPending}>
          <Sparkles size={14} /> Generar fixture con Berger
        </Button>
      </form>
    </div>
  );
}
