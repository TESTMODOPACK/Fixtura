'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Activity,
  ArrowLeft,
  CheckCircle2,
  IdCard,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ROL_PERSONAL, type PersonalAdmin, type RolPersonal } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCreatePersonal,
  useDeactivatePersonal,
  usePersonal,
  useUpdatePersonal,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const ROL_LABEL: Record<RolPersonal, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Árbitro asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

const ROL_BADGE: Record<RolPersonal, string> = {
  ARBITRO_PRINCIPAL: 'bg-accent/15 text-accent',
  ARBITRO_ASISTENTE: 'bg-orange-700/15 text-orange-700',
  PLANILLERO: 'bg-green-deep/10 text-green-deep',
  PARAMEDICO: 'bg-danger/15 text-danger',
  OTRO: 'bg-ink-mute/10 text-ink-mute',
};

const ROLES_ARBITRAJE: ReadonlyArray<RolPersonal> = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
];

export default function PersonalPage(): React.ReactElement {
  const { data: personal, isLoading } = usePersonal(false);
  const [adding, setAdding] = useState(false);
  const [filtro, setFiltro] = useState<RolPersonal | 'TODOS'>('TODOS');

  const filtrados = useMemo(() => {
    if (!personal) return [];
    return filtro === 'TODOS' ? personal : personal.filter((p) => p.rol === filtro);
  }, [personal, filtro]);

  const stats = useMemo(() => {
    const all = personal ?? [];
    const arbitros = all.filter((p) => ROLES_ARBITRAJE.includes(p.rol));
    const carnetVencido = arbitros.filter((p) => carnetStatus(p) === 'VENCIDO').length;
    const carnetPorVencer = arbitros.filter((p) => carnetStatus(p) === 'POR_VENCER').length;
    return {
      total: all.length,
      activos: all.filter((p) => p.activo).length,
      arbitros: arbitros.length,
      carnetVencido,
      carnetPorVencer,
    };
  }, [personal]);

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Personal & roles"
        sub="Catálogo de árbitros, planilleros, paramédicos. El carnet ANFA es obligatorio para árbitros oficiales."
      >
        <Link href="/admin">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Panel
          </Button>
        </Link>
        <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> {adding ? 'Cancelar' : 'Nuevo registro'}
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Total</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Activos</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : stats.activos}
          </div>
        </Card>
        <Card padding="comfortable" variant="lime">
          <CardLabel tone="mute">Árbitros</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.arbitros}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Carnet vencido</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.carnetVencido > 0 ? 'text-danger' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.carnetVencido}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Por vencer (30d)</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.carnetPorVencer > 0 ? 'text-orange-700' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.carnetPorVencer}
          </div>
        </Card>
      </div>

      {adding && (
        <Card padding="comfortable" className="mb-5">
          <NuevoPersonalForm onDone={() => setAdding(false)} />
        </Card>
      )}

      {/* Filtro por rol */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <FiltroChip active={filtro === 'TODOS'} onClick={() => setFiltro('TODOS')}>
          Todos
        </FiltroChip>
        {ROL_PERSONAL.map((r) => (
          <FiltroChip key={r} active={filtro === r} onClick={() => setFiltro(r)}>
            {ROL_LABEL[r]}
          </FiltroChip>
        ))}
      </div>

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">
            Cargando…
          </div>
        )}
        {!isLoading && filtrados.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-mute font-serif italic">
            No hay personal cargado{filtro !== 'TODOS' ? ' en este rol' : ''}.
          </div>
        )}
        {filtrados.length > 0 && (
          <div className="divide-y divide-line">
            {filtrados.map((p) => (
              <PersonaRow key={p.id} persona={p} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function FiltroChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] font-semibold border transition-colors',
        active
          ? 'bg-green-deep text-chalk border-green-deep'
          : 'bg-paper text-ink-mute border-line hover:border-green-deep hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function PersonaRow({ persona }: { persona: PersonalAdmin }): React.ReactElement {
  const deactivate = useDeactivatePersonal();
  const update = useUpdatePersonal(persona.id);
  const [editing, setEditing] = useState(false);
  const status = carnetStatus(persona);
  const aplicaCarnet = ROLES_ARBITRAJE.includes(persona.rol);

  if (editing) {
    return (
      <div className="px-5 py-4 bg-paper-dark">
        <EditarPersonalForm
          persona={persona}
          onCancel={() => setEditing(false)}
          onSubmit={async (vals) => {
            await update.mutateAsync(vals);
            setEditing(false);
          }}
          pending={update.isPending}
          error={update.error as ApiError | undefined}
        />
      </div>
    );
  }

  return (
    <div className="px-5 py-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">
            {persona.nombre} {persona.apellido}
          </span>
          {!persona.activo && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-ink-mute/15 text-ink-mute">
              inactivo
            </span>
          )}
          <span
            className={cn(
              'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
              ROL_BADGE[persona.rol],
            )}
          >
            {ROL_LABEL[persona.rol]}
          </span>
          {aplicaCarnet && status === 'VENCIDO' && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-danger/15 text-danger flex items-center gap-1">
              <AlertTriangle size={11} /> Carnet vencido
            </span>
          )}
          {aplicaCarnet && status === 'POR_VENCER' && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-orange-700/15 text-orange-700 flex items-center gap-1">
              <AlertTriangle size={11} /> Carnet por vencer
            </span>
          )}
          {aplicaCarnet && status === 'OK' && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-green-bright/15 text-green-bright flex items-center gap-1">
              <CheckCircle2 size={11} /> Carnet vigente
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
          {persona.rut && (
            <span className="font-mono">
              <IdCard size={11} className="inline mr-1" /> {persona.rut}
            </span>
          )}
          {persona.telefono && (
            <span>
              <Phone size={11} className="inline mr-1" /> {persona.telefono}
            </span>
          )}
          {persona.carnetAnfaNumero && (
            <span className="font-mono">
              <Activity size={11} className="inline mr-1" /> ANFA #{persona.carnetAnfaNumero}
              {persona.carnetAnfaVence ? ` · vence ${persona.carnetAnfaVence}` : ''}
            </span>
          )}
          {persona.tarifaBase != null && (
            <span>tarifa base ${persona.tarifaBase.toLocaleString('es-CL')}</span>
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
        {persona.activo ? (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `¿Desactivar a ${persona.nombre} ${persona.apellido}? Quedará oculta para nuevas designaciones pero el historial se conserva.`,
                )
              ) {
                deactivate.mutate(persona.id);
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
            onClick={() => update.mutate({ activo: true })}
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

function EditarPersonalForm({
  persona,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  persona: PersonalAdmin;
  onCancel: () => void;
  onSubmit: (vals: {
    nombre: string;
    apellido: string;
    rol: RolPersonal;
    rut: string | null;
    telefono: string | null;
    email: string | null;
    tarifaBase: number | null;
    carnetAnfaNumero: string | null;
    carnetAnfaVence: string | null;
    notas: string | null;
  }) => Promise<void>;
  pending?: boolean;
  error?: ApiError;
}): React.ReactElement {
  const Schema = z.object({
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(100),
    rol: z.enum(ROL_PERSONAL),
    rut: z.string().optional(),
    telefono: z.string().optional(),
    email: z.union([z.literal(''), z.string().email('Email inválido')]).optional(),
    tarifaBase: z.coerce.number().int().min(0).optional(),
    carnetAnfaNumero: z.string().optional(),
    carnetAnfaVence: z.string().optional(),
    notas: z.string().max(2000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: persona.nombre,
      apellido: persona.apellido,
      rol: persona.rol,
      rut: persona.rut ?? '',
      telefono: persona.telefono ?? '',
      email: persona.email ?? '',
      tarifaBase: persona.tarifaBase ?? undefined,
      carnetAnfaNumero: persona.carnetAnfaNumero ?? '',
      carnetAnfaVence: persona.carnetAnfaVence ?? '',
      notas: persona.notas ?? '',
    },
  });
  const rol = form.watch('rol');
  const aplicaCarnet = ROLES_ARBITRAJE.includes(rol);

  const handle = async (vals: Form): Promise<void> => {
    await onSubmit({
      nombre: vals.nombre,
      apellido: vals.apellido,
      rol: vals.rol,
      rut: vals.rut || null,
      telefono: vals.telefono || null,
      email: vals.email || null,
      tarifaBase: vals.tarifaBase ?? null,
      carnetAnfaNumero: vals.carnetAnfaNumero || null,
      carnetAnfaVence: vals.carnetAnfaVence || null,
      notas: vals.notas || null,
    });
  };

  return (
    <form
      onSubmit={form.handleSubmit(handle)}
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <div className="md:col-span-2 flex items-center gap-2">
        <Pencil size={16} className="text-accent" />
        <CardLabel>Editando · {persona.nombre} {persona.apellido}</CardLabel>
      </div>
      <Input
        label="Nombre"
        {...form.register('nombre')}
        error={form.formState.errors.nombre?.message}
      />
      <Input
        label="Apellido"
        {...form.register('apellido')}
        error={form.formState.errors.apellido?.message}
      />
      <div>
        <label className="label">Rol</label>
        <select className="input" {...form.register('rol')}>
          {ROL_PERSONAL.map((r) => (
            <option key={r} value={r}>
              {ROL_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <Input label="RUT" {...form.register('rut')} />
      <Input label="Teléfono" {...form.register('telefono')} />
      <Input
        label="Email"
        type="email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <Input
        label="Tarifa base (CLP)"
        type="number"
        min={0}
        step={1000}
        {...form.register('tarifaBase', { valueAsNumber: true })}
      />
      {aplicaCarnet && (
        <>
          <Input label="N° Carnet ANFA" {...form.register('carnetAnfaNumero')} />
          <Input
            label="Vence"
            type="date"
            {...form.register('carnetAnfaVence')}
          />
        </>
      )}
      <div className="md:col-span-2">
        <label className="label">Notas</label>
        <textarea
          className="input min-h-[60px]"
          {...form.register('notas')}
        />
      </div>
      {error && (
        <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
          {error.message}
        </div>
      )}
      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" variant="accent" loading={pending}>
          Guardar cambios
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X size={14} /> Cancelar
        </Button>
      </div>
    </form>
  );
}

function NuevoPersonalForm({ onDone }: { onDone: () => void }): React.ReactElement {
  const mutation = useCreatePersonal();

  const Schema = z.object({
    nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    apellido: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    rol: z.enum(ROL_PERSONAL),
    rut: z.string().optional(),
    telefono: z.string().optional(),
    email: z.union([z.literal(''), z.string().email('Email inválido')]).optional(),
    tarifaBase: z.coerce.number().int().min(0).optional(),
    carnetAnfaNumero: z.string().optional(),
    carnetAnfaVence: z.string().optional(),
    notas: z.string().max(2000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { rol: 'ARBITRO_PRINCIPAL' },
  });
  const rol = form.watch('rol');
  const aplicaCarnet = ROLES_ARBITRAJE.includes(rol);

  const onSubmit = async (vals: Form): Promise<void> => {
    await mutation.mutateAsync({
      nombre: vals.nombre,
      apellido: vals.apellido,
      rol: vals.rol,
      rut: vals.rut || null,
      telefono: vals.telefono || null,
      email: vals.email || null,
      tarifaBase: vals.tarifaBase ?? null,
      carnetAnfaNumero: vals.carnetAnfaNumero || null,
      carnetAnfaVence: vals.carnetAnfaVence || null,
      notas: vals.notas || null,
    });
    form.reset();
    onDone();
  };

  const error = mutation.error as ApiError | undefined;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <UserCog size={18} className="text-accent" />
        <CardLabel>Nuevo personal</CardLabel>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <Input
          label="Nombre"
          {...form.register('nombre')}
          error={form.formState.errors.nombre?.message}
        />
        <Input
          label="Apellido"
          {...form.register('apellido')}
          error={form.formState.errors.apellido?.message}
        />

        <div>
          <label className="label">Rol</label>
          <select className="input" {...form.register('rol')}>
            {ROL_PERSONAL.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <Input label="RUT" {...form.register('rut')} placeholder="12.345.678-9" />

        <Input label="Teléfono" {...form.register('telefono')} placeholder="+56 9 1234 5678" />
        <Input
          label="Email"
          type="email"
          {...form.register('email')}
          error={form.formState.errors.email?.message}
        />

        <Input
          label="Tarifa base por partido (CLP)"
          type="number"
          min={0}
          step={1000}
          {...form.register('tarifaBase', { valueAsNumber: true })}
        />

        {aplicaCarnet && (
          <>
            <Input
              label="N° Carnet ANFA"
              {...form.register('carnetAnfaNumero')}
              placeholder="ej. 12345"
            />
            <Input
              label="Vence (AAAA-MM-DD)"
              type="date"
              {...form.register('carnetAnfaVence')}
            />
          </>
        )}

        <div className="md:col-span-2">
          <label className="label">Notas (opcional)</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="ej. especialista en juveniles, no disponible domingos"
            {...form.register('notas')}
          />
        </div>

        {error && (
          <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" variant="accent" loading={mutation.isPending}>
            <Plus size={14} /> Crear personal
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

function carnetStatus(p: PersonalAdmin): 'VENCIDO' | 'POR_VENCER' | 'OK' | 'NO_APLICA' {
  if (!ROLES_ARBITRAJE.includes(p.rol)) return 'NO_APLICA';
  if (!p.carnetAnfaVence) return 'NO_APLICA';
  const vence = new Date(p.carnetAnfaVence).getTime();
  if (Number.isNaN(vence)) return 'NO_APLICA';
  const now = Date.now();
  const diff = vence - now;
  if (diff < 0) return 'VENCIDO';
  if (diff < 30 * 24 * 60 * 60 * 1000) return 'POR_VENCER';
  return 'OK';
}
