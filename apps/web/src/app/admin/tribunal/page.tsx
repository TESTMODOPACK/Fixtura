'use client';

import { ArrowRight, Gavel, Lock, Trophy } from 'lucide-react';
import Link from 'next/link';

import type { TorneoAdmin } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { cn } from '@/lib/cn';
import { useTorneos } from '@/hooks/use-admin';

/**
 * Index global del Tribunal de disciplina.
 *
 * El tribunal vive bajo cada torneo (sanciones por RUT × torneo). Esta
 * página lista los torneos diferenciados por estado:
 *   - ACTIVO  → operación normal (sanciones automáticas + manuales).
 *   - CERRADO → solo resoluciones de cierre (no hay competencia en curso).
 *   - DRAFT   → sin tribunal (el torneo no arrancó, no hay partidos).
 */
type EstadoTorneo = TorneoAdmin['estado'];

const ESTADO_ORDEN: EstadoTorneo[] = ['ACTIVO', 'CERRADO', 'DRAFT'];

const ESTADO_INFO: Record<
  EstadoTorneo,
  { label: string; sub: string; clickable: boolean; badge: string }
> = {
  ACTIVO: {
    label: 'Activo',
    sub: 'Sanciones automáticas + resoluciones manuales',
    clickable: true,
    badge: 'bg-green-bright/15 text-green-bright',
  },
  CERRADO: {
    label: 'Cerrado',
    sub: 'Solo resoluciones de cierre',
    clickable: true,
    badge: 'bg-ink-mute/15 text-ink-mute',
  },
  DRAFT: {
    label: 'Borrador',
    sub: 'El torneo no arrancó — sin tribunal',
    clickable: false,
    badge: 'bg-orange-700/15 text-orange-700',
  },
};

export default function TribunalIndexPage(): React.ReactElement {
  const { data: torneos, isLoading } = useTorneos();

  const ordenados = (torneos ?? [])
    .slice()
    .sort(
      (a, b) =>
        ESTADO_ORDEN.indexOf(a.estado) - ESTADO_ORDEN.indexOf(b.estado) ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );

  return (
    <>
      <PageHead
        eyebrow="Disciplina"
        title="Tribunal"
        sub="Las sanciones se administran por torneo. Los activos operan normal; los cerrados solo admiten resoluciones de cierre; los borradores no tienen tribunal."
      />

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando torneos…</div>
      )}

      {!isLoading && ordenados.length === 0 && (
        <Card padding="roomy">
          <CardLabel>Sin torneos</CardLabel>
          <p className="font-serif italic text-ink-mute mt-2">
            Creá un torneo primero — el tribunal opera por torneo.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ordenados.map((t) => (
          <TorneoTribunalCard key={t.id} torneo={t} />
        ))}
      </div>
    </>
  );
}

function TorneoTribunalCard({ torneo: t }: { torneo: TorneoAdmin }): React.ReactElement {
  const info = ESTADO_INFO[t.estado];

  const inner = (
    <Card
      padding="comfortable"
      className={cn(
        'h-full',
        info.clickable
          ? 'hover:border-accent transition-colors'
          : 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        {info.clickable ? (
          <Trophy size={18} className="text-accent" />
        ) : (
          <Lock size={18} className="text-ink-mute" />
        )}
        <span
          className={cn(
            'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
            info.badge,
          )}
        >
          {info.label}
        </span>
      </div>
      <div className="font-display text-2xl text-green-deep tracking-display mb-1">
        {t.nombre}
      </div>
      <div className="text-xs text-ink-mute mb-1">
        {t.temporadaNombre} · {t.equiposCount} equipos · {t.fechasCount} fechas
      </div>
      <div className="text-xs text-ink-mute font-serif italic mb-3">{info.sub}</div>
      {info.clickable ? (
        <div className="text-sm text-accent font-semibold flex items-center gap-1">
          <Gavel size={14} />{' '}
          {t.estado === 'CERRADO' ? 'Resoluciones de cierre' : 'Ir al tribunal'}{' '}
          <ArrowRight size={14} />
        </div>
      ) : (
        <div className="text-sm text-ink-mute font-semibold flex items-center gap-1">
          <Lock size={14} /> No disponible
        </div>
      )}
    </Card>
  );

  if (!info.clickable) return inner;
  return <Link href={`/admin/torneos/${t.id}/tribunal`}>{inner}</Link>;
}
