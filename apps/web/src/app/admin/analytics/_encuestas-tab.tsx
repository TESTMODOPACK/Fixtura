'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  ClipboardList,
  Frown,
  Meh,
  MessageSquare,
  Plus,
  Save,
  Send,
  Smile,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import {
  TIPO_PREGUNTA,
  TIPOS_ESCALA,
  TIPOS_OPCION,
  type DispararEncuestaResultado,
  type EstadoPlantilla,
  type PlantillaEncuesta,
  type PreguntaEncuesta,
  type ResumenEncuesta,
  type ResumenPregunta,
  type TipoPregunta,
  type UpsertPreguntaRequest,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { FormErrorBanner } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import {
  useActualizarPlantilla,
  useActualizarPregunta,
  useAgregarPregunta,
  useCrearPlantilla,
  useDispararEncuesta,
  useEliminarPlantilla,
  useEliminarPregunta,
  usePlantillasEncuesta,
  useCrearEjemploEncuesta,
  useReordenarPreguntas,
  useResumenEncuesta,
  useTorneos,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';

// ── Etiquetas legibles de los tipos de pregunta ────────────────────────
const TIPO_LABEL: Record<TipoPregunta, string> = {
  NPS_0_10: 'Nota 0–10 (NPS)',
  ESCALA_1_5: 'Escala 1–5',
  SI_NO: 'Sí / No',
  OPCION_UNICA: 'Opción única',
  OPCION_MULTIPLE: 'Opción múltiple',
  TEXTO: 'Texto libre',
};

const ESTADO_BADGE: Record<EstadoPlantilla, string> = {
  BORRADOR: 'bg-amber-400/20 text-amber-700',
  ACTIVA: 'bg-green-bright/15 text-green-bright',
  ARCHIVADA: 'bg-ink-mute/15 text-ink-mute',
};

const ESTADO_LABEL: Record<EstadoPlantilla, string> = {
  BORRADOR: 'Borrador',
  ACTIVA: 'Activa',
  ARCHIVADA: 'Archivada',
};

type Vista = { modo: 'lista' } | { modo: 'editor'; plantillaId: string } | { modo: 'resultados'; plantillaId: string };

export function EncuestasTab(): React.ReactElement {
  const { data: plantillas, isLoading, error } = usePlantillasEncuesta();
  const [vista, setVista] = useState<Vista>({ modo: 'lista' });
  const apiError = error as ApiError | undefined;

  // La plantilla seleccionada se re-busca del listado fresco en cada render,
  // así el editor refleja los cambios apenas el hook invalida la query.
  const seleccionada =
    vista.modo !== 'lista'
      ? (plantillas ?? []).find((p) => p.id === vista.plantillaId) ?? null
      : null;

  if (vista.modo === 'editor' && seleccionada) {
    return <EditorPlantilla plantilla={seleccionada} onVolver={() => setVista({ modo: 'lista' })} />;
  }
  if (vista.modo === 'resultados' && seleccionada) {
    return (
      <ResultadosPlantilla
        plantilla={seleccionada}
        onVolver={() => setVista({ modo: 'lista' })}
      />
    );
  }

  return (
    <div className="space-y-5">
      <ListaPlantillas
        plantillas={plantillas ?? []}
        isLoading={isLoading}
        apiError={apiError}
        onEditar={(id) => setVista({ modo: 'editor', plantillaId: id })}
        onResultados={(id) => setVista({ modo: 'resultados', plantillaId: id })}
      />
    </div>
  );
}

// ══════════════════════════ LISTA ══════════════════════════════════════

function ListaPlantillas({
  plantillas,
  isLoading,
  apiError,
  onEditar,
  onResultados,
}: {
  plantillas: PlantillaEncuesta[];
  isLoading: boolean;
  apiError?: ApiError;
  onEditar: (id: string) => void;
  onResultados: (id: string) => void;
}): React.ReactElement {
  const [creando, setCreando] = useState(false);
  const ejemplo = useCrearEjemploEncuesta();

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-serif italic text-ink-mute max-w-2xl">
          Arma tus propias encuestas: define las preguntas en una plantilla reutilizable y
          dispárala por torneo a los delegados de cada club. Una pregunta de nota 0–10 marcada como
          NPS conserva el score clásico.
        </p>
        <Button variant="accent" onClick={() => setCreando((v) => !v)}>
          {creando ? <X size={15} /> : <Plus size={15} />}
          {creando ? 'Cancelar' : 'Nueva encuesta'}
        </Button>
      </div>

      {creando && <NuevaPlantillaForm onDone={() => setCreando(false)} />}

      {isLoading && <div className="font-serif italic text-ink-mute py-8">Cargando encuestas…</div>}

      {!isLoading && apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR LAS ENCUESTAS
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {!isLoading && !apiError && plantillas.length === 0 && !creando && (
        <Card padding="roomy">
          <div className="flex flex-col items-center justify-center text-center gap-2 py-6">
            <ClipboardList size={28} className="text-ink-mute" />
            <div className="font-display tracking-display text-xl text-green-deep">
              Todavía no tienes encuestas
            </div>
            <p className="text-sm font-serif italic text-ink-mute max-w-md">
              Crea tu primera plantilla para empezar a medir la satisfacción de tus clubes. Puedes
              reutilizarla en todos los torneos que quieras.
            </p>
            <Button
              variant="default"
              className="mt-2"
              loading={ejemplo.isPending}
              onClick={() =>
                ejemplo.mutate(undefined, {
                  onSuccess: () =>
                    toastSuccess('Encuesta de ejemplo creada. Edítala a tu gusto.'),
                  onError: (err) => toastError(err),
                })
              }
            >
              <Plus size={14} /> Usar plantilla de ejemplo (NPS)
            </Button>
          </div>
        </Card>
      )}

      {plantillas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plantillas.map((p) => (
            <PlantillaCard
              key={p.id}
              plantilla={p}
              onEditar={() => onEditar(p.id)}
              onResultados={() => onResultados(p.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PlantillaCard({
  plantilla,
  onEditar,
  onResultados,
}: {
  plantilla: PlantillaEncuesta;
  onEditar: () => void;
  onResultados: () => void;
}): React.ReactElement {
  const eliminar = useEliminarPlantilla();
  const [disparando, setDisparando] = useState(false);

  const tasa =
    plantilla.totalEnviadas > 0
      ? Math.round((plantilla.totalRespondidas / plantilla.totalEnviadas) * 100)
      : null;

  const onEliminar = (): void => {
    const ok = window.confirm(
      `¿Eliminar la encuesta “${plantilla.nombre}”? Se borran sus preguntas y todas las respuestas recibidas. Esta acción no se puede deshacer.`,
    );
    if (!ok) return;
    eliminar.mutate(plantilla.id, {
      onSuccess: () => toastSuccess('Encuesta eliminada.'),
      onError: (err) => toastError(err),
    });
  };

  return (
    <Card padding="comfortable" className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display tracking-display text-lg text-green-deep truncate">
            {plantilla.nombre}
          </div>
          {plantilla.descripcion && (
            <p className="text-xs font-serif italic text-ink-mute mt-0.5 line-clamp-2">
              {plantilla.descripcion}
            </p>
          )}
        </div>
        <span
          className={cn(
            'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded flex-shrink-0',
            ESTADO_BADGE[plantilla.estado],
          )}
        >
          {ESTADO_LABEL[plantilla.estado]}
        </span>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-ink-mute">
        <span>
          <span className="font-mono font-semibold text-ink">{plantilla.preguntas.length}</span>{' '}
          {plantilla.preguntas.length === 1 ? 'pregunta' : 'preguntas'}
        </span>
        <span>
          <span className="font-mono font-semibold text-ink">
            {plantilla.totalRespondidas}/{plantilla.totalEnviadas}
          </span>{' '}
          respondidas{tasa != null ? ` · ${tasa}%` : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-line">
        <Button size="sm" variant="default" onClick={onEditar}>
          Editar
        </Button>
        <Button size="sm" variant="default" onClick={onResultados}>
          <BarChart3 size={14} /> Resultados
        </Button>
        <Button size="sm" variant="accent" onClick={() => setDisparando((v) => !v)}>
          <Send size={14} /> {disparando ? 'Cerrar' : 'Disparar'}
        </Button>
        <button
          type="button"
          onClick={onEliminar}
          disabled={eliminar.isPending}
          className="ml-auto p-1.5 rounded text-ink-mute hover:text-danger hover:bg-danger/10 disabled:opacity-50"
          title="Eliminar encuesta"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {disparando && (
        <DispararEncuesta plantilla={plantilla} onClose={() => setDisparando(false)} />
      )}
    </Card>
  );
}

function NuevaPlantillaForm({ onDone }: { onDone: () => void }): React.ReactElement {
  const crear = useCrearPlantilla();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [intentado, setIntentado] = useState(false);

  const errNombre = nombre.trim().length < 2 ? 'Escribe un nombre (mín. 2 caracteres).' : undefined;
  const fieldErrors =
    intentado && errNombre ? [{ label: 'Nombre', mensaje: errNombre }] : [];

  const onSubmit = (): void => {
    setIntentado(true);
    if (errNombre) {
      toastWarning('Falta el nombre de la encuesta.');
      return;
    }
    crear.mutate(
      { nombre: nombre.trim(), descripcion: descripcion.trim() || null },
      {
        onSuccess: () => {
          toastSuccess('Encuesta creada. Ahora agrégale preguntas.');
          onDone();
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Card padding="comfortable">
      <CardLabel>Nueva encuesta</CardLabel>
      <FormErrorBanner
        fieldErrors={fieldErrors}
        apiError={crear.error}
        validationTitle="Revisa estos datos:"
        apiTitle="No se pudo crear la encuesta"
      />
      <div className="grid grid-cols-1 gap-3 mt-1">
        <div>
          <Input
            label="Nombre"
            placeholder="Ej. Satisfacción de clubes — Clausura 2026"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={intentado ? errNombre : undefined}
            maxLength={150}
          />
        </div>
        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Una línea para el delegado: qué le estás preguntando y por qué."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={1000}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="accent" onClick={onSubmit} loading={crear.isPending}>
            <Plus size={15} /> Crear encuesta
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ══════════════════════════ EDITOR ═════════════════════════════════════

function EditorPlantilla({
  plantilla,
  onVolver,
}: {
  plantilla: PlantillaEncuesta;
  onVolver: () => void;
}): React.ReactElement {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="default" size="sm" onClick={onVolver}>
          <ArrowLeft size={14} /> Volver a las encuestas
        </Button>
        <span
          className={cn(
            'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
            ESTADO_BADGE[plantilla.estado],
          )}
        >
          {ESTADO_LABEL[plantilla.estado]}
        </span>
      </div>

      <DatosPlantillaForm plantilla={plantilla} />
      <PreguntasEditor plantilla={plantilla} />
    </div>
  );
}

function DatosPlantillaForm({ plantilla }: { plantilla: PlantillaEncuesta }): React.ReactElement {
  const actualizar = useActualizarPlantilla();
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [descripcion, setDescripcion] = useState(plantilla.descripcion ?? '');
  const [intentado, setIntentado] = useState(false);

  const errNombre = nombre.trim().length < 2 ? 'Escribe un nombre (mín. 2 caracteres).' : undefined;

  const guardar = (): void => {
    setIntentado(true);
    if (errNombre) {
      toastWarning('El nombre no puede quedar vacío.');
      return;
    }
    actualizar.mutate(
      {
        id: plantilla.id,
        input: { nombre: nombre.trim(), descripcion: descripcion.trim() || null },
      },
      {
        onSuccess: () => toastSuccess('Datos guardados.'),
        onError: (err) => toastError(err),
      },
    );
  };

  const activar = (): void => {
    actualizar.mutate(
      { id: plantilla.id, input: { estado: 'ACTIVA' } },
      {
        onSuccess: () => toastSuccess('Encuesta activada. Ya puedes dispararla a tus torneos.'),
        onError: (err) => toastError(err),
      },
    );
  };

  const archivar = (): void => {
    actualizar.mutate(
      { id: plantilla.id, input: { estado: 'ARCHIVADA' } },
      {
        onSuccess: () => toastSuccess('Encuesta archivada.'),
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Card padding="comfortable">
      <CardLabel>Datos de la encuesta</CardLabel>
      <div className="grid grid-cols-1 gap-3 mt-1">
        <Input
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={intentado ? errNombre : undefined}
          maxLength={150}
        />
        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea
            className="input min-h-[60px]"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={1000}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={guardar} loading={actualizar.isPending}>
            <Save size={14} /> Guardar datos
          </Button>
          {plantilla.estado === 'BORRADOR' && (
            <Button variant="accent" onClick={activar} loading={actualizar.isPending}>
              <Sparkles size={14} /> Activar encuesta
            </Button>
          )}
          {plantilla.estado === 'ACTIVA' && (
            <Button variant="ghost" onClick={archivar} loading={actualizar.isPending}>
              Archivar
            </Button>
          )}
        </div>
        {plantilla.estado === 'BORRADOR' && (
          <p className="text-xs font-serif italic text-ink-mute">
            La encuesta está en borrador. Agrega tus preguntas y, cuando esté lista, actívala para
            poder dispararla a los torneos.
          </p>
        )}
      </div>
    </Card>
  );
}

function PreguntasEditor({ plantilla }: { plantilla: PlantillaEncuesta }): React.ReactElement {
  const agregar = useAgregarPregunta();
  const reordenar = useReordenarPreguntas();
  const [agregando, setAgregando] = useState(false);

  const preguntas = [...plantilla.preguntas].sort((a, b) => a.orden - b.orden);
  const yaHayNps = preguntas.some((p) => p.esNps);

  const mover = (index: number, dir: -1 | 1): void => {
    const destino = index + dir;
    if (destino < 0 || destino >= preguntas.length) return;
    const ids = preguntas.map((p) => p.id);
    const actual = ids[index];
    const otro = ids[destino];
    if (actual === undefined || otro === undefined) return;
    ids[index] = otro;
    ids[destino] = actual;
    reordenar.mutate(
      { plantillaId: plantilla.id, preguntaIds: ids },
      { onError: (err) => toastError(err) },
    );
  };

  return (
    <Card padding="comfortable">
      <div className="flex items-center justify-between gap-3 mb-1">
        <CardLabel>
          Preguntas {preguntas.length > 0 && `(${preguntas.length})`}
        </CardLabel>
        <Button variant="accent" size="sm" onClick={() => setAgregando((v) => !v)}>
          {agregando ? <X size={14} /> : <Plus size={14} />}
          {agregando ? 'Cancelar' : 'Agregar pregunta'}
        </Button>
      </div>

      {preguntas.length === 0 && !agregando && (
        <div className="text-sm font-serif italic text-ink-mute py-4 text-center">
          Esta encuesta todavía no tiene preguntas. Agrega la primera para empezar.
        </div>
      )}

      <div className="space-y-3 mt-3">
        {preguntas.map((pregunta, i) => (
          <PreguntaFila
            key={pregunta.id}
            pregunta={pregunta}
            indice={i}
            total={preguntas.length}
            otraEsNps={yaHayNps && !pregunta.esNps}
            onMover={(dir) => mover(i, dir)}
            moviendo={reordenar.isPending}
          />
        ))}
      </div>

      {agregando && (
        <div className="mt-3">
          <NuevaPreguntaFila
            otraEsNps={yaHayNps}
            saving={agregar.isPending}
            onCancel={() => setAgregando(false)}
            onGuardar={(input) =>
              agregar.mutate(
                { plantillaId: plantilla.id, input },
                {
                  onSuccess: () => {
                    toastSuccess('Pregunta agregada.');
                    setAgregando(false);
                  },
                  onError: (err) => toastError(err),
                },
              )
            }
          />
        </div>
      )}
    </Card>
  );
}

/** Validación compartida de una pregunta antes de mandarla al backend. */
function validarPregunta(p: UpsertPreguntaRequest): string | null {
  if (p.texto.trim().length < 1) return 'Escribe el texto de la pregunta.';
  if (TIPOS_OPCION.includes(p.tipo)) {
    const limpias = p.opciones.map((o) => o.trim()).filter(Boolean);
    if (limpias.length < 2) return 'Las preguntas de opción necesitan al menos 2 opciones.';
  }
  if (p.esNps && p.tipo !== 'NPS_0_10') {
    return 'Solo una pregunta de nota 0–10 puede ser la pregunta NPS.';
  }
  return null;
}

function PreguntaFila({
  pregunta,
  indice,
  total,
  otraEsNps,
  onMover,
  moviendo,
}: {
  pregunta: PreguntaEncuesta;
  indice: number;
  total: number;
  otraEsNps: boolean;
  onMover: (dir: -1 | 1) => void;
  moviendo: boolean;
}): React.ReactElement {
  const actualizar = useActualizarPregunta();
  const eliminar = useEliminarPregunta();

  const [texto, setTexto] = useState(pregunta.texto);
  const [tipo, setTipo] = useState<TipoPregunta>(pregunta.tipo);
  const [opciones, setOpciones] = useState<string[]>(pregunta.opciones);
  const [obligatoria, setObligatoria] = useState(pregunta.obligatoria);
  const [esNps, setEsNps] = useState(pregunta.esNps);
  const [intentado, setIntentado] = useState(false);

  const esOpcion = TIPOS_OPCION.includes(tipo);

  const construir = (): UpsertPreguntaRequest => ({
    texto: texto.trim(),
    tipo,
    opciones: esOpcion ? opciones.map((o) => o.trim()).filter(Boolean) : [],
    obligatoria,
    esNps: tipo === 'NPS_0_10' ? esNps : false,
  });

  const guardar = (): void => {
    setIntentado(true);
    const input = construir();
    const err = validarPregunta(input);
    if (err) {
      toastWarning(err);
      return;
    }
    actualizar.mutate(
      { preguntaId: pregunta.id, input },
      {
        onSuccess: () => toastSuccess('Pregunta actualizada.'),
        onError: (e) => toastError(e),
      },
    );
  };

  const borrar = (): void => {
    const ok = window.confirm('¿Eliminar esta pregunta? Se borran también sus respuestas.');
    if (!ok) return;
    eliminar.mutate(pregunta.id, {
      onSuccess: () => toastSuccess('Pregunta eliminada.'),
      onError: (e) => toastError(e),
    });
  };

  const errTexto = intentado && texto.trim().length < 1 ? 'Escribe el texto de la pregunta.' : undefined;

  return (
    <div className="rounded-card border border-line bg-paper-dark/40 p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-0.5 pt-1.5">
          <span className="font-mono text-xs text-ink-mute font-semibold">{indice + 1}</span>
          <button
            type="button"
            onClick={() => onMover(-1)}
            disabled={indice === 0 || moviendo}
            className="p-0.5 rounded text-ink-mute hover:text-accent disabled:opacity-30"
            title="Subir"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={indice === total - 1 || moviendo}
            className="p-0.5 rounded text-ink-mute hover:text-accent disabled:opacity-30"
            title="Bajar"
          >
            <ArrowDown size={14} />
          </button>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <PreguntaCampos
            texto={texto}
            setTexto={setTexto}
            tipo={tipo}
            setTipo={(t) => {
              setTipo(t);
              if (t !== 'NPS_0_10') setEsNps(false);
            }}
            opciones={opciones}
            setOpciones={setOpciones}
            obligatoria={obligatoria}
            setObligatoria={setObligatoria}
            esNps={esNps}
            setEsNps={setEsNps}
            otraEsNps={otraEsNps}
            errTexto={errTexto}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="default" size="sm" onClick={guardar} loading={actualizar.isPending}>
              <Save size={14} /> Guardar
            </Button>
            <button
              type="button"
              onClick={borrar}
              disabled={eliminar.isPending}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ink-mute hover:text-danger disabled:opacity-50"
              title="Eliminar pregunta"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NuevaPreguntaFila({
  otraEsNps,
  saving,
  onGuardar,
  onCancel,
}: {
  otraEsNps: boolean;
  saving: boolean;
  onGuardar: (input: UpsertPreguntaRequest) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoPregunta>('NPS_0_10');
  const [opciones, setOpciones] = useState<string[]>(['', '']);
  const [obligatoria, setObligatoria] = useState(false);
  const [esNps, setEsNps] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const esOpcion = TIPOS_OPCION.includes(tipo);

  const submit = (): void => {
    setIntentado(true);
    const input: UpsertPreguntaRequest = {
      texto: texto.trim(),
      tipo,
      opciones: esOpcion ? opciones.map((o) => o.trim()).filter(Boolean) : [],
      obligatoria,
      esNps: tipo === 'NPS_0_10' ? esNps : false,
    };
    const err = validarPregunta(input);
    if (err) {
      toastWarning(err);
      return;
    }
    onGuardar(input);
  };

  const errTexto = intentado && texto.trim().length < 1 ? 'Escribe el texto de la pregunta.' : undefined;

  return (
    <div className="rounded-card border-2 border-accent/30 bg-accent/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Plus size={14} className="text-accent" />
        <CardLabel>Nueva pregunta</CardLabel>
      </div>
      <PreguntaCampos
        texto={texto}
        setTexto={setTexto}
        tipo={tipo}
        setTipo={(t) => {
          setTipo(t);
          if (t !== 'NPS_0_10') setEsNps(false);
        }}
        opciones={opciones}
        setOpciones={setOpciones}
        obligatoria={obligatoria}
        setObligatoria={setObligatoria}
        esNps={esNps}
        setEsNps={setEsNps}
        otraEsNps={otraEsNps}
        errTexto={errTexto}
      />
      <div className="flex gap-2">
        <Button variant="accent" size="sm" onClick={submit} loading={saving}>
          <Plus size={14} /> Agregar pregunta
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Campos compartidos entre "nueva pregunta" y "editar pregunta". */
function PreguntaCampos({
  texto,
  setTexto,
  tipo,
  setTipo,
  opciones,
  setOpciones,
  obligatoria,
  setObligatoria,
  esNps,
  setEsNps,
  otraEsNps,
  errTexto,
}: {
  texto: string;
  setTexto: (v: string) => void;
  tipo: TipoPregunta;
  setTipo: (v: TipoPregunta) => void;
  opciones: string[];
  setOpciones: (v: string[]) => void;
  obligatoria: boolean;
  setObligatoria: (v: boolean) => void;
  esNps: boolean;
  setEsNps: (v: boolean) => void;
  otraEsNps: boolean;
  errTexto?: string;
}): React.ReactElement {
  const esOpcion = TIPOS_OPCION.includes(tipo);
  const npsDisabled = tipo !== 'NPS_0_10';

  const setOpcion = (i: number, valor: string): void => {
    const next = [...opciones];
    next[i] = valor;
    setOpciones(next);
  };
  const quitarOpcion = (i: number): void => setOpciones(opciones.filter((_, idx) => idx !== i));
  const agregarOpcion = (): void => setOpciones([...opciones, '']);

  return (
    <>
      <div>
        <label className="label">Texto de la pregunta</label>
        <input
          className={cn('input', errTexto && 'border-danger focus:border-danger')}
          placeholder="Ej. ¿Qué tan probable es que recomiendes la liga a otro club?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={300}
        />
        {errTexto && <p className="text-xs text-danger mt-1">{errTexto}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Tipo de respuesta</label>
          <select
            className="input"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoPregunta)}
          >
            {TIPO_PREGUNTA.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end gap-1.5 pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={obligatoria}
              onChange={(e) => setObligatoria(e.target.checked)}
            />
            <span>Obligatoria</span>
          </label>
          <label
            className={cn(
              'flex items-center gap-2 text-sm',
              npsDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
            title={
              npsDisabled
                ? 'Solo las preguntas de nota 0–10 pueden ser la pregunta NPS.'
                : otraEsNps && !esNps
                  ? 'Ya hay otra pregunta marcada como NPS; al marcar esta, el sistema desmarca la anterior.'
                  : undefined
            }
          >
            <input
              type="checkbox"
              checked={esNps}
              disabled={npsDisabled}
              onChange={(e) => setEsNps(e.target.checked)}
            />
            <span>Es la pregunta NPS</span>
          </label>
        </div>
      </div>

      {esOpcion && (
        <div>
          <label className="label">Opciones (mínimo 2)</label>
          <div className="space-y-2">
            {opciones.map((op, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder={`Opción ${i + 1}`}
                  value={op}
                  onChange={(e) => setOpcion(i, e.target.value)}
                  maxLength={120}
                />
                <button
                  type="button"
                  onClick={() => quitarOpcion(i)}
                  disabled={opciones.length <= 1}
                  className="p-1.5 rounded text-ink-mute hover:text-danger hover:bg-danger/10 disabled:opacity-30"
                  title="Quitar opción"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={agregarOpcion}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            <Plus size={13} /> Agregar opción
          </button>
        </div>
      )}
    </>
  );
}

// ══════════════════════════ DISPARAR ═══════════════════════════════════

function DispararEncuesta({
  plantilla,
  onClose,
}: {
  plantilla: PlantillaEncuesta;
  onClose: () => void;
}): React.ReactElement {
  const { data: torneos } = useTorneos();
  const disparar = useDispararEncuesta();
  const [torneoId, setTorneoId] = useState('');
  const [resultado, setResultado] = useState<DispararEncuestaResultado | null>(null);

  const sinPreguntas = plantilla.preguntas.length === 0;
  const noActiva = plantilla.estado !== 'ACTIVA';

  const onEnviar = (): void => {
    if (!torneoId) {
      toastWarning('Elige un torneo para enviar la encuesta.');
      return;
    }
    if (sinPreguntas) {
      toastWarning('La encuesta no tiene preguntas. Agrégalas antes de dispararla.');
      return;
    }
    setResultado(null);
    disparar.mutate(
      { plantillaId: plantilla.id, torneoId },
      {
        onSuccess: (r) => {
          setResultado(r);
          toastSuccess(`Se enviaron ${r.enviadas} encuesta(s).`);
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <div className="mt-4 pt-3 border-t border-line">
      <CardLabel>Disparar a un torneo</CardLabel>
      <p className="text-xs font-serif italic text-ink-mute mt-1 mb-3">
        Cada club del torneo recibe un correo (al delegado) con el link para responder. Se manda
        una sola encuesta por club; los que ya la tienen no se reenvían.
      </p>

      {noActiva && (
        <div className="mb-3 rounded-lg bg-amber-400/10 border border-amber-400/40 px-3 py-2 text-xs text-amber-700">
          La encuesta está en <strong>{ESTADO_LABEL[plantilla.estado].toLowerCase()}</strong>.
          Actívala desde el editor para poder dispararla.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={torneoId}
          onChange={(e) => setTorneoId(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-green-deep"
        >
          <option value="">Elige un torneo…</option>
          {(torneos ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <Button
          variant="accent"
          onClick={onEnviar}
          loading={disparar.isPending}
          disabled={noActiva || sinPreguntas}
        >
          <Send size={15} /> Enviar encuestas
        </Button>
      </div>

      {resultado && (
        <div className="mt-3 rounded-lg bg-green-bright/10 border border-green-bright/30 px-3 py-2 text-sm text-green-deep">
          Se enviaron <strong>{resultado.enviadas}</strong> encuesta(s).
          {resultado.yaEnviadas > 0 && ` ${resultado.yaEnviadas} club(es) ya tenían encuesta.`}
          {resultado.sinEmail > 0 &&
            ` ${resultado.sinEmail} club(es) sin email de contacto — cárgalo en la directiva del club.`}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════ RESULTADOS ═════════════════════════════════

function ResultadosPlantilla({
  plantilla,
  onVolver,
}: {
  plantilla: PlantillaEncuesta;
  onVolver: () => void;
}): React.ReactElement {
  const { data, isLoading, error } = useResumenEncuesta(plantilla.id);
  const apiError = error as ApiError | undefined;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="default" size="sm" onClick={onVolver}>
          <ArrowLeft size={14} /> Volver a las encuestas
        </Button>
        <div className="font-display tracking-display text-lg text-green-deep truncate">
          {plantilla.nombre}
        </div>
      </div>

      {isLoading && (
        <div className="font-serif italic text-ink-mute py-8">Calculando resultados…</div>
      )}

      {!isLoading && apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="text-sm text-danger">{apiError.message}</div>
        </Card>
      )}

      {data && <ResultadosContenido data={data} />}
    </div>
  );
}

function ResultadosContenido({ data }: { data: ResumenEncuesta }): React.ReactElement {
  if (data.totalEnviadas === 0) {
    return (
      <Card padding="roomy">
        <div className="flex items-center justify-center h-[160px] text-sm font-serif italic text-ink-mute text-center px-4">
          Todavía no enviaste esta encuesta a ningún torneo. Dispárala desde la lista para empezar a
          recibir respuestas.
        </div>
      </Card>
    );
  }

  const tasa =
    data.totalEnviadas > 0 ? Math.round((data.totalRespondidas / data.totalEnviadas) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Score NPS (solo si la plantilla tiene una pregunta NPS con respuestas) */}
      {data.scoreNps != null && (
        <Card padding="roomy">
          <CardLabel>Score NPS</CardLabel>
          <div className="flex flex-col md:flex-row md:items-center gap-6 mt-2">
            <div>
              <div
                className={cn(
                  'font-display tracking-display text-5xl',
                  data.scoreNps > 0
                    ? 'text-green-bright'
                    : data.scoreNps < 0
                      ? 'text-danger'
                      : 'text-ink-mute',
                )}
              >
                {data.scoreNps > 0 ? `+${data.scoreNps}` : data.scoreNps}
              </div>
              <div className="text-xs font-serif italic text-ink-mute mt-0.5">de −100 a +100</div>
            </div>
            <div className="flex-1">
              <BarraNps
                promotores={data.promotores}
                pasivos={data.pasivos}
                detractores={data.detractores}
              />
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Segmento icon={Smile} label="Promotores" valor={data.promotores} tono="ok" />
                <Segmento icon={Meh} label="Pasivos" valor={data.pasivos} tono="neutral" />
                <Segmento icon={Frown} label="Detractores" valor={data.detractores} tono="bad" />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Cobertura de respuestas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat icon={Send} label="Enviadas" valor={data.totalEnviadas} />
        <MiniStat icon={MessageSquare} label="Respondidas" valor={data.totalRespondidas} />
        <MiniStat icon={BarChart3} label="Tasa de respuesta" valor={`${tasa}%`} />
      </div>

      {/* Una tarjeta por pregunta */}
      {data.preguntas.length === 0 ? (
        <Card padding="roomy">
          <div className="text-sm font-serif italic text-ink-mute text-center">
            Esta encuesta no tiene preguntas para resumir.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.preguntas.map((p) => (
            <ResumenPreguntaCard key={p.preguntaId} pregunta={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResumenPreguntaCard({ pregunta }: { pregunta: ResumenPregunta }): React.ReactElement {
  const esEscala = TIPOS_ESCALA.includes(pregunta.tipo);
  const esTexto = pregunta.tipo === 'TEXTO';

  return (
    <Card padding="comfortable">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display tracking-display text-base text-green-deep">
            {pregunta.texto}
          </div>
          <div className="text-xs text-ink-mute mt-0.5">
            {TIPO_LABEL[pregunta.tipo]} ·{' '}
            <span className="font-mono font-semibold text-ink">{pregunta.respondidas}</span>{' '}
            respuesta(s)
          </div>
        </div>
        {esEscala && pregunta.promedio != null && (
          <div className="text-right flex-shrink-0">
            <div className="font-display tracking-display text-2xl text-green-deep">
              {pregunta.promedio.toFixed(1)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-ink-mute">promedio</div>
          </div>
        )}
      </div>

      {/* Texto libre → lista de respuestas */}
      {esTexto && (
        <div className="mt-3">
          {pregunta.textos.length === 0 ? (
            <div className="text-sm font-serif italic text-ink-mute">
              Aún no hay respuestas escritas.
            </div>
          ) : (
            <ul className="space-y-2">
              {pregunta.textos.map((t, i) => (
                <li key={i} className="border-l-2 border-line pl-3 text-sm text-green-deep">
                  “{t}”
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Resto de tipos → barras de distribución */}
      {!esTexto && (
        <div className="mt-3">
          {pregunta.distribucion.length === 0 ? (
            <div className="text-sm font-serif italic text-ink-mute">
              Sin respuestas para distribuir todavía.
            </div>
          ) : (
            <Distribucion items={pregunta.distribucion} />
          )}
        </div>
      )}
    </Card>
  );
}

function Distribucion({
  items,
}: {
  items: { etiqueta: string; cantidad: number }[];
}): React.ReactElement {
  const max = Math.max(1, ...items.map((i) => i.cantidad));
  const total = items.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = total > 0 ? Math.round((item.cantidad / total) * 100) : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 sm:w-36 text-sm text-ink truncate flex-shrink-0" title={item.etiqueta}>
              {item.etiqueta}
            </div>
            <div className="flex-1 h-5 rounded bg-line/60 overflow-hidden">
              <div
                className="h-full bg-green-deep rounded"
                style={{ width: `${(item.cantidad / max) * 100}%` }}
              />
            </div>
            <div className="w-16 text-right text-xs text-ink-mute flex-shrink-0">
              <span className="font-mono font-semibold text-ink">{item.cantidad}</span>
              {total > 0 && <span className="ml-1">· {pct}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════ Compartidos NPS ════════════════════════════

function BarraNps({
  promotores,
  pasivos,
  detractores,
}: {
  promotores: number;
  pasivos: number;
  detractores: number;
}): React.ReactElement {
  const total = promotores + pasivos + detractores;
  if (total === 0) {
    return <div className="h-3 rounded-full bg-line" />;
  }
  const pct = (n: number): string => `${(n / total) * 100}%`;
  return (
    <div className="flex h-3 rounded-full overflow-hidden">
      {promotores > 0 && <div style={{ width: pct(promotores) }} className="bg-green-bright" />}
      {pasivos > 0 && <div style={{ width: pct(pasivos) }} className="bg-amber-400" />}
      {detractores > 0 && <div style={{ width: pct(detractores) }} className="bg-danger" />}
    </div>
  );
}

function Segmento({
  icon: Icon,
  label,
  valor,
  tono,
}: {
  icon: typeof Smile;
  label: string;
  valor: number;
  tono: 'ok' | 'neutral' | 'bad';
}): React.ReactElement {
  return (
    <div className="text-center">
      <Icon
        size={20}
        className={cn(
          'mx-auto mb-1',
          tono === 'ok' ? 'text-green-bright' : tono === 'bad' ? 'text-danger' : 'text-ink-mute',
        )}
      />
      <div className="font-display tracking-display text-2xl text-green-deep">{valor}</div>
      <div className="text-xs text-ink-mute">{label}</div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Send;
  label: string;
  valor: string | number;
}): React.ReactElement {
  return (
    <Card padding="comfortable">
      <div className="flex items-center gap-1.5">
        <Icon size={14} className="text-ink-mute" />
        <CardLabel>{label}</CardLabel>
      </div>
      <div className="font-display tracking-display text-3xl text-green-deep mt-1">{valor}</div>
    </Card>
  );
}
