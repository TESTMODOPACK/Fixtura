'use client';

import { ArrowRight, Plus, Trophy, Users } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHead } from '@/components/ui/page-head';
import { useTorneos } from '@/hooks/use-admin';

export default function AdminDashboardPage(): React.ReactElement {
  const { data: torneos, isLoading } = useTorneos();
  const activos = torneos?.filter((t) => t.estado === 'ACTIVO') ?? [];
  const draft = torneos?.filter((t) => t.estado === 'DRAFT') ?? [];
  const totalEquipos = torneos?.reduce((acc, t) => acc + t.equiposCount, 0) ?? 0;

  return (
    <>
      <PageHead
        eyebrow="Panel principal · Sprint 2B"
        title="Buenas, Admin"
        sub="Configurá tus torneos y empezá a operar tu liga."
      >
        <Link href="/admin/torneos/nuevo">
          <Button variant="accent" size="sm">
            <Plus size={14} /> Nuevo torneo
          </Button>
        </Link>
      </PageHead>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <KpiCard
          label="Torneos activos"
          value={isLoading ? '…' : activos.length}
          sub={`${draft.length} en borrador`}
        />
        <KpiCard
          label="Equipos totales"
          value={isLoading ? '…' : totalEquipos}
          sub="En todos los torneos"
        />
        <KpiCard label="Próx. fecha cubierta" value="—" sub="Esperando designaciones" />
        <KpiCard label="Casos en tribunal" value={0} sub="Sin casos abiertos" variant="dark" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <CardLabel>Torneos</CardLabel>
            <Link href="/admin/torneos" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>

          {isLoading && <div className="font-serif italic text-ink-mute">Cargando torneos...</div>}

          {!isLoading && (!torneos || torneos.length === 0) && (
            <div className="text-center py-8">
              <Trophy size={36} className="mx-auto text-line mb-3" />
              <p className="font-serif italic text-ink-mute mb-4">
                Todavía no tenés ningún torneo. Empezá creando el primero.
              </p>
              <Link href="/admin/torneos/nuevo">
                <Button variant="accent" size="sm">
                  <Plus size={14} /> Crear torneo
                </Button>
              </Link>
            </div>
          )}

          {torneos && torneos.length > 0 && (
            <div className="divide-y divide-line -mx-6">
              {torneos.slice(0, 5).map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/torneos/${t.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-paper transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink truncate">{t.nombre}</div>
                    <div className="text-xs text-ink-mute">
                      {t.temporadaNombre} · {t.equiposCount} equipos · {t.fechasCount} fechas
                    </div>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded ${
                      t.estado === 'ACTIVO'
                        ? 'bg-green-bright/10 text-green-bright'
                        : t.estado === 'DRAFT'
                          ? 'bg-accent/10 text-accent'
                          : 'bg-ink-mute/10 text-ink-mute'
                    }`}
                  >
                    {t.estado}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card variant="lime">
          <CardLabel tone="mute">Quick start</CardLabel>
          <div className="font-display text-xl text-green-deep tracking-display mb-2">
            CHECKLIST INICIAL
          </div>
          <ul className="space-y-2 text-sm text-green-deep/85">
            <li className="flex items-start gap-2">
              <span className="font-mono text-green-deep">1.</span>
              <span>Crear temporada y torneo</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono text-green-deep">2.</span>
              <span>Inscribir equipos (mín. 4)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono text-green-deep">3.</span>
              <span>Cargar plantillas de jugadores</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono text-green-deep">4.</span>
              <span>Generar fixture automático (Berger)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono text-green-deep">5.</span>
              <span>Designar árbitros (Sprint 2C)</span>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
