'use client';

import { ChevronRight, Plus, Shield, Users } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useClubes } from '@/hooks/use-admin';

export default function ClubesPage(): React.ReactElement {
  const { data: clubes, isLoading } = useClubes();

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Clubes"
        sub="Catálogo de clubes (equipos) de la liga. Cada club mantiene su identidad, directiva, plantel por categoría y se inscribe a los torneos que la liga organiza."
      >
        <Link href="/admin/clubes/nuevo">
          <Button variant="accent" size="sm">
            <Plus size={14} /> Nuevo club
          </Button>
        </Link>
      </PageHead>

      {isLoading && (
        <Card padding="roomy">
          <p className="font-serif italic text-ink-mute">Cargando clubes…</p>
        </Card>
      )}

      {!isLoading && (clubes?.length ?? 0) === 0 && (
        <Card padding="roomy" className="text-center">
          <Shield size={36} className="mx-auto text-line mb-3" />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            TODAVÍA NO HAY CLUBES
          </div>
          <p className="font-serif italic text-ink-mute mb-4">
            Cargá el primer club para empezar a inscribirlo en torneos.
          </p>
          <Link href="/admin/clubes/nuevo">
            <Button variant="accent" size="sm">
              <Plus size={14} /> Crear primer club
            </Button>
          </Link>
        </Card>
      )}

      {!isLoading && clubes && clubes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubes.map((c) => (
            <Link
              key={c.id}
              href={`/admin/clubes/${c.id}`}
              className="block"
            >
              <Card
                padding="comfortable"
                className="hover:border-green-deep transition-colors h-full"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-12 h-12 rounded-full flex-shrink-0 border-2 border-line flex items-center justify-center"
                    style={{ backgroundColor: c.colorPrimario ?? '#888278' }}
                  >
                    {c.escudoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.escudoUrl}
                        alt={c.nombre}
                        className="w-full h-full object-contain rounded-full"
                      />
                    ) : (
                      <Shield size={20} className="text-chalk" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardLabel>{c.slug}</CardLabel>
                    <div className="font-display text-lg text-green-deep tracking-display leading-tight truncate">
                      {c.nombre.toUpperCase()}
                    </div>
                  </div>
                  {c.estado === 'INACTIVO' && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
                      Inactivo
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-ink-mute mt-3">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {c.jugadoresCount} jugador{c.jugadoresCount === 1 ? '' : 'es'}
                  </span>
                </div>

                {c.categoriaNombres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {c.categoriaNombres.map((nom, i) => (
                      <span
                        key={`${c.id}-cat-${i}`}
                        className="text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-0.5 rounded bg-green-deep/10 text-green-deep"
                      >
                        {nom}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end mt-3 text-accent text-xs font-semibold">
                  Ver ficha <ChevronRight size={14} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
