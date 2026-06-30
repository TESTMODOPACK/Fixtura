'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Flag,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { PartidoDetalle, TipoIncidencia } from '@fixtura/types';

import { InformePartido } from '@/components/informe-partido';
import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { FormErrorBanner } from '@/components/ui/form-errors';
import { LigaPlusLockup } from '@/components/ui/logo';
import {
  useAddIncidencia,
  useCerrarActa,
  usePartido,
  useRemoveIncidencia,
  useRosterActa,
} from '@/hooks/use-admin';
import { useLogout } from '@/hooks/use-logout';
import {
  useArrancarCentro,
  useFinalizarCentro,
  useMatchCenter,
  usePausarCentro,
  useQuitarGolCentro,
  useReanudarCentro,
  useSegundosCronometro,
  useSiguientePeriodoCentro,
  useSumarGolCentro,
} from '@/hooks/use-match-center';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { useAuthStore } from '@/store/auth-store';

function etiquetaPeriodo(periodo: number): string {
  if (periodo === 1) return '1er tiempo';
  if (periodo === 2) return '2º tiempo';
  if (periodo === 3) return '3er tiempo';
  if (periodo >= 4) return `Período ${periodo}`;
  return '—';
}

export default function PlanilleroPartidoPage({
  params,
}: {
  // Next.js 14 — params es síncrono.
  params: { partidoId: string };
}): React.ReactElement | null {
  const { partidoId } = params;
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useLogout();

  // Mismo guard de hidratación que /personal: esperar a sessionStorage
  // antes de evaluar el token (si no, un refresh expulsa a "/").
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/');
  }, [hydrated, accessToken, router]);

  const { snapshot, conectado, error } = useMatchCenter(partidoId);
  const { data: partido } = usePartido(hydrated && accessToken ? partidoId : null);

  if (!hydrated || !accessToken) return null;

  const cerrada = !!partido?.actaCerradaAt;
  // Un partido suspendido / no jugado / reprogramado no se opera en cancha.
  const inactivo =
    partido?.estado === 'SUSPENDIDO_FUERZA_MAYOR' ||
    partido?.estado === 'NO_JUGADO' ||
    partido?.estado === 'REPROGRAMADO';

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-green-deep text-chalk sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/personal" className="flex items-center gap-1.5 text-sm text-chalk/80 hover:text-chalk">
            <ArrowLeft size={16} /> Mis partidos
          </Link>
          <LigaPlusLockup inverse showTag={false} />
          <button
            type="button"
            onClick={() => logout()}
            className="text-sm text-chalk/80 hover:text-chalk"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">
              → Planilla{partido ? ` · Fecha ${partido.fechaNumero}` : ''}
            </div>
            <h1 className="font-display text-2xl text-green-deep tracking-display leading-tight">
              {snapshot
                ? `${snapshot.equipoLocalNombre} vs ${snapshot.equipoVisitaNombre}`
                : 'Cargando…'}
            </h1>
          </div>
          <span
            className="text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1 shrink-0"
            title={conectado ? 'En vivo' : 'Reconectando — usando polling'}
          >
            {conectado ? (
              <Wifi size={13} className="text-green-bright" />
            ) : (
              <WifiOff size={13} className="text-orange-700" />
            )}
          </span>
        </div>

        {error && (
          <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5">
            <div className="text-sm text-danger">{error}</div>
          </Card>
        )}

        {cerrada && (
          <Card padding="comfortable" className="border-2 border-green-bright/40 bg-green-bright/[0.04]">
            <div className="flex items-center gap-2 text-green-deep font-semibold">
              <Lock size={16} /> Acta cerrada
            </div>
            <p className="text-sm text-ink-mute mt-1">
              El resultado quedó registrado: {partido?.golesLocal} - {partido?.golesVisita}.
              Si necesitas corregirlo, pídele al coordinador que reabra el acta.
            </p>
          </Card>
        )}

        {!snapshot && !error && (
          <Card padding="roomy">
            <p className="font-serif italic text-ink-mute">Cargando partido…</p>
          </Card>
        )}

        {inactivo && !cerrada && (
          <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/[0.03]">
            <div className="flex items-center gap-2 text-danger font-semibold">
              <AlertTriangle size={16} /> Partido no disponible
            </div>
            <p className="text-sm text-ink-mute mt-1">
              Este partido figura como{' '}
              {partido?.estado === 'NO_JUGADO'
                ? 'no jugado'
                : partido?.estado === 'REPROGRAMADO'
                  ? 'reprogramado'
                  : 'suspendido'}
              . No se puede llevar la planilla. Si es un error, avísale al coordinador.
            </p>
          </Card>
        )}

        {snapshot && !cerrada && !inactivo && (
          <>
            <MarcadorCronometro partidoId={partidoId} snapshot={snapshot} />
            {partido && <IncidenciasMovil partidoId={partidoId} partido={partido} snapshot={snapshot} />}
            {partido && (
              <CerrarActaMovil
                partidoId={partidoId}
                golesLocal={snapshot.golesLocal}
                golesVisita={snapshot.golesVisita}
                estadoCentro={snapshot.estado}
              />
            )}
          </>
        )}

        {snapshot && cerrada && partido && partido.incidencias.length > 0 && (
          <IncidenciasList partidoId={partidoId} incidencias={partido.incidencias} soloLectura />
        )}

        {snapshot && !inactivo && (
          <InformePartido
            partidoId={partidoId}
            equipoLocalNombre={snapshot.equipoLocalNombre}
            equipoVisitaNombre={snapshot.equipoVisitaNombre}
          />
        )}
      </main>
    </div>
  );
}

// ─── Marcador + cronómetro + controles ──────────────────────────────
function MarcadorCronometro({
  partidoId,
  snapshot,
}: {
  partidoId: string;
  snapshot: NonNullable<ReturnType<typeof useMatchCenter>['snapshot']>;
}): React.ReactElement {
  const arrancar = useArrancarCentro(partidoId);
  const pausar = usePausarCentro(partidoId);
  const reanudar = useReanudarCentro(partidoId);
  const sumarGol = useSumarGolCentro(partidoId);
  const quitarGol = useQuitarGolCentro(partidoId);
  const siguiente = useSiguientePeriodoCentro(partidoId);
  const finalizar = useFinalizarCentro(partidoId);

  const segundos = useSegundosCronometro(snapshot);
  const cronometro = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
  const enJuego = snapshot.estado === 'EN_VIVO' || snapshot.estado === 'PAUSADO';

  const onErr = (e: unknown): void => toastError((e as ApiError).message ?? 'No se pudo.');

  return (
    <Card padding="comfortable">
      <div className="grid grid-cols-3 items-center gap-2">
        <GolColumna
          nombre={snapshot.equipoLocalNombre}
          goles={snapshot.golesLocal}
          onMas={() => sumarGol.mutate('LOCAL', { onError: onErr })}
          onMenos={() => quitarGol.mutate('LOCAL', { onError: onErr })}
          disabled={sumarGol.isPending || quitarGol.isPending || !enJuego}
        />
        <div className="text-center">
          <div
            className={cn(
              'font-mono text-4xl font-bold tabular-nums',
              snapshot.vencido ? 'text-danger' : 'text-ink',
            )}
          >
            {cronometro}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
            {etiquetaPeriodo(snapshot.periodo)}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider font-semibold inline-block px-2 py-0.5 rounded bg-paper-dark text-ink-mute">
            {snapshot.estado.replace('_', ' ')}
          </div>
        </div>
        <GolColumna
          nombre={snapshot.equipoVisitaNombre}
          goles={snapshot.golesVisita}
          onMas={() => sumarGol.mutate('VISITA', { onError: onErr })}
          onMenos={() => quitarGol.mutate('VISITA', { onError: onErr })}
          disabled={sumarGol.isPending || quitarGol.isPending || !enJuego}
        />
      </div>

      {snapshot.vencido && enJuego && (
        <p className="mt-3 text-center text-[11px] font-serif italic text-danger">
          Tiempo cumplido — pasa al siguiente período o finaliza.
        </p>
      )}

      {/* Controles — botones grandes, táctiles */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {snapshot.estado === 'IDLE' && (
          <Button
            variant="accent"
            className="col-span-2 h-12"
            onClick={() => arrancar.mutate({}, { onError: onErr })}
            loading={arrancar.isPending}
          >
            <Play size={18} /> Iniciar partido
          </Button>
        )}
        {snapshot.estado === 'EN_VIVO' && (
          <Button className="h-12" onClick={() => pausar.mutate(undefined, { onError: onErr })} disabled={pausar.isPending}>
            <Pause size={18} /> Pausar
          </Button>
        )}
        {snapshot.estado === 'PAUSADO' && (
          <>
            <Button variant="accent" className="h-12" onClick={() => reanudar.mutate(undefined, { onError: onErr })} disabled={reanudar.isPending}>
              <Play size={18} /> Reanudar
            </Button>
            <Button className="h-12" onClick={() => siguiente.mutate(undefined, { onError: onErr })} disabled={siguiente.isPending}>
              <RotateCcw size={18} /> Sig. período
            </Button>
          </>
        )}
        {enJuego && (
          <Button
            className={cn('h-12', snapshot.estado === 'EN_VIVO' ? '' : 'col-span-2')}
            onClick={() => {
              if (window.confirm('¿Finalizar el partido? Después tienes que cerrar el acta.')) {
                finalizar.mutate(undefined, { onError: onErr });
              }
            }}
            disabled={finalizar.isPending}
          >
            <Flag size={18} /> Finalizar
          </Button>
        )}
      </div>
      {snapshot.estado === 'IDLE' && (
        <p className="mt-3 text-center text-[11px] font-serif italic text-ink-mute">
          Para iniciar: árbitro y planillero designados, el día agendado y plantel mínimo.
        </p>
      )}
    </Card>
  );
}

function GolColumna({
  nombre,
  goles,
  onMas,
  onMenos,
  disabled,
}: {
  nombre: string;
  goles: number;
  onMas: () => void;
  onMenos: () => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute mb-1 truncate">
        {nombre}
      </div>
      <div className="font-display text-5xl text-green-deep tracking-display tabular-nums">
        {goles}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        <button
          type="button"
          onClick={onMenos}
          disabled={disabled || goles === 0}
          className="h-9 w-9 flex items-center justify-center rounded border border-line text-ink-mute text-xl leading-none disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={onMas}
          disabled={disabled}
          className="h-9 px-3 flex items-center justify-center rounded bg-accent text-chalk text-sm font-semibold leading-none disabled:opacity-50"
        >
          + GOL
        </button>
      </div>
    </div>
  );
}

// ─── Incidencias ────────────────────────────────────────────────────
const TIPOS_RAPIDOS: Array<{ value: TipoIncidencia; label: string }> = [
  { value: 'GOL', label: '⚽ Gol' },
  { value: 'AMARILLA', label: '🟨 Amarilla' },
  { value: 'ROJA', label: '🟥 Roja' },
  { value: 'AMARILLA_ROJA', label: '🟨🟥 Doble amarilla' },
];

function IncidenciasMovil({
  partidoId,
  partido,
  snapshot,
}: {
  partidoId: string;
  partido: PartidoDetalle;
  snapshot: NonNullable<ReturnType<typeof useMatchCenter>['snapshot']>;
}): React.ReactElement {
  const [equipoSel, setEquipoSel] = useState<string>(partido.equipoLocalId);
  const [jugadorId, setJugadorId] = useState<string>('');
  const [tipo, setTipo] = useState<TipoIncidencia>('GOL');
  const [minuto, setMinuto] = useState<string>('');
  const [intentado, setIntentado] = useState(false);
  const addIncidencia = useAddIncidencia(partidoId);
  const addErr = addIncidencia.error as ApiError | undefined;

  // Banner explícito: el jugador es obligatorio. Solo se muestra tras intentar.
  const fieldErrors =
    intentado && !jugadorId
      ? [{ label: 'Jugador', mensaje: 'Elige el jugador.' }]
      : [];

  const minutoSugerido = Math.max(0, snapshot.periodo - 1) * snapshot.minutosPorPeriodo +
    Math.floor((snapshot.segundosTranscurridos ?? 0) / 60);

  const roster = useRosterActa(partidoId);
  const ladoSel =
    roster.data?.local.inscripcionId === equipoSel ? roster.data?.local : roster.data?.visita;
  const yaCertificado = !!roster.data?.presentesCertificadosAt;
  const elegibles = (ladoSel?.jugadores ?? []).filter((j) =>
    yaCertificado ? j.presente : j.habilitado,
  );

  const enJuego = snapshot.estado === 'EN_VIVO' || snapshot.estado === 'PAUSADO';

  const registrar = async (): Promise<void> => {
    setIntentado(true);
    if (!jugadorId) {
      toastWarning('Faltan datos: elige el jugador.');
      return;
    }
    const minutoFinal = minuto.trim() !== '' ? Number(minuto) : minutoSugerido;
    try {
      await addIncidencia.mutateAsync({
        equipoId: equipoSel,
        jugadorInscritoId: jugadorId,
        tipo,
        minuto: Number.isFinite(minutoFinal) ? minutoFinal : null,
      });
      setJugadorId('');
      setMinuto('');
      setIntentado(false);
    } catch (err) {
      toastError((err as ApiError).message ?? 'No se pudo registrar.');
    }
  };

  return (
    <>
      {enJuego && (
        <Card padding="comfortable">
          <CardLabel>Registrar incidencia</CardLabel>
          <FormErrorBanner
            fieldErrors={fieldErrors}
            apiError={addErr}
            validationTitle="Falta un dato:"
            apiTitle="No se pudo registrar la incidencia"
          />
          <div className="flex gap-2 mt-3 mb-3">
            {[
              { id: partido.equipoLocalId, nombre: partido.equipoLocalNombre },
              { id: partido.equipoVisitaId, nombre: partido.equipoVisitaNombre },
            ].map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setEquipoSel(e.id);
                  setJugadorId('');
                }}
                className={cn(
                  'flex-1 px-3 py-2 text-sm font-semibold rounded-card border transition-colors truncate',
                  equipoSel === e.id
                    ? 'bg-green-deep text-chalk border-green-deep'
                    : 'bg-chalk text-ink-mute border-line',
                )}
              >
                {e.nombre}
              </button>
            ))}
          </div>

          <label className="label">Jugador</label>
          <select className="input" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)}>
            <option value="">— elige jugador —</option>
            {elegibles.map((j) => (
              <option key={j.jugadorId} value={j.jugadorId}>
                {j.numeroCamiseta ? `#${j.numeroCamiseta} ` : ''}
                {j.nombre} {j.apellido}
                {j.capitan ? ' (C)' : ''}
              </option>
            ))}
          </select>
          {!roster.isLoading && elegibles.length === 0 && (
            <p className="mt-1 text-[11px] font-serif italic text-ink-mute">
              {yaCertificado
                ? 'No hay presentes certificados en este equipo.'
                : 'Sin jugadores habilitados en la nómina.'}
            </p>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2 mt-3 items-end">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidencia)}>
                {TIPOS_RAPIDOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="label">Min</label>
              <input
                type="number"
                min={0}
                max={150}
                className="input"
                placeholder={String(minutoSugerido)}
                value={minuto}
                onChange={(e) => setMinuto(e.target.value)}
              />
            </div>
          </div>
          <Button variant="accent" className="w-full h-12 mt-3" onClick={registrar} loading={addIncidencia.isPending}>
            <Flag size={16} /> Registrar
          </Button>
          <p className="mt-2 text-[11px] font-serif italic text-ink-mute">
            Cada gol debe quedar con su goleador antes de cerrar el acta.
          </p>
        </Card>
      )}

      {partido.incidencias.length > 0 && (
        <IncidenciasList partidoId={partidoId} incidencias={partido.incidencias} />
      )}
    </>
  );
}

const ICONOS: Record<string, string> = {
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

function IncidenciasList({
  partidoId,
  incidencias,
  soloLectura = false,
}: {
  partidoId: string;
  incidencias: PartidoDetalle['incidencias'];
  soloLectura?: boolean;
}): React.ReactElement {
  const remove = useRemoveIncidencia(partidoId);
  const orden = [...incidencias].sort((a, b) => (b.minuto ?? 0) - (a.minuto ?? 0));

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-3 bg-paper-dark border-b border-line">
        <CardLabel tone="mute">Incidencias · {incidencias.length}</CardLabel>
      </div>
      <div className="divide-y divide-line">
        {orden.map((i) => (
          <div key={i.id} className="px-4 py-2.5 flex items-center gap-3">
            <span className="text-lg w-7 text-center">{ICONOS[i.tipo] ?? '•'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{i.jugadorNombre ?? 'Sin jugador'}</div>
              <div className="text-xs text-ink-mute truncate">
                {i.tipo.replace('_', ' ')} · {i.equipoNombre}
              </div>
            </div>
            <div className="text-xs font-mono text-ink-mute w-9 text-right">
              {i.minuto != null ? `${i.minuto}'` : '—'}
            </div>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => remove.mutate(i.id)}
                className="p-1.5 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
                aria-label="Borrar incidencia"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Cierre del acta ────────────────────────────────────────────────
function CerrarActaMovil({
  partidoId,
  golesLocal,
  golesVisita,
  estadoCentro,
}: {
  partidoId: string;
  golesLocal: number;
  golesVisita: number;
  estadoCentro: string;
}): React.ReactElement {
  const [observaciones, setObservaciones] = useState('');
  // El planillero no tiene en caché las vistas admin del torneo/fixture, así
  // que el torneoId solo serviría para invalidarlas: pasamos '' y el hook
  // igual refresca lo que importa (el partido y las vistas públicas).
  const cerrar = useCerrarActa(partidoId, '');

  // El acta se cierra una vez terminado el tiempo (FINALIZADO_CENTRO). Antes
  // dejamos cargar incidencias pero no cerrar, para no oficializar a medias.
  const listoParaCerrar = estadoCentro === 'FINALIZADO_CENTRO';

  const onCerrar = (): void => {
    if (!window.confirm(`¿Cerrar el acta con ${golesLocal} - ${golesVisita}? El resultado queda oficial.`)) {
      return;
    }
    cerrar.mutate(
      { golesLocal, golesVisita, observaciones: observaciones.trim() || null },
      {
        onSuccess: () => toastSuccess('Acta cerrada. ¡Gracias!'),
        onError: (e) => toastError((e as ApiError).message ?? 'No se pudo cerrar el acta.'),
      },
    );
  };

  return (
    <Card padding="comfortable" className={listoParaCerrar ? 'border-2 border-accent/40' : ''}>
      <CardLabel>Cerrar acta</CardLabel>
      <FormErrorBanner
        apiError={cerrar.error}
        apiTitle="No se pudo cerrar el acta"
      />
      {!listoParaCerrar ? (
        <p className="text-sm text-ink-mute mt-2 font-serif italic">
          Finaliza el partido para poder cerrar el acta con el resultado.
        </p>
      ) : (
        <>
          <div className="text-center my-3">
            <div className="font-display text-3xl text-green-deep tracking-display tabular-nums">
              {golesLocal} - {golesVisita}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-ink-mute mt-1">
              Resultado final (derivado de los goles registrados)
            </div>
          </div>
          <label className="label">Observaciones (opcional)</label>
          <textarea
            className="input min-h-[72px]"
            placeholder="Incidentes, lesiones, reclamos…"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
          <Button variant="accent" className="w-full h-12 mt-3" onClick={onCerrar} loading={cerrar.isPending}>
            <Lock size={16} /> Cerrar acta
          </Button>
        </>
      )}
    </Card>
  );
}
