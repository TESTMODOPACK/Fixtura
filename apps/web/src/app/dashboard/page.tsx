import { Download, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHead } from '@/components/ui/page-head';

export default function DashboardPage(): React.ReactElement {
  return (
    <>
      <PageHead
        eyebrow="Panel principal · v0.1 placeholder"
        title="Buenas, Admin"
        sub="Fase 0 lista. Esto es el shell del dashboard. Las KPIs reales llegan en Sprint 1."
      >
        <Button variant="default" size="sm">
          <Download size={14} /> Boletín
        </Button>
        <Button variant="accent" size="sm">
          <Plus size={14} /> Nuevo torneo
        </Button>
      </PageHead>

      {/* KPIs placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <KpiCard label="Equipos activos" value="—" sub="Sin datos aún" />
        <KpiCard label="Próx. fecha cubierta" value="—" sub="0 / 0 designaciones" />
        <KpiCard label="Ingresos del mes" value="—" sub="Esperando Sprint 6" />
        <KpiCard label="Casos en tribunal" value="0" sub="Sin casos abiertos" variant="dark" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardLabel>Próxima fecha</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            FECHA 1 · POR DEFINIR
          </div>
          <p className="font-serif italic text-ink-mute">
            Cuando crees tu primer torneo en Sprint 3, este bloque mostrará los partidos de la
            próxima fecha con cobertura de designaciones.
          </p>
        </Card>

        <Card variant="lime">
          <CardLabel tone="mute">Sistema</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            FASE 0 LISTA
          </div>
          <p className="text-sm text-green-deep/80 leading-relaxed">
            Auth, multi-tenant + RLS, observabilidad y diseño base. El producto real empieza
            en Sprint 1 (identidad y onboarding).
          </p>
        </Card>
      </div>
    </>
  );
}
