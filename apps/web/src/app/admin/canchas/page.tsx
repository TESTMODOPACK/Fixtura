'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Lightbulb,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  SUPERFICIE_CANCHA,
  SUPERFICIE_LABEL,
  type CanchaAdmin,
  type SuperficieCancha,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCanchas,
  useCreateCancha,
  useDeactivateCancha,
  useUpdateCancha,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const SUPERFICIE_BADGE: Record<SuperficieCancha, string> = {
  PASTO_NATURAL: 'bg-green-bright/15 text-green-bright',
  PASTO_SINTETICO: 'bg-green-deep/15 text-green-deep',
  CEMENTO: 'bg-ink-mute/15 text-ink-mute',
  TIERRA: 'bg-orange-700/15 text-orange-700',
  OTRA: 'bg-ink-mute/10 text-ink-mute',
};

export default function CanchasPage(): React.ReactElement {
  const { data: canchas, isLoading, error } = useCanchas(false);
  const apiError = error as ApiError | undefined;
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => {
    const all = canchas ?? [];
    return {
      total: all.length,
      activas: all.filter((c) => c.activa).length,
      capacidadTotal: all
        .filter((c) => c.activa)
        .reduce((acc, c) => acc + (c.capacidad ?? 0), 0),
      conIluminacion: all.filter((c) => c.activa && c.iluminacion).length,
    };
  }, [canchas]);

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Ocupación de canchas"
        sub="Catálogo de canchas donde se juegan los partidos. Al editar un partido, el sistema avisa si hay choque de horario en la misma cancha."
      >
        <Link
          href="/admin/canchas/ocupacion"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-card text-sm font-semibold bg-paper border border-line hover:border-green-deep hover:text-green-deep transition-colors"
        >
          <CalendarRange size={14} /> Vista calendario
        </Link>
        <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> {adding ? 'Cancelar' : 'Nueva cancha'}
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Total</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Activas</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : stats.activas}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Con iluminación</CardLabel>
          <div className="font-display text-3xl text-accent tracking-display">
            {isLoading ? '…' : stats.conIluminacion}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Permiten horario nocturno</div>
        </Card>
        <Card padding="comfortable" variant="lime">
          <CardLabel tone="mute">Capacidad total</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.capacidadTotal.toLocaleString('es-CL')}
          </div>
          <div className="text-xs text-green-deep/70 font-serif italic mt-1">Suma de aforos</div>
        </Card>
      </div>

      {apiError && (
        <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5 mb-4">
          <div className="flex items-start gap-3 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">No pudimos cargar las canchas</div>
              <div className="text-sm mt-1">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {adding && (
        <Card padding="comfortable" className="mb-5">
          <CanchaForm onDone={() => setAdding(false)} />
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
        )}
        {!isLoading && !apiError && (canchas?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <Trophy size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              Todavía no hay canchas cargadas. Agregá la primera para empezar a trackear ocupación.
            </p>
          </div>
        )}
        {canchas && canchas.length > 0 && (
          <div className="divide-y divide-line">
            {canchas.map((c) => (
              <CanchaRow key={c.id} cancha={c} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function CanchaRow({ cancha }: { cancha: CanchaAdmin }): React.ReactElement {
  const deactivate = useDeactivateCancha();
  const update = useUpdateCancha(cancha.id);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="p-5 bg-paper-dark">
        <CanchaForm cancha={cancha} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="p-5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">{cancha.nombre}</span>
          {!cancha.activa && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-ink-mute/15 text-ink-mute">
              inactiva
            </span>
          )}
          <span
            className={cn(
              'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
              SUPERFICIE_BADGE[cancha.superficie],
            )}
          >
            {SUPERFICIE_LABEL[cancha.superficie]}
          </span>
          {cancha.iluminacion && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-accent/15 text-accent flex items-center gap-1">
              <Lightbulb size={11} /> Iluminación
            </span>
          )}
          {cancha.tieneCamarines && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-green-deep/10 text-green-deep">
              Camarines
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
          {cancha.direccion && (
            <span className="flex items-center gap-1">
              <MapPin size={11} /> {cancha.direccion}
            </span>
          )}
          {cancha.capacidad != null && (
            <span className="flex items-center gap-1">
              <Users size={11} /> Capacidad {cancha.capacidad.toLocaleString('es-CL')}
            </span>
          )}
          {cancha.observaciones && (
            <span className="font-serif italic truncate flex-1">{cancha.observaciones}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1 rounded text-ink-mute hover:text-accent hover:bg-accent/10"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        {cancha.activa ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`¿Desactivar la cancha "${cancha.nombre}"?`)) {
                deactivate.mutate(cancha.id);
              }
            }}
            className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
            title="Desactivar"
          >
            <Trash2 size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => update.mutate({ activa: true })}
            className="p-1 rounded text-ink-mute hover:text-green-bright hover:bg-green-bright/10"
            title="Reactivar"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function CanchaForm({
  cancha,
  onDone,
}: {
  cancha?: CanchaAdmin;
  onDone: () => void;
}): React.ReactElement {
  const create = useCreateCancha();
  const update = useUpdateCancha(cancha?.id ?? '');
  const mutation = cancha ? update : create;
  const error = mutation.error as ApiError | undefined;

  const Schema = z.object({
    nombre: z.string().min(2).max(150),
    direccion: z.string().max(500).optional(),
    lat: z.union([z.literal(''), z.coerce.number().min(-90).max(90)]).optional(),
    lng: z.union([z.literal(''), z.coerce.number().min(-180).max(180)]).optional(),
    capacidad: z.union([z.literal(''), z.coerce.number().int().min(0).max(200000)]).optional(),
    superficie: z.enum(SUPERFICIE_CANCHA),
    iluminacion: z.boolean(),
    tieneCamarines: z.boolean(),
    observaciones: z.string().max(1000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: cancha?.nombre ?? '',
      direccion: cancha?.direccion ?? '',
      lat: cancha?.lat ?? '',
      lng: cancha?.lng ?? '',
      capacidad: cancha?.capacidad ?? '',
      superficie: cancha?.superficie ?? 'PASTO_NATURAL',
      iluminacion: cancha?.iluminacion ?? false,
      tieneCamarines: cancha?.tieneCamarines ?? false,
      observaciones: cancha?.observaciones ?? '',
    },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    const payload = {
      nombre: vals.nombre,
      direccion: vals.direccion || null,
      lat: vals.lat === '' || vals.lat === undefined ? null : Number(vals.lat),
      lng: vals.lng === '' || vals.lng === undefined ? null : Number(vals.lng),
      capacidad:
        vals.capacidad === '' || vals.capacidad === undefined ? null : Number(vals.capacidad),
      superficie: vals.superficie,
      iluminacion: vals.iluminacion,
      tieneCamarines: vals.tieneCamarines,
      observaciones: vals.observaciones || null,
    };
    if (cancha) {
      await update.mutateAsync(payload);
    } else {
      await create.mutateAsync(payload);
    }
    form.reset();
    onDone();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={18} className="text-accent" />
        <CardLabel>{cancha ? `Editando · ${cancha.nombre}` : 'Nueva cancha'}</CardLabel>
      </div>

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({ formName: 'cancha' }),
        )}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <Input
          label="Nombre"
          placeholder="Estadio Municipal · Cancha 1"
          {...form.register('nombre')}
          error={form.formState.errors.nombre?.message}
        />
        <Input
          label="Dirección (opcional)"
          placeholder="Av. Irarrázaval 1234, Ñuñoa"
          {...form.register('direccion')}
        />

        <div>
          <label className="label">Superficie</label>
          <select className="input" {...form.register('superficie')}>
            {SUPERFICIE_CANCHA.map((s) => (
              <option key={s} value={s}>
                {SUPERFICIE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Capacidad / aforo"
          type="number"
          min={0}
          {...form.register('capacidad', { valueAsNumber: true })}
        />

        <Input
          label="Latitud (opcional)"
          type="number"
          step="any"
          {...form.register('lat', { valueAsNumber: true })}
          error={form.formState.errors.lat?.message}
        />
        <Input
          label="Longitud (opcional)"
          type="number"
          step="any"
          {...form.register('lng', { valueAsNumber: true })}
          error={form.formState.errors.lng?.message}
        />

        <div className="md:col-span-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...form.register('iluminacion')} />
            <Lightbulb size={14} className="text-accent" />
            <span>Tiene iluminación (horario nocturno)</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...form.register('tieneCamarines')} />
            <span>Tiene camarines</span>
          </label>
        </div>

        <div className="md:col-span-2">
          <label className="label">Observaciones</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Ej: cancha 2 sin riego automático, traer balones de repuesto"
            {...form.register('observaciones')}
          />
        </div>

        {error && (
          <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" variant="accent" loading={mutation.isPending}>
            {cancha ? (
              <>
                <CheckCircle2 size={14} /> Guardar cambios
              </>
            ) : (
              <>
                <Plus size={14} /> Crear cancha
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            <X size={14} /> Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
