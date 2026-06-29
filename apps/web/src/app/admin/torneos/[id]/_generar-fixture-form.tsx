'use client';

import { zodResolver } from '@/lib/zod-resolver';
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
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { FixtureAdvertencia, HorarioTorneo } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import {
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

const LABEL_MAP: Record<string, string> = {
  fechaInicio: 'Fecha de la primera fecha',
  diasEntreFechas: 'Días entre fechas',
};

export function GenerarFixtureForm({ torneoId }: { torneoId: string }): React.ReactElement {
  const mutation = useGenerarFixture(torneoId);
  const { data: horarios, isLoading: loadingHorarios } = useHorariosTorneo(torneoId);
  const bannerRef = useRef<HTMLDivElement>(null);

  const horariosActivos = (horarios ?? []).filter((h) => h.activo);

  // Sprint 44 — Las canchas que se usarán en el torneo son las que el
  // operador asignó a cada horario (cancha + hora + día). NO se muestra
  // el catálogo completo, porque la liga puede tener 6 canchas pero usar
  // solo 2 en este torneo. Se deduplica por canchaId.
  const canchasDelTorneoMap = new Map<string, { id: string; nombre: string }>();
  let horariosSinCancha = 0;
  for (const h of horariosActivos) {
    if (h.canchaId && h.canchaNombre) {
      canchasDelTorneoMap.set(h.canchaId, {
        id: h.canchaId,
        nombre: h.canchaNombre,
      });
    } else {
      horariosSinCancha++;
    }
  }
  const canchasDelTorneo = Array.from(canchasDelTorneoMap.values()).sort(
    (a, b) => a.nombre.localeCompare(b.nombre),
  );

  const faltanHorarios = !loadingHorarios && horariosActivos.length === 0;
  const faltanCanchas =
    !loadingHorarios && !faltanHorarios && canchasDelTorneo.length === 0;
  const faltaConfig = faltanHorarios || faltanCanchas;

  const form = useForm<FixtureForm>({
    resolver: zodResolver(FixtureFormSchema),
    defaultValues: {
      // TZ fix — en-CA da 'YYYY-MM-DD' local (toISOString daría día UTC).
      fechaInicio: new Date().toLocaleDateString('en-CA'),
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

  // Sprint 44 UX — Horarios y canchas YA no se ingresan aquí. El backend
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

  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    LABEL_MAP,
  );

  return (
    <div>
      {mutation.isSuccess && mutation.data && (
        <div className="bg-green-lime/30 border border-green-bright rounded-card p-4 mb-4">
          <div className="font-display text-lg text-green-deep tracking-display">
            ✓ CALENDARIO GENERADO
          </div>
          <p className="text-sm text-green-deep/85 mt-1">
            Se crearon {mutation.data.fechasCreadas} fechas y{' '}
            {mutation.data.partidosCreados} partidos.
            {mutation.data.equiposLibres.length > 0 &&
              ` En ${mutation.data.equiposLibres.length} fecha(s) un equipo descansa (cantidad impar de equipos).`}
          </p>
          {mutation.data.modoGeneracion === 'HORARIOS_TORNEO' && (
            <p className="text-xs text-green-deep/70 mt-2 font-serif italic">
              Día, hora y cancha se asignaron automáticamente desde los
              horarios del torneo.
            </p>
          )}
          {(mutation.data.partidosSinHorario ?? 0) > 0 && (
            <p className="text-xs text-accent font-semibold mt-2">
              ⚠ {mutation.data.partidosSinHorario} partido(s) quedaron sin
              día ni cancha porque no alcanzaron los horarios para esa fecha.
              Carga más horarios en el tab Horarios o asígnalos a mano abriendo
              cada partido.
            </p>
          )}
          {(mutation.data.partidosEnCanchaNoDisponible ?? []).length > 0 && (
            <p className="text-xs text-accent font-semibold mt-2">
              ⚠ {mutation.data.partidosEnCanchaNoDisponible.length} partido(s)
              quedaron en canchas marcadas como no disponibles. Si la cancha
              no se va a habilitar a tiempo, abre el partido y elige otra
              cancha o reprograma la fecha.
            </p>
          )}
          {mutation.data.fechaInicioAjustada && (
            <p className="text-xs text-accent font-semibold mt-2">
              ⚠ La fecha de inicio que elegiste (
              {mutation.data.fechaInicioAjustada.fechaInicioOriginal}) caía
              en un día sin horarios cargados. La primera fecha del torneo
              quedó programada para el{' '}
              {mutation.data.fechaInicioAjustada.fechaInicioReal}.
            </p>
          )}
        </div>
      )}

      {prevalidacion && <PrevalidacionPanel prevalidacion={prevalidacion} />}

      <FormErrorBanner
        ref={bannerRef}
        fieldErrors={fieldErrors}
        apiError={error}
        validationTitle="Revisa estos datos antes de generar el calendario:"
        apiTitle="No se pudo generar el calendario"
      />

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({
            formName: 'generar-fixture',
            labelMap: LABEL_MAP,
            bannerRef,
          }),
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
            canchasDelTorneo={canchasDelTorneo}
            horariosSinCancha={horariosSinCancha}
            torneoId={torneoId}
            faltanHorarios={faltanHorarios}
            loading={loadingHorarios}
          />
        </div>

        <Button
          type="submit"
          variant="accent"
          loading={mutation.isPending}
          disabled={tieneError}
          title={
            faltanHorarios
              ? 'Carga al menos un horario en el tab Horarios.'
              : faltanCanchas
                ? 'Asigna una cancha a cada horario antes de generar.'
                : tieneErrorPrevalidacion
                  ? 'Resuelve los problemas marcados arriba antes de generar.'
                  : undefined
          }
        >
          <Sparkles size={14} /> Generar calendario de partidos
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
          Todo listo para generar — {equiposCount} equipos inscritos ·{' '}
          {horariosCount} horario(s) cargado(s) · {canchasDisponiblesCount}{' '}
          cancha(s).
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute">
        → Resumen antes de generar: {equiposCount} equipos · {horariosCount}{' '}
        horario(s) · {canchasDisponiblesCount} cancha(s)
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
          Resuelve los problemas marcados antes de generar el calendario.
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
 * Sprint 44 — Panel con las canchas que se van a usar en el torneo.
 * Las canchas se definen al cargar los horarios (cada horario tiene su
 * cancha). Si no hay horarios todavía, no podemos saber las canchas.
 * Si hay horarios pero alguno sin cancha asignada, mostramos aviso.
 */
function CanchasPanel({
  canchasDelTorneo,
  horariosSinCancha,
  torneoId,
  faltanHorarios,
  loading,
}: {
  canchasDelTorneo: Array<{ id: string; nombre: string }>;
  horariosSinCancha: number;
  torneoId: string;
  faltanHorarios: boolean;
  loading: boolean;
}): React.ReactElement {
  if (loading) {
    return (
      <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1 flex items-center gap-1.5">
          <MapPin size={11} /> Canchas que se van a usar
        </div>
        <p className="text-xs font-serif italic text-ink-mute">Cargando…</p>
      </div>
    );
  }

  // Caso 1 — no hay horarios cargados todavía. Las canchas se eligen
  // al cargar cada horario, así que mientras no haya horarios no se
  // sabe qué canchas se van a usar.
  if (faltanHorarios) {
    return (
      <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1 flex items-center gap-1.5">
          <MapPin size={11} /> Canchas que se van a usar
        </div>
        <p className="text-xs text-ink-mute leading-snug font-serif italic">
          Primero carga los horarios — al definir cada horario eliges en
          qué cancha se juega.
        </p>
      </div>
    );
  }

  // Caso 2 — hay horarios pero ninguno tiene cancha asignada.
  if (canchasDelTorneo.length === 0) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-danger mb-1 flex items-center gap-1.5">
          <XCircle size={11} /> Falta asignar canchas
        </div>
        <p className="text-xs text-ink leading-snug">
          Cargaste horarios pero ninguno tiene cancha elegida. Ve al{' '}
          <Link
            href={`/admin/torneos/${torneoId}/horarios`}
            className="text-accent font-semibold hover:underline"
          >
            tab Horarios
          </Link>{' '}
          y edita cada horario para elegir su cancha.
        </p>
      </div>
    );
  }

  // Caso 3 — hay canchas asignadas. Mostrar la lista + aviso si algunos
  // horarios todavía no tienen cancha.
  return (
    <div className="bg-paper-dark border border-line rounded-card px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute mb-2 flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          <MapPin size={11} /> Canchas del torneo ({canchasDelTorneo.length})
        </span>
        <Link
          href={`/admin/torneos/${torneoId}/horarios`}
          className="text-accent hover:underline normal-case tracking-normal text-[10px]"
        >
          Editar →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {canchasDelTorneo.map((c) => (
          <span
            key={c.id}
            className="text-xs px-2 py-0.5 rounded bg-green-deep/10 text-green-deep font-medium"
          >
            {c.nombre}
          </span>
        ))}
      </div>
      {horariosSinCancha > 0 && (
        <p className="text-[11px] text-accent mt-2 leading-snug">
          ⚠ {horariosSinCancha} horario(s) todavía sin cancha asignada.
          Edítalos en el tab Horarios.
        </p>
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
