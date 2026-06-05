'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Info,
  MapPin,
  Sparkles,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { FixtureAdvertencia, HorarioTorneo } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import {
  useCanchas,
  useFixturePrevalidacion,
  useGenerarFixture,
  useHorariosTorneo,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const DIAS_SEMANA_CORTO: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

const FixtureFormSchema = z.object({
  fechaInicio: z.iso.date('Fecha requerida'),
  diasEntreFechas: z.coerce.number().int().min(1).max(30),
});
type FixtureForm = z.infer<typeof FixtureFormSchema>;

export function GenerarFixtureForm({ torneoId }: { torneoId: string }): React.ReactElement {
  const mutation = useGenerarFixture(torneoId);
  const { data: horarios, isLoading: loadingHorarios } = useHorariosTorneo(torneoId);
  const { data: canchas, isLoading: loadingCanchas } = useCanchas();

  const horariosActivos = (horarios ?? []).filter((h) => h.activo);
  const canchasDisponibles = (canchas ?? []).filter(
    (c) => c.estado === 'DISPONIBLE',
  );

  const faltanHorarios = !loadingHorarios && horariosActivos.length === 0;
  const faltanCanchas = !loadingCanchas && canchasDisponibles.length === 0;
  const faltaConfig = faltanHorarios || faltanCanchas;

  const form = useForm<FixtureForm>({
    resolver: zodResolver(FixtureFormSchema),
    defaultValues: {
      fechaInicio: new Date().toISOString().slice(0, 10),
      diasEntreFechas: 7,
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
  const tieneErrorPrevalidacion =
    prevalidacion?.advertencias.some((a) => a.nivel === 'ERROR') ?? false;
  const tieneError = tieneErrorPrevalidacion || faltaConfig;

  // Sprint 44 UX — Horarios y canchas YA no se ingresan acá. El backend
  // los toma de:
  //   - tab "Horarios →" del torneo (plantilla por día de semana, Sprint 39)
  //   - módulo /admin/canchas (catálogo con estado DISPONIBLE, Sprint 40)
  // El DTO los acepta opcionales con defaults; los omitimos al generar.
  const onSubmit = async (vals: FixtureForm): Promise<void> => {
    await mutation.mutateAsync({
      fechaInicio: vals.fechaInicio,
      diasEntreFechas: vals.diasEntreFechas,
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HorariosPanel
            horarios={horariosActivos}
            loading={loadingHorarios}
            torneoId={torneoId}
          />
          <CanchasPanel
            canchasDisponibles={canchasDisponibles}
            loading={loadingCanchas}
          />
        </div>

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
          title={
            faltanHorarios
              ? 'Definí al menos un horario en el tab Horarios del torneo.'
              : faltanCanchas
                ? 'Habilitá al menos una cancha en /admin/canchas.'
                : tieneErrorPrevalidacion
                  ? 'Hay errores que bloquean la generación.'
                  : undefined
          }
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

/**
 * Sprint 44 — Panel con horarios cargados desde el tab "Horarios →".
 * Bloquea el botón de generar si no hay ninguno activo.
 */
function HorariosPanel({
  horarios,
  loading,
  torneoId,
}: {
  horarios: HorarioTorneo[];
  loading: boolean;
  torneoId: string;
}): React.ReactElement {
  const horariosPorDia = new Map<number, string[]>();
  for (const h of horarios) {
    if (!horariosPorDia.has(h.diaSemana)) {
      horariosPorDia.set(h.diaSemana, []);
    }
    horariosPorDia.get(h.diaSemana)!.push(h.hora);
  }
  const diasOrdenados = Array.from(horariosPorDia.keys()).sort();

  if (loading) {
    return (
      <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1 flex items-center gap-1.5">
          <CalendarClock size={11} /> Horarios del torneo
        </div>
        <p className="text-xs font-serif italic text-ink-mute">Cargando…</p>
      </div>
    );
  }

  if (horarios.length === 0) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-danger mb-1 flex items-center gap-1.5">
          <XCircle size={11} /> Faltan horarios
        </div>
        <p className="text-xs text-ink leading-snug">
          No definiste horarios para este torneo.{' '}
          <Link
            href={`/admin/torneos/${torneoId}/horarios`}
            className="text-accent font-semibold hover:underline"
          >
            Agregalos en el tab Horarios →
          </Link>{' '}
          antes de generar el fixture.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-2 flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          <CalendarClock size={11} /> Horarios del torneo
        </span>
        <Link
          href={`/admin/torneos/${torneoId}/horarios`}
          className="text-accent hover:underline normal-case tracking-normal text-[10px]"
        >
          Editar →
        </Link>
      </div>
      <div className="space-y-1">
        {diasOrdenados.map((dia) => {
          const horas = horariosPorDia.get(dia)!.sort();
          return (
            <div key={dia} className="flex items-baseline gap-2 text-xs">
              <span className="font-semibold text-green-deep w-9 flex-shrink-0">
                {DIAS_SEMANA_CORTO[dia] ?? `Día ${dia}`}
              </span>
              <span className="text-ink-mute font-mono">{horas.join(' · ')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Sprint 44 — Panel con canchas DISPONIBLES desde /admin/canchas.
 * Bloquea el botón de generar si no hay ninguna.
 */
function CanchasPanel({
  canchasDisponibles,
  loading,
}: {
  canchasDisponibles: Array<{ id: string; nombre: string }>;
  loading: boolean;
}): React.ReactElement {
  if (loading) {
    return (
      <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1 flex items-center gap-1.5">
          <MapPin size={11} /> Canchas disponibles
        </div>
        <p className="text-xs font-serif italic text-ink-mute">Cargando…</p>
      </div>
    );
  }

  if (canchasDisponibles.length === 0) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-danger mb-1 flex items-center gap-1.5">
          <XCircle size={11} /> Faltan canchas
        </div>
        <p className="text-xs text-ink leading-snug">
          No hay canchas en estado DISPONIBLE.{' '}
          <Link
            href="/admin/canchas"
            className="text-accent font-semibold hover:underline"
          >
            Agregalas o reactivalas en /admin/canchas
          </Link>{' '}
          antes de generar el fixture.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-2 flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          <MapPin size={11} /> Canchas disponibles ({canchasDisponibles.length})
        </span>
        <Link
          href="/admin/canchas"
          className="text-accent hover:underline normal-case tracking-normal text-[10px]"
        >
          Editar →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {canchasDisponibles.map((c) => (
          <span
            key={c.id}
            className="text-xs px-2 py-0.5 rounded bg-green-deep/10 text-green-deep font-medium"
          >
            {c.nombre}
          </span>
        ))}
      </div>
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
