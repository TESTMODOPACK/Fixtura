'use client';

import { AlertTriangle, CheckCircle2, Star } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import type { EncuestaPublica, PreguntaEncuesta, RespuestaItem } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { apiFetch, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastWarning } from '@/lib/toast';

type Estado =
  | { kind: 'loading' }
  | { kind: 'form'; info: EncuestaPublica }
  | { kind: 'ya' }
  | { kind: 'gracias' }
  | { kind: 'error'; mensaje: string };

/**
 * Valor en curso de una pregunta según su tipo:
 *  - NPS_0_10 / ESCALA_1_5 / SI_NO → number (o null si no respondida)
 *  - OPCION_UNICA / OPCION_MULTIPLE → string[]
 *  - TEXTO → string
 */
type ValorRespuesta = number | string | string[] | null;

type ValoresMap = Record<string, ValorRespuesta>;

/** ¿La pregunta tiene una respuesta efectiva (no vacía)? */
function tieneRespuesta(pregunta: PreguntaEncuesta, valor: ValorRespuesta): boolean {
  switch (pregunta.tipo) {
    case 'NPS_0_10':
    case 'ESCALA_1_5':
    case 'SI_NO':
      return typeof valor === 'number';
    case 'OPCION_UNICA':
    case 'OPCION_MULTIPLE':
      return Array.isArray(valor) && valor.length > 0;
    case 'TEXTO':
      return typeof valor === 'string' && valor.trim().length > 0;
    default:
      return false;
  }
}

/** Arma el RespuestaItem con el campo correcto según el tipo. */
function aRespuestaItem(pregunta: PreguntaEncuesta, valor: ValorRespuesta): RespuestaItem | null {
  if (!tieneRespuesta(pregunta, valor)) return null;
  switch (pregunta.tipo) {
    case 'NPS_0_10':
    case 'ESCALA_1_5':
    case 'SI_NO':
      return { preguntaId: pregunta.id, valorNumero: valor as number };
    case 'OPCION_UNICA':
    case 'OPCION_MULTIPLE':
      return { preguntaId: pregunta.id, valorOpciones: valor as string[] };
    case 'TEXTO':
      return { preguntaId: pregunta.id, valorTexto: (valor as string).trim() };
    default:
      return null;
  }
}

function ResponderContent(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get('token');
  const [estado, setEstado] = useState<Estado>({ kind: 'loading' });

  const [valores, setValores] = useState<ValoresMap>({});
  const [enviando, setEnviando] = useState(false);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado({ kind: 'error', mensaje: 'El enlace no tiene un token válido.' });
      return;
    }
    apiFetch<EncuestaPublica>(`/public/encuestas/info?token=${encodeURIComponent(token)}`)
      .then((info) => {
        setEstado(info.yaRespondida ? { kind: 'ya' } : { kind: 'form', info });
      })
      .catch((err) => {
        const apiErr = err as ApiError;
        setEstado({ kind: 'error', mensaje: apiErr.message ?? 'No pudimos abrir la encuesta.' });
      });
  }, [token]);

  const preguntas = useMemo(
    () => (estado.kind === 'form' ? [...estado.info.preguntas].sort((a, b) => a.orden - b.orden) : []),
    [estado],
  );

  const setValor = (preguntaId: string, valor: ValorRespuesta): void => {
    setValores((prev) => ({ ...prev, [preguntaId]: valor }));
    // Al responder, sacamos la pregunta del listado de faltantes si estaba.
    setFaltantes((prev) => (prev.length === 0 ? prev : prev.filter((id) => id !== preguntaId)));
  };

  const enviar = (): void => {
    if (!token || estado.kind !== 'form') return;

    const sinResponder = preguntas.filter(
      (p) => p.obligatoria && !tieneRespuesta(p, valores[p.id] ?? null),
    );
    if (sinResponder.length > 0) {
      setFaltantes(sinResponder.map((p) => p.id));
      toastWarning(
        sinResponder.length === 1
          ? 'Falta responder una pregunta obligatoria.'
          : `Faltan ${sinResponder.length} preguntas obligatorias por responder.`,
      );
      requestAnimationFrame(() => {
        bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    setFaltantes([]);
    setEnviando(true);

    const respuestas = preguntas
      .map((p) => aRespuestaItem(p, valores[p.id] ?? null))
      .filter((r): r is RespuestaItem => r !== null);

    apiFetch<{ ok: boolean; yaRespondida: boolean }>(
      `/public/encuestas/responder?token=${encodeURIComponent(token)}`,
      { method: 'POST', body: { respuestas } },
    )
      .then((res) => {
        setEstado(res.yaRespondida ? { kind: 'ya' } : { kind: 'gracias' });
      })
      .catch((err) => {
        const apiErr = err as ApiError;
        setEstado({ kind: 'error', mensaje: apiErr.message ?? 'No pudimos registrar tu respuesta.' });
      })
      .finally(() => setEnviando(false));
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <Card padding="roomy" className="w-full max-w-lg">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup />
        </div>

        {estado.kind === 'loading' && (
          <div className="text-center">
            <CardLabel>Abriendo encuesta…</CardLabel>
          </div>
        )}

        {estado.kind === 'ya' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-bright mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              YA RESPONDISTE
            </div>
            <p className="font-serif italic text-ink-mute">
              Gracias, ya teníamos tu respuesta registrada.
            </p>
          </div>
        )}

        {estado.kind === 'gracias' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-bright mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              ¡GRACIAS POR RESPONDER!
            </div>
            <p className="font-serif italic text-ink-mute">
              Tu opinión nos ayuda a mejorar la liga temporada a temporada.
            </p>
          </div>
        )}

        {estado.kind === 'error' && (
          <div className="text-center">
            <AlertTriangle size={48} className="mx-auto text-danger mb-4" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              ALGO NO FUNCIONÓ
            </div>
            <p className="font-serif italic text-ink-mute mb-4">{estado.mensaje}</p>
            <p className="text-sm text-ink-mute">
              Los enlaces expiran después de un tiempo. Si pasó eso, avisa a la liga.
            </p>
          </div>
        )}

        {estado.kind === 'form' && (
          <div>
            <div className="text-center mb-6">
              <div className="text-[11px] tracking-[2px] uppercase text-green-deep font-bold mb-1">
                {estado.info.club} · {estado.info.torneo}
              </div>
              <div className="font-display text-2xl text-green-deep tracking-display">
                {estado.info.nombre}
              </div>
              {estado.info.descripcion && (
                <p className="font-serif italic text-ink-mute text-sm mt-1">
                  {estado.info.descripcion}
                </p>
              )}
              <p className="text-[11px] text-ink-mute mt-2">
                Tus respuestas ayudan a {estado.info.liga} a mejorar cada temporada.
              </p>
            </div>

            {faltantes.length > 0 && (
              <div
                ref={bannerRef}
                role="alert"
                aria-live="polite"
                className="mb-6 bg-danger/10 border-2 border-danger/40 rounded-card px-4 py-3"
              >
                <div className="flex items-start gap-2 text-danger">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <div className="text-sm flex-1">
                    <div className="font-semibold">
                      {faltantes.length === 1
                        ? 'Falta una pregunta obligatoria por responder:'
                        : `Faltan ${faltantes.length} preguntas obligatorias por responder:`}
                    </div>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {preguntas
                        .filter((p) => faltantes.includes(p.id))
                        .map((p) => (
                          <li key={p.id}>{p.texto}</li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-7">
              {preguntas.map((pregunta) => (
                <Pregunta
                  key={pregunta.id}
                  pregunta={pregunta}
                  valor={valores[pregunta.id] ?? null}
                  falta={faltantes.includes(pregunta.id)}
                  onChange={(v) => setValor(pregunta.id, v)}
                />
              ))}
            </div>

            <Button onClick={enviar} disabled={enviando} className="w-full mt-8">
              {enviando ? 'Enviando…' : 'Enviar respuestas'}
            </Button>
          </div>
        )}

        {(estado.kind === 'ya' || estado.kind === 'gracias' || estado.kind === 'error') && (
          <div className="mt-8 flex justify-center">
            <Link href="/">
              <Button variant="default" size="sm">
                Ir al inicio
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

function Pregunta({
  pregunta,
  valor,
  falta,
  onChange,
}: {
  pregunta: PreguntaEncuesta;
  valor: ValorRespuesta;
  falta: boolean;
  onChange: (valor: ValorRespuesta) => void;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-card transition-colors',
        falta && 'ring-2 ring-danger/40 bg-danger/[0.03] -mx-3 px-3 py-3',
      )}
    >
      <div className="text-sm font-semibold text-green-deep mb-3">
        {pregunta.texto}
        {pregunta.obligatoria && <span className="text-danger ml-0.5">*</span>}
      </div>
      <ControlPregunta pregunta={pregunta} valor={valor} onChange={onChange} />
    </div>
  );
}

function ControlPregunta({
  pregunta,
  valor,
  onChange,
}: {
  pregunta: PreguntaEncuesta;
  valor: ValorRespuesta;
  onChange: (valor: ValorRespuesta) => void;
}): React.ReactElement {
  switch (pregunta.tipo) {
    case 'NPS_0_10':
      return <Nps valor={typeof valor === 'number' ? valor : null} onChange={onChange} />;
    case 'ESCALA_1_5':
      return <Escala valor={typeof valor === 'number' ? valor : 0} onChange={onChange} />;
    case 'SI_NO':
      return <SiNo valor={typeof valor === 'number' ? valor : null} onChange={onChange} />;
    case 'OPCION_UNICA':
      return (
        <OpcionUnica
          opciones={pregunta.opciones}
          name={pregunta.id}
          valor={Array.isArray(valor) ? (valor[0] ?? null) : null}
          onChange={onChange}
        />
      );
    case 'OPCION_MULTIPLE':
      return (
        <OpcionMultiple
          opciones={pregunta.opciones}
          valor={Array.isArray(valor) ? valor : []}
          onChange={onChange}
        />
      );
    case 'TEXTO':
      return <Texto valor={typeof valor === 'string' ? valor : ''} onChange={onChange} />;
    default:
      return <></>;
  }
}

function Nps({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'w-9 h-9 rounded-lg text-sm font-display border transition-colors',
              valor === n
                ? 'bg-orange text-white border-orange'
                : 'bg-white text-green-deep border-line hover:border-orange',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-ink-mute mt-1.5 px-0.5">
        <span>Nada probable</span>
        <span>Muy probable</span>
      </div>
    </div>
  );
}

function Escala({
  valor,
  onChange,
}: {
  valor: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} de 5`}
          className="p-0.5"
        >
          <Star
            size={32}
            className={n <= valor ? 'text-orange' : 'text-line'}
            fill={n <= valor ? '#E76F26' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

function SiNo({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (v: number) => void;
}): React.ReactElement {
  const opcion = (label: string, val: number): React.ReactElement => (
    <button
      type="button"
      onClick={() => onChange(val)}
      className={cn(
        'flex-1 h-12 rounded-lg text-sm font-display border-2 transition-colors',
        valor === val
          ? 'bg-orange text-white border-orange'
          : 'bg-white text-green-deep border-line hover:border-orange',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-3">
      {opcion('Sí', 1)}
      {opcion('No', 0)}
    </div>
  );
}

function OpcionUnica({
  opciones,
  name,
  valor,
  onChange,
}: {
  opciones: string[];
  name: string;
  valor: string | null;
  onChange: (v: string[]) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      {opciones.map((op) => {
        const activo = valor === op;
        return (
          <label
            key={op}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
              activo ? 'border-orange bg-orange/5' : 'border-line bg-white hover:border-orange',
            )}
          >
            <input
              type="radio"
              name={name}
              checked={activo}
              onChange={() => onChange([op])}
              className="accent-orange w-4 h-4"
            />
            <span className="text-sm text-green-deep">{op}</span>
          </label>
        );
      })}
    </div>
  );
}

function OpcionMultiple({
  opciones,
  valor,
  onChange,
}: {
  opciones: string[];
  valor: string[];
  onChange: (v: string[]) => void;
}): React.ReactElement {
  const toggle = (op: string): void => {
    onChange(valor.includes(op) ? valor.filter((x) => x !== op) : [...valor, op]);
  };
  return (
    <div className="space-y-2">
      {opciones.map((op) => {
        const activo = valor.includes(op);
        return (
          <label
            key={op}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
              activo ? 'border-orange bg-orange/5' : 'border-line bg-white hover:border-orange',
            )}
          >
            <input
              type="checkbox"
              checked={activo}
              onChange={() => toggle(op)}
              className="accent-orange w-4 h-4"
            />
            <span className="text-sm text-green-deep">{op}</span>
          </label>
        );
      })}
    </div>
  );
}

function Texto({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <textarea
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      maxLength={2000}
      rows={3}
      placeholder="Escribe tu respuesta…"
      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-green-deep resize-none focus:outline-none focus:border-orange"
    />
  );
}

export default function ResponderEncuestaPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <ResponderContent />
    </Suspense>
  );
}
