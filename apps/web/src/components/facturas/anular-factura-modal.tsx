'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

import type { FacturaPlataforma } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { useAnularFactura } from '@/hooks/use-admin';

interface Props {
  factura: FacturaPlataforma;
  onClose: () => void;
}

export function AnularFacturaModal({ factura, onClose }: Props): React.ReactElement {
  const [motivo, setMotivo] = useState('');
  const mut = useAnularFactura();

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (motivo.trim().length < 2) {
      alert('Indica un motivo válido.');
      return;
    }
    mut.mutate(
      { facturaId: factura.id, input: { motivo: motivo.trim() } },
      {
        onSuccess: () => {
          alert(`Factura anulada.`);
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
          <div className="flex items-start gap-2">
            <AlertTriangle size={22} className="text-danger flex-shrink-0 mt-1" />
            <div>
              <h2 className="font-display tracking-display text-2xl text-ink">
                Anular factura
              </h2>
              <p className="text-sm text-ink-mute mt-1">
                {factura.tenantNombre} — período{' '}
                {String(factura.periodoMes).padStart(2, '0')}/{factura.periodoAnio}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-mute hover:text-ink"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-danger/5 border border-danger/30 rounded p-3 mb-4 text-sm text-danger">
          Esta acción es <strong>irreversible</strong>. La factura quedará marcada como
          ANULADA y el motivo quedará registrado en el audit log.
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Motivo de anulación
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              minLength={2}
              maxLength={500}
              className="w-full border border-paper-mute rounded px-3 py-2"
              placeholder="Error en el monto, doble facturación, etc."
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending || motivo.trim().length < 2}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {mut.isPending ? 'Anulando…' : 'Anular factura'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
