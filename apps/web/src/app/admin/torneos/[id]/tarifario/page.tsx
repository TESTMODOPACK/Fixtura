'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDollarSign,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  TIPO_TARIFA_LABEL,
  type FrecuenciaCuota,
  type TarifaTorneo,
  type TipoTarifa,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCreateTarifa,
  useDeleteTarifa,
  useGenerarCobros,
  useTarifas,
  useTorneo,
  useUpdateTarifa,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 34B — Tarifario por torneo.
 *
 * Configura los montos que el sistema usa para generar cobros
 * automáticamente: matrícula al inscribir un club, cuota recurrente
 * por mes/semana/año, multas al cerrar acta con tarjetas/rojas/fechas,
 * walkover, otros.
 *
 * Modelo: una fila por tipo. Si no está cargada, el sistema no genera
 * cobro para ese concepto (silencioso + audit log).
 */

const TIPOS_ORDEN: TipoTarifa[] = [
  'MATRICULA',
  'CUOTA',
  'MULTA_AMARILLA',
  'MULTA_ROJA',
  'MULTA_WALKOVER',
  'OTRO',
];

const DESCRIPCION_BREVE: Record<TipoTarifa, string> = {
  MATRICULA:
    'Pago único por equipo. Se cobra cuando el torneo arranca (al ponerlo "En curso"). Definí en cuántos días vence; si pasa sin pago, queda atrasado.',
  CUOTA:
    'Cuota mensual por equipo. Al arrancar el torneo se generan todas las cuotas de una vez. Definí cuántas cuotas y qué día del mes vencen.',
  MULTA_AMARILLA:
    'Monto fijo por cada tarjeta amarilla. Se carga al club al cerrar el acta del partido.',
  MULTA_ROJA:
    'Monto fijo por cada tarjeta roja. Se carga al club al cerrar el acta (independiente de las fechas de suspensión que el tribunal aplique).',
  MULTA_WALKOVER:
    'Monto fijo si un club no se presenta a un partido (walkover). Se cobra al club ausente.',
  OTRO:
    'Cualquier otro concepto que la liga quiera dejar configurado.',
};

export default function TarifarioPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const { data: torneo, isLoading: loadingTorneo } = useTorneo(id);
  const { data: tarifas, isLoading } = useTarifas(id);
  const generarCobros = useGenerarCobros(id);
  const [tipoActivo, setTipoActivo] = useState<TipoTarifa | null>(null);
  const [editando, setEditando] = useState<TarifaTorneo | null>(null);

  const onGenerarCobros = async (): Promise<void> => {
    const ok = confirm(
      'Generar los cobros del tarifario (matrícula + cuotas) para todos los ' +
        'equipos del torneo.\n\nEs seguro: no duplica los cobros que ya existan. ' +
        'Útil si configuraste el tarifario DESPUÉS de iniciar el torneo.\n\n¿Continuar?',
    );
    if (!ok) return;
    try {
      const r = await generarCobros.mutateAsync();
      toastSuccess(
        `Listo: ${r.matriculasCreadas} matrícula(s) + ${r.cuotasCreadas} cuota(s) ` +
          `en ${r.equiposProcesados} equipo(s).`,
      );
    } catch (err) {
      toastError(err);
    }
  };

  if (loadingTorneo) {
    return (
      <div className="font-serif italic text-ink-mute">Cargando torneo…</div>
    );
  }
  if (!torneo) {
    return (
      <Card padding="roomy" className="text-center">
        <p className="font-serif italic text-ink-mute">
          Torneo no encontrado.{' '}
          <Link href="/admin/torneos" className="text-accent">
            Volver al listado
          </Link>
          .
        </p>
      </Card>
    );
  }

  const porTipo = new Map<TipoTarifa, TarifaTorneo>();
  for (const t of tarifas ?? []) porTipo.set(t.tipo, t);

  return (
    <>
      <PageHead
        eyebrow={`Torneo · ${torneo.temporadaNombre}`}
        title={`Tarifario — ${torneo.nombre}`}
        sub="Configurá los montos a cobrar por concepto. Lo que no esté cargado no se cobra (silencioso)."
      >
        <Link href={`/admin/torneos/${id}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al torneo
          </Button>
        </Link>
        {torneo.estado === 'ACTIVO' && (
          <Button
            variant="accent"
            size="sm"
            onClick={onGenerarCobros}
            loading={generarCobros.isPending}
            title="Genera matrícula + cuotas para los equipos (idempotente). Útil si configuraste el tarifario después de iniciar el torneo."
          >
            <CircleDollarSign size={14} /> Generar cobros
          </Button>
        )}
      </PageHead>

      <Card padding="roomy" className="mb-5 border-accent/30 bg-accent/5">
        <div className="flex items-start gap-3">
          <CircleDollarSign size={20} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink">
            <div className="font-semibold mb-1">Cómo funciona</div>
            <p className="font-serif italic text-ink-mute">
              Cada fila configura un concepto del torneo. Si no la cargás, el
              sistema no genera ese cobro. La <b>matrícula</b> y las{' '}
              <b>cuotas</b> se generan para todos los equipos cuando el torneo
              arranca (al ponerlo <b>“En curso”</b>). Las <b>multas</b> se
              aplican solas al cerrar el acta. Dejá el tarifario listo{' '}
              <b>antes</b> de arrancar el torneo. <b>Eliminar una tarifa no toca
              los cobros que ya se generaron con ella</b> — solo deja de generar
              nuevos.
            </p>
          </div>
        </div>
      </Card>

      {isLoading && (
        <Card padding="roomy" className="text-center">
          <p className="font-serif italic text-ink-mute">Cargando tarifas…</p>
        </Card>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {TIPOS_ORDEN.map((tipo) => (
            <TarifaCard
              key={tipo}
              tipo={tipo}
              tarifa={porTipo.get(tipo) ?? null}
              onCrear={() => setTipoActivo(tipo)}
              onEditar={(t) => setEditando(t)}
              torneoId={id}
            />
          ))}
        </div>
      )}

      {tipoActivo && (
        <CrearTarifaModal
          torneoId={id}
          tipo={tipoActivo}
          onClose={() => setTipoActivo(null)}
        />
      )}
      {editando && (
        <EditarTarifaModal
          torneoId={id}
          tarifa={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}

// ─── Cards de cada tipo ────────────────────────────────────────────

function TarifaCard({
  tipo,
  tarifa,
  onCrear,
  onEditar,
  torneoId,
}: {
  tipo: TipoTarifa;
  tarifa: TarifaTorneo | null;
  onCrear: () => void;
  onEditar: (t: TarifaTorneo) => void;
  torneoId: string;
}): React.ReactElement {
  const deleteTarifa = useDeleteTarifa(torneoId);

  const onEliminar = (): void => {
    if (!tarifa) return;
    const ok = confirm(
      `¿Eliminar la tarifa "${TIPO_TARIFA_LABEL[tipo]}"?\n\n` +
        `Los cobros que ya se generaron NO se tocan, pero quedan sin tarifa ` +
        `origen vinculada. El sistema simplemente dejará de generar nuevos ` +
        `cobros de este tipo en este torneo.\n\n` +
        `Si querés conservar la trazabilidad, podés desactivarla en lugar de ` +
        `borrarla (editá la tarifa y desmarcá "Tarifa activa").`,
    );
    if (!ok) return;
    deleteTarifa.mutate(tarifa.id, {
      onSuccess: (res) => {
        // Sprint 34G — el backend devuelve cuantos cobros quedaron sin
        // tarifa origen. Lo mostramos en el toast para que el operador
        // sepa el impacto historico.
        const msg = res.cobrosDesvinculados > 0
          ? `Tarifa "${TIPO_TARIFA_LABEL[tipo]}" eliminada. ${res.cobrosDesvinculados} cobro(s) quedaron sin tarifa origen vinculada.`
          : `Tarifa "${TIPO_TARIFA_LABEL[tipo]}" eliminada.`;
        toastSuccess(msg);
      },
    });
  };

  const configurada = tarifa !== null;

  return (
    <Card
      padding="roomy"
      className={configurada ? '' : 'border-dashed border-line/60 bg-paper/40'}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            configurada
              ? tarifa!.activo
                ? 'bg-accent/15 text-accent'
                : 'bg-ink-mute/15 text-ink-mute'
              : 'bg-line/40 text-ink-mute'
          }`}
        >
          {tipo === 'MATRICULA' || tipo === 'CUOTA' ? (
            <CircleDollarSign size={18} />
          ) : tipo === 'OTRO' ? (
            <CircleDollarSign size={18} />
          ) : (
            <ShieldAlert size={18} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-display text-lg text-green-deep tracking-display">
              {TIPO_TARIFA_LABEL[tipo].toUpperCase()}
            </div>
            {configurada && !tarifa!.activo && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
                Inactiva
              </span>
            )}
            {!configurada && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-line/40 text-ink-mute">
                Sin configurar
              </span>
            )}
          </div>
          <p className="text-xs font-serif italic text-ink-mute mt-1 mb-3">
            {DESCRIPCION_BREVE[tipo]}
          </p>

          {configurada ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <Dato
                label="Monto"
                valor={`$${tarifa!.monto.toLocaleString('es-CL')}`}
                destacado
              />
              {tipo === 'MATRICULA' && (
                <Dato
                  label="Vence a los"
                  valor={
                    tarifa!.diasPlazoPago != null
                      ? `${tarifa!.diasPlazoPago} día${tarifa!.diasPlazoPago === 1 ? '' : 's'}`
                      : '7 días'
                  }
                />
              )}
              {tipo === 'CUOTA' && (
                <>
                  <Dato
                    label="Cantidad de cuotas"
                    valor={
                      tarifa!.cantidadCuotas != null
                        ? String(tarifa!.cantidadCuotas)
                        : '—'
                    }
                  />
                  <Dato
                    label={
                      tarifa!.frecuencia === 'SEMANAL'
                        ? 'Día de la semana'
                        : 'Día del mes'
                    }
                    valor={
                      tarifa!.diaVencimiento != null
                        ? formatDia(tarifa!.frecuencia, tarifa!.diaVencimiento)
                        : '—'
                    }
                  />
                </>
              )}
              {tarifa!.descripcion && (
                <Dato
                  label="Notas"
                  valor={tarifa!.descripcion}
                  className="col-span-2 md:col-span-3"
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-mute">
              Cargá un monto para que el sistema empiece a usarlo automáticamente.
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2">
          {configurada ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditar(tarifa!)}
                title="Editar tarifa"
              >
                <Pencil size={14} /> Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEliminar}
                loading={deleteTarifa.isPending}
                className="text-danger hover:bg-danger/10"
                title="Eliminar tarifa"
              >
                <Trash2 size={14} /> Quitar
              </Button>
            </>
          ) : (
            <Button variant="accent" size="sm" onClick={onCrear}>
              <Plus size={14} /> Configurar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Dato({
  label,
  valor,
  destacado,
  className,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold">
        {label}
      </div>
      <div
        className={
          destacado
            ? 'font-display text-xl text-green-deep tracking-display'
            : 'text-sm text-ink'
        }
      >
        {valor}
      </div>
    </div>
  );
}

const DIAS_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function formatDia(frec: FrecuenciaCuota, n: number): string {
  if (frec === 'SEMANAL') return DIAS_SEMANA[n] ?? `Día ${n}`;
  return `Día ${n}`;
}

/**
 * Valida y normaliza los campos específicos por tipo de tarifa antes de
 * enviar al backend. Devuelve { error } si hay un problema de validación
 * (con mensaje para el operador), o los tres campos ya parseados a número
 * o null. Evita el caso silencioso de input vacío → Number('') = 0.
 */
type CamposTarifa =
  | { ok: false; error: string }
  | {
      ok: true;
      diaVencimiento: number | null;
      cantidadCuotas: number | null;
      diasPlazoPago: number | null;
    };

function validarCamposTarifa(
  tipo: TipoTarifa,
  raw: { dia: string; cantidadCuotas: string; diasPlazo: string },
): CamposTarifa {
  if (tipo === 'CUOTA') {
    const n = Number(raw.cantidadCuotas);
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      return { ok: false, error: 'Indicá cuántas cuotas se cobran (entre 1 y 60).' };
    }
    const d = Number(raw.dia);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return {
        ok: false,
        error: 'El día del mes en que vence la cuota debe estar entre 1 y 31.',
      };
    }
    return { ok: true, diaVencimiento: d, cantidadCuotas: n, diasPlazoPago: null };
  }
  if (tipo === 'MATRICULA') {
    // Campo vacío → default 7 días (no "vence hoy" por un 0 silencioso).
    const dias = raw.diasPlazo.trim() === '' ? 7 : Number(raw.diasPlazo);
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
      return { ok: false, error: 'El plazo de pago debe estar entre 0 y 365 días.' };
    }
    return { ok: true, diaVencimiento: null, cantidadCuotas: null, diasPlazoPago: dias };
  }
  // Multas y OTRO: sin campos extra de vencimiento/cuotas.
  return { ok: true, diaVencimiento: null, cantidadCuotas: null, diasPlazoPago: null };
}

// ─── Modales ─────────────────────────────────────────────────────

function CrearTarifaModal({
  torneoId,
  tipo,
  onClose,
}: {
  torneoId: string;
  tipo: TipoTarifa;
  onClose: () => void;
}): React.ReactElement {
  const createTarifa = useCreateTarifa(torneoId);
  const esCuota = tipo === 'CUOTA';

  const [monto, setMonto] = useState<string>('');
  const [descripcion, setDescripcion] = useState('');
  const [dia, setDia] = useState<string>('5');
  const [cantidadCuotas, setCantidadCuotas] = useState<string>('1');
  const [diasPlazo, setDiasPlazo] = useState<string>('7');

  const onGuardar = async (): Promise<void> => {
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      toastError('Ingresá un monto válido.');
      return;
    }
    const campos = validarCamposTarifa(tipo, { dia, cantidadCuotas, diasPlazo });
    if (!campos.ok) {
      toastError(campos.error);
      return;
    }
    try {
      await createTarifa.mutateAsync({
        tipo,
        monto: montoNum,
        descripcion: descripcion.trim() || null,
        // El modelo nuevo solo genera cuotas mensuales por adelantado.
        frecuencia: esCuota ? 'MENSUAL' : 'UNICO',
        diaVencimiento: campos.diaVencimiento,
        cantidadCuotas: campos.cantidadCuotas,
        diasPlazoPago: campos.diasPlazoPago,
        activo: true,
      });
      toastSuccess(`Tarifa "${TIPO_TARIFA_LABEL[tipo]}" configurada.`);
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      toastError(apiErr.message ?? 'Error al guardar.');
    }
  };

  return (
    <ModalShell
      titulo={`Configurar ${TIPO_TARIFA_LABEL[tipo]}`}
      onClose={onClose}
    >
      <FormFields
        tipo={tipo}
        esCuota={esCuota}
        monto={monto}
        setMonto={setMonto}
        descripcion={descripcion}
        setDescripcion={setDescripcion}
        dia={dia}
        setDia={setDia}
        cantidadCuotas={cantidadCuotas}
        setCantidadCuotas={setCantidadCuotas}
        diasPlazo={diasPlazo}
        setDiasPlazo={setDiasPlazo}
      />
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-line mt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={onGuardar}
          loading={createTarifa.isPending}
        >
          <Check size={14} /> Guardar tarifa
        </Button>
      </div>
    </ModalShell>
  );
}

function EditarTarifaModal({
  torneoId,
  tarifa,
  onClose,
}: {
  torneoId: string;
  tarifa: TarifaTorneo;
  onClose: () => void;
}): React.ReactElement {
  const updateTarifa = useUpdateTarifa(torneoId);
  const esCuota = tarifa.tipo === 'CUOTA';

  const [monto, setMonto] = useState<string>(String(tarifa.monto));
  const [descripcion, setDescripcion] = useState(tarifa.descripcion ?? '');
  const [dia, setDia] = useState<string>(
    tarifa.diaVencimiento != null ? String(tarifa.diaVencimiento) : '5',
  );
  const [cantidadCuotas, setCantidadCuotas] = useState<string>(
    tarifa.cantidadCuotas != null ? String(tarifa.cantidadCuotas) : '1',
  );
  const [diasPlazo, setDiasPlazo] = useState<string>(
    tarifa.diasPlazoPago != null ? String(tarifa.diasPlazoPago) : '7',
  );
  const [activo, setActivo] = useState<boolean>(tarifa.activo);

  const onGuardar = async (): Promise<void> => {
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      toastError('Ingresá un monto válido.');
      return;
    }
    const campos = validarCamposTarifa(tarifa.tipo, {
      dia,
      cantidadCuotas,
      diasPlazo,
    });
    if (!campos.ok) {
      toastError(campos.error);
      return;
    }
    try {
      await updateTarifa.mutateAsync({
        id: tarifa.id,
        input: {
          monto: montoNum,
          descripcion: descripcion.trim() || null,
          frecuencia: esCuota ? 'MENSUAL' : 'UNICO',
          diaVencimiento: campos.diaVencimiento,
          cantidadCuotas: campos.cantidadCuotas,
          diasPlazoPago: campos.diasPlazoPago,
          activo,
        },
      });
      toastSuccess('Tarifa actualizada.');
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      toastError(apiErr.message ?? 'Error al actualizar.');
    }
  };

  return (
    <ModalShell
      titulo={`Editar ${TIPO_TARIFA_LABEL[tarifa.tipo]}`}
      onClose={onClose}
    >
      <FormFields
        tipo={tarifa.tipo}
        esCuota={esCuota}
        monto={monto}
        setMonto={setMonto}
        descripcion={descripcion}
        setDescripcion={setDescripcion}
        dia={dia}
        setDia={setDia}
        cantidadCuotas={cantidadCuotas}
        setCantidadCuotas={setCantidadCuotas}
        diasPlazo={diasPlazo}
        setDiasPlazo={setDiasPlazo}
      />
      {/* Sprint 34G — snapshot del monto. */}
      <div className="text-[11px] font-serif italic text-ink-mute bg-paper/60 p-2 rounded-card mt-3 flex items-start gap-2">
        <AlertTriangle size={11} className="text-accent flex-shrink-0 mt-0.5" />
        El cambio de monto solo afecta cobros futuros. Los cobros ya generados
        con esta tarifa NO se actualizan automáticamente — si querés ajustarlos,
        editalos uno por uno desde Finanzas.
      </div>
      <label className="flex items-center gap-2 text-sm mt-3">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
        Tarifa activa (genera cobros nuevos)
      </label>
      {!activo && (
        <div className="text-xs font-serif italic text-ink-mute bg-paper/60 p-2 rounded-card mt-1 flex items-start gap-2">
          <AlertTriangle size={12} className="text-accent flex-shrink-0 mt-0.5" />
          Tarifa inactiva: el sistema no va a generar cobros nuevos pero los
          que ya existen quedan como están.
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-line mt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={onGuardar}
          loading={updateTarifa.isPending}
        >
          <Check size={14} /> Guardar cambios
        </Button>
      </div>
    </ModalShell>
  );
}

function FormFields({
  tipo,
  esCuota,
  monto,
  setMonto,
  descripcion,
  setDescripcion,
  dia,
  setDia,
  cantidadCuotas,
  setCantidadCuotas,
  diasPlazo,
  setDiasPlazo,
}: {
  tipo: TipoTarifa;
  esCuota: boolean;
  monto: string;
  setMonto: (v: string) => void;
  descripcion: string;
  setDescripcion: (v: string) => void;
  dia: string;
  setDia: (v: string) => void;
  cantidadCuotas: string;
  setCantidadCuotas: (v: string) => void;
  diasPlazo: string;
  setDiasPlazo: (v: string) => void;
}): React.ReactElement {
  const esMatricula = tipo === 'MATRICULA';
  return (
    <div className="space-y-3">
      <p className="text-xs font-serif italic text-ink-mute">
        {DESCRIPCION_BREVE[tipo]}
      </p>

      <Input
        label="Monto (CLP)"
        type="number"
        min={0}
        placeholder="ej. 50000"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
      />

      {esMatricula && (
        <Input
          label="¿En cuántos días vence? (desde que arranca el torneo)"
          type="number"
          min={0}
          max={365}
          placeholder="ej. 15"
          value={diasPlazo}
          onChange={(e) => setDiasPlazo(e.target.value)}
        />
      )}

      {esCuota && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Cantidad de cuotas"
              type="number"
              min={1}
              max={60}
              placeholder="ej. 5"
              value={cantidadCuotas}
              onChange={(e) => setCantidadCuotas(e.target.value)}
            />
            <div>
              <label className="label">Día del mes en que vence</label>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] font-serif italic text-ink-mute">
            Ejemplo: 5 cuotas con vencimiento el día 10 genera, al arrancar el
            torneo, 5 cobros por equipo que vencen el 10 de cada mes.
          </p>
        </>
      )}

      <Input
        label="Descripción (opcional)"
        placeholder='ej. "Incluye seguro deportivo"'
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
    </div>
  );
}

function ModalShell({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center px-4 overflow-y-auto py-8">
      <div className="bg-chalk rounded-card border border-line max-w-xl w-full">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-display text-xl text-green-deep tracking-display">
            {titulo}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-ink p-1"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
