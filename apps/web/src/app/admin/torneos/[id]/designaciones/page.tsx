'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Plus,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  ROL_PERSONAL,
  type DesignacionAdmin,
  type EstadoDesignacion,
  type PersonalAdmin,
  type RolPersonal,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useAsignarDesignacion,
  useDesignacionesPorFecha,
  useFixtureDetail,
  usePersonal,
  useRemoveDesignacion,
  useTorneo,
  useUpdateDesignacionEstado,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const ROL_LABEL: Record<RolPersonal, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

const ROL_ABREV: Record<RolPersonal, string> = {
  ARBITRO_PRINCIPAL: 'Principal',
  ARBITRO_ASISTENTE: 'Asistente',
  PLANILLERO: 'Planilla',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

const ESTADO_LABEL: Record<EstadoDesignacion, string> = {
  PROPUESTA: 'Propuesta',
  CONFIRMADA: 'Confirmada',
  RECHAZADA: 'Rechazada',
  ASISTIO: 'Asistió',
  AUSENTE: 'Ausente',
};

const ESTADO_BADGE: Record<EstadoDesignacion, string> = {
  PROPUESTA: 'bg-orange-700/15 text-orange-700',
  CONFIRMADA: 'bg-green-bright/15 text-green-bright',
  RECHAZADA: 'bg-danger/15 text-danger',
  ASISTIO: 'bg-green-deep/15 text-green-deep',
  AUSENTE: 'bg-ink-mute/15 text-ink-mute',
};

export default function DesignacionesPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const torneoId = params.id;
  const { data: torneo } = useTorneo(torneoId);
  const { data: fixture, isLoading: loadingFixture } = useFixtureDetail(torneoId);
  const { data: personal } = usePersonal(true);

  const fechas = fixture?.fechas ?? [];
  const [fechaId, setFechaId] = useState<string | null>(null);

  // Default: primera fecha programada / en curso. Si todas están finalizadas,
  // la primera.
  useEffect(() => {
    if (fechaId) return;
    if (fechas.length === 0) return;
    const pendiente = fechas.find((f) => f.estado === 'PROGRAMADA' || f.estado === 'EN_CURSO');
    const target = pendiente ?? fechas[0];
    if (target) setFechaId(target.id);
  }, [fechas, fechaId]);

  const { data: designaciones, isLoading: loadingDesig } = useDesignacionesPorFecha(
    torneoId,
    fechaId,
  );

  return (
    <>
      <PageHead
        eyebrow={torneo ? `Torneo · ${torneo.nombre}` : 'Designaciones'}
        title="Designaciones de árbitros"
        sub="Asigná árbitros principales, asistentes, planilleros y paramédicos a cada partido de la fecha."
      >
        <Link href={`/admin/torneos/${torneoId}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Torneo
          </Button>
        </Link>
        <Link href="/admin/personal">
          <Button variant="default" size="sm">
            <UserCog size={14} /> Personal
          </Button>
        </Link>
      </PageHead>

      {loadingFixture && (
        <div className="font-serif italic text-ink-mute">Cargando fixture…</div>
      )}

      {!loadingFixture && fechas.length === 0 && (
        <Card padding="roomy">
          <CardLabel>Sin fixture</CardLabel>
          <p className="font-serif italic text-ink-mute mt-2">
            Generá el fixture del torneo antes de designar árbitros.
          </p>
          <Link href={`/admin/torneos/${torneoId}`}>
            <Button variant="accent" size="sm" className="mt-3">
              Ir al torneo
            </Button>
          </Link>
        </Card>
      )}

      {fechas.length > 0 && (
        <>
          {/* Selector de fecha en chips */}
          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <CalendarRange size={14} className="text-ink-mute" />
            {fechas.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFechaId(f.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] font-semibold border transition-colors',
                  fechaId === f.id
                    ? 'bg-green-deep text-chalk border-green-deep'
                    : 'bg-paper text-ink-mute border-line hover:border-green-deep hover:text-ink',
                )}
              >
                F{f.numero}
              </button>
            ))}
          </div>

          {loadingDesig && (
            <div className="font-serif italic text-ink-mute">Cargando designaciones…</div>
          )}

          {!loadingDesig && designaciones && (
            <FechaDesignacionesView
              torneoId={torneoId}
              fechaId={designaciones.fechaId}
              partidos={designaciones.partidos}
              personal={personal ?? []}
            />
          )}
        </>
      )}
    </>
  );
}

function FechaDesignacionesView({
  torneoId,
  fechaId,
  partidos,
  personal,
}: {
  torneoId: string;
  fechaId: string;
  partidos: NonNullable<ReturnType<typeof useDesignacionesPorFecha>['data']>['partidos'];
  personal: PersonalAdmin[];
}): React.ReactElement {
  if (partidos.length === 0) {
    return (
      <Card padding="roomy">
        <div className="font-serif italic text-ink-mute">
          No hay partidos en esta fecha.
        </div>
      </Card>
    );
  }

  // Stats agregados de la fecha
  const totalDesigs = partidos.reduce((acc, p) => acc + p.designaciones.length, 0);
  const confirmadas = partidos.reduce(
    (acc, p) => acc + p.designaciones.filter((d) => d.estado === 'CONFIRMADA' || d.estado === 'ASISTIO').length,
    0,
  );
  const conflictos = partidos.reduce(
    (acc, p) => acc + p.designaciones.filter((d) => d.conflictoDobleBooking).length,
    0,
  );
  const carnetIssues = partidos.reduce(
    (acc, p) => acc + p.designaciones.filter((d) => d.carnetAnfaWarning === 'VENCIDO' || d.carnetAnfaWarning === 'POR_VENCER').length,
    0,
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card padding="comfortable">
          <CardLabel>Designaciones</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {totalDesigs}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Confirmadas</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {confirmadas}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Conflictos</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              conflictos > 0 ? 'text-danger' : 'text-green-bright',
            )}
          >
            {conflictos}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Doble booking</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Carnet ANFA</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              carnetIssues > 0 ? 'text-orange-700' : 'text-green-bright',
            )}
          >
            {carnetIssues}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Por revisar</div>
        </Card>
      </div>

      <div className="space-y-4">
        {partidos.map((p) => (
          <PartidoCard
            key={p.partidoId}
            partido={p}
            torneoId={torneoId}
            fechaId={fechaId}
            personal={personal}
          />
        ))}
      </div>
    </>
  );
}

function PartidoCard({
  partido,
  torneoId,
  fechaId,
  personal,
}: {
  partido: NonNullable<ReturnType<typeof useDesignacionesPorFecha>['data']>['partidos'][number];
  torneoId: string;
  fechaId: string;
  personal: PersonalAdmin[];
}): React.ReactElement {
  const [addingRol, setAddingRol] = useState<RolPersonal | null>(null);
  const asignar = useAsignarDesignacion({ torneoId, fechaId });
  const remove = useRemoveDesignacion({ torneoId, fechaId });
  const updateEstado = useUpdateDesignacionEstado({ torneoId, fechaId });

  const fechaHora = partido.fechaHora ? new Date(partido.fechaHora) : null;
  const hora = fechaHora
    ? fechaHora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : null;
  const dia = fechaHora
    ? fechaHora.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink">
            {partido.equipoLocalNombre} <span className="text-ink-mute">vs</span>{' '}
            {partido.equipoVisitaNombre}
          </div>
          <div className="text-xs text-ink-mute">
            {dia && <span>{dia} · </span>}
            {hora && <span className="font-mono">{hora}</span>}
            {partido.canchaNombre && <span> · {partido.canchaNombre}</span>}
            {!fechaHora && <span className="italic">Sin fecha/hora</span>}
          </div>
        </div>
      </div>

      <div className="divide-y divide-line">
        {ROL_PERSONAL.map((rol) => {
          const desigs = partido.designaciones.filter((d) => d.rolAsignado === rol);
          return (
            <div key={rol} className="px-5 py-3 flex items-start gap-3">
              <div className="w-32 flex-shrink-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                  {ROL_ABREV[rol]}
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                {desigs.length === 0 && (
                  <div className="text-sm text-ink-mute italic font-serif">
                    Sin designar
                  </div>
                )}
                {desigs.map((d) => (
                  <DesignacionRow
                    key={d.id}
                    desig={d}
                    onRemove={() => remove.mutate(d.id)}
                    onUpdateEstado={(estado) => updateEstado.mutate({ id: d.id, estado })}
                  />
                ))}

                {addingRol === rol ? (
                  <AsignarForm
                    personal={personal}
                    rol={rol}
                    yaAsignados={partido.designaciones.map((d) => d.personalId)}
                    onCancel={() => setAddingRol(null)}
                    onSubmit={async (personalId) => {
                      await asignar.mutateAsync({
                        partidoId: partido.partidoId,
                        personalId,
                        rolAsignado: rol,
                      });
                      setAddingRol(null);
                    }}
                    pending={asignar.isPending}
                    error={asignar.error as ApiError | undefined}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingRol(rol)}
                    className="text-xs text-accent hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <Plus size={12} /> Asignar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DesignacionRow({
  desig,
  onRemove,
  onUpdateEstado,
}: {
  desig: DesignacionAdmin;
  onRemove: () => void;
  onUpdateEstado: (estado: EstadoDesignacion) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="font-semibold text-ink">
        {desig.personalNombre} {desig.personalApellido}
      </span>

      <select
        value={desig.estado}
        onChange={(e) => onUpdateEstado(e.target.value as EstadoDesignacion)}
        className={cn(
          'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded border-0 cursor-pointer',
          ESTADO_BADGE[desig.estado],
        )}
      >
        <option value="PROPUESTA">{ESTADO_LABEL.PROPUESTA}</option>
        <option value="CONFIRMADA">{ESTADO_LABEL.CONFIRMADA}</option>
        <option value="RECHAZADA">{ESTADO_LABEL.RECHAZADA}</option>
        <option value="ASISTIO">{ESTADO_LABEL.ASISTIO}</option>
        <option value="AUSENTE">{ESTADO_LABEL.AUSENTE}</option>
      </select>

      {desig.conflictoDobleBooking && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-danger/15 text-danger flex items-center gap-1">
          <AlertTriangle size={11} /> Doble booking
        </span>
      )}

      {desig.carnetAnfaWarning === 'VENCIDO' && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-danger/15 text-danger flex items-center gap-1">
          <AlertTriangle size={11} /> Carnet vencido
        </span>
      )}
      {desig.carnetAnfaWarning === 'POR_VENCER' && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-orange-700/15 text-orange-700 flex items-center gap-1">
          <AlertTriangle size={11} /> Carnet por vencer
        </span>
      )}
      {desig.carnetAnfaWarning === 'OK' && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-green-bright/15 text-green-bright flex items-center gap-1">
          <CheckCircle2 size={11} /> Carnet OK
        </span>
      )}

      {desig.montoPago != null && (
        <span className="text-xs text-ink-mute">
          ${desig.montoPago.toLocaleString('es-CL')}
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
        title="Quitar designación"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AsignarForm({
  personal,
  rol,
  yaAsignados,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  personal: PersonalAdmin[];
  rol: RolPersonal;
  yaAsignados: string[];
  onSubmit: (personalId: string) => Promise<void>;
  onCancel: () => void;
  pending?: boolean;
  error?: ApiError;
}): React.ReactElement {
  const [personalId, setPersonalId] = useState('');

  // Sugerencias: personal cuyo rol base coincide con el rol pedido.
  // Si no hay coincidencias, mostrar todos.
  const candidatos = useMemo(() => {
    const sugeridos = personal.filter((p) => p.rol === rol && !yaAsignados.includes(p.id));
    if (sugeridos.length > 0) return sugeridos;
    return personal.filter((p) => !yaAsignados.includes(p.id));
  }, [personal, rol, yaAsignados]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="input max-w-xs"
        value={personalId}
        onChange={(e) => setPersonalId(e.target.value)}
      >
        <option value="">— elegí persona —</option>
        {candidatos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} {p.apellido}
            {p.rol !== rol ? ` (${ROL_ABREV[p.rol]})` : ''}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="accent"
        size="sm"
        disabled={!personalId || pending}
        onClick={() => personalId && onSubmit(personalId)}
        loading={pending}
      >
        Asignar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        <X size={14} />
      </Button>
      {error && (
        <span className="text-xs text-danger">{error.message}</span>
      )}
    </div>
  );
}
