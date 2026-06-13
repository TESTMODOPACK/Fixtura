'use client';

import { Activity, ArrowRight, Trophy, UserCog } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useTorneos } from '@/hooks/use-admin';

/**
 * Index global de Designaciones.
 *
 * Las designaciones operan por fecha de un torneo (planilla típica del
 * responsable de árbitros). Esta página lista los torneos activos para
 * entrar al detalle. El catálogo de personal (que es global por tenant)
 * tiene su propia entrada al lado.
 */
export default function DesignacionesIndexPage(): React.ReactElement {
  const { data: torneos, isLoading } = useTorneos();
  const activos = torneos?.filter((t) => t.estado === 'ACTIVO') ?? [];
  const draft = torneos?.filter((t) => t.estado === 'DRAFT') ?? [];

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Designación de personal"
        sub="Asigna árbitros, asistentes y planilleros a los partidos de cada fecha. (Paramédicos y personal de recinto se gestionan desde el catálogo.)"
      >
        <Link href="/admin/personal">
          <Button variant="default" size="sm">
            <UserCog size={14} /> Catálogo de personal
          </Button>
        </Link>
      </PageHead>

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando torneos…</div>
      )}

      {!isLoading && (torneos?.length ?? 0) === 0 && (
        <Card padding="roomy">
          <CardLabel>Sin torneos</CardLabel>
          <p className="font-serif italic text-ink-mute mt-2">
            Crea un torneo y genera su fixture para empezar a designar personal.
          </p>
        </Card>
      )}

      {activos.length > 0 && (
        <>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
            → Activos
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {activos.map((t) => (
              <TorneoCard key={t.id} torneo={t} />
            ))}
          </div>
        </>
      )}

      {draft.length > 0 && (
        <>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
            → En borrador
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {draft.map((t) => (
              <TorneoCard key={t.id} torneo={t} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function TorneoCard({
  torneo,
}: {
  torneo: { id: string; nombre: string; temporadaNombre: string; equiposCount: number; fechasCount: number };
}): React.ReactElement {
  return (
    <Link href={`/admin/torneos/${torneo.id}/designaciones`}>
      <Card padding="comfortable" className="hover:border-accent transition-colors h-full">
        <div className="flex items-start justify-between mb-3">
          <Trophy size={18} className="text-accent" />
        </div>
        <div className="font-display text-2xl text-green-deep tracking-display mb-1">
          {torneo.nombre}
        </div>
        <div className="text-xs text-ink-mute mb-3">
          {torneo.temporadaNombre} · {torneo.equiposCount} equipos · {torneo.fechasCount} fechas
        </div>
        <div className="text-sm text-accent font-semibold flex items-center gap-1">
          <Activity size={14} /> Designar personal <ArrowRight size={14} />
        </div>
      </Card>
    </Link>
  );
}
