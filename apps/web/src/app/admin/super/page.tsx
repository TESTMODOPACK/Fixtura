'use client';

import {
  Activity,
  Building2,
  CircleDollarSign,
  FileText,
  Globe,
  Heart,
  ListChecks,
  ShieldAlert,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useMetricasPlataforma, useSystemHealth } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

/**
 * Sprint 23 — Panel principal del super admin.
 * KPIs de plataforma + atajos a Tenants, Planes, Impersonación, Health.
 */
export default function SuperAdminPanel(): React.ReactElement {
  const { data: metricas, isLoading, error } = useMetricasPlataforma();
  const { data: health } = useSystemHealth();
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Super Admin · Panel"
        sub="Vista cross-tenant de LigaPlus. Métricas, salud y acciones globales."
      />

      {/* Atajos */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Link href="/admin/super/tenants">
          <Card padding="comfortable" className="hover:shadow-md transition-shadow cursor-pointer">
            <Building2 size={20} className="text-accent mb-2" />
            <CardLabel>Ligas</CardLabel>
            <div className="text-sm text-ink-mute mt-1">Gestionar ligas y recintos</div>
          </Card>
        </Link>
        <Link href="/admin/super/planes">
          <Card padding="comfortable" className="hover:shadow-md transition-shadow cursor-pointer">
            <CircleDollarSign size={20} className="text-accent mb-2" />
            <CardLabel>Planes</CardLabel>
            <div className="text-sm text-ink-mute mt-1">Catálogo de suscripción</div>
          </Card>
        </Link>
        <Link href="/admin/super/facturas">
          <Card padding="comfortable" className="hover:shadow-md transition-shadow cursor-pointer">
            <FileText size={20} className="text-accent mb-2" />
            <CardLabel>Facturas</CardLabel>
            <div className="text-sm text-ink-mute mt-1">Cobros a las ligas</div>
          </Card>
        </Link>
        <Link href="/admin/super/portal">
          <Card padding="comfortable" className="hover:shadow-md transition-shadow cursor-pointer">
            <Globe size={20} className="text-accent mb-2" />
            <CardLabel>Portal público</CardLabel>
            <div className="text-sm text-ink-mute mt-1">Tenant por defecto</div>
          </Card>
        </Link>
        <Link href="/admin/super/impersonate">
          <Card padding="comfortable" className="hover:shadow-md transition-shadow cursor-pointer">
            <UserCheck size={20} className="text-accent mb-2" />
            <CardLabel>Entrar como…</CardLabel>
            <div className="text-sm text-ink-mute mt-1">Modo soporte</div>
          </Card>
        </Link>
        <Link href="/admin/super/health">
          <Card padding="comfortable" className="hover:shadow-md transition-shadow cursor-pointer">
            <Heart size={20} className="text-accent mb-2" />
            <CardLabel>Estado del sistema</CardLabel>
            <div className="text-sm text-ink-mute mt-1">Servicios y salud</div>
          </Card>
        </Link>
      </div>

      {apiError && (
        <Card padding="roomy" className="mb-5 border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR LAS MÉTRICAS
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Estado rápido del sistema */}
      {health && (
        <Card padding="comfortable" className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardLabel>Estado del sistema</CardLabel>
            <div className="flex items-center gap-4 text-xs">
              <span className={`flex items-center gap-1 ${health.db.ok ? 'text-green-bright' : 'text-danger'}`}>
                <Activity size={12} /> DB {health.db.ok ? 'OK' : 'ERROR'}
                {health.db.latencyMs != null && (
                  <span className="text-ink-mute">({health.db.latencyMs}ms)</span>
                )}
              </span>
              <span className="text-ink-mute">
                uptime {Math.floor(health.uptimeSec / 3600)}h {Math.floor((health.uptimeSec % 3600) / 60)}m
              </span>
              {health.gitSha && (
                <span className="font-mono text-ink-mute">{health.gitSha.slice(0, 8)}</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando métricas…</div>
      )}

      {metricas && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Stat label="Ligas (total)" value={Number(metricas.tenants.total)} icon={Building2} />
            <Stat
              label="Activas"
              value={Number(metricas.tenants.activos)}
              icon={Building2}
              highlight
            />
            <Stat label="En prueba" value={Number(metricas.tenants.trial)} icon={Building2} />
            <Stat
              label="Suspendidas"
              value={Number(metricas.tenants.suspendidos)}
              icon={Building2}
              danger={Number(metricas.tenants.suspendidos) > 0}
            />
            <Stat
              label="Canceladas"
              value={Number(metricas.tenants.cancelados)}
              icon={Building2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Card padding="comfortable">
              <CardLabel>Usuarios</CardLabel>
              <div className="font-display text-4xl text-green-deep tracking-display mt-2">
                {metricas.usuarios.total}
              </div>
              <div className="text-xs text-ink-mute mt-2 flex items-center gap-1">
                <Users size={12} /> {metricas.usuarios.activosUltimoMes} activos último mes
              </div>
            </Card>
            <Card padding="comfortable">
              <CardLabel>Competición (últimos 30d)</CardLabel>
              <div className="mt-3 space-y-1">
                <div className="flex items-baseline gap-2">
                  <Trophy size={14} className="text-accent" />
                  <span className="font-mono text-lg text-ink">
                    {metricas.competicion.torneosActivos}
                  </span>
                  <span className="text-xs text-ink-mute">torneos activos</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <ListChecks size={14} className="text-accent" />
                  <span className="font-mono text-lg text-ink">
                    {metricas.competicion.partidosUltimo30d}
                  </span>
                  <span className="text-xs text-ink-mute">partidos finalizados</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <ListChecks size={14} className="text-accent" />
                  <span className="font-mono text-lg text-ink">
                    {metricas.competicion.actasCerradasUltimo30d}
                  </span>
                  <span className="text-xs text-ink-mute">actas cerradas</span>
                </div>
              </div>
            </Card>
            <Card padding="comfortable" variant="lime">
              <CardLabel tone="mute">Ingresos recurrentes</CardLabel>
              <div className="font-display text-3xl text-green-deep tracking-display mt-2">
                ${(metricas.ingresos.mrr / 1000).toFixed(1)}k
                <span className="text-base text-ink-mute font-mono">/mes</span>
              </div>
              <div className="text-xs text-ink-mute mt-2">
                ARR ≈ ${(metricas.ingresos.arr / 1_000_000).toFixed(2)}M CLP
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  highlight,
  danger,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
  highlight?: boolean;
  danger?: boolean;
}): React.ReactElement {
  return (
    <Card padding="comfortable" variant={highlight ? 'lime' : undefined}>
      <div className="flex items-center justify-between">
        <CardLabel tone="mute">{label}</CardLabel>
        <Icon size={14} className="text-ink-mute" />
      </div>
      <div
        className={`font-display text-3xl tracking-display mt-1 ${
          danger ? 'text-danger' : highlight ? 'text-green-bright' : 'text-green-deep'
        }`}
      >
        {value}
      </div>
    </Card>
  );
}
