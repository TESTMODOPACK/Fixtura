'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Coins,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  METODO_PAGO_LIQUIDACION,
  METODO_PAGO_LIQUIDACION_LABEL,
  type CuentaPorPagarPersona,
  type MetodoPagoLiquidacion,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCuentasPorPagar,
  useEliminarLiquidacion,
  useLiquidaciones,
  useLiquidar,
} from '@/hooks/use-admin';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { cn } from '@/lib/cn';

function formatCLP(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

const ROL_LABEL: Record<string, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Árbitro asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

function rolLabel(rol: string): string {
  return ROL_LABEL[rol] ?? rol;
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  // iso puede venir como YYYY-MM-DD (date) o full datetime.
  const soloFecha = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(soloFecha);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

type Tab = 'cuentas' | 'historial';

export default function PagosPersonalPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('cuentas');
  const [pagarPersona, setPagarPersona] = useState<CuentaPorPagarPersona | null>(
    null,
  );

  return (
    <div>
      <PageHead
        eyebrow="Operaciones"
        title="Pagos a personal"
        sub="Cuentas por pagar a árbitros, planilleros y staff por sus asistencias confirmadas."
      />

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('cuentas')}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition',
            tab === 'cuentas'
              ? 'bg-green-deep text-white'
              : 'bg-paper-2 text-ink-mute hover:bg-paper-3',
          )}
        >
          Cuentas por pagar
        </button>
        <button
          type="button"
          onClick={() => setTab('historial')}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition',
            tab === 'historial'
              ? 'bg-green-deep text-white'
              : 'bg-paper-2 text-ink-mute hover:bg-paper-3',
          )}
        >
          Historial de pagos
        </button>
      </div>

      {tab === 'cuentas' ? (
        <CuentasTab onPagar={setPagarPersona} />
      ) : (
        <HistorialTab />
      )}

      {pagarPersona && (
        <PagarModal
          persona={pagarPersona}
          onClose={() => setPagarPersona(null)}
        />
      )}
    </div>
  );
}

// ─── Tab: cuentas por pagar ─────────────────────────────────────────

function CuentasTab({
  onPagar,
}: {
  onPagar: (p: CuentaPorPagarPersona) => void;
}): React.ReactElement {
  const { data, isLoading } = useCuentasPorPagar();
  const [expandido, setExpandido] = useState<string | null>(null);

  const personas = data?.personas ?? [];

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardLabel>Total pendiente</CardLabel>
          <div className="flex items-center gap-2 text-3xl font-display text-green-deep">
            <Coins className="h-6 w-6 text-orange-700" />
            {isLoading ? '…' : formatCLP(data?.totalPendienteGlobal ?? 0)}
          </div>
        </Card>
        <Card>
          <CardLabel>Personas con saldo</CardLabel>
          <div className="flex items-center gap-2 text-3xl font-display text-green-deep">
            <Users className="h-6 w-6 text-ink-mute" />
            {isLoading ? '…' : personas.length}
          </div>
        </Card>
        <Card>
          <CardLabel>Sin monto definido</CardLabel>
          <div className="flex items-center gap-2 text-3xl font-display text-green-deep">
            <AlertTriangle
              className={cn(
                'h-6 w-6',
                (data?.sinMontoCount ?? 0) > 0 ? 'text-danger' : 'text-ink-mute',
              )}
            />
            {isLoading ? '…' : data?.sinMontoCount ?? 0}
          </div>
        </Card>
      </div>

      {(data?.sinMontoCount ?? 0) > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" />
          <p>
            Hay <strong>{data?.sinMontoCount}</strong> asistencia(s) confirmada(s)
            sin monto de pago definido. No se pueden liquidar hasta asignarles un
            monto en la designación correspondiente.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-ink-mute">Cargando…</p>
      ) : personas.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-mute">
            <Wallet className="h-10 w-10 opacity-40" />
            <p className="font-medium">No hay cuentas por pagar</p>
            <p className="text-sm">
              Las designaciones marcadas como <strong>ASISTIÓ</strong> con un monto
              definido aparecerán acá.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {personas.map((p) => {
            const abierto = expandido === p.personalId;
            return (
              <Card key={p.personalId} padding="tight">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3 text-left"
                    onClick={() =>
                      setExpandido(abierto ? null : p.personalId)
                    }
                  >
                    {abierto ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-mute" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-mute" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-green-deep">
                        {p.nombre} {p.apellido}
                      </p>
                      <p className="text-sm text-ink-mute">
                        {p.designacionesCount} asistencia(s)
                        {p.rut ? ` · ${p.rut}` : ''}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold text-green-deep">
                      {formatCLP(p.totalPendiente)}
                    </span>
                    <Button size="sm" onClick={() => onPagar(p)}>
                      Pagar
                    </Button>
                  </div>
                </div>

                {abierto && (
                  <div className="mt-3 border-t border-line pt-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-ink-mute">
                          <th className="pb-2 font-medium">Fecha</th>
                          <th className="pb-2 font-medium">Partido</th>
                          <th className="pb-2 font-medium">Rol</th>
                          <th className="pb-2 text-right font-medium">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.detalle.map((d) => (
                          <tr key={d.designacionId} className="border-t border-line/50">
                            <td className="py-2">
                              {d.fechaNumero != null ? `F${d.fechaNumero} · ` : ''}
                              {formatFecha(d.fechaHora)}
                            </td>
                            <td className="py-2">
                              {d.equipoLocalNombre} vs {d.equipoVisitaNombre}
                              <span className="block text-xs text-ink-mute">
                                {d.torneoNombre}
                              </span>
                            </td>
                            <td className="py-2">{rolLabel(d.rolAsignado)}</td>
                            <td className="py-2 text-right">{formatCLP(d.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal: pagar (liquidar) ────────────────────────────────────────

function PagarModal({
  persona,
  onClose,
}: {
  persona: CuentaPorPagarPersona;
  onClose: () => void;
}): React.ReactElement {
  const liquidar = useLiquidar();
  const [seleccion, setSeleccion] = useState<Set<string>>(
    new Set(persona.detalle.map((d) => d.designacionId)),
  );
  const [metodoPago, setMetodoPago] = useState<MetodoPagoLiquidacion>(
    'TRANSFERENCIA',
  );
  const [comprobante, setComprobante] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fechaPago, setFechaPago] = useState('');

  const total = useMemo(
    () =>
      persona.detalle
        .filter((d) => seleccion.has(d.designacionId))
        .reduce((acc, d) => acc + d.monto, 0),
    [persona.detalle, seleccion],
  );

  function toggle(id: string): void {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(): Promise<void> {
    if (seleccion.size === 0) {
      toastWarning('Seleccioná al menos una asistencia para pagar.');
      return;
    }
    try {
      await liquidar.mutateAsync({
        personalId: persona.personalId,
        designacionIds: Array.from(seleccion),
        metodoPago,
        comprobante: comprobante.trim() || null,
        observaciones: observaciones.trim() || null,
        fechaPago: fechaPago || undefined,
      });
      toastSuccess(
        `Pago de ${formatCLP(total)} a ${persona.nombre} ${persona.apellido} registrado.`,
      );
      onClose();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl text-green-deep">
              Pagar a {persona.nombre} {persona.apellido}
            </h2>
            <p className="text-sm text-ink-mute">
              Seleccioná las asistencias a saldar con este pago.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-mute">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 space-y-1 rounded-lg border border-line p-3">
          {persona.detalle.map((d) => (
            <label
              key={d.designacionId}
              className="flex cursor-pointer items-center gap-3 py-1 text-sm"
            >
              <input
                type="checkbox"
                checked={seleccion.has(d.designacionId)}
                onChange={() => toggle(d.designacionId)}
                className="h-4 w-4"
              />
              <span className="flex-1">
                {d.fechaNumero != null ? `F${d.fechaNumero} · ` : ''}
                {d.equipoLocalNombre} vs {d.equipoVisitaNombre}
                <span className="block text-xs text-ink-mute">
                  {rolLabel(d.rolAsignado)}
                </span>
              </span>
              <span className="font-medium">{formatCLP(d.monto)}</span>
            </label>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-green-deep/5 px-4 py-3">
          <span className="font-medium text-green-deep">Total a pagar</span>
          <span className="text-xl font-semibold text-green-deep">
            {formatCLP(total)}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="metodo">
              Método de pago
            </label>
            <select
              id="metodo"
              className="input"
              value={metodoPago}
              onChange={(e) =>
                setMetodoPago(e.target.value as MetodoPagoLiquidacion)
              }
            >
              {METODO_PAGO_LIQUIDACION.map((m) => (
                <option key={m} value={m}>
                  {METODO_PAGO_LIQUIDACION_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Fecha de pago (opcional)"
            type="date"
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
          />

          <Input
            label="Comprobante / referencia (opcional)"
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
            placeholder="N° transferencia, recibo…"
            maxLength={200}
          />

          <div>
            <label className="label" htmlFor="obs">
              Observaciones (opcional)
            </label>
            <textarea
              id="obs"
              className="input min-h-[72px]"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={liquidar.isPending}
            disabled={seleccion.size === 0}
          >
            Registrar pago
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: historial de pagos ────────────────────────────────────────

function HistorialTab(): React.ReactElement {
  const { data, isLoading } = useLiquidaciones();
  const eliminar = useEliminarLiquidacion();
  const liquidaciones = data ?? [];

  async function revertir(id: string, nombre: string): Promise<void> {
    if (
      !window.confirm(
        `¿Revertir este pago a ${nombre}? Las asistencias volverán a quedar pendientes de pago.`,
      )
    ) {
      return;
    }
    try {
      await eliminar.mutateAsync(id);
      toastSuccess('Pago revertido. Las asistencias quedaron pendientes.');
    } catch (err) {
      toastError(err);
    }
  }

  if (isLoading) return <p className="text-ink-mute">Cargando…</p>;

  if (liquidaciones.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-mute">
          <Wallet className="h-10 w-10 opacity-40" />
          <p className="font-medium">Todavía no hay pagos registrados</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="tight">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-mute">
            <th className="pb-2 font-medium">Fecha</th>
            <th className="pb-2 font-medium">Persona</th>
            <th className="pb-2 font-medium">Método</th>
            <th className="pb-2 font-medium">Asistencias</th>
            <th className="pb-2 text-right font-medium">Total</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {liquidaciones.map((l) => (
            <tr key={l.id} className="border-t border-line">
              <td className="py-3">{formatFecha(l.fechaPago)}</td>
              <td className="py-3">
                {l.personalNombre} {l.personalApellido}
                {l.comprobante && (
                  <span className="block text-xs text-ink-mute">
                    {l.comprobante}
                  </span>
                )}
              </td>
              <td className="py-3">
                {METODO_PAGO_LIQUIDACION_LABEL[l.metodoPago]}
              </td>
              <td className="py-3">{l.designacionesCount}</td>
              <td className="py-3 text-right font-medium">
                {formatCLP(l.total)}
              </td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={() =>
                    revertir(l.id, `${l.personalNombre} ${l.personalApellido}`)
                  }
                  className="text-ink-mute transition hover:text-danger"
                  title="Revertir pago"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
