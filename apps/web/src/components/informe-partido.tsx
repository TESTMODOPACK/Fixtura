'use client';

import { AlertTriangle, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  LADO_OBSERVACION,
  ROL_AUTOR_OBSERVACION_LABEL,
  type LadoObservacion,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import {
  useCrearObservacionPartido,
  useEliminarObservacionPartido,
  useObservacionesPartido,
} from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { toastError, toastWarning } from '@/lib/toast';

/**
 * Informe del partido — antecedentes disciplinarios (conducta de barra, DT,
 * incidentes) que el árbitro/planillero/admin cargan y el tribunal lee. Cada
 * entrada se asocia a un lado (local/visita/general). `soloLectura` lo usa el
 * tribunal: ve las observaciones pero no agrega ni borra.
 */
export function InformePartido({
  partidoId,
  equipoLocalNombre,
  equipoVisitaNombre,
  soloLectura = false,
}: {
  partidoId: string;
  equipoLocalNombre?: string;
  equipoVisitaNombre?: string;
  soloLectura?: boolean;
}): React.ReactElement {
  const { data: observaciones, isLoading } = useObservacionesPartido(partidoId);
  const crear = useCrearObservacionPartido(partidoId);
  const eliminar = useEliminarObservacionPartido(partidoId);

  const [lado, setLado] = useState<LadoObservacion>('GENERAL');
  const [texto, setTexto] = useState('');
  const [intentado, setIntentado] = useState(false);

  const ladoLabel = (l: LadoObservacion): string =>
    l === 'LOCAL'
      ? (equipoLocalNombre ?? 'Local')
      : l === 'VISITA'
        ? (equipoVisitaNombre ?? 'Visita')
        : 'General';

  const textoInvalido = texto.trim().length < 3;

  const enviar = (): void => {
    setIntentado(true);
    if (textoInvalido) {
      toastWarning('Escribe la observación (al menos 3 caracteres).');
      return;
    }
    crear.mutate(
      { lado, texto: texto.trim() },
      {
        onSuccess: () => {
          setTexto('');
          setLado('GENERAL');
          setIntentado(false);
        },
        onError: (e) => toastError(e),
      },
    );
  };

  return (
    <Card padding="comfortable" className="mb-5">
      <CardLabel>Informe del partido</CardLabel>
      <p className="text-xs text-ink-mute mt-1 mb-3 leading-snug">
        Antecedentes para el tribunal: conducta de la barra, del DT, incidentes
        fuera del marcador. Asócialos al equipo correspondiente.
      </p>

      {isLoading && <div className="font-serif italic text-ink-mute text-sm">Cargando…</div>}
      {!isLoading && (!observaciones || observaciones.length === 0) && (
        <div className="font-serif italic text-ink-mute text-sm">
          Sin observaciones registradas todavía.
        </div>
      )}
      {observaciones && observaciones.length > 0 && (
        <ul className="space-y-2">
          {observaciones.map((o) => (
            <li
              key={o.id}
              className="border border-line rounded-card px-3 py-2 bg-paper flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider font-semibold text-ink-mute mb-1">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded',
                      o.lado === 'LOCAL'
                        ? 'bg-green-bright/10 text-green-deep'
                        : o.lado === 'VISITA'
                          ? 'bg-accent/10 text-accent'
                          : 'bg-ink-mute/10 text-ink-mute',
                    )}
                  >
                    {ladoLabel(o.lado)}
                  </span>
                  <span className="normal-case tracking-normal font-medium">
                    {o.autorNombre} · {ROL_AUTOR_OBSERVACION_LABEL[o.autorRol] ?? o.autorRol}
                  </span>
                </div>
                <p className="text-sm text-ink whitespace-pre-wrap break-words">{o.texto}</p>
              </div>
              {!soloLectura && (
                <button
                  type="button"
                  onClick={() => eliminar.mutate(o.id)}
                  className="text-ink-mute hover:text-danger p-1 shrink-0"
                  title="Eliminar observación"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!soloLectura && (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-2">
            <div>
              <label className="label">Equipo / ámbito</label>
              <select
                className="input"
                value={lado}
                onChange={(e) => setLado(e.target.value as LadoObservacion)}
              >
                {LADO_OBSERVACION.map((l) => (
                  <option key={l} value={l}>
                    {ladoLabel(l)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Observación</label>
              <textarea
                className={cn(
                  'input min-h-[64px]',
                  intentado && textoInvalido && 'border-danger',
                )}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={1000}
                placeholder="Ej: la barra del equipo visitante agredió verbalmente al árbitro al finalizar el partido."
              />
              {intentado && textoInvalido && (
                <p className="text-[11px] text-danger mt-1 flex items-center gap-1">
                  <AlertTriangle size={11} /> Escribe al menos 3 caracteres.
                </p>
              )}
            </div>
          </div>
          <Button variant="accent" size="sm" onClick={enviar} loading={crear.isPending}>
            <MessageSquarePlus size={14} /> Agregar al informe
          </Button>
        </div>
      )}
    </Card>
  );
}
