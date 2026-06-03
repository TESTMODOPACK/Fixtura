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
  FRECUENCIA_CUOTA_LABEL,
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
    'Pago único al inscribir un club al torneo. Se cobra automáticamente al confirmar la inscripción.',
  CUOTA:
    'Pago recurrente (semanal, mensual o anual) por inscripción. Lo genera el cron diario según la frecuencia y día de vencimiento.',
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
  const [tipoActivo, setTipoActivo] = useState<TipoTarifa | null>(null);
  const [editando, setEditando] = useState<TarifaTorneo | null>(null);

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
      </PageHead>

      <Card padding="roomy" className="mb-5 border-accent/30 bg-accent/5">
        <div className="flex items-start gap-3">
          <CircleDollarSign size={20} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink">
            <div className="font-semibold mb-1">Cómo funciona</div>
            <p className="font-serif italic text-ink-mute">
              Cada fila configura un concepto del torneo. Si no la cargás, el
              sistema no genera cobro para ese caso. La <b>matrícula</b> se
              cobra al inscribir un club; la <b>cuota</b> recurrente se genera
              cada período en un cron diario. Las <b>multas</b> se aplican
              automáticamente al cerrar el acta. <b>Eliminar una tarifa no toca
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
        `Los cobros que ya se generaron NO se tocan. El sistema simplemente ` +
        `dejará de generar nuevos cobros de este tipo en este torneo.`,
    );
    if (!ok) return;
    deleteTarifa.mutate(tarifa.id, {
      onSuccess: () => toastSuccess(`Tarifa "${TIPO_TARIFA_LABEL[tipo]}" eliminada.`),
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
              {tipo === 'CUOTA' && (
                <>
                  <Dato
                    label="Frecuencia"
                    valor={FRECUENCIA_CUOTA_LABEL[tarifa!.frecuencia]}
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
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCuota>(
    esCuota ? 'MENSUAL' : 'UNICO',
  );
  const [dia, setDia] = useState<string>('5');

  const onGuardar = async (): Promise<void> => {
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      toastError('Ingresá un monto válido.');
      return;
    }
    try {
      await createTarifa.mutateAsync({
        tipo,
        monto: montoNum,
        descripcion: descripcion.trim() || null,
        frecuencia: esCuota ? frecuencia : 'UNICO',
        diaVencimiento:
          esCuota && frecuencia !== 'UNICO' ? Number(dia) : null,
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
        frecuencia={frecuencia}
        setFrecuencia={setFrecuencia}
        dia={dia}
        setDia={setDia}
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
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCuota>(tarifa.frecuencia);
  const [dia, setDia] = useState<string>(
    tarifa.diaVencimiento != null ? String(tarifa.diaVencimiento) : '5',
  );
  const [activo, setActivo] = useState<boolean>(tarifa.activo);

  const onGuardar = async (): Promise<void> => {
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      toastError('Ingresá un monto válido.');
      return;
    }
    try {
      await updateTarifa.mutateAsync({
        id: tarifa.id,
        input: {
          monto: montoNum,
          descripcion: descripcion.trim() || null,
          frecuencia: esCuota ? frecuencia : 'UNICO',
          diaVencimiento:
            esCuota && frecuencia !== 'UNICO' ? Number(dia) : null,
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
        frecuencia={frecuencia}
        setFrecuencia={setFrecuencia}
        dia={dia}
        setDia={setDia}
      />
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
  frecuencia,
  setFrecuencia,
  dia,
  setDia,
}: {
  tipo: TipoTarifa;
  esCuota: boolean;
  monto: string;
  setMonto: (v: string) => void;
  descripcion: string;
  setDescripcion: (v: string) => void;
  frecuencia: FrecuenciaCuota;
  setFrecuencia: (v: FrecuenciaCuota) => void;
  dia: string;
  setDia: (v: string) => void;
}): React.ReactElement {
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

      {esCuota && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Frecuencia</label>
            <select
              className="input"
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as FrecuenciaCuota)}
            >
              <option value="UNICO">Pago único</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSUAL">Mensual</option>
              <option value="ANUAL">Anual</option>
            </select>
          </div>
          {frecuencia !== 'UNICO' && (
            <div>
              <label className="label">
                {frecuencia === 'SEMANAL'
                  ? 'Día de la semana'
                  : 'Día del mes'}
              </label>
              {frecuencia === 'SEMANAL' ? (
                <select
                  className="input"
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                >
                  <option value="1">Lunes</option>
                  <option value="2">Martes</option>
                  <option value="3">Miércoles</option>
                  <option value="4">Jueves</option>
                  <option value="5">Viernes</option>
                  <option value="6">Sábado</option>
                  <option value="7">Domingo</option>
                </select>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="input"
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                />
              )}
            </div>
          )}
        </div>
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
