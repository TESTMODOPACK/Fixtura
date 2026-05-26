'use client';

import {
  ArrowLeft,
  CalendarRange,
  type LucideIcon,
  Plus,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useEquipos, useTorneo } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

import { GenerarFixtureForm } from './_generar-fixture-form';
import { NuevoEquipoForm } from './_nuevo-equipo-form';

type Tab = 'equipos' | 'fixture' | 'configuracion';

export default function TorneoDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const [tab, setTab] = useState<Tab>('equipos');
  const { data: torneo, isLoading } = useTorneo(id);
  const { data: equipos } = useEquipos(id);

  if (isLoading) {
    return (
      <div className="font-serif italic text-ink-mute">Cargando torneo...</div>
    );
  }
  if (!torneo) {
    return (
      <Card padding="roomy">
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          TORNEO NO ENCONTRADO
        </div>
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al listado
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <>
      <PageHead
        eyebrow={`Torneo · ${torneo.temporadaNombre}`}
        title={torneo.nombre}
        sub={`${torneo.tipoFormato.replace('_', ' ')} · ${torneo.ruedas === 2 ? 'ida y vuelta' : 'solo ida'} · ${torneo.puntosVictoria}/${torneo.puntosEmpate}/${torneo.puntosDerrota} pts`}
      >
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver
          </Button>
        </Link>
      </PageHead>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Equipos" value={torneo.equiposCount} icon={Users} />
        <StatCard label="Fechas" value={torneo.fechasCount} icon={CalendarRange} />
        <StatCard label="Estado" value={torneo.estado} icon={Trophy} highlight={torneo.estado === 'ACTIVO'} />
        <StatCard label="Slug" value={torneo.slug} icon={Trophy} mono />
      </div>

      {/* Tabs */}
      <div className="border-b border-line mb-6 -mx-6 md:-mx-10 px-6 md:px-10">
        <nav className="flex gap-1">
          <TabButton active={tab === 'equipos'} onClick={() => setTab('equipos')}>
            Equipos <span className="text-ink-mute">({torneo.equiposCount})</span>
          </TabButton>
          <TabButton active={tab === 'fixture'} onClick={() => setTab('fixture')}>
            Fixture <span className="text-ink-mute">({torneo.fechasCount})</span>
          </TabButton>
          <TabButton active={tab === 'configuracion'} onClick={() => setTab('configuracion')}>
            Configuración
          </TabButton>
        </nav>
      </div>

      {tab === 'equipos' && <EquiposTab torneoId={id} />}
      {tab === 'fixture' && <FixtureTab torneoId={id} hasFechas={torneo.fechasCount > 0} hasEquipos={(equipos?.length ?? 0) >= 2} />}
      {tab === 'configuracion' && <ConfiguracionTab torneoId={id} />}
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
  mono,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  highlight?: boolean;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'border border-line rounded-card p-4',
        highlight ? 'bg-green-lime/20 border-green-bright' : 'bg-chalk',
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-1.5">
        <Icon size={12} /> {label}
      </div>
      <div
        className={cn(
          'text-green-deep tracking-display',
          mono ? 'font-mono text-sm' : 'font-display text-2xl',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-ink-mute hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function EquiposTab({ torneoId }: { torneoId: string }): React.ReactElement {
  const { data: equipos, isLoading } = useEquipos(torneoId);
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card padding="none" className="lg:col-span-2 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <CardLabel>Equipos inscritos</CardLabel>
          <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> {adding ? 'Cancelar' : 'Inscribir equipo'}
          </Button>
        </div>

        {adding && (
          <div className="px-5 py-4 bg-paper-dark border-b border-line">
            <NuevoEquipoForm torneoId={torneoId} onDone={() => setAdding(false)} />
          </div>
        )}

        {isLoading && (
          <div className="p-6 font-serif italic text-ink-mute">Cargando...</div>
        )}

        {equipos && equipos.length === 0 && !adding && (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              Inscribí los primeros equipos para poder generar el fixture.
            </p>
          </div>
        )}

        {equipos && equipos.length > 0 && (
          <div className="divide-y divide-line">
            {equipos.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0 border border-line"
                  style={{ backgroundColor: e.colorPrimario ?? '#888278' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">{e.nombre}</div>
                  <div className="text-xs text-ink-mute font-mono">{e.slug}</div>
                </div>
                <div className="text-xs text-ink-mute">{e.jugadoresCount} jugadores</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card variant="lime" padding="comfortable">
        <CardLabel tone="mute">Recordatorio</CardLabel>
        <div className="font-display text-lg text-green-deep tracking-display mb-2">
          MÍNIMO 2 EQUIPOS
        </div>
        <p className="text-sm text-green-deep/85">
          Para generar el fixture necesitás al menos 2 equipos. Para una liga real, recomendamos
          inscribir todos los equipos antes de generar el fixture — agregar equipos después
          requiere regenerar.
        </p>
      </Card>
    </div>
  );
}

function FixtureTab({
  torneoId,
  hasFechas,
  hasEquipos,
}: {
  torneoId: string;
  hasFechas: boolean;
  hasEquipos: boolean;
}): React.ReactElement {
  if (hasFechas) {
    return (
      <Card padding="roomy">
        <CardLabel>Fixture ya generado</CardLabel>
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          FIXTURE ACTIVO
        </div>
        <p className="font-serif italic text-ink-mute mb-4">
          El fixture ya está generado. La vista de detalle del fixture (partidos, drag&drop)
          llega en Sprint 2B.2.
        </p>
        <p className="text-sm text-ink-mute">
          Mientras tanto, podés verlo público en{' '}
          <Link href="/fixture" className="text-accent hover:underline">
            /fixture
          </Link>
          .
        </p>
      </Card>
    );
  }

  if (!hasEquipos) {
    return (
      <Card padding="roomy" className="text-center">
        <CalendarRange size={36} className="mx-auto text-line mb-3" />
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          INSCRIBÍ EQUIPOS PRIMERO
        </div>
        <p className="font-serif italic text-ink-mute">
          Para generar el fixture necesitás al menos 2 equipos inscritos.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="roomy">
      <CardLabel>Generar fixture automático</CardLabel>
      <div className="font-display text-2xl text-green-deep tracking-display mb-2">
        ALGORITMO BERGER
      </div>
      <p className="font-serif italic text-ink-mute mb-6">
        Round Robin completo con número impar resuelto (un equipo libre por fecha). Las
        restricciones de no-3-locales-seguidos y conflictos de cancha se aplican después en
        modo edición manual.
      </p>
      <GenerarFixtureForm torneoId={torneoId} />
    </Card>
  );
}

function ConfiguracionTab({ torneoId: _ }: { torneoId: string }): React.ReactElement {
  return (
    <Card padding="roomy">
      <CardLabel>Configuración</CardLabel>
      <p className="font-serif italic text-ink-mute">
        Edición de parámetros del torneo, cambio de estado, archivo, etc. — Sprint 2B.2.
      </p>
    </Card>
  );
}
