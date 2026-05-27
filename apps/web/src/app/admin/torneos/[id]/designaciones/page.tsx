'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarRange,
  CheckCircle2,
  Plus,
  Trash2,
  UserCog,
  Wand2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  ROLES_DESIGNABLES_PARTIDO,
  ROLES_DESIGNABLES_RECINTO,
  SLOTS_POR_ROL,
  type AutoAsignarResult,
  type DesignacionAdmin,
  type DesignacionRecinto,
  type EstadoDesignacion,
  type PersonalAdmin,
  type RolDesignablePartido,
  type RolDesignableRecinto,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useAsignarDesignacion,
  useAsignarRecinto,
  useAutoAsignarDesignaciones,
  useDesignacionesPorFecha,
  useDesignacionesRecinto,
  useFixtureDetail,
  usePersonal,
  useRemoveDesignacion,
  useRemoveRecinto,
  useTorneo,
  useUpdateDesignacionEstado,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const ROL_LABEL: Record<RolDesignablePartido, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Asistente',
  PLANILLERO: 'Planillero',
};

const ROL_ABREV: Record<RolDesignablePartido, string> = {
  ARBITRO_PRINCIPAL: 'Principal',
  ARBITRO_ASISTENTE: 'Asistente',
  PLANILLERO: 'Planilla',
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
        eyebrow={torneo ? `Torneo · ${torneo.nombre}` : 'Designación de personal'}
        title="Designación de personal"
        sub="Asigná árbitros principales, asistentes y planilleros a cada partido. (Paramédicos y personal de recinto se gestionan desde el catálogo.)"
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
          {/* Selector de fecha en chips + acciones */}
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
            {fechaId && (
              <div className="ml-auto">
                <AutoAsignarBoton torneoId={torneoId} fechaId={fechaId} />
              </div>
            )}
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

      {/* Cobertura del recinto: paramédicos y otros para toda la jornada */}
      <RecintoSection torneoId={torneoId} fechaId={fechaId} personal={personal} />
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
  // addingRol guarda el slot id ("ARBITRO_ASISTENTE-1") porque ahora hay
  // múltiples slots por rol (asistente 1 y asistente 2).
  const [addingRol, setAddingRol] = useState<string | null>(null);
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
        {ROLES_DESIGNABLES_PARTIDO.map((rol) => {
          const desigs = partido.designaciones.filter((d) => d.rolAsignado === rol);
          const slotsNecesarios = SLOTS_POR_ROL[rol];
          // Construyo exactamente N "filas" (slots). Las primeras se llenan
          // con designaciones existentes; las restantes muestran "Sin
          // designar" + botón "Asignar".
          const slots: Array<DesignacionAdmin | null> = Array.from(
            { length: Math.max(slotsNecesarios, desigs.length) },
            (_, i) => desigs[i] ?? null,
          );

          return (
            <div key={rol} className="px-5 py-3">
              {slots.map((d, idx) => {
                const slotId = `${rol}-${idx}`;
                const etiqueta =
                  slotsNecesarios > 1
                    ? `${ROL_ABREV[rol]} ${idx + 1}`
                    : ROL_ABREV[rol];
                return (
                  <div key={slotId} className="flex items-start gap-3 mb-1.5 last:mb-0">
                    <div className="w-32 flex-shrink-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                        {etiqueta}
                      </div>
                    </div>

                    <div className="flex-1">
                      {d ? (
                        <DesignacionRow
                          desig={d}
                          onRemove={() => remove.mutate(d.id)}
                          onUpdateEstado={(estado) =>
                            updateEstado.mutate({ id: d.id, estado })
                          }
                        />
                      ) : addingRol === slotId ? (
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
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-ink-mute italic font-serif">
                            Sin designar
                          </span>
                          <button
                            type="button"
                            onClick={() => setAddingRol(slotId)}
                            className="text-xs text-accent hover:underline font-semibold inline-flex items-center gap-1"
                          >
                            <Plus size={12} /> Asignar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
  rol: RolDesignablePartido;
  yaAsignados: string[];
  onSubmit: (personalId: string) => Promise<void>;
  onCancel: () => void;
  pending?: boolean;
  error?: ApiError;
}): React.ReactElement {
  const [personalId, setPersonalId] = useState('');

  // Solo personal con rol designable a partidos. Paramédicos y "otro"
  // son del recinto, no por partido.
  const designables = useMemo(
    () =>
      personal.filter((p) =>
        (ROLES_DESIGNABLES_PARTIDO as readonly string[]).includes(p.rol),
      ),
    [personal],
  );

  // Sugerencias: personal cuyo rol base coincide con el rol pedido.
  // Si no hay coincidencias, mostrar todos los designables.
  const candidatos = useMemo(() => {
    const sugeridos = designables.filter(
      (p) => p.rol === rol && !yaAsignados.includes(p.id),
    );
    if (sugeridos.length > 0) return sugeridos;
    return designables.filter((p) => !yaAsignados.includes(p.id));
  }, [designables, rol, yaAsignados]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="input max-w-xs"
        value={personalId}
        onChange={(e) => setPersonalId(e.target.value)}
      >
        <option value="">— elegí persona —</option>
        {candidatos.map((p) => {
          const rolBase = p.rol as RolDesignablePartido;
          const abrev = ROL_ABREV[rolBase] ?? p.rol;
          return (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.apellido}
              {p.rol !== rol ? ` (${abrev})` : ''}
            </option>
          );
        })}
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

// ─── Auto-asignar (botón + modal de resumen) ─────────────────────────
function AutoAsignarBoton({
  torneoId,
  fechaId,
}: {
  torneoId: string;
  fechaId: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [rolesElegidos, setRolesElegidos] = useState<RolDesignablePartido[]>([
    'ARBITRO_PRINCIPAL',
  ]);
  const [sobreescribir, setSobreescribir] = useState(false);
  const [resultado, setResultado] = useState<AutoAsignarResult | null>(null);
  const mutation = useAutoAsignarDesignaciones({ torneoId, fechaId });
  const error = mutation.error as ApiError | undefined;

  const toggleRol = (rol: RolDesignablePartido): void => {
    setRolesElegidos((prev) =>
      prev.includes(rol) ? prev.filter((r) => r !== rol) : [...prev, rol],
    );
  };

  const ejecutar = async (): Promise<void> => {
    if (rolesElegidos.length === 0) return;
    const res = await mutation.mutateAsync({
      roles: rolesElegidos,
      sobreescribir,
    });
    setResultado(res);
  };

  const cerrar = (): void => {
    setOpen(false);
    setResultado(null);
  };

  if (!open) {
    return (
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <Wand2 size={14} /> Asignar automáticamente
      </Button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <Card padding="roomy" className="w-full max-w-lg">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-accent" />
            <CardLabel>Auto-asignar designaciones</CardLabel>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="p-1 text-ink-mute hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {!resultado && (
          <>
            <p className="text-sm text-ink-mute font-serif italic mb-4">
              El sistema asigna el personal disponible automáticamente. Balancea la carga entre
              árbitros, evita doble booking y excluye carnets vencidos.
            </p>

            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-2">
                → Roles a cubrir
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLES_DESIGNABLES_PARTIDO.map((rol) => {
                  const active = rolesElegidos.includes(rol);
                  return (
                    <button
                      key={rol}
                      type="button"
                      onClick={() => toggleRol(rol)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] font-semibold border transition-colors',
                        active
                          ? 'bg-green-deep text-chalk border-green-deep'
                          : 'bg-paper text-ink-mute border-line hover:border-green-deep hover:text-ink',
                      )}
                    >
                      {ROL_LABEL[rol]}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={sobreescribir}
                onChange={(e) => setSobreescribir(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Sobreescribir</span>: reemplazar designaciones
                existentes con la nueva asignación.{' '}
                <span className="text-ink-mute font-serif italic">
                  (Por defecto solo cubre lo vacío.)
                </span>
              </span>
            </label>

            {error && (
              <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mb-3">
                {error.message}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="accent"
                loading={mutation.isPending}
                disabled={rolesElegidos.length === 0}
                onClick={ejecutar}
              >
                <Wand2 size={14} /> Ejecutar asignación
              </Button>
              <Button type="button" variant="ghost" onClick={cerrar}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {resultado && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <div className="font-display text-3xl text-green-bright tracking-display">
                  {resultado.asignados.length}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold mt-1">
                  Asignados
                </div>
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    'font-display text-3xl tracking-display',
                    resultado.sinDisponibilidad.length > 0
                      ? 'text-danger'
                      : 'text-ink-mute',
                  )}
                >
                  {resultado.sinDisponibilidad.length}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold mt-1">
                  Sin disponibilidad
                </div>
              </div>
              <div className="text-center">
                <div className="font-display text-3xl text-ink-mute tracking-display">
                  {resultado.yaAsignados.length}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold mt-1">
                  Ya cubiertos
                </div>
              </div>
            </div>

            {resultado.asignados.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-green-bright font-semibold mb-2">
                  ✓ Nuevas designaciones
                </div>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {resultado.asignados.map((a, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-green-bright flex-shrink-0" />
                      <span className="font-semibold">
                        {a.personalNombre} {a.personalApellido}
                      </span>
                      <span className="text-xs text-ink-mute">como {ROL_LABEL[a.rolAsignado]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {resultado.sinDisponibilidad.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-danger font-semibold mb-2">
                  ✗ Sin disponibilidad
                </div>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {resultado.sinDisponibilidad.map((s, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-danger">
                      <AlertTriangle size={12} className="flex-shrink-0" />
                      <span className="text-xs">
                        {ROL_LABEL[s.rolAsignado]}: {s.motivo}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button type="button" variant="accent" onClick={cerrar}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Cobertura del recinto (paramédicos y otros por jornada) ────────
function RecintoSection({
  torneoId,
  fechaId,
  personal,
}: {
  torneoId: string;
  fechaId: string;
  personal: PersonalAdmin[];
}): React.ReactElement {
  const { data: designaciones, isLoading } = useDesignacionesRecinto(torneoId, fechaId);
  const asignar = useAsignarRecinto({ torneoId, fechaId });
  const remove = useRemoveRecinto({ torneoId, fechaId });
  const [addingRol, setAddingRol] = useState<RolDesignableRecinto | null>(null);
  const asignarErr = asignar.error as ApiError | undefined;

  // Personal candidato para el recinto (paramédicos y otros del catálogo)
  const candidatos = useMemo(
    () =>
      personal.filter((p) =>
        (ROLES_DESIGNABLES_RECINTO as readonly string[]).includes(p.rol),
      ),
    [personal],
  );

  return (
    <Card padding="none" className="overflow-hidden mt-6">
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center gap-2">
        <Building2 size={16} className="text-accent" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
            COBERTURA DEL RECINTO · ESTA FECHA
          </div>
          <div className="text-xs text-ink-mute font-serif italic">
            Personal que cubre toda la jornada (no un partido específico): paramédicos, utilería,
            seguridad, etc.
          </div>
        </div>
      </div>

      <div className="divide-y divide-line">
        {ROLES_DESIGNABLES_RECINTO.map((rol) => {
          const desigs = (designaciones ?? []).filter((d) => d.rolAsignado === rol);
          const rolLabel =
            rol === 'PARAMEDICO'
              ? 'Paramédico'
              : rol === 'OTRO'
                ? 'Otros (utilería, seguridad)'
                : rol;
          return (
            <div key={rol} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="w-32 flex-shrink-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                    {rolLabel}
                  </div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {isLoading && desigs.length === 0 && (
                    <div className="text-sm text-ink-mute font-serif italic">Cargando…</div>
                  )}
                  {!isLoading && desigs.length === 0 && (
                    <div className="text-sm text-ink-mute italic font-serif">Sin designar</div>
                  )}
                  {desigs.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 flex-wrap text-sm">
                      <span className="font-semibold text-ink">
                        {d.personalNombre} {d.personalApellido}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                          ESTADO_BADGE[d.estado],
                        )}
                      >
                        {ESTADO_LABEL[d.estado]}
                      </span>
                      {d.canchaNombre && (
                        <span className="text-xs text-ink-mute">
                          Cancha: <span className="font-mono text-ink">{d.canchaNombre}</span>
                        </span>
                      )}
                      {d.montoPago != null && (
                        <span className="text-xs text-ink-mute">
                          ${d.montoPago.toLocaleString('es-CL')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Quitar a ${d.personalNombre} ${d.personalApellido} del recinto?`,
                            )
                          ) {
                            remove.mutate(d.id);
                          }
                        }}
                        className="ml-auto p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
                        title="Quitar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  {addingRol === rol ? (
                    <RecintoAsignarForm
                      candidatos={candidatos}
                      yaAsignados={desigs.map((d) => d.personalId)}
                      rolBaseEsperado={rol}
                      onCancel={() => setAddingRol(null)}
                      onSubmit={async (personalId, canchaNombre) => {
                        await asignar.mutateAsync({
                          fechaId,
                          personalId,
                          rolAsignado: rol,
                          canchaNombre: canchaNombre || null,
                        });
                        setAddingRol(null);
                      }}
                      pending={asignar.isPending}
                      error={asignarErr}
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
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RecintoAsignarForm({
  candidatos,
  yaAsignados,
  rolBaseEsperado,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  candidatos: PersonalAdmin[];
  yaAsignados: string[];
  rolBaseEsperado: RolDesignableRecinto;
  onCancel: () => void;
  onSubmit: (personalId: string, canchaNombre: string) => Promise<void>;
  pending?: boolean;
  error?: ApiError;
}): React.ReactElement {
  const [personalId, setPersonalId] = useState('');
  const [canchaNombre, setCanchaNombre] = useState('');

  const sugeridos = useMemo(
    () =>
      candidatos.filter(
        (p) => p.rol === rolBaseEsperado && !yaAsignados.includes(p.id),
      ),
    [candidatos, rolBaseEsperado, yaAsignados],
  );
  const restoCandidatos = useMemo(
    () =>
      candidatos.filter(
        (p) => p.rol !== rolBaseEsperado && !yaAsignados.includes(p.id),
      ),
    [candidatos, rolBaseEsperado, yaAsignados],
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="input max-w-xs"
        value={personalId}
        onChange={(e) => setPersonalId(e.target.value)}
      >
        <option value="">— elegí persona —</option>
        {sugeridos.length > 0 && (
          <optgroup label="Sugeridos por rol base">
            {sugeridos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido}
              </option>
            ))}
          </optgroup>
        )}
        {restoCandidatos.length > 0 && (
          <optgroup label="Otros candidatos">
            {restoCandidatos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido} ({p.rol})
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <input
        className="input max-w-[180px] text-sm"
        type="text"
        placeholder="Cancha (opcional)"
        value={canchaNombre}
        onChange={(e) => setCanchaNombre(e.target.value)}
      />
      <Button
        type="button"
        variant="accent"
        size="sm"
        disabled={!personalId || pending}
        onClick={() => personalId && onSubmit(personalId, canchaNombre.trim())}
        loading={pending}
      >
        Asignar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        <X size={14} />
      </Button>
      {error && <span className="text-xs text-danger">{error.message}</span>}
    </div>
  );
}
