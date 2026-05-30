'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Plus,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { EstadoSuscripcion, TenantPlatform } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useReactivarTenant,
  useSuspenderTenant,
  useTenantsPlataforma,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const BADGE_ESTADO: Record<EstadoSuscripcion, string> = {
  TRIAL: 'bg-orange-700/15 text-orange-700',
  ACTIVO: 'bg-green-bright/15 text-green-bright',
  SUSPENDIDO: 'bg-danger/15 text-danger',
  CANCELADO: 'bg-ink-mute/15 text-ink-mute',
};

export default function TenantsPlataformaPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoSuscripcion | 'TODOS'>('TODOS');
  const { data: tenants, isLoading, error } = useTenantsPlataforma({
    search: search || undefined,
    estado: estado === 'TODOS' ? undefined : estado,
  });
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Ligas registradas"
        sub="Listado de todas las ligas y recintos que usan Fixtura. Acciones solo para el administrador del sistema."
      >
        <Link href="/admin/super">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Panel
          </Button>
        </Link>
        <Link href="/admin/super/tenants/nuevo">
          <Button variant="accent" size="sm">
            <Plus size={14} /> Nueva liga
          </Button>
        </Link>
      </PageHead>

      <Card padding="comfortable" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-8">
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Buscar
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <Input
                placeholder="slug o nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Estado
            </label>
            <select
              className="input"
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoSuscripcion | 'TODOS')}
            >
              <option value="TODOS">Todos</option>
              <option value="TRIAL">En prueba</option>
              <option value="ACTIVO">Activas</option>
              <option value="SUSPENDIDO">Suspendidas</option>
              <option value="CANCELADO">Canceladas</option>
            </select>
          </div>
        </div>
      </Card>

      {apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5 mb-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm text-danger">{apiError.message}</div>
          </div>
        </Card>
      )}

      {isLoading && <p className="font-serif italic text-ink-mute">Cargando…</p>}

      {tenants && Array.isArray(tenants) && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 bg-paper-dark border-b border-line">
            <CardLabel>
              {tenants.length} {tenants.length === 1 ? 'liga' : 'ligas'}
            </CardLabel>
          </div>
          {tenants.length === 0 ? (
            <div className="p-12 text-center text-sm text-ink-mute font-serif italic">
              <Building2 size={32} className="mx-auto mb-3 text-line" />
              No hay ligas que coincidan con esos filtros.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {tenants.map((t) => (
                <TenantRow key={t.id} tenant={t} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

function TenantRow({ tenant }: { tenant: TenantPlatform }): React.ReactElement {
  const suspender = useSuspenderTenant(tenant.id);
  const reactivar = useReactivarTenant(tenant.id);

  const onSuspender = async (): Promise<void> => {
    const motivo = window.prompt(
      `Motivo de suspensión para "${tenant.nombre}":`,
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
    if (!window.confirm(`¿Reactivar tenant "${tenant.nombre}"?`)) return;
    try {
      await reactivar.mutateAsync();
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <li className="px-5 py-4 grid grid-cols-12 items-center gap-3">
      <div className="col-span-12 md:col-span-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">{tenant.nombre}</span>
          <span
            className={cn(
              'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded',
              BADGE_ESTADO[tenant.estadoSuscripcion],
            )}
          >
            {tenant.estadoSuscripcion}
          </span>
          {!tenant.isActive && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
              inactivo
            </span>
          )}
        </div>
        <div className="text-xs text-ink-mute mt-0.5">
          <span className="font-mono">{tenant.slug}</span>
          {tenant.customDomain && (
            <>
              {' · '}
              <span className="font-mono">{tenant.customDomain}</span>
            </>
          )}
          {tenant.planNombre && <> · plan {tenant.planNombre}</>}
        </div>
      </div>
      <div className="col-span-6 md:col-span-3 text-xs text-ink-mute">
        <div>
          <span className="font-mono text-sm text-ink">{tenant.torneos ?? 0}</span> torneos
        </div>
        <div>
          <span className="font-mono text-sm text-ink">{tenant.equipos ?? 0}</span> equipos
        </div>
        <div>
          <span className="font-mono text-sm text-ink">{tenant.miembros ?? 0}</span> miembros
        </div>
      </div>
      <div className="col-span-6 md:col-span-4 flex justify-end gap-2 flex-wrap">
        {tenant.estadoSuscripcion === 'SUSPENDIDO' ? (
          <Button size="sm" variant="accent" onClick={onReactivar} disabled={reactivar.isPending}>
            Reactivar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onSuspender} disabled={suspender.isPending}>
            Suspender
          </Button>
        )}
        <Link href={`/admin/super/tenants/${tenant.id}`}>
          <Button size="sm" variant="default">
            Editar
          </Button>
        </Link>
      </div>
    </li>
  );
}
