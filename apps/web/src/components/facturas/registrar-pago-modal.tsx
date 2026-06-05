'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

import { METODO_PAGO_LABEL, type FacturaPlataforma } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { useRegistrarPagoManual } from '@/hooks/use-admin';

interface Props {
  factura: FacturaPlataforma;
  onClose: () => void;
}

export function RegistrarPagoModal({ factura, onClose }: Props): React.ReactElement {
  const [metodoPago, setMetodoPago] = useState<'TRANSFERENCIA' | 'MANUAL'>(
    'TRANSFERENCIA',
  );
  const [observaciones, setObservaciones] = useState('');
  // TZ fix — 'en-CA' da 'YYYY-MM-DD' en hora local. toISOString() daría
  // el día UTC (mañana entre 20:00-23:59 en Chile).
  const [fechaPago, setFechaPago] = useState(
    new Date().toLocaleDateString('en-CA'),
  );
  const mut = useRegistrarPagoManual();

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    mut.mutate(
      {
        facturaId: factura.id,
        input: { metodoPago, observaciones: observaciones || undefined, fechaPago },
      },
      {
        onSuccess: () => {
          alert(`Pago registrado para ${factura.tenantNombre}.`);
          onClose();
        },
        onError: (e) => alert(`Error: ${(e as Error).message}`),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display tracking-display text-2xl text-ink">
              Registrar pago manual
            </h2>
            <p className="text-sm text-ink-mute mt-1">
              {factura.tenantNombre} — período{' '}
              {String(factura.periodoMes).padStart(2, '0')}/{factura.periodoAnio}
            </p>
            <p className="text-sm text-ink-mute">
              Monto: <strong>${factura.monto.toLocaleString('es-CL')} CLP</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-mute hover:text-ink"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Método de pago
            </label>
            <select
              value={metodoPago}
              onChange={(e) =>
                setMetodoPago(e.target.value as 'TRANSFERENCIA' | 'MANUAL')
              }
              className="w-full border border-paper-mute rounded px-3 py-2"
            >
              <option value="TRANSFERENCIA">
                {METODO_PAGO_LABEL.TRANSFERENCIA}
              </option>
              <option value="MANUAL">{METODO_PAGO_LABEL.MANUAL}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Fecha de pago
            </label>
            <input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className="w-full border border-paper-mute rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Observaciones <span className="text-ink-mute">(opcional)</span>
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full border border-paper-mute rounded px-3 py-2"
              placeholder="Comprobante BCI #12345, etc."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
