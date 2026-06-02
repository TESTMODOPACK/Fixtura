'use client';

import {
  ArrowLeft,
  CalendarRange,
  Check,
  type LucideIcon,
  Plus,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ApiError } from '@/lib/api';
import { useEquipos, useTorneo, useUpdateTorneo } from '@/hooks/use-admin';
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
          {/* Si el torneo ya tiene fixture generado, el tab navega DIRECTO
              al detalle (sin pasar por una card intermedia con un botón
              "Ver detalle"). Si todavía no hay fixture, queda como tab
              interno que muestra el botón de generación. */}
          {torneo.fechasCount > 0 ? (
            <Link
              href={`/admin/torneos/${id}/fixture`}
              className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink"
            >
              Fixture <span className="text-ink-mute">({torneo.fechasCount})</span> →
            </Link>
          ) : (
            <TabButton active={tab === 'fixture'} onClick={() => setTab('fixture')}>
              Fixture <span className="text-ink-mute">({torneo.fechasCount})</span>
            </TabButton>
          )}
          <TabButton active={tab === 'configuracion'} onClick={() => setTab('configuracion')}>
            Configuración
          </TabButton>
          <Link
            href={`/admin/torneos/${id}/designaciones`}
            className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink ml-auto"
          >
            Designaciones →
          </Link>
          <Link
            href={`/admin/torneos/${id}/tribunal`}
            className="px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 -mb-px border-transparent text-ink-mute hover:text-ink"
          >
            Tribunal →
          </Link>
        </nav>
      </div>

      {tab === 'equipos' && <EquiposTab torneoId={id} estadoTorneo={torneo.estado} />}
      {tab === 'fixture' && (
        <FixtureTab
          torneoId={id}
          hasFechas={torneo.fechasCount > 0}
          hasEquipos={(equipos?.length ?? 0) >= 2}
        />
      )}
      {tab === 'configuracion' && (
        <ConfiguracionTab torneoId={id} estado={torneo.estado} fechasCount={torneo.fechasCount} />
      )}
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

function EquiposTab({
  torneoId,
  estadoTorneo,
}: {
  torneoId: string;
  estadoTorneo: 'DRAFT' | 'ACTIVO' | 'CERRADO';
}): React.ReactElement {
  const { data: equipos, isLoading } = useEquipos(torneoId);
  const [adding, setAdding] = useState(false);
  // Solo se pueden inscribir equipos en DRAFT. Después el fixture está
  // generado y agregar un equipo rompe la consistencia (cantidad de
  // partidos/fechas). Si el admin necesita agregar, primero debe
  // resetear el fixture.
  const puedeInscribir = estadoTorneo === 'DRAFT';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card padding="none" className="lg:col-span-2 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <CardLabel>Equipos inscritos</CardLabel>
          {puedeInscribir ? (
            <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} /> {adding ? 'Cancelar' : 'Inscribir equipo'}
            </Button>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded bg-ink-mute/10 text-ink-mute">
              Torneo {estadoTorneo.toLowerCase()} · inscripciones cerradas
            </span>
          )}
        </div>

        {adding && puedeInscribir && (
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
  const router = useRouter();

  // Si el torneo YA tiene fixture, redirigimos directo al detalle.
  // Evita la card intermedia "FIXTURE ACTIVO + Ver detalle" que era ruido
  // (el header del tab ya navega derecho, esto es defensivo si llegan acá
  // por deeplink o por estado interno preservado).
  useEffect(() => {
    if (hasFechas) {
      router.replace(`/admin/torneos/${torneoId}/fixture`);
    }
  }, [hasFechas, router, torneoId]);

  if (hasFechas) {
    return (
      <Card padding="roomy">
        <p className="font-serif italic text-ink-mute text-center">Abriendo el fixture…</p>
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

function ConfiguracionTab({
  torneoId,
  estado,
  fechasCount,
}: {
  torneoId: string;
  estado: string;
  fechasCount: number;
}): React.ReactElement {
  const mutation = useUpdateTorneo(torneoId);
  const error = mutation.error as ApiError | undefined;

  const transitions: Record<string, { label: string; next: 'DRAFT' | 'ACTIVO' | 'CERRADO'; disabled?: string }> = {
    DRAFT: {
      label: 'Activar torneo',
      next: 'ACTIVO',
      disabled:
        fechasCount === 0
          ? 'Primero generá el fixture (mínimo 1 fecha)'
          : undefined,
    },
    ACTIVO: { label: 'Cerrar torneo', next: 'CERRADO' },
    CERRADO: { label: 'Reabrir como ACTIVO', next: 'ACTIVO' },
  };

  const transition = transitions[estado];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card padding="roomy">
        <CardLabel>Estado del torneo</CardLabel>
        <div className="font-display text-3xl text-green-deep tracking-display my-2">{estado}</div>
        <p className="font-serif italic text-ink-mute text-sm mb-6">
          {estado === 'DRAFT' &&
            'En borrador. Solo visible desde el panel admin. Activá el torneo para que aparezca en el portal público.'}
          {estado === 'ACTIVO' &&
            'Torneo activo. Visible en el portal público. Los hinchas pueden ver tabla, fixture y rankings.'}
          {estado === 'CERRADO' &&
            'Torneo cerrado. No se aceptan nuevas actas. Sigue visible como histórico en el portal.'}
        </p>

        {transition && (
          <div className="space-y-2">
            <Button
              variant="accent"
              onClick={() => mutation.mutate({ estado: transition.next })}
              loading={mutation.isPending}
              disabled={!!transition.disabled}
            >
              <Check size={14} /> {transition.label}
            </Button>
            {transition.disabled && (
              <p className="text-xs text-ink-mute font-serif italic">{transition.disabled}</p>
            )}
            {error && (
              <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">{error.message}</p>
            )}
          </div>
        )}
      </Card>

      <Card variant="lime" padding="roomy">
        <CardLabel tone="mute">Flujo de estados</CardLabel>
        <div className="space-y-3 mt-3 text-sm text-green-deep/90">
          <div className="flex items-start gap-3">
            <span className="font-display text-lg text-green-deep tracking-display">DRAFT</span>
            <span className="font-serif italic">Configuración inicial: equipos, plantillas, fixture.</span>
          </div>
          <div className="ml-12 text-green-deep">↓</div>
          <div className="flex items-start gap-3">
            <span className="font-display text-lg text-green-deep tracking-display">ACTIVO</span>
            <span className="font-serif italic">El torneo se juega: actas, designaciones, portal público.</span>
          </div>
          <div className="ml-12 text-green-deep">↓</div>
          <div className="flex items-start gap-3">
            <span className="font-display text-lg text-green-deep tracking-display">CERRADO</span>
            <span className="font-serif italic">Histórico. Datos congelados para consulta.</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
