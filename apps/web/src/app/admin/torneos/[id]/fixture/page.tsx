'use client';

import { ArrowLeft, CalendarRange, ChevronRight, Lock } from 'lucide-react';
import Link from 'next/link';

import type { FechaAdmin, PartidoAdmin } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useFixtureDetail } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

export default function FixtureAdminPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const torneoId = params.id;
  const { data, isLoading } = useFixtureDetail(torneoId);

  return (
    <>
      <PageHead
        eyebrow={data ? `Torneo · ${data.torneoNombre}` : 'Fixture'}
        title="Fixture completo"
        sub="Cargá actas, editá horarios y canchas, controlá el estado de cada partido."
      >
        <Link href={`/admin/torneos/${torneoId}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al torneo
          </Button>
        </Link>
      </PageHead>

      {isLoading && <div className="font-serif italic text-ink-mute">Cargando fixture...</div>}

      {data && data.fechas.length === 0 && (
        <Card padding="roomy" className="text-center">
          <CalendarRange size={48} className="mx-auto text-line mb-4" />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            FIXTURE VACÍO
          </div>
          <p className="font-serif italic text-ink-mute">
            Volvé al torneo y generá el fixture con Berger.
          </p>
        </Card>
      )}

      {data && data.fechas.length > 0 && (
        <div className="space-y-5">
          {data.fechas.map((fecha) => (
            <FechaCard key={fecha.id} torneoId={torneoId} fecha={fecha} />
          ))}
        </div>
      )}
    </>
  );
}

function FechaCard({ torneoId, fecha }: { torneoId: string; fecha: FechaAdmin }): React.ReactElement {
  const finalizadas = fecha.partidos.filter(
    (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
  ).length;
  const total = fecha.partidos.length;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between">
        <div>
          <CardLabel tone="mute">Fecha {fecha.numero}</CardLabel>
          <div className="font-display text-lg text-green-deep tracking-display">
            {(fecha.etiqueta ?? `Fecha ${fecha.numero}`).toUpperCase()}
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
            fecha.estado === 'FINALIZADA'
              ? 'bg-green-bright/10 text-green-bright'
              : finalizadas > 0
                ? 'bg-accent/10 text-accent'
                : 'bg-ink-mute/10 text-ink-mute',
          )}
        >
          {fecha.estado === 'FINALIZADA' ? 'Finalizada' : `${finalizadas}/${total} jugados`}
        </span>
      </div>
      <div className="divide-y divide-line">
        {fecha.partidos.map((p) => (
          <PartidoRow key={p.id} torneoId={torneoId} partido={p} />
        ))}
      </div>
    </Card>
  );
}

function PartidoRow({
  torneoId,
  partido,
}: {
  torneoId: string;
  partido: PartidoAdmin;
}): React.ReactElement {
  const fecha = partido.fechaHora ? new Date(partido.fechaHora) : null;
  const dia = fecha?.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
  const hora = fecha?.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const cerrada = !!partido.actaCerradaAt;

  return (
    <Link
      href={`/admin/torneos/${torneoId}/partidos/${partido.id}`}
      className="px-5 py-4 grid grid-cols-[auto_1fr_auto_1fr_auto_auto] gap-4 items-center hover:bg-paper transition-colors"
    >
      <div className="text-xs text-ink-mute font-mono text-right w-24">
        <div>{dia ?? 'Sin fecha'}</div>
        <div className="font-semibold text-ink">{hora ?? '—'}</div>
      </div>

      <div className="text-right font-semibold truncate">{partido.equipoLocalNombre}</div>

      <div className="flex items-center gap-2 font-display tracking-display text-xl text-green-deep min-w-[60px] justify-center">
        {partido.estado === 'FINALIZADO' || partido.estado === 'WALKOVER' ? (
          <>
            <span>{partido.golesLocal ?? '-'}</span>
            <span className="text-ink-mute">:</span>
            <span>{partido.golesVisita ?? '-'}</span>
          </>
        ) : (
          <span className="text-ink-mute font-serif italic text-xs">vs</span>
        )}
      </div>

      <div className="font-semibold truncate">{partido.equipoVisitaNombre}</div>

      <div className="flex items-center gap-2 text-xs">
        {cerrada && <Lock size={12} className="text-green-bright" />}
        <span
          className={cn(
            'uppercase tracking-wider font-semibold px-2 py-0.5 rounded text-[10px]',
            partido.estado === 'FINALIZADO' && 'bg-green-bright/10 text-green-bright',
            partido.estado === 'PROGRAMADO' && 'bg-ink-mute/10 text-ink-mute',
            partido.estado === 'EN_CURSO' && 'bg-accent/10 text-accent',
            partido.estado === 'WALKOVER' && 'bg-orange-700/10 text-orange-700',
            (partido.estado === 'SUSPENDIDO_FUERZA_MAYOR' ||
              partido.estado === 'REPROGRAMADO') && 'bg-danger/10 text-danger',
          )}
        >
          {partido.estado.replace('_', ' ')}
        </span>
      </div>

      <ChevronRight size={16} className="text-line" />
    </Link>
  );
}
