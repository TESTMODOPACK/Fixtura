'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CloudRain,
  Flag,
  Lock,
  MapPin,
  Play,
  Save,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  MOTIVO_SUSPENSION,
  MOTIVO_SUSPENSION_LABEL,
  type MotivoSuspension,
  type TipoIncidencia,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import {
  OfflineActaBanner,
  OfflineSubmitHint,
} from '@/components/offline-acta-banner';
import { PageHead } from '@/components/ui/page-head';
import {
  useAddIncidencia,
  useCanchas,
  useCerrarActa,
  useDeclararWalkover,
  useDesignacionesPorPartido,
  useJugadores,
  useJugadoresBloqueados,
  usePartido,
  useReabrirActa,
  useReactivarPartido,
  useRemoveIncidencia,
  useReprogramarPartido,
  useSuspenderPartido,
  useUpdatePartido,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function PartidoDetallePage({
  params,
}: {
  params: { id: string; partidoId: string };
}): React.ReactElement {
  const { id: torneoId, partidoId } = params;
  const { data: partido, isLoading } = usePartido(partidoId);

  if (isLoading) return <div className="font-serif italic text-ink-mute">Cargando...</div>;
  if (!partido) {
    return (
      <Card padding="roomy">
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          PARTIDO NO ENCONTRADO
        </div>
        <Link href={`/admin/torneos/${torneoId}/fixture`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al fixture
          </Button>
        </Link>
      </Card>
    );
  }

  const cerrada = !!partido.actaCerradaAt;

  return (
    <>
      <PageHead
        eyebrow={`Fecha ${partido.fechaNumero}`}
        title={`${partido.equipoLocalNombre}  vs  ${partido.equipoVisitaNombre}`}
        sub={partido.fechaEtiqueta ?? `Fecha ${partido.fechaNumero}`}
      >
        <Link href={`/admin/torneos/${torneoId}/fixture`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Fixture
          </Button>
        </Link>
        {!partido.actaCerradaAt && (
          <Link href={`/admin/torneos/${torneoId}/partidos/${partidoId}/centro`}>
            <Button variant="accent" size="sm">
              Match Center
            </Button>
          </Link>
        )}
      </PageHead>

      <OfflineActaBanner />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card padding="comfortable" className="lg:col-span-2">
          <CardLabel>Marcador</CardLabel>
          <div className="grid grid-cols-3 gap-4 items-center text-center mt-4">
            <div>
              <div className="font-serif italic text-ink-mute text-sm mb-1">Local</div>
              <div className="font-semibold text-lg truncate">{partido.equipoLocalNombre}</div>
              <div className="font-display text-6xl text-green-deep tracking-display mt-2">
                {partido.golesLocal ?? '—'}
              </div>
            </div>
            <div className="font-display text-3xl text-ink-mute tracking-display">VS</div>
            <div>
              <div className="font-serif italic text-ink-mute text-sm mb-1">Visita</div>
              <div className="font-semibold text-lg truncate">{partido.equipoVisitaNombre}</div>
              <div className="font-display text-6xl text-green-deep tracking-display mt-2">
                {partido.golesVisita ?? '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 text-sm">
            <div className="flex items-center gap-2 text-ink-mute">
              <Calendar size={14} />
              {partido.fechaHora
                ? new Date(partido.fechaHora).toLocaleString('es-CL', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Sin horario'}
            </div>
            <div className="flex items-center gap-2 text-ink-mute">
              <MapPin size={14} />
              {partido.canchaNombre ?? 'Sin cancha'}
            </div>
            <div className="flex items-center gap-2 text-ink-mute">
              {cerrada ? (
                <>
                  <Lock size={14} className="text-green-bright" /> Acta cerrada
                </>
              ) : (
                <>
                  <Unlock size={14} /> {partido.estado.replace('_', ' ').toLowerCase()}
                </>
              )}
            </div>
          </div>
        </Card>

        <ActaSection partido={partido} torneoId={torneoId} />
      </div>

      <EditarPartidoCard partido={partido} torneoId={torneoId} cerrada={cerrada} />

      <SuspensionCard partido={partido} torneoId={torneoId} cerrada={cerrada} />

      <WalkoverCard partido={partido} torneoId={torneoId} cerrada={cerrada} />

      <DesignacionesSection partidoId={partido.id} torneoId={torneoId} />

      {!cerrada && (
        <IncidenciasSection
          partido={partido}
          torneoId={torneoId}
          fechaNumero={partido.fechaNumero}
        />
      )}

      <IncidenciasList partido={partido} cerrada={cerrada} />
    </>
  );
}

// ─── Acta (cerrar / reabrir) ────────────────────────────────────────
function ActaSection({
  partido,
  torneoId,
}: {
  partido: { id: string; golesLocal: number | null; golesVisita: number | null; actaCerradaAt: string | null };
  torneoId: string;
}): React.ReactElement {
  const cerrarActa = useCerrarActa(partido.id, torneoId);
  const reabrirActa = useReabrirActa(partido.id, torneoId);

  const ActaSchema = z.object({
    golesLocal: z.coerce.number().int().min(0).max(99),
    golesVisita: z.coerce.number().int().min(0).max(99),
  });
  type ActaForm = z.infer<typeof ActaSchema>;

  const form = useForm<ActaForm>({
    resolver: zodResolver(ActaSchema),
    defaultValues: { golesLocal: partido.golesLocal ?? 0, golesVisita: partido.golesVisita ?? 0 },
  });

  const cerrada = !!partido.actaCerradaAt;
  const error = (cerrarActa.error ?? reabrirActa.error) as ApiError | undefined;

  if (cerrada) {
    return (
      <Card variant="lime" padding="comfortable">
        <CardLabel tone="mute">Acta</CardLabel>
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">CERRADA</div>
        <p className="text-sm text-green-deep/85 font-serif italic mb-4">
          Cerrada el{' '}
          {new Date(partido.actaCerradaAt!).toLocaleString('es-CL', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          . La tabla y los rankings ya reflejan este resultado.
        </p>
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            const ok = window.confirm(
              'Vas a reabrir el acta de este partido. Esto deshace el cierre pero NO revierte automáticamente las sanciones disciplinarias que ya se contaron ' +
                '(ej. fechas pendientes decrementadas, sanciones nuevas generadas). Si lo necesitás, ajustá esas sanciones manualmente desde el Tribunal. ¿Continuar?',
            );
            if (ok) reabrirActa.mutate();
          }}
          loading={reabrirActa.isPending}
        >
          <Unlock size={14} /> Reabrir
        </Button>
        {error && <p className="text-sm text-danger mt-2">{error.message}</p>}
      </Card>
    );
  }

  return (
    <Card padding="comfortable">
      <CardLabel>Cerrar acta</CardLabel>
      <form
        onSubmit={form.handleSubmit(
          (vals) => cerrarActa.mutate(vals),
          makeRhfErrorHandler({ formName: 'cerrar-acta' }),
        )}
        className="space-y-3 mt-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Goles local"
            type="number"
            min={0}
            max={99}
            {...form.register('golesLocal', { valueAsNumber: true })}
            error={form.formState.errors.golesLocal?.message}
          />
          <Input
            label="Goles visita"
            type="number"
            min={0}
            max={99}
            {...form.register('golesVisita', { valueAsNumber: true })}
            error={form.formState.errors.golesVisita?.message}
          />
        </div>
        <Button type="submit" variant="accent" loading={cerrarActa.isPending} className="w-full">
          <Lock size={14} /> Cerrar acta
        </Button>
        <div className="text-center">
          <OfflineSubmitHint />
        </div>
        {error && (
          <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">{error.message}</p>
        )}
      </form>
    </Card>
  );
}

// ─── Designaciones (árbitros / personal asignado) ───────────────────
function DesignacionesSection({
  partidoId,
  torneoId,
}: {
  partidoId: string;
  torneoId: string;
}): React.ReactElement {
  const { data: designaciones, isLoading } = useDesignacionesPorPartido(partidoId);

  return (
    <Card padding="comfortable" className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <CardLabel>Personal designado</CardLabel>
        <Link
          href={`/admin/torneos/${torneoId}/designaciones`}
          className="text-xs uppercase tracking-[0.18em] font-semibold text-accent hover:underline"
        >
          Gestionar →
        </Link>
      </div>
      {isLoading && (
        <div className="font-serif italic text-ink-mute text-sm">Cargando…</div>
      )}
      {!isLoading && (!designaciones || designaciones.length === 0) && (
        <div className="font-serif italic text-ink-mute text-sm">
          Sin personal designado en este partido todavía.
        </div>
      )}
      {designaciones && designaciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {designaciones.map((d) => {
            const rolAbrev =
              d.rolAsignado === 'ARBITRO_PRINCIPAL'
                ? 'Principal'
                : d.rolAsignado === 'ARBITRO_ASISTENTE'
                  ? 'Asistente'
                  : d.rolAsignado === 'PLANILLERO'
                    ? 'Planilla'
                    : d.rolAsignado;
            const warning =
              d.conflictoDobleBooking ||
              d.carnetAnfaWarning === 'VENCIDO' ||
              d.carnetAnfaWarning === 'POR_VENCER';
            return (
              <div
                key={d.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-card text-sm border',
                  warning ? 'border-danger/40 bg-danger/5' : 'border-line bg-paper',
                )}
              >
                <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-ink-mute">
                  {rolAbrev}
                </span>
                <span className="font-semibold">
                  {d.personalNombre} {d.personalApellido}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
                  · {d.estado.toLowerCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Editar partido (cancha, horario, estado, walkover) ─────────────
function EditarPartidoCard({
  partido,
  torneoId,
  cerrada,
}: {
  partido: {
    id: string;
    canchaId: string | null;
    canchaNombre: string | null;
    fechaHora: string | null;
    estado: string;
  };
  torneoId: string;
  cerrada: boolean;
}): React.ReactElement {
  const mutation = useUpdatePartido(partido.id, torneoId);
  const { data: canchas } = useCanchas(true);

  const Schema = z.object({
    // "" representa "sin cancha del catálogo / texto libre"
    canchaId: z.string().nullable(),
    canchaNombre: z.string().max(100).nullable(),
    fechaHora: z.string().min(1, 'Requerida').nullable(),
    estado: z.enum([
      'PROGRAMADO',
      'EN_CURSO',
      'FINALIZADO',
      'SUSPENDIDO_FUERZA_MAYOR',
      'REPROGRAMADO',
      'WALKOVER',
    ]),
  });
  type Form = z.infer<typeof Schema>;

  // TZ fix — el input datetime-local necesita la hora LOCAL en formato
  // 'YYYY-MM-DDTHH:mm'. partido.fechaHora es un ISO en UTC; .slice(0,16)
  // mostraba la hora UTC (14:00) en vez de la hora real del partido en
  // Chile (10:00). Convertimos con componentes locales.
  const fechaHoraLocal = (() => {
    if (!partido.fechaHora) return '';
    const d = new Date(partido.fechaHora);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      canchaId: partido.canchaId,
      canchaNombre: partido.canchaNombre,
      fechaHora: fechaHoraLocal,
      estado: partido.estado as Form['estado'],
    },
  });

  // Fix select cancha — el <select> se monta con defaultValue=canchaId
  // ANTES de que useCanchas cargue las opciones. Sin la option
  // correspondiente, el browser cae a "Sin cancha" y RHF captura "".
  // Cuando las canchas terminan de cargar, re-aplicamos el valor real.
  useEffect(() => {
    if (canchas && partido.canchaId) {
      form.setValue('canchaId', partido.canchaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canchas]);

  const canchaIdSeleccionada = form.watch('canchaId');
  const error = mutation.error as ApiError | undefined;

  // Sprint 44 — Aviso si el partido vino sin horario o cancha asignados.
  // Suele pasar cuando el generador del fixture corrió en un día sin
  // slots cargados (bug del Sprint 44 ya corregido) — los fixtures
  // generados ANTES del fix quedan así. La opción más rápida es borrar
  // el fixture y regenerar; si solo es 1-2 partidos, asignar a mano acá.
  const faltaConfigPartido =
    !partido.fechaHora || (!partido.canchaId && !partido.canchaNombre);

  return (
    <Card padding="comfortable" className="mb-5">
      <CardLabel>Detalles del partido</CardLabel>
      {faltaConfigPartido && !cerrada && (
        <div className="mb-3 bg-accent/10 border border-accent/30 rounded-card px-3 py-2 text-sm text-ink leading-snug">
          <strong>Este partido quedó sin horario o cancha al generar el
          fixture.</strong>{' '}
          Asignalos manualmente abajo, o borrá el fixture entero desde el
          tab Fixture y regenerá — si configuraste los horarios y canchas
          después, el generador los va a tomar.
        </div>
      )}
      <form
        onSubmit={form.handleSubmit(
          (vals) => {
            const payload: {
              canchaId: string | null;
              canchaNombre?: string | null;
              fechaHora: string | null;
              estado: Form['estado'];
            } = {
              canchaId: vals.canchaId || null,
              fechaHora: vals.fechaHora
                ? new Date(vals.fechaHora).toISOString()
                : null,
              estado: vals.estado,
            };
            // Solo enviamos canchaNombre cuando no hay cancha del catálogo
            // (modo legacy). Si hay canchaId, el backend setea el nombre.
            if (!vals.canchaId) payload.canchaNombre = vals.canchaNombre;
            mutation.mutate(payload);
          },
          makeRhfErrorHandler({ formName: 'partido-detalle' }),
        )}
        className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3"
      >
        <div>
          <label className="label">Cancha</label>
          <select
            className="input"
            {...form.register('canchaId')}
            disabled={cerrada}
          >
            <option value="">— Sin cancha del catálogo —</option>
            {canchas?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {!canchaIdSeleccionada && (
            <input
              type="text"
              placeholder="Nombre libre (legacy)"
              className="input mt-2"
              {...form.register('canchaNombre')}
              disabled={cerrada}
            />
          )}
        </div>
        <Input
          label="Fecha y hora"
          type="datetime-local"
          {...form.register('fechaHora')}
          disabled={cerrada}
        />
        <div>
          <label className="label">Estado</label>
          <select className="input" {...form.register('estado')} disabled={cerrada}>
            <option value="PROGRAMADO">Programado</option>
            <option value="EN_CURSO">En curso</option>
            <option value="FINALIZADO">Finalizado</option>
            <option value="SUSPENDIDO_FUERZA_MAYOR">Suspendido (fuerza mayor)</option>
            <option value="REPROGRAMADO">Reprogramado</option>
            <option value="WALKOVER">Walkover (3-0)</option>
          </select>
        </div>

        <div className="md:col-span-3 flex items-start gap-2 flex-wrap">
          <Button type="submit" variant="accent" size="sm" loading={mutation.isPending} disabled={cerrada}>
            <Save size={14} /> Guardar
          </Button>
          {cerrada && <span className="text-xs text-ink-mute">Reabrí el acta para editar.</span>}
          {error && (
            <span className="text-xs text-danger font-semibold flex-1 min-w-[200px]">
              {error.message}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

// ─── Sprint 8: Suspensión / reprogramación / reactivación ──────────
function SuspensionCard({
  partido,
  torneoId,
  cerrada,
}: {
  partido: {
    id: string;
    estado: string;
    motivoSuspension: MotivoSuspension | null;
    suspendidoAt: string | null;
    observacionesSuspension: string | null;
    fechaHora: string | null;
    canchaId: string | null;
    canchaNombre: string | null;
  };
  torneoId: string;
  cerrada: boolean;
}): React.ReactElement | null {
  const [mode, setMode] = useState<'idle' | 'suspender' | 'reprogramar'>('idle');
  const suspender = useSuspenderPartido(partido.id, torneoId);
  const reprogramar = useReprogramarPartido(partido.id, torneoId);
  const reactivar = useReactivarPartido(partido.id, torneoId);
  const { data: canchas } = useCanchas(true);

  if (cerrada) return null;

  const estaSuspendido = partido.estado === 'SUSPENDIDO_FUERZA_MAYOR';
  const susErr =
    (suspender.error as ApiError | undefined) ??
    (reprogramar.error as ApiError | undefined) ??
    (reactivar.error as ApiError | undefined);

  return (
    <Card padding="comfortable" className="mb-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel className={estaSuspendido ? 'text-danger' : ''}>
          {estaSuspendido ? '⚠ Partido suspendido' : 'Suspensión y reprogramación'}
        </CardLabel>
        <div className="flex items-center gap-2">
          {estaSuspendido && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => reactivar.mutate()}
              loading={reactivar.isPending}
              title="Reactivar el partido (vuelve a PROGRAMADO)"
            >
              <Play size={14} /> Reactivar
            </Button>
          )}
          {!estaSuspendido && mode === 'idle' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode('suspender')}
            >
              <CloudRain size={14} /> Suspender
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === 'reprogramar' ? 'idle' : 'reprogramar')}
          >
            <Calendar size={14} /> {mode === 'reprogramar' ? 'Cancelar' : 'Reprogramar'}
          </Button>
        </div>
      </div>

      {estaSuspendido && partido.motivoSuspension && (
        <div className="mt-3 p-3 rounded-card bg-danger/5 border border-danger/20">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-danger">
                Motivo: {MOTIVO_SUSPENSION_LABEL[partido.motivoSuspension]}
              </div>
              {partido.suspendidoAt && (
                <div className="text-xs text-ink-mute mt-1">
                  Registrado el{' '}
                  <span className="font-mono">
                    {new Date(partido.suspendidoAt).toLocaleString('es-CL')}
                  </span>
                </div>
              )}
              {partido.observacionesSuspension && (
                <div className="text-xs text-ink mt-2 italic">
                  &ldquo;{partido.observacionesSuspension}&rdquo;
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'suspender' && (
        <SuspenderForm
          onSubmit={async (vals) => {
            await suspender.mutateAsync(vals);
            setMode('idle');
          }}
          onCancel={() => setMode('idle')}
          loading={suspender.isPending}
        />
      )}

      {mode === 'reprogramar' && (
        <ReprogramarForm
          partido={partido}
          canchas={canchas ?? []}
          onSubmit={async (vals) => {
            await reprogramar.mutateAsync(vals);
            setMode('idle');
          }}
          onCancel={() => setMode('idle')}
          loading={reprogramar.isPending}
        />
      )}

      {susErr && (
        <div className="mt-3 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
          {susErr.message}
        </div>
      )}
    </Card>
  );
}

function SuspenderForm({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (vals: { motivo: MotivoSuspension; observaciones: string | null }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}): React.ReactElement {
  const [motivo, setMotivo] = useState<MotivoSuspension>('LLUVIA');
  const [observaciones, setObservaciones] = useState('');

  return (
    <div className="mt-4 p-4 rounded-card bg-paper border border-line">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Motivo</label>
          <select
            className="input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoSuspension)}
            disabled={loading}
          >
            {MOTIVO_SUSPENSION.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_SUSPENSION_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Observaciones (opcional)</label>
          <input
            type="text"
            className="input"
            placeholder="Detalle visible para árbitros y delegados"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            disabled={loading}
            maxLength={1000}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={() => onSubmit({ motivo, observaciones: observaciones.trim() || null })}
          loading={loading}
        >
          <CloudRain size={14} /> Confirmar suspensión
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          <X size={14} /> Cancelar
        </Button>
      </div>
    </div>
  );
}

function ReprogramarForm({
  partido,
  canchas,
  onSubmit,
  onCancel,
  loading,
}: {
  partido: { fechaHora: string | null; canchaId: string | null };
  canchas: Array<{ id: string; nombre: string }>;
  onSubmit: (vals: {
    fechaHora: string;
    canchaId: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}): React.ReactElement {
  const [fechaHora, setFechaHora] = useState(
    partido.fechaHora ? partido.fechaHora.slice(0, 16) : '',
  );
  const [canchaId, setCanchaId] = useState<string>(partido.canchaId ?? '');

  return (
    <div className="mt-4 p-4 rounded-card bg-paper border border-line">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Nueva fecha y hora"
          type="datetime-local"
          value={fechaHora}
          onChange={(e) => setFechaHora(e.target.value)}
          disabled={loading}
        />
        <div>
          <label className="label">Cancha</label>
          <select
            className="input"
            value={canchaId}
            onChange={(e) => setCanchaId(e.target.value)}
            disabled={loading}
          >
            <option value="">— Mantener / sin cancha del catálogo —</option>
            {canchas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={() => {
            if (!fechaHora) {
              alert('Tenés que indicar la nueva fecha y hora.');
              return;
            }
            onSubmit({
              fechaHora: new Date(fechaHora).toISOString(),
              canchaId: canchaId || null,
            });
          }}
          loading={loading}
        >
          <Calendar size={14} /> Reprogramar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          <X size={14} /> Cancelar
        </Button>
      </div>
      <p className="text-xs text-ink-mute italic mt-2">
        El sistema valida choque de cancha en la nueva hora. Si hay conflicto, vas a ver el error acá.
      </p>
    </div>
  );
}

// ─── Sprint 9: Declarar walkover (3-0 por inasistencia) ────────────
function WalkoverCard({
  partido,
  torneoId,
  cerrada,
}: {
  partido: {
    id: string;
    estado: string;
    equipoLocalId: string;
    equipoLocalNombre: string;
    equipoVisitaId: string;
    equipoVisitaNombre: string;
    golesLocal: number | null;
    golesVisita: number | null;
    observaciones: string | null;
  };
  torneoId: string;
  cerrada: boolean;
}): React.ReactElement | null {
  const [abierto, setAbierto] = useState(false);
  const [perdedor, setPerdedor] = useState<string>('');
  const [obs, setObs] = useState('');
  const walkover = useDeclararWalkover(partido.id, torneoId);
  const err = walkover.error as ApiError | undefined;
  const esWalkover = partido.estado === 'WALKOVER';

  // Si ya está cerrada por acta normal, no mostramos walkover.
  if (cerrada && !esWalkover) return null;

  return (
    <Card padding="comfortable" className="mb-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel className={esWalkover ? 'text-orange-700' : ''}>
          {esWalkover ? '⚠ Walkover declarado' : 'Walkover (inasistencia)'}
        </CardLabel>
        {!esWalkover && !cerrada && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAbierto((v) => !v)}
          >
            <Flag size={14} /> {abierto ? 'Cancelar' : 'Declarar walkover'}
          </Button>
        )}
      </div>

      {esWalkover && (
        <div className="mt-3 p-3 rounded-card bg-orange-700/5 border border-orange-700/20">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="text-orange-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-orange-700">
                {partido.equipoLocalNombre} {partido.golesLocal} - {partido.golesVisita} {partido.equipoVisitaNombre}
              </div>
              <div className="text-xs text-ink-mute mt-1">
                Marcador automático por inasistencia. El equipo perdedor no suma puntos.
              </div>
              {partido.observaciones && (
                <div className="text-xs text-ink mt-2 italic">
                  &ldquo;{partido.observaciones}&rdquo;
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {abierto && !esWalkover && (
        <div className="mt-4 p-4 rounded-card bg-paper border border-line space-y-3">
          <div>
            <label className="label">Equipo NO presentado (pierde 3-0)</label>
            <select
              className="input"
              value={perdedor}
              onChange={(e) => setPerdedor(e.target.value)}
              disabled={walkover.isPending}
            >
              <option value="">— Elegí el equipo —</option>
              <option value={partido.equipoLocalId}>{partido.equipoLocalNombre}</option>
              <option value={partido.equipoVisitaId}>{partido.equipoVisitaNombre}</option>
            </select>
          </div>
          <div>
            <label className="label">Observaciones (opcional)</label>
            <input
              type="text"
              className="input"
              placeholder="Detalle del incidente (motivo de la inasistencia, hora de llegada, etc.)"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={walkover.isPending}
              maxLength={1000}
            />
          </div>
          <div className="text-xs text-ink-mute italic">
            Esto cierra el acta automáticamente con marcador 3-0. No genera goleadores
            individuales. El tribunal puede aplicar sanción adicional al equipo perdedor.
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              loading={walkover.isPending}
              onClick={() => {
                if (!perdedor) {
                  alert('Tenés que elegir cuál equipo no se presentó.');
                  return;
                }
                if (
                  !window.confirm(
                    `Confirmás declarar walkover 3-0? El acta queda cerrada automáticamente.`,
                  )
                )
                  return;
                walkover.mutate({
                  equipoPerdedorId: perdedor,
                  observaciones: obs.trim() || null,
                });
                setAbierto(false);
              }}
            >
              <Flag size={14} /> Confirmar walkover
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAbierto(false)}
              disabled={walkover.isPending}
            >
              <X size={14} /> Cancelar
            </Button>
          </div>
          {err && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
              {err.message}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Cargar incidencias (goles, tarjetas, MVP) ──────────────────────
function IncidenciasSection({
  partido,
  torneoId,
  fechaNumero,
}: {
  partido: {
    id: string;
    equipoLocalId: string;
    equipoLocalNombre: string;
    equipoVisitaId: string;
    equipoVisitaNombre: string;
  };
  torneoId: string;
  fechaNumero: number;
}): React.ReactElement {
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<string>(partido.equipoLocalId);
  const jugadoresQuery = useJugadores(equipoSeleccionado);
  const bloqueadosQuery = useJugadoresBloqueados(torneoId, fechaNumero);
  const bloqueadosSet = new Set(
    (bloqueadosQuery.data ?? []).map((b) => b.jugadorInscritoId),
  );
  const addIncidencia = useAddIncidencia(partido.id);
  const error = addIncidencia.error as ApiError | undefined;

  const Schema = z.object({
    jugadorInscritoId: z.string().min(1, 'Elegí un jugador'),
    tipo: z.enum(['GOL', 'AUTOGOL', 'AMARILLA', 'ROJA', 'AMARILLA_ROJA', 'ASISTENCIA', 'MVP']),
    minuto: z.coerce.number().int().min(0).max(150).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { jugadorInscritoId: '', tipo: 'GOL', minuto: undefined },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    await addIncidencia.mutateAsync({
      equipoId: equipoSeleccionado,
      jugadorInscritoId: vals.jugadorInscritoId,
      tipo: vals.tipo as TipoIncidencia,
      minuto: vals.minuto ?? null,
    });
    form.reset({ jugadorInscritoId: '', tipo: 'GOL', minuto: undefined });
  };

  return (
    <Card padding="comfortable" className="mb-5">
      <CardLabel>Cargar incidencia</CardLabel>

      <div className="flex gap-2 mt-3 mb-4">
        <button
          type="button"
          onClick={() => setEquipoSeleccionado(partido.equipoLocalId)}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-semibold rounded-card border transition-colors',
            equipoSeleccionado === partido.equipoLocalId
              ? 'bg-green-deep text-chalk border-green-deep'
              : 'bg-chalk text-ink-mute border-line hover:border-green-deep',
          )}
        >
          {partido.equipoLocalNombre}
        </button>
        <button
          type="button"
          onClick={() => setEquipoSeleccionado(partido.equipoVisitaId)}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-semibold rounded-card border transition-colors',
            equipoSeleccionado === partido.equipoVisitaId
              ? 'bg-green-deep text-chalk border-green-deep'
              : 'bg-chalk text-ink-mute border-line hover:border-green-deep',
          )}
        >
          {partido.equipoVisitaNombre}
        </button>
      </div>

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({ formName: 'incidencia-partido' }),
        )}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
      >
        <div className="md:col-span-2">
          <label className="label">Jugador</label>
          <select className="input" {...form.register('jugadorInscritoId')}>
            <option value="">— elegí jugador —</option>
            {jugadoresQuery.data?.map((j) => {
              const sancionado = bloqueadosSet.has(j.id);
              return (
                <option key={j.id} value={j.id}>
                  {sancionado ? '🚫 ' : ''}
                  {j.numeroCamiseta ? `#${j.numeroCamiseta} ` : ''}
                  {j.nombre} {j.apellido}
                  {j.capitan ? ' (C)' : ''}
                  {sancionado ? ' — SANCIONADO' : ''}
                </option>
              );
            })}
          </select>
          {form.formState.errors.jugadorInscritoId && (
            <p className="text-xs text-danger mt-1">{form.formState.errors.jugadorInscritoId.message}</p>
          )}
          {bloqueadosSet.size > 0 && (
            <p className="text-xs text-accent mt-1 font-serif italic">
              ⚠ {bloqueadosSet.size} jugador(es) sancionado(s) no debería(n) estar en cancha esta fecha.
            </p>
          )}
        </div>

        <div>
          <label className="label">Tipo</label>
          <select className="input" {...form.register('tipo')}>
            <option value="GOL">⚽ Gol</option>
            <option value="AUTOGOL">🥲 Autogol</option>
            <option value="ASISTENCIA">🅰️ Asistencia</option>
            <option value="AMARILLA">🟨 Amarilla</option>
            <option value="ROJA">🟥 Roja directa</option>
            <option value="AMARILLA_ROJA">🟨🟥 Doble amarilla</option>
            <option value="MVP">🏆 MVP del partido</option>
          </select>
        </div>

        <Input
          label="Minuto"
          type="number"
          min={0}
          max={150}
          placeholder="Ej. 35"
          {...form.register('minuto', { valueAsNumber: true })}
        />

        <div className="md:col-span-4 flex items-center gap-2 flex-wrap">
          <Button type="submit" variant="accent" size="sm" loading={addIncidencia.isPending}>
            <Flag size={14} /> Agregar
          </Button>
          <OfflineSubmitHint />
          {error && <span className="text-xs text-danger">{error.message}</span>}
        </div>
      </form>
    </Card>
  );
}

// ─── Listado de incidencias del partido ─────────────────────────────
function IncidenciasList({
  partido,
  cerrada,
}: {
  partido: {
    id: string;
    incidencias: Array<{
      id: string;
      tipo: string;
      minuto: number | null;
      jugadorNombre: string | null;
      equipoNombre: string;
    }>;
  };
  cerrada: boolean;
}): React.ReactElement {
  const remove = useRemoveIncidencia(partido.id);

  const ICONS: Record<string, string> = {
    GOL: '⚽',
    AUTOGOL: '🥲',
    ASISTENCIA: '🅰️',
    AMARILLA: '🟨',
    ROJA: '🟥',
    AMARILLA_ROJA: '🟨🟥',
    MVP: '🏆',
    CAMBIO: '🔄',
    LESION: '🚑',
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-paper-dark border-b border-line">
        <CardLabel tone="mute">Incidencias del partido</CardLabel>
        <div className="font-display text-lg text-green-deep tracking-display">
          {partido.incidencias.length} EVENTOS
        </div>
      </div>

      {partido.incidencias.length === 0 && (
        <div className="p-8 text-center text-sm text-ink-mute font-serif italic">
          Todavía no hay incidencias cargadas en este partido.
        </div>
      )}

      {partido.incidencias.length > 0 && (
        <div className="divide-y divide-line">
          {partido.incidencias.map((i) => (
            <div key={i.id} className="px-5 py-3 flex items-center gap-3">
              <span className="text-xl w-8 text-center">{ICONS[i.tipo] ?? '•'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {i.jugadorNombre ?? 'Sin jugador'}
                </div>
                <div className="text-xs text-ink-mute truncate">
                  {i.tipo.replace('_', ' ')} · {i.equipoNombre}
                </div>
              </div>
              <div className="text-xs font-mono text-ink-mute w-12 text-right">
                {i.minuto != null ? `${i.minuto}'` : '—'}
              </div>
              {!cerrada && (
                <button
                  type="button"
                  onClick={() => remove.mutate(i.id)}
                  className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
                  aria-label="Borrar"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
