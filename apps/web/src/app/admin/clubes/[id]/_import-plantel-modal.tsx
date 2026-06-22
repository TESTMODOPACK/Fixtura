'use client';

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import type {
  BulkImportPreview,
  BulkImportPreviewRow,
  BulkImportResult,
  BulkImportRow,
  ImportRowAction,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { CardLabel } from '@/components/ui/card';
import {
  useConfirmImportPlantel,
  usePreviewImportPlantel,
} from '@/hooks/use-admin';
import { API_URL } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/cn';

/**
 * Sprint 28 — Modal de 3 pasos para importar planteles desde Excel.
 *
 * Flujo:
 *   1. SUBIR: el admin baja el template, lo completa, lo sube.
 *      Parseamos con SheetJS y armamos el array de filas.
 *   2. PREVIEW: el backend evalúa todo. Mostramos tabla con badges
 *      (NUEVO / ACTUALIZAR / INACTIVAR / RECHAZADO / EN_EXCEPCION).
 *      El admin puede cancelar aquí sin que se aplique nada.
 *   3. CONFIRMAR: el admin acepta. El backend re-evalúa y aplica.
 *      Mostramos el resumen.
 *
 * El categoriaId viene del PlantelTab activo: importas contra
 * la categoría que estás viendo. El backend valida que la
 * categoría sea una asignada al club.
 */

type Step = 'upload' | 'preview' | 'done';

export function ImportPlantelModal({
  clubId,
  categoriaId,
  categoriaNombre,
  open,
  onClose,
}: {
  clubId: string;
  categoriaId: string;
  categoriaNombre: string;
  open: boolean;
  onClose: () => void;
}): React.ReactElement | null {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [filename, setFilename] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [inactivarFaltantes, setInactivarFaltantes] = useState(true);

  const previewMut = usePreviewImportPlantel(clubId);
  const confirmMut = useConfirmImportPlantel(clubId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = (): void => {
    setStep('upload');
    setRows([]);
    setFilename('');
    setParseError(null);
    setInactivarFaltantes(true);
    previewMut.reset();
    confirmMut.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const onFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    setParseError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);

    // A8 — xlsx@0.18.5 arrastra prototype-pollution/ReDoS sin parche en npm, y
    // XLSX.read corre en el cliente sobre un archivo elegido por el admin.
    // Acotamos la superficie validando extensión y tamaño ANTES de parsear.
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setParseError('Formato no soportado. Subí un archivo .xlsx o .xls.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError('El archivo supera el límite de 5 MB.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName =
        wb.SheetNames.find((n) => n.toLowerCase().startsWith('jugador')) ??
        wb.SheetNames[0];
      if (!sheetName) {
        setParseError('El archivo no tiene hojas.');
        return;
      }
      const sheet = wb.Sheets[sheetName];
      if (!sheet) {
        setParseError(`No se pudo leer la hoja "${sheetName}".`);
        return;
      }
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false, // todo como string — más predecible para validar
        defval: '',
      });
      if (raw.length === 0) {
        setParseError(
          `La hoja "${sheetName}" está vacía. Carga al menos una fila.`,
        );
        return;
      }
      const mapped = raw
        .map((r) => mapRowToBulkImport(r))
        .filter((r): r is BulkImportRow => r !== null);
      if (mapped.length === 0) {
        setParseError(
          'No se pudo extraer ninguna fila válida. Revisa que las columnas se llamen: rut, nombres, apellidos.',
        );
        return;
      }
      setRows(mapped);

      // Disparar preview inmediatamente. NO atrapamos el error aquí:
      // previewMut.error se renderiza solo en la UI (UploadStep).
      // Atrapar aquí enmascararía el mensaje del backend con un
      // genérico "No se pudo leer el archivo".
      const preview = await previewMut
        .mutateAsync({ categoriaId, rows: mapped })
        .catch(() => null);
      if (preview) setStep('preview');
    } catch (err) {
      setParseError(
        err instanceof Error
          ? `No se pudo leer el archivo: ${err.message}`
          : 'No se pudo leer el archivo.',
      );
    }
  };

  const onConfirm = async (): Promise<void> => {
    try {
      const res = await confirmMut.mutateAsync({
        categoriaId,
        rows,
        inactivarFaltantes,
      });
      setStep('done');
      const total = res.creados + res.actualizados + res.inactivados;
      toastSuccess(
        `Importación aplicada: ${total} cambio${total === 1 ? '' : 's'} en el plantel.`,
      );
    } catch (err) {
      // confirmMut.error queda set y se muestra en el preview step,
      // pero un toast adicional ayuda si el modal está scrolleado.
      toastError(err);
    }
  };

  if (!open) return null;

  const preview = previewMut.data;
  const result = confirmMut.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="bg-paper rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2 font-display text-xl tracking-display text-green-deep">
              <FileSpreadsheet size={20} /> Importar plantel desde Excel
            </div>
            <p className="text-xs text-ink-mute mt-0.5">
              Categoría destino:{' '}
              <span className="font-semibold">{categoriaNombre}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-ink-mute hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stepper */}
        <Stepper step={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <UploadStep
              fileInputRef={fileInputRef}
              filename={filename}
              parseError={parseError}
              isPreviewing={previewMut.isPending}
              previewError={previewMut.error}
              onFileChange={onFileChange}
            />
          )}

          {step === 'preview' && preview && (
            <PreviewStep
              preview={preview}
              inactivarFaltantes={inactivarFaltantes}
              setInactivarFaltantes={setInactivarFaltantes}
              confirmError={confirmMut.error}
            />
          )}

          {step === 'done' && result && <DoneStep result={result} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-line bg-paper-dark">
          <div className="text-xs text-ink-mute">
            {step === 'preview' &&
              preview &&
              `${preview.totalFilas} filas leídas · ${preview.nuevos} nuevos · ${preview.actualizados} actualizados · ${preview.inactivarFilas.length} a inactivar · ${preview.rechazados} rechazados`}
          </div>
          <div className="flex items-center gap-2">
            {step === 'upload' && (
              <Button variant="ghost" size="sm" onClick={close}>
                Cancelar
              </Button>
            )}
            {step === 'preview' && (
              <>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Cambiar archivo
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={onConfirm}
                  disabled={
                    confirmMut.isPending ||
                    (preview?.nuevos === 0 &&
                      preview?.actualizados === 0 &&
                      preview?.enExcepcion === 0 &&
                      (preview?.inactivarFilas.length ?? 0) === 0)
                  }
                >
                  {confirmMut.isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Aplicando…
                    </>
                  ) : (
                    `Aplicar cambios`
                  )}
                </Button>
              </>
            )}
            {step === 'done' && (
              <Button variant="accent" size="sm" onClick={close}>
                Listo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───── Sub-componentes ─────

function Stepper({ step }: { step: Step }): React.ReactElement {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'upload', label: '1. Subir archivo' },
    { key: 'preview', label: '2. Revisar cambios' },
    { key: 'done', label: '3. Resultado' },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-paper-dark border-b border-line text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center font-semibold text-[10px]',
              i < idx
                ? 'bg-green-bright text-paper'
                : i === idx
                  ? 'bg-accent text-paper'
                  : 'bg-line text-ink-mute',
            )}
          >
            {i < idx ? '✓' : i + 1}
          </div>
          <span
            className={cn(
              i === idx
                ? 'font-semibold text-ink'
                : i < idx
                  ? 'text-ink-mute'
                  : 'text-ink-mute',
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-line">→</span>}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  fileInputRef,
  filename,
  parseError,
  isPreviewing,
  previewError,
  onFileChange,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  filename: string;
  parseError: string | null;
  isPreviewing: boolean;
  previewError: unknown;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}): React.ReactElement {
  const onDownloadTemplate = async (): Promise<void> => {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_URL}/admin/clubes/plantel/template.xlsx`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toastError(
        new Error(
          'No se pudo descargar la plantilla. Revisa tu sesión y vuelve a intentar.',
        ),
      );
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-jugadores-fixtura.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink mb-3">
          Carga un archivo Excel (.xlsx) con tu plantel. Si no tienes uno, descarga
          la plantilla con el formato correcto:
        </p>
        <button
          type="button"
          onClick={onDownloadTemplate}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded border border-line hover:bg-paper-dark"
        >
          <Download size={14} /> Descargar plantilla en blanco
        </button>
      </div>

      <div className="border-2 border-dashed border-line rounded-lg p-8 text-center">
        <Upload size={32} className="mx-auto text-ink-mute mb-2" />
        <p className="text-sm text-ink mb-3">
          Selecciona tu archivo Excel con el plantel completo
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFileChange}
          className="hidden"
          id="plantel-import-input"
          disabled={isPreviewing}
        />
        <label
          htmlFor="plantel-import-input"
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded font-semibold text-sm cursor-pointer',
            isPreviewing
              ? 'bg-line text-ink-mute cursor-wait'
              : 'bg-accent text-paper hover:bg-accent-dark',
          )}
        >
          {isPreviewing ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Analizando…
            </>
          ) : (
            <>
              <Upload size={14} /> Elegir archivo
            </>
          )}
        </label>
        {filename && (
          <p className="text-xs text-ink-mute mt-3 font-mono">{filename}</p>
        )}
      </div>

      {parseError && (
        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {previewError != null && (
        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            {previewError instanceof Error
              ? previewError.message
              : 'Error al analizar el archivo.'}
          </span>
        </div>
      )}

      <div className="text-xs text-ink-mute space-y-1 pt-3 border-t border-line">
        <div className="font-semibold text-ink uppercase tracking-wider mb-1">
          Reglas
        </div>
        <div>
          • Match por RUT: si un jugador ya está en este plantel se{' '}
          <b>actualiza</b>.
        </div>
        <div>
          • Si un RUT está en otro club de la liga, se <b>rechaza</b>.
        </div>
        <div>
          • Si un RUT está vetado, se <b>rechaza</b>.
        </div>
        <div>
          • Jugadores actuales que no vengan en el archivo se proponen{' '}
          <b>inactivar</b>.
        </div>
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  inactivarFaltantes,
  setInactivarFaltantes,
  confirmError,
}: {
  preview: BulkImportPreview;
  inactivarFaltantes: boolean;
  setInactivarFaltantes: (v: boolean) => void;
  confirmError: unknown;
}): React.ReactElement {
  const [filtro, setFiltro] = useState<ImportRowAction | 'todos'>('todos');
  const filas = useMemo(
    () =>
      filtro === 'todos'
        ? preview.filas
        : preview.filas.filter((f) => f.action === filtro),
    [preview, filtro],
  );

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard
          label="Nuevos"
          value={preview.nuevos}
          tone={preview.nuevos > 0 ? 'good' : 'mute'}
        />
        <StatCard
          label="Actualizar"
          value={preview.actualizados}
          tone={preview.actualizados > 0 ? 'good' : 'mute'}
        />
        <StatCard
          label="Excepción"
          value={preview.enExcepcion}
          tone={preview.enExcepcion > 0 ? 'warn' : 'mute'}
          hint={`máx. ${preview.cupoExcepcionesDisponible}`}
        />
        <StatCard
          label="Rechazados"
          value={preview.rechazados}
          tone={preview.rechazados > 0 ? 'bad' : 'mute'}
        />
        <StatCard
          label="A inactivar"
          value={preview.inactivarFilas.length}
          tone={preview.inactivarFilas.length > 0 ? 'warn' : 'mute'}
        />
      </div>

      {preview.rechazados > 0 && (
        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded text-xs text-danger">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Hay <b>{preview.rechazados}</b> fila(s) con problemas. Esas filas{' '}
            <b>no se aplicarán</b>. Revísalas en la tabla; si todo es esperable,
            puedes continuar igual.
          </span>
        </div>
      )}

      {confirmError != null && (
        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded text-xs text-danger">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            No se pudo aplicar el import:{' '}
            {confirmError instanceof Error ? confirmError.message : 'error desconocido'}
          </span>
        </div>
      )}

      {/* Inactivar faltantes */}
      {preview.inactivarFilas.length > 0 && (
        <div className="p-3 bg-paper-dark border border-line rounded">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={inactivarFaltantes}
              onChange={(e) => setInactivarFaltantes(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-semibold">
                Marcar como INACTIVO a {preview.inactivarFilas.length} jugador(es)
                que NO vienen en el archivo
              </div>
              <details className="mt-1">
                <summary className="text-xs text-ink-mute cursor-pointer hover:text-ink">
                  Ver lista
                </summary>
                <div className="mt-2 text-xs text-ink-mute space-y-0.5 max-h-32 overflow-y-auto">
                  {preview.inactivarFilas.map((j) => (
                    <div key={j.jugadorId}>
                      <span className="font-mono">{j.rut}</span> — {j.nombres}{' '}
                      {j.apellidos}
                    </div>
                  ))}
                </div>
              </details>
              <div className="text-xs text-ink-mute mt-1">
                Quedan en la historia (no se borran). Puedes reactivarlos
                manualmente desde la ficha del club.
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Filtro + tabla */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-mute">Mostrar:</span>
        {(['todos', 'NUEVO', 'ACTUALIZAR', 'EN_EXCEPCION', 'RECHAZADO'] as const).map(
          (k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              className={cn(
                'px-2 py-1 rounded font-semibold',
                filtro === k
                  ? 'bg-ink text-paper'
                  : 'bg-paper border border-line hover:bg-paper-dark',
              )}
            >
              {k === 'todos' ? 'Todos' : labelAction(k)}
            </button>
          ),
        )}
      </div>

      <div className="border border-line rounded overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead className="bg-paper-dark border-b border-line">
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink-mute font-semibold">
              <th className="px-3 py-2">RUT</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Edad</th>
              <th className="px-3 py-2">Acción</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filas.map((f, i) => (
              <PreviewRow key={`${f.rut}-${i}`} fila={f} />
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-mute italic">
                  Sin filas en este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function PreviewRow({
  fila,
}: {
  fila: BulkImportPreviewRow;
}): React.ReactElement {
  return (
    <tr
      className={cn(
        fila.action === 'RECHAZADO' && 'bg-danger/5',
        fila.action === 'EN_EXCEPCION' && 'bg-accent/5',
      )}
    >
      <td className="px-3 py-2 font-mono">{fila.rut}</td>
      <td className="px-3 py-2">
        {fila.nombres} {fila.apellidos}
      </td>
      <td className="px-3 py-2 font-mono">{fila.edadCalendario ?? '—'}</td>
      <td className="px-3 py-2">
        <ActionBadge action={fila.action} />
      </td>
      <td className="px-3 py-2 text-ink-mute">
        {fila.motivo ?? (fila.cambios.length > 0 ? fila.cambios.join(', ') : '—')}
      </td>
    </tr>
  );
}

function ActionBadge({
  action,
}: {
  action: ImportRowAction;
}): React.ReactElement {
  const map: Record<ImportRowAction, { bg: string; text: string; label: string }> = {
    NUEVO: {
      bg: 'bg-green-bright/15',
      text: 'text-green-deep',
      label: 'Nuevo',
    },
    ACTUALIZAR: {
      bg: 'bg-paper-dark',
      text: 'text-ink',
      label: 'Actualizar',
    },
    EN_EXCEPCION: {
      bg: 'bg-accent/15',
      text: 'text-accent',
      label: 'Excepción',
    },
    INACTIVAR: {
      bg: 'bg-ink-mute/15',
      text: 'text-ink-mute',
      label: 'Inactivar',
    },
    RECHAZADO: {
      bg: 'bg-danger/15',
      text: 'text-danger',
      label: 'Rechazado',
    },
  };
  const s = map[action];
  return (
    <span
      className={cn(
        'inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold',
        s.bg,
        s.text,
      )}
    >
      {s.label}
    </span>
  );
}

function labelAction(a: ImportRowAction): string {
  return {
    NUEVO: 'Nuevos',
    ACTUALIZAR: 'Actualizar',
    EN_EXCEPCION: 'Excepción',
    INACTIVAR: 'Inactivar',
    RECHAZADO: 'Rechazados',
  }[a];
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'mute';
  hint?: string;
}): React.ReactElement {
  const colors = {
    good: 'text-green-bright',
    warn: 'text-accent',
    bad: 'text-danger',
    mute: 'text-ink-mute',
  };
  return (
    <div className="border border-line rounded p-2.5 bg-paper">
      <CardLabel>{label}</CardLabel>
      <div className={cn('font-display text-2xl tracking-display', colors[tone])}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-ink-mute">{hint}</div>}
    </div>
  );
}

function DoneStep({
  result,
}: {
  result: BulkImportResult;
}): React.ReactElement {
  return (
    <div className="text-center py-6">
      <CheckCircle2 size={48} className="mx-auto text-green-bright mb-3" />
      <div className="font-display text-2xl text-green-deep tracking-display mb-1">
        Importación aplicada
      </div>
      <p className="text-sm text-ink-mute mb-5">
        Se procesaron {result.totalFilas} filas.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        <StatCard label="Creados" value={result.creados} tone="good" />
        <StatCard label="Actualizados" value={result.actualizados} tone="good" />
        <StatCard label="Excepción" value={result.enExcepcion} tone="warn" />
        <StatCard label="Rechazados" value={result.rechazados} tone="bad" />
        <StatCard label="Inactivados" value={result.inactivados} tone="warn" />
      </div>

      {result.errores.length > 0 && (
        <details className="text-left">
          <summary className="text-xs text-ink-mute cursor-pointer hover:text-ink">
            Ver {result.errores.length} errores
          </summary>
          <div className="mt-2 p-3 bg-danger/5 border border-danger/30 rounded text-xs space-y-1">
            {result.errores.map((e, i) => (
              <div key={i}>
                <span className="font-mono font-semibold">{e.rut}:</span>{' '}
                {e.motivo}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ───── Helpers de parseo ─────

/**
 * Mapea una fila cruda del Excel a BulkImportRow. Las columnas pueden
 * venir con distinto casing — normalizamos las keys.
 *
 * Returns null si la fila no tiene RUT (probablemente fila vacía).
 */
function mapRowToBulkImport(raw: Record<string, unknown>): BulkImportRow | null {
  const norm = normalizeKeys(raw);
  const rut = pick(norm, 'rut', 'RUT', 'run', 'RUN');
  if (!rut || String(rut).trim() === '') return null;
  return {
    rut: String(rut).trim(),
    nombres: String(pick(norm, 'nombres', 'nombre') ?? '').trim(),
    apellidos: String(pick(norm, 'apellidos', 'apellido') ?? '').trim(),
    fechaNac: parseFechaNac(pick(norm, 'fechanac', 'fechanacimiento', 'nacimiento')),
    email: optionalStr(pick(norm, 'email', 'correo', 'mail')),
    telefono: optionalStr(pick(norm, 'telefono', 'tel', 'celular', 'fono')),
    numeroCamiseta: optionalStr(
      pick(norm, 'numerocamiseta', 'camiseta', 'numero', 'dorsal'),
    ),
    posicion: optionalStr(pick(norm, 'posicion', 'pos'))?.toUpperCase() ?? null,
    capitan: parseCapitan(pick(norm, 'capitan', 'capi')),
    // Contacto de emergencia (sprint 33A). Tolerante a varios nombres
    // de columna y casing.
    telefonoContacto: optionalStr(
      pick(
        norm,
        'telefonocontacto',
        'telefonoemergencia',
        'contactotelefono',
        'telcontacto',
      ),
    ),
    nombreContacto: optionalStr(
      pick(
        norm,
        'nombrecontacto',
        'nombreemergencia',
        'contactonombre',
        'contacto',
      ),
    ),
  };
}

function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase().replace(/\s+/g, '')] = v;
  }
  return out;
}

function pick(
  obj: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const k of keys) {
    const norm = k.trim().toLowerCase().replace(/\s+/g, '');
    if (norm in obj && obj[norm] != null && obj[norm] !== '') {
      return obj[norm];
    }
  }
  return null;
}

function parseCapitan(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === 'true' || t === 'si' || t === 'sí' || t === '1' || t === 'x';
  }
  return false;
}

function optionalStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * SheetJS puede devolver la fecha como string ISO, dd/mm/yyyy, o
 * número de serie de Excel cuando raw:false no lo convirtió bien.
 * Normalizamos a ISO 'YYYY-MM-DD'.
 */
function parseFechaNac(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  // ISO ya
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m && m[1] && m[2] && m[3]) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) yy = Number(yy) > 30 ? `19${yy}` : `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  // Como último recurso intentamos Date
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}
