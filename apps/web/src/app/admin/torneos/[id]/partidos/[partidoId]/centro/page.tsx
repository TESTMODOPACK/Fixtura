'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Flag,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { TipoIncidencia } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { FormErrorBanner } from '@/components/ui/form-errors';
import { PageHead } from '@/components/ui/page-head';
import { ReprogramadaBadge } from '@/components/ui/reprogramada-badge';
import {
  useAddIncidencia,
  usePartido,
  useRemoveIncidencia,
  useRosterActa,
} from '@/hooks/use-admin';
import {
  useAjustarTiempoAgregado,
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
import { toastError, toastWarning } from '@/lib/toast';

/** Etiqueta humana del período del partido. */
function etiquetaPeriodo(periodo: number): string {
  if (periodo === 1) return '1er tiempo';
  if (periodo === 2) return '2º tiempo';
  if (periodo === 3) return '3er tiempo';
  if (periodo >= 4) return `Período ${periodo}`;
  return '—';
}

export default function CentroPage({
  params,
}: {
  // Next.js 14 — params es síncrono.
  params: { id: string; partidoId: string };
}): React.ReactElement {
  const { id: torneoId, partidoId } = params;
  const { snapshot, conectado, error } = useMatchCenter(partidoId);
  const { data: partido } = usePartido(partidoId);
  const arrancar = useArrancarCentro(partidoId);
  const pausar = usePausarCentro(partidoId);
  const reanudar = useReanudarCentro(partidoId);
  const sumarGol = useSumarGolCentro(partidoId);
  const quitarGol = useQuitarGolCentro(partidoId);
  const siguientePeriodo = useSiguientePeriodoCentro(partidoId);
  const finalizar = useFinalizarCentro(partidoId);
  const agregado = useAjustarTiempoAgregado(partidoId);

  // Cronómetro que corre en el cliente (sembrado del servidor). Avanza
  // fluido aunque el WS venga irregular y no salta al tocar el marcador.
  const segundos = useSegundosCronometro(snapshot);
  const minutosVisibles = Math.floor(segundos / 60);
  const segundosVisibles = segundos % 60;
  const cronometro = `${String(minutosVisibles).padStart(2, '0')}:${String(segundosVisibles).padStart(2, '0')}`;

  // El marcador y las incidencias solo se cargan con el partido en juego
  // (no antes de iniciar ni después de finalizar el centro).
  const enJuego =
    snapshot?.estado === 'EN_VIVO' || snapshot?.estado === 'PAUSADO';

  // Minuto de juego acumulado (sirve para autocompletar el minuto de la
  // incidencia): períodos completos previos + minutos del período actual.
  const minutoJuego = snapshot
    ? Math.max(0, snapshot.periodo - 1) * snapshot.minutosPorPeriodo +
      minutosVisibles
    : 0;

  return (
    <>
      <PageHead
        eyebrow={partido ? `Match Center · Fecha ${partido.fechaNumero}` : 'Match Center'}
        title={snapshot ? `${snapshot.equipoLocalNombre} vs ${snapshot.equipoVisitaNombre}` : 'Cargando…'}
        sub="Panel del cronista — marcador y cronómetro en vivo."
      >
        <Link href={`/admin/torneos/${torneoId}/partidos/${partidoId}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Detalle partido
          </Button>
        </Link>
        {partido?.fechaReprogramada && <ReprogramadaBadge />}
        <span
          className="text-xs uppercase tracking-[0.18em] font-semibold flex items-center gap-1"
          title={conectado ? 'WebSocket conectado' : 'Sin conexión — usando polling'}
        >
          {conectado ? (
            <Wifi size={14} className="text-green-bright" />
          ) : (
            <WifiOff size={14} className="text-orange-700" />
          )}
          <span className={conectado ? 'text-green-bright' : 'text-orange-700'}>
            {conectado ? 'En vivo' : 'Polling'}
          </span>
        </span>
      </PageHead>

      {error && (
        <Card padding="comfortable" className="mb-5 border-2 border-danger/40 bg-danger/5">
          <div className="text-sm text-danger">{error}</div>
        </Card>
      )}

      {!snapshot && !error && (
        <Card padding="roomy">
          <p className="font-serif italic text-ink-mute">Cargando snapshot…</p>
        </Card>
      )}

      {snapshot && (
        <>
          {/* Marcador principal */}
          <Card padding="roomy" className="mb-5">
            <div className="grid grid-cols-3 items-center gap-4">
              <EquipoColumn
                nombre={snapshot.equipoLocalNombre}
                goles={snapshot.golesLocal}
                onMas={() => sumarGol.mutate('LOCAL')}
                onMenos={() => quitarGol.mutate('LOCAL')}
                disabled={sumarGol.isPending || quitarGol.isPending || !enJuego}
              />
              <div className="text-center">
                <div
                  className={cn(
                    'font-mono text-6xl md:text-7xl font-bold tabular-nums',
                    snapshot.vencido ? 'text-danger' : 'text-ink',
                  )}
                >
                  {cronometro}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute">
                  {etiquetaPeriodo(snapshot.periodo)} · {snapshot.minutosPorPeriodo}
                  {snapshot.minutosAgregados > 0 ? ` +${snapshot.minutosAgregados}` : ''} min
                  {snapshot.minutosEntretiempo > 0 && (
                    <span className="ml-2 text-ink-mute/70">
                      · descanso {snapshot.minutosEntretiempo}&nbsp;min
                    </span>
                  )}
                </div>
                {enJuego && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
                      Tiempo agregado
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        agregado.mutate(Math.max(0, snapshot.minutosAgregados - 1))
                      }
                      disabled={agregado.isPending || snapshot.minutosAgregados <= 0}
                      className="h-6 w-6 flex items-center justify-center rounded border border-line text-ink-mute text-base leading-none disabled:opacity-30 hover:bg-paper-dark"
                      aria-label="Quitar un minuto de tiempo agregado"
                    >
                      −
                    </button>
                    <span className="font-mono text-sm w-9 text-center tabular-nums">
                      {snapshot.minutosAgregados}&apos;
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        agregado.mutate(Math.min(30, snapshot.minutosAgregados + 1))
                      }
                      disabled={agregado.isPending || snapshot.minutosAgregados >= 30}
                      className="h-6 w-6 flex items-center justify-center rounded border border-line text-ink-mute text-base leading-none disabled:opacity-30 hover:bg-paper-dark"
                      aria-label="Agregar un minuto"
                    >
                      +
                    </button>
                  </div>
                )}
                <div className="mt-2 text-[10px] uppercase tracking-wider font-semibold inline-block px-2 py-0.5 rounded bg-paper-dark text-ink-mute">
                  {snapshot.estado.replace('_', ' ')}
                </div>
                {snapshot.vencido && enJuego && (
                  <div className="mt-2 text-[11px] font-serif italic text-danger">
                    Tiempo cumplido — pasa al siguiente período o finaliza.
                  </div>
                )}
              </div>
              <EquipoColumn
                nombre={snapshot.equipoVisitaNombre}
                goles={snapshot.golesVisita}
                onMas={() => sumarGol.mutate('VISITA')}
                onMenos={() => quitarGol.mutate('VISITA')}
                disabled={sumarGol.isPending || quitarGol.isPending || !enJuego}
              />
            </div>
            {snapshot.estado === 'IDLE' && (
              <p className="mt-4 text-center text-xs font-serif italic text-ink-mute">
                Inicia el partido para cargar goles e incidencias.
              </p>
            )}
          </Card>

          {/* Controles cronómetro */}
          <Card padding="roomy">
            <CardLabel>Controles del cronómetro</CardLabel>
            <div className="mt-4 flex flex-wrap gap-3">
              {snapshot.estado === 'IDLE' && (
                <div className="flex flex-col gap-2 basis-full">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="accent"
                      onClick={() => arrancar.mutate({})}
                      disabled={arrancar.isPending}
                      loading={arrancar.isPending}
                    >
                      <Play size={16} /> Iniciar partido
                    </Button>
                    {arrancar.error && (
                      <Button
                        variant="default"
                        onClick={() => {
                          if (
                            window.confirm(
                              '¿Forzar el inicio fuera de la fecha agendada? ' +
                                'Quedará registrado en las observaciones del partido. ' +
                                '(No omite la falta de personal ni de plantel.)',
                            )
                          ) {
                            arrancar.mutate({ forzarDia: true });
                          }
                        }}
                        disabled={arrancar.isPending}
                      >
                        <AlertTriangle size={14} /> Forzar inicio
                      </Button>
                    )}
                  </div>
                  {arrancar.error && (
                    <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
                      {(arrancar.error as ApiError).message}
                    </div>
                  )}
                  <p className="text-xs font-serif italic text-ink-mute">
                    Para iniciar: árbitro principal + planillero designados, el día
                    agendado y plantel mínimo registrado por equipo.
                  </p>
                </div>
              )}
              {snapshot.estado === 'EN_VIVO' && (
                <Button onClick={() => pausar.mutate()} disabled={pausar.isPending}>
                  <Pause size={16} /> Pausar
                </Button>
              )}
              {snapshot.estado === 'PAUSADO' && (
                <>
                  <Button
                    variant="accent"
                    onClick={() => reanudar.mutate()}
                    disabled={reanudar.isPending}
                  >
                    <Play size={16} /> Reanudar
                  </Button>
                  <Button
                    onClick={() => siguientePeriodo.mutate()}
                    disabled={siguientePeriodo.isPending}
                  >
                    <RotateCcw size={16} /> Siguiente período
                  </Button>
                  {snapshot.minutosEntretiempo > 0 && (
                    <div className="basis-full text-xs font-serif italic text-ink-mute mt-2">
                      Pausa en período {snapshot.periodo}. El reglamento del
                      torneo prevé {snapshot.minutosEntretiempo} min de descanso
                      antes del siguiente período.
                    </div>
                  )}
                </>
              )}
              {(snapshot.estado === 'EN_VIVO' || snapshot.estado === 'PAUSADO') && (
                <Button
                  onClick={() => {
                    if (
                      window.confirm(
                        '¿Finalizar el partido en vivo? Aún tienes que cerrar el acta para registrar el resultado oficial.',
                      )
                    ) {
                      finalizar.mutate();
                    }
                  }}
                  disabled={finalizar.isPending}
                >
                  <Flag size={16} /> Finalizar partido
                </Button>
              )}
              {snapshot.estado === 'FINALIZADO_CENTRO' && (
                <div className="text-sm font-serif italic text-ink-mute">
                  El partido en vivo terminó. Cierra el acta desde la vista detalle.
                </div>
              )}
            </div>
          </Card>

          {/* Carga de incidencias en vivo (planillero) */}
          {enJuego && partido && (
            <IncidenciasPanel
              partidoId={partidoId}
              equipoLocalId={partido.equipoLocalId}
              equipoLocalNombre={partido.equipoLocalNombre}
              equipoVisitaId={partido.equipoVisitaId}
              equipoVisitaNombre={partido.equipoVisitaNombre}
              minutoSugerido={minutoJuego}
            />
          )}

          {partido && partido.incidencias.length > 0 && (
            <IncidenciasEnVivoList
              partidoId={partidoId}
              incidencias={partido.incidencias}
            />
          )}
        </>
      )}
    </>
  );
}

function EquipoColumn({
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
      <div className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-2 truncate">
        {nombre}
      </div>
      <div className="font-display text-7xl md:text-8xl text-green-deep tracking-display tabular-nums">
        {goles}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={onMenos}
          disabled={disabled || goles === 0}
          className="px-3 py-1 rounded border border-line text-ink-mute text-lg leading-none disabled:opacity-30 hover:bg-paper-dark"
        >
          −
        </button>
        <button
          type="button"
          onClick={onMas}
          disabled={disabled}
          className="px-3 py-1 rounded bg-accent text-chalk text-lg leading-none disabled:opacity-50 hover:bg-accent/80"
        >
          + GOL
        </button>
      </div>
    </div>
  );
}

// ─── Carga de incidencias en vivo ───────────────────────────────────
// Tipos que el planillero suele registrar durante el partido. F46.6 — el
// marcador se deriva de las incidencias de gol (fuente única): registrar un
// GOL suma al marcador en el backend. Las tarjetas no tocan el marcador. El
// resto (autogol, asistencia, MVP) se carga en el detalle del partido.
const TIPOS_RAPIDOS: Array<{ value: TipoIncidencia; label: string }> = [
  { value: 'GOL', label: '⚽ Gol' },
  { value: 'AMARILLA', label: '🟨 Amarilla' },
  { value: 'ROJA', label: '🟥 Roja' },
  { value: 'AMARILLA_ROJA', label: '🟨🟥 Doble amarilla' },
];

function IncidenciasPanel({
  partidoId,
  equipoLocalId,
  equipoLocalNombre,
  equipoVisitaId,
  equipoVisitaNombre,
  minutoSugerido,
}: {
  partidoId: string;
  equipoLocalId: string;
  equipoLocalNombre: string;
  equipoVisitaId: string;
  equipoVisitaNombre: string;
  minutoSugerido: number;
}): React.ReactElement {
  const [equipoSel, setEquipoSel] = useState<string>(equipoLocalId);
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

  // El selector de jugador debe ofrecer SOLO el roster del partido (la
  // nómina del torneo de ese equipo), no la plantilla completa del club.
  // Si ya se certificaron presentes, mostramos solo los presentes; si aún
  // no, caemos a los habilitados (no sancionados/vetados) para no frenar la
  // carga de incidencias en vivo.
  const roster = useRosterActa(partidoId);
  const ladoSel =
    roster.data?.local.inscripcionId === equipoSel
      ? roster.data?.local
      : roster.data?.visita;
  const yaCertificado = !!roster.data?.presentesCertificadosAt;
  const jugadoresElegibles = (ladoSel?.jugadores ?? []).filter((j) =>
    yaCertificado ? j.presente : j.habilitado,
  );

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
      // F46.6 — el marcador se deriva de las incidencias en el backend; no
      // tocamos el marcador aquí (evita el doble conteo con el botón +GOL).
      setJugadorId('');
      setMinuto('');
    } catch (err) {
      toastError((err as ApiError).message ?? 'No se pudo registrar.');
    }
  };

  return (
    <Card padding="roomy" className="mt-5">
      <CardLabel>Registrar incidencia</CardLabel>

      <FormErrorBanner
        fieldErrors={fieldErrors}
        apiError={addErr}
        validationTitle="Falta un dato:"
        apiTitle="No se pudo registrar la incidencia"
      />

      {/* Equipo */}
      <div className="flex gap-2 mt-3 mb-3">
        {[
          { id: equipoLocalId, nombre: equipoLocalNombre },
          { id: equipoVisitaId, nombre: equipoVisitaNombre },
        ].map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              setEquipoSel(e.id);
              setJugadorId('');
            }}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-semibold rounded-card border transition-colors truncate',
              equipoSel === e.id
                ? 'bg-green-deep text-chalk border-green-deep'
                : 'bg-chalk text-ink-mute border-line hover:border-green-deep',
            )}
          >
            {e.nombre}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_0.7fr_auto] gap-3 items-end">
        <div>
          <label className="label">Jugador</label>
          <select
            className="input"
            value={jugadorId}
            onChange={(e) => setJugadorId(e.target.value)}
          >
            <option value="">— elige jugador —</option>
            {jugadoresElegibles.map((j) => (
              <option key={j.jugadorId} value={j.jugadorId}>
                {j.numeroCamiseta ? `#${j.numeroCamiseta} ` : ''}
                {j.nombre} {j.apellido}
                {j.capitan ? ' (C)' : ''}
              </option>
            ))}
          </select>
          {!roster.isLoading && jugadoresElegibles.length === 0 && (
            <p className="mt-1 text-[11px] font-serif italic text-ink-mute">
              {yaCertificado
                ? 'No hay jugadores presentes certificados en este equipo.'
                : 'Sin jugadores habilitados en la nómina. Certifica los presentes en el detalle del partido.'}
            </p>
          )}
        </div>
        <div>
          <label className="label">Tipo</label>
          <select
            className="input"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoIncidencia)}
          >
            {TIPOS_RAPIDOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Minuto</label>
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
        <Button
          variant="accent"
          onClick={registrar}
          loading={addIncidencia.isPending}
        >
          <Flag size={14} /> Registrar
        </Button>
      </div>
      <p className="mt-3 text-[11px] font-serif italic text-ink-mute">
        El marcador se arma con las incidencias de gol: registrar un GOL aquí
        suma 1 al marcador, y el botón “+ GOL” de arriba crea un gol provisional
        sin jugador para no frenar el partido. Importante: cada gol debe quedar
        atribuido a su goleador antes de cerrar el acta (se asigna en el detalle
        del partido). Borrar una incidencia de gol baja el marcador.
      </p>
    </Card>
  );
}

const ICONOS_INCIDENCIA: Record<string, string> = {
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

function IncidenciasEnVivoList({
  partidoId,
  incidencias,
}: {
  partidoId: string;
  incidencias: Array<{
    id: string;
    tipo: string;
    minuto: number | null;
    jugadorNombre: string | null;
    equipoNombre: string;
  }>;
}): React.ReactElement {
  const remove = useRemoveIncidencia(partidoId);
  // Más recientes primero — útil para el planillero en vivo.
  const orden = [...incidencias].sort((a, b) => (b.minuto ?? 0) - (a.minuto ?? 0));

  return (
    <Card padding="none" className="overflow-hidden mt-5">
      <div className="px-5 py-3 bg-paper-dark border-b border-line">
        <CardLabel tone="mute">Incidencias del partido</CardLabel>
        <div className="font-display text-lg text-green-deep tracking-display">
          {incidencias.length} EVENTOS
        </div>
      </div>
      <div className="divide-y divide-line">
        {orden.map((i) => (
          <div key={i.id} className="px-5 py-2.5 flex items-center gap-3">
            <span className="text-xl w-8 text-center">
              {ICONOS_INCIDENCIA[i.tipo] ?? '•'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">
                {i.jugadorNombre ?? 'Sin jugador'}
              </div>
              <div className="text-xs text-ink-mute truncate">
                {i.tipo.replace('_', ' ')} · {i.equipoNombre}
              </div>
            </div>
            <div className="text-xs font-mono text-ink-mute w-10 text-right">
              {i.minuto != null ? `${i.minuto}'` : '—'}
            </div>
            <button
              type="button"
              onClick={() => remove.mutate(i.id)}
              className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
              aria-label="Borrar incidencia"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
