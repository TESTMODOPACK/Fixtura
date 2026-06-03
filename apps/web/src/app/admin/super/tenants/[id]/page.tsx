'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Pause,
  Play,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { EstadoSuscripcion } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  usePlanesSuscripcion,
  useReactivarTenant,
  useSuspenderTenant,
  useTenantPlataforma,
  useUpdateTenantPlataforma,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const BADGE_ESTADO: Record<EstadoSuscripcion, string> = {
  TRIAL: 'bg-orange-700/15 text-orange-700',
  ACTIVO: 'bg-green-bright/15 text-green-bright',
  SUSPENDIDO: 'bg-danger/15 text-danger',
  CANCELADO: 'bg-ink-mute/15 text-ink-mute',
};

const ESTADO_LABEL: Record<EstadoSuscripcion, string> = {
  TRIAL: 'En prueba',
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  CANCELADO: 'Cancelado',
};

/** Lookup seguro si el backend devuelve un estado fuera del enum. */
function badgeFor(estado: string | null | undefined): string {
  if (estado && estado in BADGE_ESTADO) {
    return BADGE_ESTADO[estado as EstadoSuscripcion];
  }
  return 'bg-ink-mute/15 text-ink-mute';
}
function labelFor(estado: string | null | undefined): string {
  if (estado && estado in ESTADO_LABEL) {
    return ESTADO_LABEL[estado as EstadoSuscripcion];
  }
  return estado ?? 'Desconocido';
}

/**
 * Coerce a valor renderizable. Previene React error #438 (objects are
 * not valid as a React child) cuando el backend devuelve por error un
 * objeto en un campo que esperamos string/number.
 *
 * Caso real: si `feature_flags` en DB está mal tipado (TEXT en lugar
 * de JSONB), TypeORM devuelve string que JSON.parse falla; o si el
 * backend retorna la entity cruda en vez del DTO, vienen objetos
 * anidados como `plan` u `brandingJson`.
 */
function safe(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Object o array — no debería pasar, pero no rompemos el render.
  return '[dato inválido]';
}

/** Parsea featureFlags a Record<string, boolean> independiente de cómo venga. */
function parseFeatureFlags(value: unknown): Record<string, boolean> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, boolean>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, boolean>;
  }
  return {};
}

/** Convierte timestamp (string ISO o Date) a fecha local formateada. */
function fmtDate(value: unknown): string {
  if (!value) return '—';
  try {
    if (typeof value === 'string' || value instanceof Date) {
      return new Date(value).toLocaleString('es-CL');
    }
    return '—';
  } catch {
    return '—';
  }
}

const Schema = z.object({
  nombre: z.string().min(2).max(200),
  customDomain: z.string().max(255).optional().or(z.literal('')),
  planId: z.string().optional(),
  estadoSuscripcion: z.enum(['TRIAL', 'ACTIVO', 'SUSPENDIDO', 'CANCELADO']),
});
type FormData = z.infer<typeof Schema>;

export default function DetalleTenantPage({
  params,
}: {
  // Next.js 14 — params es síncrono. En Next 15 es Promise y hay que usar use().
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const { data: tenant, isLoading, error } = useTenantPlataforma(id);
  const { data: planes } = usePlanesSuscripcion();
  const update = useUpdateTenantPlataforma(id);
  const suspender = useSuspenderTenant(id);
  const reactivar = useReactivarTenant(id);
  const apiError = error as ApiError | undefined;

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: '',
      customDomain: '',
      planId: '',
      estadoSuscripcion: 'TRIAL',
    },
  });

  // Cargar valores en el form cuando llegan los datos.
  useEffect(() => {
    if (tenant) {
      // safe() coerciona a string si el backend manda objeto por error.
      form.reset({
        nombre: safe(tenant.nombre),
        customDomain: safe(tenant.customDomain),
        planId: safe(tenant.planId),
        estadoSuscripcion:
          tenant.estadoSuscripcion && tenant.estadoSuscripcion in ESTADO_LABEL
            ? tenant.estadoSuscripcion
            : 'TRIAL',
      });
    }
  }, [tenant, form]);

  const onSubmit = form.handleSubmit(
    async (data) => {
      try {
        await update.mutateAsync({
          nombre: data.nombre,
          customDomain: data.customDomain || null,
          planId: data.planId || null,
          estadoSuscripcion: data.estadoSuscripcion,
        });
      } catch {
        // MutationCache global muestra toastError; el banner abajo
        // muestra el detalle.
      }
    },
    makeRhfErrorHandler({ formName: 'editar-tenant' }),
  );

  const onSuspender = async (): Promise<void> => {
    const motivo = window.prompt(
      `Motivo de suspensión para "${tenant?.nombre}":`,
      'Falta de pago',
    );
    if (!motivo || motivo.trim().length < 2) return;
    try {
      await suspender.mutateAsync(motivo);
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
    }
  };

  const onReactivar = async (): Promise<void> => {
    if (!window.confirm(`¿Reactivar el tenant "${tenant?.nombre}"?`)) return;
    try {
      await reactivar.mutateAsync();
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHead eyebrow="Plataforma" title="Cargando tenant…" />
        <div className="font-serif italic text-ink-mute">Un momento…</div>
      </>
    );
  }

  if (apiError) {
    return (
      <>
        <PageHead eyebrow="Plataforma" title="Tenant" />
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR EL TENANT
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
              <Link href="/admin/super/tenants">
                <Button variant="default" size="sm" className="mt-3">
                  <ArrowLeft size={14} /> Volver al listado
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (!tenant) {
    return (
      <>
        <PageHead eyebrow="Plataforma" title="Tenant no encontrado" />
        <Card padding="roomy">
          <p className="font-serif italic text-ink-mute">
            No existe un tenant con ese identificador.
          </p>
          <Link href="/admin/super/tenants">
            <Button variant="default" size="sm" className="mt-3">
              <ArrowLeft size={14} /> Volver al listado
            </Button>
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title={safe(tenant.nombre) || '(sin nombre)'}
        sub={`Detalle del tenant · slug: ${safe(tenant.slug)}`}
      >
        <Link href="/admin/super/tenants">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Listado
          </Button>
        </Link>
        {tenant.estadoSuscripcion === 'SUSPENDIDO' ? (
          <Button
            variant="accent"
            size="sm"
            onClick={onReactivar}
            disabled={reactivar.isPending}
          >
            <Play size={14} /> Reactivar
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSuspender}
            disabled={suspender.isPending}
          >
            <Pause size={14} /> Suspender
          </Button>
        )}
      </PageHead>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel tone="mute">Estado</CardLabel>
          <div className="mt-2">
            <span
              className={cn(
                'text-xs uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                badgeFor(tenant.estadoSuscripcion),
              )}
            >
              {labelFor(tenant.estadoSuscripcion)}
            </span>
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">Plan</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mt-1">
            {safe(tenant.planNombre) || 'Sin plan'}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">Torneos</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mt-1">
            {tenant.torneos ?? 0}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">Equipos</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mt-1">
            {tenant.equipos ?? 0}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">Miembros</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mt-1">
            {tenant.miembros ?? 0}
          </div>
        </Card>
      </div>

      {tenant.estadoSuscripcion === 'SUSPENDIDO' && tenant.suspendidoMotivo && (
        <Card
          padding="comfortable"
          className="mb-5 border-2 border-danger/40 bg-danger/5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="text-danger">Tenant suspendido.</strong>{' '}
              <span className="text-ink-mute italic">
                Motivo: {safe(tenant.suspendidoMotivo)}
              </span>
              {tenant.suspendidoAt && (
                <div className="text-xs text-ink-mute mt-1">
                  Suspendido el {fmtDate(tenant.suspendidoAt)}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Formulario de edición */}
      <form onSubmit={onSubmit} className="space-y-5">
        <Card padding="comfortable">
          <CardLabel>Datos editables</CardLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="label">Nombre comercial</label>
              <Input {...form.register('nombre')} />
              {form.formState.errors.nombre && (
                <p className="text-xs text-danger mt-1">
                  {form.formState.errors.nombre.message}
                </p>
              )}
            </div>
            <div>
              <label className="label">Dominio propio (opcional)</label>
              <Input
                placeholder="liganunoa.cl"
                {...form.register('customDomain')}
              />
              <p className="text-xs text-ink-mute italic mt-1">
                Debe apuntar al servidor via CNAME. Vacío = solo subdominio
                fixtura.cl/{safe(tenant.slug)}.
              </p>
            </div>
            <div>
              <label className="label">Plan</label>
              <select className="input" {...form.register('planId')}>
                <option value="">— Sin plan asignado —</option>
                {planes?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} (${p.precioMensualClp.toLocaleString('es-CL')}/mes)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Estado de suscripción</label>
              <select className="input" {...form.register('estadoSuscripcion')}>
                <option value="TRIAL">En prueba</option>
                <option value="ACTIVO">Activo</option>
                <option value="SUSPENDIDO">Suspendido</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <p className="text-xs text-ink-mute italic mt-1">
                Cambiar a &quot;Suspendido&quot; desde acá NO registra motivo. Para suspensión
                trazable usá el botón &quot;Suspender&quot; del encabezado.
              </p>
            </div>
          </div>
        </Card>

        <Card padding="comfortable">
          <CardLabel>Información de solo lectura</CardLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold">
                Identificador
              </div>
              <div className="font-mono mt-1">{safe(tenant.id)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold">
                Slug
              </div>
              <div className="font-mono mt-1">{safe(tenant.slug)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold">
                Tipo
              </div>
              <div className="mt-1">{safe(tenant.tipo)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold">
                Fin del trial
              </div>
              <div className="mt-1">{fmtDate(tenant.trialExpiraAt)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold">
                Creado el
              </div>
              <div className="mt-1">{fmtDate(tenant.createdAt)}</div>
            </div>
          </div>
        </Card>

        {update.error && (
          <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5">
            <div className="text-sm text-danger">
              {safe((update.error as ApiError).message) || 'Error al guardar'}
            </div>
          </Card>
        )}
        {update.isSuccess && (
          <Card padding="comfortable" className="border-2 border-green-bright/40 bg-green-bright/5">
            <div className="flex items-center gap-2 text-sm text-green-bright">
              <CheckCircle2 size={16} /> Cambios guardados correctamente.
            </div>
          </Card>
        )}

        <div className="flex gap-3">
          <Button type="submit" variant="accent" disabled={update.isPending}>
            <Save size={14} /> {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <Link href="/admin/super/tenants">
            <Button type="button" variant="default">
              Volver
            </Button>
          </Link>
        </div>
      </form>

      {/* Banderas de funciones (feature flags) */}
      {(() => {
        const flags = parseFeatureFlags(tenant.featureFlags);
        const entries = Object.entries(flags);
        if (entries.length === 0) return null;
        return (
          <Card padding="comfortable" className="mt-5">
            <CardLabel>Funciones habilitadas (overrides)</CardLabel>
            <div className="flex flex-wrap gap-1 mt-3">
              {entries.map(([k, v]) => (
                <span
                  key={k}
                  className={cn(
                    'text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded',
                    v === true
                      ? 'bg-green-bright/15 text-green-bright'
                      : 'bg-ink-mute/15 text-ink-mute line-through',
                  )}
                >
                  {String(k)}
                </span>
              ))}
            </div>
            <p className="text-xs text-ink-mute italic mt-3">
              Estas funciones sobrescriben las del plan. Para editarlas usá el API.
            </p>
          </Card>
        );
      })()}

      <div className="mt-6 flex items-start gap-2 p-4 rounded-card bg-orange-50 text-orange-900 text-xs">
        <Building2 size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          Recordá: para <strong>ver u operar</strong> los datos internos de esta
          liga (torneos, partidos, actas, etc.) usá el flujo de{' '}
          <Link href="/admin/super/impersonate" className="underline font-semibold">
            Impersonar
          </Link>
          . Toda acción queda registrada en el audit log.
        </div>
      </div>
    </>
  );
}
