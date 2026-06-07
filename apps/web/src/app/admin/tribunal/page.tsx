'use client';

import { ArrowRight, Gavel, Trophy } from 'lucide-react';
import Link from 'next/link';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useTorneos } from '@/hooks/use-admin';

/**
 * Index global del Tribunal de disciplina.
 *
 * El tribunal vive bajo cada torneo (sanciones por RUT × torneo, regla del
 * anexo). Esta página simplemente lista los torneos para que el operador
 * elija a cuál entrar. Si en el futuro se justifica una vista cross-torneo
 * (ej. "todos los jugadores sancionados en el tenant"), se construye acá.
 */
export default function TribunalIndexPage(): React.ReactElement {
  const { data: torneos, isLoading } = useTorneos();

  // El tribunal opera sobre torneos en curso: solo mostramos los ACTIVOS.
  // Los DRAFT no tienen partidos jugados y los CERRADOS son historia.
  const torneosActivos = (torneos ?? []).filter((t) => t.estado === 'ACTIVO');

  return (
    <>
      <PageHead
        eyebrow="Disciplina"
        title="Tribunal"
        sub="Las sanciones se administran por torneo. Elegí el torneo activo cuyo tribunal querés operar."
      />

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando torneos…</div>
      )}

      {!isLoading && torneosActivos.length === 0 && (
        <Card padding="roomy">
          <CardLabel>Sin torneos activos</CardLabel>
          <p className="font-serif italic text-ink-mute mt-2">
            El tribunal opera sobre torneos en curso. Iniciá un torneo (ponelo
            “En curso”) para administrar sus sanciones.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {torneosActivos.map((t) => (
          <Link key={t.id} href={`/admin/torneos/${t.id}/tribunal`}>
            <Card
              padding="comfortable"
              className="hover:border-accent transition-colors h-full"
            >
              <div className="flex items-start justify-between mb-3">
                <Trophy size={18} className="text-accent" />
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute">
                  {t.estado}
                </span>
              </div>
              <div className="font-display text-2xl text-green-deep tracking-display mb-1">
                {t.nombre}
              </div>
              <div className="text-xs text-ink-mute mb-3">
                {t.temporadaNombre} · {t.equiposCount} equipos · {t.fechasCount} fechas
              </div>
              <div className="text-sm text-accent font-semibold flex items-center gap-1">
                <Gavel size={14} /> Ir al tribunal <ArrowRight size={14} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
