'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Activity,
  ArrowLeft,
  CalendarOff,
  CheckCircle2,
  IdCard,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  ROL_PERSONAL,
  TIPO_CUENTA_BANCARIA,
  TIPO_CUENTA_BANCARIA_LABEL,
  formatearRut,
  validarRut,
  type PersonalAdmin,
  type RolPersonal,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useAusencias,
  useCrearAusencia,
  useCreatePersonal,
  useDeactivatePersonal,
  useEliminarAusencia,
  useInvitarPersonal,
  usePersonal,
  useTenantSettings,
  useUpdatePersonal,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { formatFecha, formatFechaHora } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toastWarning } from '@/lib/toast';

/**
 * Campo CLP opcional. Un <input type="number"> vacío con valueAsNumber
 * entrega NaN, que NO es undefined → z.number().optional() lo rechaza y el
 * submit fallaba en silencio. Normalizamos vacío/NaN → undefined.
 */
const clpOpcional = z.preprocess((v) => {
  if (v === '' || v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? undefined : n;
}, z.number().int().min(0).optional());

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
  const { data: settings } = useTenantSettings();
  const requiereCarnetAnfa = settings?.requiereCarnetAnfa ?? false;
  const [adding, setAdding] = useState(false);
  const [filtro, setFiltro] = useState<RolPersonal | 'TODOS'>('TODOS');

  const filtrados = useMemo(() => {
    if (!personal) return [];
    if (filtro === 'TODOS') return personal;
    // F53 — filtrar por TODOS los roles de la persona (fallback a [rol]).
    return personal.filter((p) =>
      (p.roles?.length ? p.roles : [p.rol]).includes(filtro),
    );
  }, [personal, filtro]);

  const stats = useMemo(() => {
    const all = personal ?? [];
    const arbitros = all.filter((p) =>
      (p.roles?.length ? p.roles : [p.rol]).some((r) => ROLES_ARBITRAJE.includes(r)),
    );
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
        sub={
          requiereCarnetAnfa
            ? 'Catálogo de árbitros, planilleros, paramédicos. El carnet ANFA es obligatorio para árbitros oficiales.'
            : 'Catálogo de árbitros, planilleros, paramédicos. El carnet ANFA es opcional (esta liga no es ANFA — cambia la configuración en Ajustes si corresponde).'
        }
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

      <div
        className={cn(
          'grid grid-cols-2 gap-3 mb-6',
          requiereCarnetAnfa ? 'md:grid-cols-5' : 'md:grid-cols-3',
        )}
      >
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
        {requiereCarnetAnfa && (
          <>
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
          </>
        )}
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
              <PersonaRow
                key={p.id}
                persona={p}
                requiereCarnetAnfa={requiereCarnetAnfa}
              />
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

function PersonaRow({
  persona,
  requiereCarnetAnfa,
}: {
  persona: PersonalAdmin;
  requiereCarnetAnfa: boolean;
}): React.ReactElement {
  const deactivate = useDeactivatePersonal();
  const update = useUpdatePersonal(persona.id);
  const invitar = useInvitarPersonal();
  const [editing, setEditing] = useState(false);
  const [showAusencias, setShowAusencias] = useState(false);
  const status = carnetStatus(persona);
  // Solo mostrar badges de carnet si la liga es ANFA. Para ligas libres,
  // el carnet sigue siendo data útil pero no la mostramos como warning.
  const aplicaCarnet = requiereCarnetAnfa && ROLES_ARBITRAJE.includes(persona.rol);

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
    <div>
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
          {persona.cuentaEstado === 'ACTIVA' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-green-bright/15 text-green-bright">
              tiene acceso
            </span>
          )}
          {persona.cuentaEstado === 'PENDIENTE' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-orange-700/15 text-orange-700">
              invitación pendiente
            </span>
          )}
          {(persona.roles?.length ? persona.roles : [persona.rol]).map((r) => (
            <span
              key={r}
              className={cn(
                'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                ROL_BADGE[r],
              )}
            >
              {ROL_LABEL[r]}
            </span>
          ))}
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
              {persona.carnetAnfaVence ? ` · vence ${formatFecha(persona.carnetAnfaVence)}` : ''}
            </span>
          )}
          {persona.tarifaBase != null && (
            <span>tarifa base ${persona.tarifaBase.toLocaleString('es-CL')}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {(persona.email || persona.telefono) && persona.activo && (
          <InvitarMenu persona={persona} invitar={invitar} />
        )}
        <button
          type="button"
          onClick={() => setShowAusencias((v) => !v)}
          className={cn(
            'p-1 rounded hover:bg-orange-700/10',
            showAusencias ? 'text-orange-700' : 'text-ink-mute hover:text-orange-700',
          )}
          title="Ausencias / disponibilidad"
        >
          <CalendarOff size={14} />
        </button>
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
      {showAusencias && (
        <div className="px-5 pb-4 bg-paper-dark/40 border-t border-line">
          <AusenciasPanel personaId={persona.id} />
        </div>
      )}
    </div>
  );
}

/**
 * F48 — Gestión de ausencias (rangos de fechas no disponibles) de una
 * persona. Cuando el rango cubre la fecha de un partido, la auto-asignación
 * y el análisis de cobertura excluyen a esta persona.
 */
function AusenciasPanel({ personaId }: { personaId: string }): React.ReactElement {
  const { data: ausencias, isLoading } = useAusencias(personaId);
  const crear = useCrearAusencia(personaId);
  const eliminar = useEliminarAusencia(personaId);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const error = crear.error as ApiError | undefined;

  const fieldErrors: { label: string; mensaje: string }[] = [];
  if (intentado && !desde) {
    fieldErrors.push({ label: 'Desde', mensaje: 'Indica la fecha de inicio.' });
  }
  if (intentado && !hasta) {
    fieldErrors.push({ label: 'Hasta', mensaje: 'Indica la fecha de término.' });
  }

  const agregar = async (): Promise<void> => {
    setIntentado(true);
    if (!desde || !hasta) {
      toastWarning(
        `Faltan datos: ${[!desde ? 'Desde' : null, !hasta ? 'Hasta' : null]
          .filter(Boolean)
          .join(', ')}`,
      );
      return;
    }
    await crear.mutateAsync({ desde, hasta, motivo: motivo.trim() || null });
    setDesde('');
    setHasta('');
    setMotivo('');
    setIntentado(false);
  };

  return (
    <div className="pt-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-2 flex items-center gap-1">
        <CalendarOff size={12} className="text-orange-700" /> Ausencias / no disponible
      </div>

      <FormErrorBanner
        fieldErrors={fieldErrors}
        apiError={error}
        validationTitle="Revisa estos datos:"
        apiTitle="No se pudo guardar la ausencia"
      />

      {isLoading && (
        <div className="text-sm text-ink-mute font-serif italic mb-2">Cargando…</div>
      )}
      {!isLoading && (ausencias?.length ?? 0) === 0 && (
        <div className="text-sm text-ink-mute font-serif italic mb-2">
          Sin ausencias. Esta persona figura disponible para todas las fechas.
        </div>
      )}
      {(ausencias?.length ?? 0) > 0 && (
        <ul className="space-y-1 mb-3">
          {ausencias!.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-sm bg-paper rounded-card border border-line px-3 py-1.5"
            >
              <span className="font-mono text-ink">
                {a.desde} → {a.hasta}
              </span>
              {a.motivo && <span className="text-ink-mute">· {a.motivo}</span>}
              <button
                type="button"
                onClick={() => eliminar.mutate(a.id)}
                disabled={eliminar.isPending}
                className="ml-auto p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
                title="Quitar ausencia"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-[10px]">Desde</label>
          <input
            type="date"
            className="input text-sm"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label className="label text-[10px]">Hasta</label>
          <input
            type="date"
            className="input text-sm"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label text-[10px]">Motivo (opcional)</label>
          <input
            type="text"
            className="input text-sm"
            placeholder="lesión, viaje, vacaciones…"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={!desde || !hasta || crear.isPending}
          loading={crear.isPending}
          onClick={agregar}
        >
          <Plus size={14} /> Agregar
        </Button>
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
    roles: RolPersonal[];
    rut: string | null;
    telefono: string | null;
    email: string | null;
    tarifaBase: number | null;
    tarifaArbitroPrincipal: number | null;
    tarifaArbitroAsistente: number | null;
    carnetAnfaNumero: string | null;
    carnetAnfaVence: string | null;
    banco: string | null;
    tipoCuenta: (typeof TIPO_CUENTA_BANCARIA)[number] | null;
    numeroCuenta: string | null;
    titularNombre: string | null;
    titularRut: string | null;
    notas: string | null;
  }) => Promise<void>;
  pending?: boolean;
  error?: ApiError;
}): React.ReactElement {
  const bannerRef = useRef<HTMLDivElement>(null);
  const LABEL_MAP: Record<string, string> = {
    nombre: 'Nombre',
    apellido: 'Apellido',
    roles: 'Roles',
    rut: 'RUT',
    email: 'Email',
    telefono: 'Teléfono',
    tarifaBase: 'Tarifa base',
    tarifaArbitroPrincipal: 'Tarifa árbitro principal',
    tarifaArbitroAsistente: 'Tarifa árbitro asistente',
    carnetAnfaNumero: 'N° Carnet ANFA',
    carnetAnfaVence: 'Vencimiento carnet',
    banco: 'Banco',
    tipoCuenta: 'Tipo de cuenta',
    numeroCuenta: 'N° de cuenta',
    titularNombre: 'Titular',
    titularRut: 'RUT del titular',
    notas: 'Notas',
  };

  const Schema = z.object({
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(100),
    roles: z.array(z.enum(ROL_PERSONAL)).min(1, 'Elige al menos un rol'),
    rut: z
      .string()
      .optional()
      .refine((v) => !v || validarRut(v), 'RUT inválido (verifica el dígito verificador)'),
    telefono: z.string().optional(),
    email: z.union([z.literal(''), z.string().email('Email inválido')]).optional(),
    tarifaBase: clpOpcional,
    tarifaArbitroPrincipal: clpOpcional,
    tarifaArbitroAsistente: clpOpcional,
    carnetAnfaNumero: z.string().optional(),
    carnetAnfaVence: z.string().optional(),
    banco: z.string().max(60).optional(),
    tipoCuenta: z.union([z.literal(''), z.enum(TIPO_CUENTA_BANCARIA)]).optional(),
    numeroCuenta: z.string().max(40).optional(),
    titularNombre: z.string().max(150).optional(),
    titularRut: z.string().max(20).optional(),
    notas: z.string().max(2000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: persona.nombre,
      apellido: persona.apellido,
      roles: persona.roles,
      rut: persona.rut ?? '',
      telefono: persona.telefono ?? '',
      email: persona.email ?? '',
      tarifaBase: persona.tarifaBase ?? undefined,
      tarifaArbitroPrincipal: persona.tarifaArbitroPrincipal ?? undefined,
      tarifaArbitroAsistente: persona.tarifaArbitroAsistente ?? undefined,
      carnetAnfaNumero: persona.carnetAnfaNumero ?? '',
      carnetAnfaVence: persona.carnetAnfaVence ?? '',
      banco: persona.banco ?? '',
      tipoCuenta: persona.tipoCuenta ?? '',
      numeroCuenta: persona.numeroCuenta ?? '',
      titularNombre: persona.titularNombre ?? '',
      titularRut: persona.titularRut ?? '',
      notas: persona.notas ?? '',
    },
  });
  const rolesWatch = form.watch('roles');
  const rolesSel = Array.isArray(rolesWatch) ? rolesWatch : [];
  const aplicaCarnet = rolesSel.some((r) => ROLES_ARBITRAJE.includes(r));

  const handle = async (vals: Form): Promise<void> => {
    await onSubmit({
      nombre: vals.nombre,
      apellido: vals.apellido,
      roles: vals.roles,
      rut: vals.rut || null,
      telefono: vals.telefono || null,
      email: vals.email || null,
      tarifaBase: vals.tarifaBase ?? null,
      tarifaArbitroPrincipal: vals.tarifaArbitroPrincipal ?? null,
      tarifaArbitroAsistente: vals.tarifaArbitroAsistente ?? null,
      carnetAnfaNumero: vals.carnetAnfaNumero || null,
      carnetAnfaVence: vals.carnetAnfaVence || null,
      banco: vals.banco || null,
      tipoCuenta: vals.tipoCuenta || null,
      numeroCuenta: vals.numeroCuenta || null,
      titularNombre: vals.titularNombre || null,
      titularRut: vals.titularRut || null,
      notas: vals.notas || null,
    });
  };

  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    LABEL_MAP,
  );

  return (
    <form
      onSubmit={form.handleSubmit(
        handle,
        makeRhfErrorHandler({
          formName: 'personal-editar',
          labelMap: LABEL_MAP,
          bannerRef,
        }),
      )}
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <div className="md:col-span-2 flex items-center gap-2">
        <Pencil size={16} className="text-accent" />
        <CardLabel>Editando · {persona.nombre} {persona.apellido}</CardLabel>
      </div>
      <div className="md:col-span-2">
        <FormErrorBanner
          ref={bannerRef}
          fieldErrors={fieldErrors}
          apiError={error}
          validationTitle="Revisa estos datos:"
          apiTitle="No se pudo guardar"
        />
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
      <div className="md:col-span-2">
        <label className="label">Roles (puedes marcar varios)</label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
          {ROL_PERSONAL.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                value={r}
                className="h-4 w-4"
                {...form.register('roles')}
              />
              {ROL_LABEL[r]}
            </label>
          ))}
        </div>
        {form.formState.errors.roles && (
          <p className="text-xs text-danger mt-1">
            {form.formState.errors.roles.message}
          </p>
        )}
      </div>
      <Input
        label="RUT"
        placeholder="12.345.678-9"
        {...form.register('rut', {
          onBlur: (e) => {
            const v = e.target.value as string;
            if (v && validarRut(v)) {
              form.setValue('rut', formatearRut(v), { shouldValidate: true });
            }
          },
        })}
        error={form.formState.errors.rut?.message}
      />
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
          <Input
            label="Tarifa árbitro principal (CLP)"
            type="number"
            min={0}
            step={1000}
            placeholder="Si vacío, usa la tarifa base"
            {...form.register('tarifaArbitroPrincipal', { valueAsNumber: true })}
          />
          <Input
            label="Tarifa árbitro asistente (CLP)"
            type="number"
            min={0}
            step={1000}
            placeholder="Si vacío, usa la tarifa base"
            {...form.register('tarifaArbitroAsistente', { valueAsNumber: true })}
          />
          <Input label="N° Carnet ANFA" {...form.register('carnetAnfaNumero')} />
          <Input
            label="Vence"
            type="date"
            {...form.register('carnetAnfaVence')}
          />
        </>
      )}
      <div className="md:col-span-2 mt-1">
        <CardLabel>Datos bancarios (para nómina de pago)</CardLabel>
      </div>
      <Input label="Banco" {...form.register('banco')} />
      <div>
        <label className="label">Tipo de cuenta</label>
        <select className="input" {...form.register('tipoCuenta')}>
          <option value="">—</option>
          {TIPO_CUENTA_BANCARIA.map((t) => (
            <option key={t} value={t}>
              {TIPO_CUENTA_BANCARIA_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <Input label="N° de cuenta" {...form.register('numeroCuenta')} />
      <Input
        label="Titular (si difiere)"
        placeholder="Dejar vacío si es la misma persona"
        {...form.register('titularNombre')}
      />
      <Input label="RUT del titular (si difiere)" {...form.register('titularRut')} />
      <div className="md:col-span-2">
        <label className="label">Notas</label>
        <textarea
          className="input min-h-[60px]"
          {...form.register('notas')}
        />
      </div>
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
  const bannerRef = useRef<HTMLDivElement>(null);
  const LABEL_MAP: Record<string, string> = {
    nombre: 'Nombre',
    apellido: 'Apellido',
    roles: 'Roles',
    rut: 'RUT',
    email: 'Email',
    telefono: 'Teléfono',
    tarifaBase: 'Tarifa base',
    tarifaArbitroPrincipal: 'Tarifa árbitro principal',
    tarifaArbitroAsistente: 'Tarifa árbitro asistente',
    carnetAnfaNumero: 'N° Carnet ANFA',
    carnetAnfaVence: 'Vencimiento carnet',
    banco: 'Banco',
    tipoCuenta: 'Tipo de cuenta',
    numeroCuenta: 'N° de cuenta',
    titularNombre: 'Titular',
    titularRut: 'RUT del titular',
    notas: 'Notas',
  };

  const Schema = z.object({
    nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    apellido: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    roles: z.array(z.enum(ROL_PERSONAL)).min(1, 'Elige al menos un rol'),
    rut: z
      .string()
      .optional()
      .refine((v) => !v || validarRut(v), 'RUT inválido (verifica el dígito verificador)'),
    telefono: z.string().optional(),
    email: z.union([z.literal(''), z.string().email('Email inválido')]).optional(),
    tarifaBase: clpOpcional,
    tarifaArbitroPrincipal: clpOpcional,
    tarifaArbitroAsistente: clpOpcional,
    carnetAnfaNumero: z.string().optional(),
    carnetAnfaVence: z.string().optional(),
    banco: z.string().max(60).optional(),
    tipoCuenta: z.union([z.literal(''), z.enum(TIPO_CUENTA_BANCARIA)]).optional(),
    numeroCuenta: z.string().max(40).optional(),
    titularNombre: z.string().max(150).optional(),
    titularRut: z.string().max(20).optional(),
    notas: z.string().max(2000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { roles: ['ARBITRO_PRINCIPAL'] },
  });
  const rolesWatch = form.watch('roles');
  const rolesSel = Array.isArray(rolesWatch) ? rolesWatch : [];
  const aplicaCarnet = rolesSel.some((r) => ROLES_ARBITRAJE.includes(r));

  const onSubmit = async (vals: Form): Promise<void> => {
    await mutation.mutateAsync({
      nombre: vals.nombre,
      apellido: vals.apellido,
      roles: vals.roles,
      rut: vals.rut || null,
      telefono: vals.telefono || null,
      email: vals.email || null,
      tarifaBase: vals.tarifaBase ?? null,
      tarifaArbitroPrincipal: vals.tarifaArbitroPrincipal ?? null,
      tarifaArbitroAsistente: vals.tarifaArbitroAsistente ?? null,
      carnetAnfaNumero: vals.carnetAnfaNumero || null,
      carnetAnfaVence: vals.carnetAnfaVence || null,
      banco: vals.banco || null,
      tipoCuenta: vals.tipoCuenta || null,
      numeroCuenta: vals.numeroCuenta || null,
      titularNombre: vals.titularNombre || null,
      titularRut: vals.titularRut || null,
      notas: vals.notas || null,
    });
    form.reset();
    onDone();
  };

  const error = mutation.error as ApiError | undefined;
  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    LABEL_MAP,
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <UserCog size={18} className="text-accent" />
        <CardLabel>Nuevo personal</CardLabel>
      </div>

      <FormErrorBanner
        ref={bannerRef}
        fieldErrors={fieldErrors}
        apiError={error}
        validationTitle="Revisa estos datos:"
        apiTitle="No se pudo crear el personal"
      />

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({
            formName: 'personal-invitar',
            labelMap: LABEL_MAP,
            bannerRef,
          }),
        )}
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

        <div className="md:col-span-2">
          <label className="label">Roles (puedes marcar varios)</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
            {ROL_PERSONAL.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  value={r}
                  className="h-4 w-4"
                  {...form.register('roles')}
                />
                {ROL_LABEL[r]}
              </label>
            ))}
          </div>
          {form.formState.errors.roles && (
            <p className="text-xs text-danger mt-1">
              {form.formState.errors.roles.message}
            </p>
          )}
        </div>
        <Input
          label="RUT"
          placeholder="12.345.678-9"
          {...form.register('rut', {
            onBlur: (e) => {
              const v = e.target.value as string;
              if (v && validarRut(v)) {
                form.setValue('rut', formatearRut(v), { shouldValidate: true });
              }
            },
          })}
          error={form.formState.errors.rut?.message}
        />

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
              label="Tarifa árbitro principal (CLP)"
              type="number"
              min={0}
              step={1000}
              placeholder="Si vacío, usa la tarifa base"
              {...form.register('tarifaArbitroPrincipal', { valueAsNumber: true })}
            />
            <Input
              label="Tarifa árbitro asistente (CLP)"
              type="number"
              min={0}
              step={1000}
              placeholder="Si vacío, usa la tarifa base"
              {...form.register('tarifaArbitroAsistente', { valueAsNumber: true })}
            />
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

        <div className="md:col-span-2 mt-1">
          <CardLabel>Datos bancarios (para nómina de pago)</CardLabel>
        </div>
        <Input label="Banco" {...form.register('banco')} placeholder="ej. Banco Estado" />
        <div>
          <label className="label">Tipo de cuenta</label>
          <select className="input" {...form.register('tipoCuenta')}>
            <option value="">—</option>
            {TIPO_CUENTA_BANCARIA.map((t) => (
              <option key={t} value={t}>
                {TIPO_CUENTA_BANCARIA_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <Input label="N° de cuenta" {...form.register('numeroCuenta')} />
        <Input
          label="Titular (si difiere)"
          placeholder="Dejar vacío si es la misma persona"
          {...form.register('titularNombre')}
        />
        <Input
          label="RUT del titular (si difiere)"
          {...form.register('titularRut')}
        />

        <div className="md:col-span-2">
          <label className="label">Notas (opcional)</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="ej. especialista en juveniles, no disponible domingos"
            {...form.register('notas')}
          />
        </div>

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
  // TZ fix — carnetAnfaVence es fecha de solo-día. Lo interpretamos como
  // FIN del día local (T23:59:59), si no new Date('2026-06-06') = medianoche
  // UTC = 20:00 del día anterior en Chile y el carnet figuraba VENCIDO un
  // día antes de tiempo.
  const vence = new Date(p.carnetAnfaVence + 'T23:59:59').getTime();
  if (Number.isNaN(vence)) return 'NO_APLICA';
  const now = Date.now();
  const diff = vence - now;
  if (diff < 0) return 'VENCIDO';
  if (diff < 30 * 24 * 60 * 60 * 1000) return 'POR_VENCER';
  return 'OK';
}

// ─── Sprint 17: menú de invitar con selección de canal ──────────────
function InvitarMenu({
  persona,
  invitar,
}: {
  persona: PersonalAdmin;
  invitar: ReturnType<typeof useInvitarPersonal>;
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const tieneEmail = !!persona.email;
  const tieneTelefono = !!persona.telefono;

  const enviar = async (canal: 'EMAIL' | 'WHATSAPP' | 'AMBOS'): Promise<void> => {
    setAbierto(false);
    const destinos: string[] = [];
    if (canal !== 'WHATSAPP' && persona.email) destinos.push(`email ${persona.email}`);
    if (canal !== 'EMAIL' && persona.telefono) destinos.push(`WhatsApp ${persona.telefono}`);
    if (!window.confirm(`¿Enviar invitación por ${destinos.join(' + ')}?\nEl link expira en 72hs.`)) {
      return;
    }
    try {
      const r = await invitar.mutateAsync({ id: persona.id, canal });
      const partes: string[] = [];
      if (r.emailDestino) partes.push(`email ${r.emailDestino}`);
      if (r.telefonoDestino) partes.push(`WhatsApp ${r.telefonoDestino}`);
      let msg = `Invitación enviada por ${partes.join(' + ')}.\nExpira el ${formatFechaHora(r.expira)}.`;
      if (r.errores.length > 0) {
        msg += `\n\nAdvertencias parciales:\n- ${r.errores.join('\n- ')}`;
      }
      alert(msg);
    } catch (err) {
      alert(`No se pudo enviar: ${(err as Error).message}`);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((s) => !s)}
        disabled={invitar.isPending}
        className="p-1 rounded text-ink-mute hover:text-green-bright hover:bg-green-bright/10 disabled:opacity-50"
        title="Enviar invitación (email y/o WhatsApp)"
      >
        <Send size={14} className={invitar.isPending ? 'animate-pulse' : ''} />
      </button>
      {abierto && (
        <div
          className="absolute right-0 mt-1 z-10 bg-paper border border-line rounded shadow-lg overflow-hidden min-w-[180px]"
          onMouseLeave={() => setAbierto(false)}
        >
          <button
            type="button"
            onClick={() => enviar('EMAIL')}
            disabled={!tieneEmail}
            title={tieneEmail ? undefined : 'Edita a esta persona y agrégale un email para invitar por correo.'}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 enabled:hover:bg-paper-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mail size={14} className="text-ink-mute" />
            <span>{tieneEmail ? 'Solo email' : 'Solo email · sin email cargado'}</span>
          </button>
          <button
            type="button"
            onClick={() => enviar('WHATSAPP')}
            disabled={!tieneTelefono}
            title={tieneTelefono ? undefined : 'Esta persona no tiene teléfono cargado.'}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 enabled:hover:bg-paper-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageCircle size={14} className="text-green-600" />
            <span>{tieneTelefono ? 'Solo WhatsApp' : 'Solo WhatsApp · sin teléfono'}</span>
          </button>
          {tieneEmail && tieneTelefono && (
            <button
              type="button"
              onClick={() => enviar('AMBOS')}
              className="w-full px-3 py-2 text-left text-sm hover:bg-paper-dark flex items-center gap-2 border-t border-line"
            >
              <Send size={14} className="text-accent" />
              <span>Email + WhatsApp</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
