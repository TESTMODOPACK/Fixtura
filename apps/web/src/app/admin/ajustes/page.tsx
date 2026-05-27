'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Mail,
  Palette,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  ROLES_ADMIN_INVITABLES,
  type Branding,
  type MiembroAdmin,
  type RolAdminInvitable,
  type TenantSettings,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useInvitarMiembro,
  useMiembros,
  useRemoveMiembro,
  useTenantSettings,
  useUpdateTenantSettings,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

type Tab = 'branding' | 'dominio' | 'reglamento' | 'equipo';

const ROL_LABEL: Record<RolAdminInvitable, string> = {
  LIGA_ADMIN: 'Administrador',
  LIGA_COORDINADOR: 'Coordinador',
  LIGA_COORDINADOR_ARBITROS: 'Coord. árbitros',
  LIGA_CONTADOR: 'Contador',
  LIGA_COMERCIAL: 'Comercial',
  TRIBUNAL_DISCIPLINA: 'Tribunal',
};

export default function AjustesPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('branding');
  const { data: settings, isLoading, error, refetch } = useTenantSettings();
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Configuración"
        title="Ajustes de la liga"
        sub="Personalizá el branding, el dominio propio y los miembros del equipo administrador."
      />

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando ajustes…</div>
      )}

      {!isLoading && apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR LOS AJUSTES
              </div>
              <div className="text-sm text-danger mb-3">{apiError.message}</div>
              <div className="text-sm text-ink-mute font-serif italic mb-3">
                Causas frecuentes:
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Tu sesión expiró — cerrá sesión y volvé a entrar.</li>
                  <li>
                    Tu rol actual no es <span className="font-mono">LIGA_ADMIN</span> (solo ese rol
                    puede modificar ajustes; el coordinador no tiene acceso).
                  </li>
                  <li>
                    El API todavía no terminó de bootear — esperá 30 segundos y reintentá.
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-sm text-accent hover:underline font-semibold"
              >
                ↺ Reintentar
              </button>
            </div>
          </div>
        </Card>
      )}

      {!isLoading && !apiError && !settings && (
        <Card padding="roomy">
          <CardLabel>Sin datos</CardLabel>
          <p className="font-serif italic text-ink-mute mt-2">
            El endpoint respondió OK pero sin datos. Reportá esto al soporte.
          </p>
        </Card>
      )}

      {settings && (
        <>
          <div className="border-b border-line mb-6 -mx-6 md:-mx-10 px-6 md:px-10">
            <nav className="flex gap-1">
              <TabButton active={tab === 'branding'} onClick={() => setTab('branding')}>
                Branding
              </TabButton>
              <TabButton active={tab === 'dominio'} onClick={() => setTab('dominio')}>
                Dominio
              </TabButton>
              <TabButton
                active={tab === 'reglamento'}
                onClick={() => setTab('reglamento')}
              >
                Reglamento
              </TabButton>
              <TabButton active={tab === 'equipo'} onClick={() => setTab('equipo')}>
                Equipo admin
              </TabButton>
            </nav>
          </div>

          {tab === 'branding' && <BrandingTab settings={settings} />}
          {tab === 'dominio' && <DominioTab settings={settings} />}
          {tab === 'reglamento' && <ReglamentoTab settings={settings} />}
          {tab === 'equipo' && <EquipoTab />}
        </>
      )}
    </>
  );
}

function TabButton({
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
        'px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px',
        active
          ? 'border-accent text-ink'
          : 'border-transparent text-ink-mute hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

// ─── Tab: Branding ───────────────────────────────────────────────────
function BrandingTab({ settings }: { settings: TenantSettings }): React.ReactElement {
  const update = useUpdateTenantSettings();
  const [saved, setSaved] = useState(false);

  const Schema = z.object({
    nombre: z.string().min(2).max(200),
    nombreComercial: z.string().max(150).optional(),
    lemaCorto: z.string().max(200).optional(),
    colorPrimario: z
      .union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser #RRGGBB')])
      .optional(),
    colorSecundario: z
      .union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser #RRGGBB')])
      .optional(),
    escudoUrl: z
      .union([z.literal(''), z.string().url('Debe ser una URL válida')])
      .optional(),
    emailContacto: z
      .union([z.literal(''), z.string().email('Email inválido')])
      .optional(),
    telefonoContacto: z.string().max(50).optional(),
    footerTexto: z.string().max(500).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: settings.nombre,
      nombreComercial: settings.branding.nombreComercial ?? '',
      lemaCorto: settings.branding.lemaCorto ?? '',
      colorPrimario: settings.branding.colorPrimario ?? '',
      colorSecundario: settings.branding.colorSecundario ?? '',
      escudoUrl: settings.branding.escudoUrl ?? '',
      emailContacto: settings.branding.emailContacto ?? '',
      telefonoContacto: settings.branding.telefonoContacto ?? '',
      footerTexto: settings.branding.footerTexto ?? '',
    },
  });

  // Reset cuando cambian settings (en caso de re-fetch)
  useEffect(() => {
    form.reset({
      nombre: settings.nombre,
      nombreComercial: settings.branding.nombreComercial ?? '',
      lemaCorto: settings.branding.lemaCorto ?? '',
      colorPrimario: settings.branding.colorPrimario ?? '',
      colorSecundario: settings.branding.colorSecundario ?? '',
      escudoUrl: settings.branding.escudoUrl ?? '',
      emailContacto: settings.branding.emailContacto ?? '',
      telefonoContacto: settings.branding.telefonoContacto ?? '',
      footerTexto: settings.branding.footerTexto ?? '',
    });
  }, [settings, form]);

  const onSubmit = async (vals: Form): Promise<void> => {
    const branding: Branding = {};
    if (vals.nombreComercial) branding.nombreComercial = vals.nombreComercial;
    if (vals.lemaCorto) branding.lemaCorto = vals.lemaCorto;
    if (vals.colorPrimario) branding.colorPrimario = vals.colorPrimario;
    if (vals.colorSecundario) branding.colorSecundario = vals.colorSecundario;
    if (vals.escudoUrl) branding.escudoUrl = vals.escudoUrl;
    if (vals.emailContacto) branding.emailContacto = vals.emailContacto;
    if (vals.telefonoContacto) branding.telefonoContacto = vals.telefonoContacto;
    if (vals.footerTexto) branding.footerTexto = vals.footerTexto;

    await update.mutateAsync({ nombre: vals.nombre, branding });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const error = update.error as ApiError | undefined;
  const colorPrimarioVal = form.watch('colorPrimario');
  const colorSecundarioVal = form.watch('colorSecundario');
  const escudoVal = form.watch('escudoUrl');

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="grid grid-cols-1 lg:grid-cols-3 gap-5"
    >
      <Card padding="roomy" className="lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} className="text-accent" />
          <CardLabel>Identidad de la liga</CardLabel>
        </div>

        <div className="space-y-4">
          <Input
            label="Nombre oficial (interno)"
            {...form.register('nombre')}
            error={form.formState.errors.nombre?.message}
          />
          <Input
            label="Nombre comercial (visible en portal)"
            placeholder="Liga Ñuñoa Sénior"
            {...form.register('nombreComercial')}
            error={form.formState.errors.nombreComercial?.message}
          />
          <Input
            label="Lema corto (bajada en home pública)"
            placeholder="El fútbol amateur de Ñuñoa, organizado."
            {...form.register('lemaCorto')}
            error={form.formState.errors.lemaCorto?.message}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Color primario (#RRGGBB)"
              placeholder="#0F2A1F"
              {...form.register('colorPrimario')}
              error={form.formState.errors.colorPrimario?.message}
            />
            <Input
              label="Color secundario (#RRGGBB)"
              placeholder="#E76F26"
              {...form.register('colorSecundario')}
              error={form.formState.errors.colorSecundario?.message}
            />
          </div>

          <Input
            label="URL del escudo / logo"
            placeholder="https://cdn.tu-liga.cl/escudo.png"
            {...form.register('escudoUrl')}
            error={form.formState.errors.escudoUrl?.message}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email de contacto público"
              placeholder="info@tu-liga.cl"
              {...form.register('emailContacto')}
              error={form.formState.errors.emailContacto?.message}
            />
            <Input
              label="Teléfono / WhatsApp"
              placeholder="+56 9 1234 5678"
              {...form.register('telefonoContacto')}
            />
          </div>

          <div>
            <label className="label">Texto del footer</label>
            <textarea
              className="input min-h-[60px]"
              placeholder="Liga oficial afiliada a ANFA Metropolitana. Fundada en 1985."
              {...form.register('footerTexto')}
            />
          </div>
        </div>
      </Card>

      <Card padding="roomy">
        <CardLabel>Vista previa</CardLabel>
        <div
          className="mt-4 rounded-card border border-line overflow-hidden"
          style={{
            background: colorPrimarioVal && /^#[0-9a-fA-F]{6}$/.test(colorPrimarioVal)
              ? colorPrimarioVal
              : '#0F2A1F',
          }}
        >
          <div className="p-5 text-chalk">
            {escudoVal && (
              <img
                src={escudoVal}
                alt="escudo"
                className="h-12 mb-3 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <div className="font-display tracking-display text-2xl leading-tight">
              {(form.watch('nombreComercial') || form.watch('nombre') || 'TU LIGA').toUpperCase()}
            </div>
            <div
              className="text-xs uppercase tracking-[0.2em] mt-2 font-semibold"
              style={{
                color: colorSecundarioVal && /^#[0-9a-fA-F]{6}$/.test(colorSecundarioVal)
                  ? colorSecundarioVal
                  : '#E76F26',
              }}
            >
              → {form.watch('lemaCorto') || 'tu lema acá'}
            </div>
          </div>
          <div className="p-3 bg-paper text-xs text-ink-mute font-serif italic">
            Así se va a ver el header del portal público.
          </div>
        </div>

        <div className="mt-4">
          {error && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mb-3">
              {error.message}
            </div>
          )}
          {saved && !error && (
            <div className="text-sm text-green-bright bg-green-bright/10 px-3 py-2 rounded-card mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} /> Cambios guardados
            </div>
          )}
          <Button
            type="submit"
            variant="accent"
            loading={update.isPending}
            className="w-full"
          >
            Guardar cambios
          </Button>
        </div>
      </Card>
    </form>
  );
}

// ─── Tab: Dominio ────────────────────────────────────────────────────
function DominioTab({ settings }: { settings: TenantSettings }): React.ReactElement {
  const update = useUpdateTenantSettings();
  const [saved, setSaved] = useState(false);

  const Schema = z.object({
    customDomain: z.union([
      z.literal(''),
      z
        .string()
        .min(4)
        .max(255)
        .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, 'Dominio inválido (ej. liganunoa.cl)'),
    ]),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { customDomain: settings.customDomain ?? '' },
  });

  useEffect(() => {
    form.reset({ customDomain: settings.customDomain ?? '' });
  }, [settings, form]);

  const onSubmit = async (vals: Form): Promise<void> => {
    await update.mutateAsync({ customDomain: vals.customDomain });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const error = update.error as ApiError | undefined;
  const dominioActual = form.watch('customDomain');

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
      <Card padding="roomy">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={18} className="text-accent" />
          <CardLabel>Dominio propio</CardLabel>
        </div>

        <p className="text-sm text-ink-mute font-serif italic mb-4">
          Cuando registres un dominio (ej. <code className="font-mono">liganunoa.cl</code>) y
          apuntes su A record a la IP del VPS, ingresalo acá. El portal público de la liga va a
          servirse desde ese dominio automáticamente.
        </p>

        <Input
          label="Dominio propio (sin http://)"
          placeholder="liganunoa.cl"
          {...form.register('customDomain')}
          error={form.formState.errors.customDomain?.message}
        />

        {dominioActual && (
          <div className="mt-4 p-3 bg-paper rounded-card border border-line text-sm">
            <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
              → Tu portal va a vivir en
            </div>
            <div className="font-mono text-green-deep font-semibold">
              https://{dominioActual}/
            </div>
          </div>
        )}

        {!dominioActual && (
          <div className="mt-4 p-3 bg-orange-700/5 border border-orange-700/20 rounded-card text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="text-orange-700 mt-0.5 flex-shrink-0" />
            <span className="text-orange-700">
              Sin dominio configurado, el portal se accede por IP. Compatible para staging, no
              recomendado para producción.
            </span>
          </div>
        )}

        <div className="mt-4">
          {error && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mb-3">
              {error.message}
            </div>
          )}
          {saved && !error && (
            <div className="text-sm text-green-bright bg-green-bright/10 px-3 py-2 rounded-card mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} /> Dominio actualizado
            </div>
          )}
          <Button type="submit" variant="accent" loading={update.isPending}>
            Guardar dominio
          </Button>
        </div>
      </Card>

      <Card padding="comfortable" variant="lime">
        <CardLabel tone="mute">¿Cómo apunto un dominio?</CardLabel>
        <ol className="text-sm text-green-deep mt-3 space-y-2 list-decimal list-inside font-serif">
          <li>
            Comprá el dominio (NIC Chile, Namecheap, GoDaddy — ~10k CLP/año en .cl).
          </li>
          <li>
            En la zona DNS del proveedor, creá un <code className="font-mono">A record</code>{' '}
            apuntando a la IP del VPS.
          </li>
          <li>Esperá 5-30 minutos para que propague.</li>
          <li>Volvé acá y guardá el dominio.</li>
          <li>
            Generá certificado Let&apos;s Encrypt en el VPS (ver{' '}
            <code className="font-mono">docs/DEPLOY_HOSTINGER.md</code> paso 7).
          </li>
        </ol>
      </Card>
    </form>
  );
}

// ─── Tab: Reglamento ─────────────────────────────────────────────────
function ReglamentoTab({ settings }: { settings: TenantSettings }): React.ReactElement {
  const update = useUpdateTenantSettings();
  const [saved, setSaved] = useState(false);
  const [requiereCarnetAnfa, setRequiereCarnetAnfa] = useState(
    settings.requiereCarnetAnfa,
  );

  useEffect(() => {
    setRequiereCarnetAnfa(settings.requiereCarnetAnfa);
  }, [settings.requiereCarnetAnfa]);

  const toggle = async (next: boolean): Promise<void> => {
    setRequiereCarnetAnfa(next);
    try {
      await update.mutateAsync({ requiereCarnetAnfa: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Si falla, revertir el toggle visual
      setRequiereCarnetAnfa(!next);
    }
  };

  const error = update.error as ApiError | undefined;

  return (
    <div className="max-w-2xl space-y-5">
      <Card padding="roomy">
        <CardLabel>Carnet ANFA</CardLabel>

        <p className="text-sm text-ink-mute font-serif italic mt-2 mb-4">
          En Chile, las ligas afiliadas a la <strong className="text-ink">ANFA</strong>{' '}
          (Asociación Nacional de Fútbol Amateur) están obligadas a usar árbitros con
          carnet vigente. Las ligas libres (corporativas, barriales, sénior) no tienen
          esa obligación.
        </p>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-card border border-line hover:border-accent transition-colors">
          <input
            type="checkbox"
            checked={requiereCarnetAnfa}
            onChange={(e) => void toggle(e.target.checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="font-semibold text-ink">
              Esta liga está afiliada a ANFA y exige carnet ANFA vigente
            </div>
            <div className="text-xs text-ink-mute font-serif italic mt-1">
              Si está activado, la auto-asignación excluye árbitros con carnet vencido y
              el panel muestra alertas de vencimientos. Si está desactivado, el campo de
              carnet sigue disponible pero no bloquea ni alerta.
            </div>
          </div>
        </label>

        <div className="mt-4">
          <div
            className={cn(
              'p-3 rounded-card text-sm border',
              requiereCarnetAnfa
                ? 'bg-accent/5 border-accent/30 text-ink'
                : 'bg-green-bright/5 border-green-bright/30 text-ink',
            )}
          >
            <div className="font-semibold mb-1">
              {requiereCarnetAnfa
                ? '→ Modo ANFA activado'
                : '→ Modo liga libre activado'}
            </div>
            <ul className="text-xs space-y-0.5 list-disc list-inside font-serif italic">
              {requiereCarnetAnfa ? (
                <>
                  <li>Auto-asignación excluye árbitros con carnet vencido.</li>
                  <li>Dashboard muestra alertas de vencimientos.</li>
                  <li>UI marca con warning rojo a árbitros sin carnet vigente.</li>
                </>
              ) : (
                <>
                  <li>Todos los árbitros activos son elegibles para auto-asignación.</li>
                  <li>El campo carnet ANFA sigue disponible (es opcional registrarlo).</li>
                  <li>No se muestran alertas de carnet en el dashboard.</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mt-3">
            {error.message}
          </div>
        )}
        {saved && !error && (
          <div className="text-sm text-green-bright bg-green-bright/10 px-3 py-2 rounded-card mt-3 flex items-center gap-2">
            <CheckCircle2 size={14} /> Cambio guardado
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Equipo admin ───────────────────────────────────────────────
function EquipoTab(): React.ReactElement {
  const { data: miembros, isLoading } = useMiembros();
  const [invitando, setInvitando] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display tracking-display text-xl text-green-deep">
            EQUIPO ADMIN DE LA LIGA
          </div>
          <div className="text-sm text-ink-mute font-serif italic">
            Las personas que tienen acceso a este panel. Cada una puede tener uno o más roles.
          </div>
        </div>
        <Button variant="accent" size="sm" onClick={() => setInvitando((v) => !v)}>
          <Plus size={14} /> {invitando ? 'Cancelar' : 'Invitar miembro'}
        </Button>
      </div>

      {invitando && (
        <Card padding="comfortable">
          <InvitarMiembroForm onDone={() => setInvitando(false)} />
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
        )}
        {!isLoading && (miembros?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              No hay miembros registrados todavía. Sos vos solo.
            </p>
          </div>
        )}
        {!isLoading && miembros && miembros.length > 0 && (
          <div className="divide-y divide-line">
            {miembros.map((m) => (
              <MiembroRow key={m.userRoleId} miembro={m} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MiembroRow({ miembro }: { miembro: MiembroAdmin }): React.ReactElement {
  const remove = useRemoveMiembro();
  const error = remove.error as ApiError | undefined;

  return (
    <div className="px-5 py-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">
            {miembro.nombre} {miembro.apellido}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded bg-accent/15 text-accent">
            {ROL_LABEL[miembro.rol as RolAdminInvitable] ?? miembro.rol}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-ink-mute">
          <span className="flex items-center gap-1">
            <Mail size={11} /> {miembro.email}
          </span>
          <span>
            Último login:{' '}
            {miembro.ultimoLoginAt
              ? new Date(miembro.ultimoLoginAt).toLocaleDateString('es-CL', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'nunca'}
          </span>
        </div>
        {error && (
          <p className="text-xs text-danger mt-1">{error.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`¿Quitar a ${miembro.nombre} ${miembro.apellido} del equipo admin?`)) {
            remove.mutate(miembro.userRoleId);
          }
        }}
        className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
        title="Quitar miembro"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function InvitarMiembroForm({ onDone }: { onDone: () => void }): React.ReactElement {
  const mutation = useInvitarMiembro();
  const error = mutation.error as ApiError | undefined;

  const Schema = z.object({
    email: z.string().email(),
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(100),
    rol: z.enum(ROLES_ADMIN_INVITABLES),
    passwordTemporal: z.string().min(8).max(128),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { rol: 'LIGA_COORDINADOR' as RolAdminInvitable, passwordTemporal: '' },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    await mutation.mutateAsync(vals);
    form.reset();
    onDone();
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <div className="md:col-span-2 flex items-center gap-2">
        <Users size={16} className="text-accent" />
        <CardLabel>Invitar nuevo miembro</CardLabel>
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
      <Input
        label="Email"
        type="email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <div>
        <label className="label">Rol</label>
        <select className="input" {...form.register('rol')}>
          {ROLES_ADMIN_INVITABLES.map((r) => (
            <option key={r} value={r}>
              {ROL_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <Input
          label="Password temporal (mínimo 8 caracteres)"
          type="password"
          {...form.register('passwordTemporal')}
          error={form.formState.errors.passwordTemporal?.message}
        />
        <p className="text-xs text-ink-mute font-serif italic mt-1">
          Pasale al miembro este password por canal seguro. Debería cambiarlo al primer login
          (esa pantalla aún no está construida — MVP).
        </p>
      </div>
      {error && (
        <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
          {error.message}
        </div>
      )}
      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" variant="accent" loading={mutation.isPending}>
          <Plus size={14} /> Invitar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
