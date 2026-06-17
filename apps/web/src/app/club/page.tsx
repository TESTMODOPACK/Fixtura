'use client';

import { AlertTriangle, ArrowRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';

import { Card, CardLabel } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHead } from '@/components/ui/page-head';
import { ReprogramadaBadge } from '@/components/ui/reprogramada-badge';
import { useDelegadoResumen } from '@/hooks/use-delegado';
import { formatFechaHora } from '@/lib/format';

function clp(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return 'Por confirmar';
  return formatFechaHora(iso);
}

export default function ClubPanelPage(): React.ReactElement {
  const { data, isLoading } = useDelegadoResumen();

  return (
    <div>
      <PageHead
        eyebrow="Mi club"
        title={data?.clubNombre ?? 'Panel del delegado'}
        sub="Resumen de tu club: deudas, sanciones y próximo partido."
      />

      {isLoading && <p className="text-ink-mute">Cargando…</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KpiCard
              label="Deuda pendiente"
              value={clp(data.totalPendiente)}
              sub={`${data.cobrosPendientes} cobro(s) por pagar`}
              variant={data.totalPendiente > 0 ? 'dark' : 'default'}
            />
            <KpiCard
              label="Sanciones activas"
              value={data.sancionesActivas}
              sub="jugadores con fechas pendientes"
            />
            <KpiCard
              label="Cobros pendientes"
              value={data.cobrosPendientes}
              sub="incluye vencidos"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardLabel>Próximo partido</CardLabel>
              {data.proximoPartido ? (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-lg font-semibold text-ink">
                    <CalendarDays size={18} className="text-accent" />
                    {data.proximoPartido.esLocal ? 'vs' : '@'} {data.proximoPartido.rivalNombre}
                  </div>
                  <div className="text-sm text-ink-mute mt-1 flex items-center gap-2 flex-wrap">
                    <span>
                      {fmtFechaHora(data.proximoPartido.fechaHora)}
                      {data.proximoPartido.canchaNombre
                        ? ` · ${data.proximoPartido.canchaNombre}`
                        : ''}
                    </span>
                    {data.proximoPartido.fechaReprogramada && <ReprogramadaBadge />}
                  </div>
                  <div className="text-xs text-ink-mute mt-1">
                    {data.proximoPartido.torneoNombre}
                    {data.proximoPartido.categoriaNombre
                      ? ` · ${data.proximoPartido.categoriaNombre}`
                      : ''}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-mute mt-2 italic">
                  No hay partidos programados próximamente.
                </p>
              )}
            </Card>

            <Card variant={data.totalPendiente > 0 ? 'accent' : 'default'}>
              <CardLabel>Pagos</CardLabel>
              {data.totalPendiente > 0 ? (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-ink">
                    <AlertTriangle size={18} className="text-danger" />
                    <span className="font-semibold">{clp(data.totalPendiente)}</span> pendientes
                  </div>
                  <Link
                    href="/club/finanzas"
                    className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-accent hover:underline"
                  >
                    Ver y pagar deudas <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-ink-mute mt-2 italic">Tu club está al día. ¡Gracias!</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
