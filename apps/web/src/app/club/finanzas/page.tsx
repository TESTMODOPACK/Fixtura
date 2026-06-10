'use client';

import { CreditCard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHead } from '@/components/ui/page-head';
import { useDelegadoFinanzas, usePagarCobroDelegado } from '@/hooks/use-delegado';
import { toastError } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { formatFecha } from '@/lib/format';

function clp(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

const ESTADO_CLASS: Record<string, string> = {
  PENDIENTE: 'bg-orange-700/15 text-orange-700',
  VENCIDO: 'bg-danger/15 text-danger',
  PAGADO: 'bg-green-bright/15 text-green-bright',
  CANCELADO: 'bg-ink-mute/15 text-ink-mute',
};

export default function ClubFinanzasPage(): React.ReactElement {
  const { data, isLoading } = useDelegadoFinanzas();
  const pagar = usePagarCobroDelegado();

  const onPagar = (cobroId: string): void => {
    pagar.mutate(cobroId, {
      onError: (err) => toastError(err),
    });
  };

  return (
    <div>
      <PageHead
        eyebrow="Mi club"
        title="Pagos y deudas"
        sub="Estado de cuenta de tu club. Podés pagar en línea las deudas pendientes."
      />

      {isLoading && <p className="text-ink-mute">Cargando…</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <KpiCard
              label="Total pendiente"
              value={clp(data.totalPendiente)}
              variant={data.totalPendiente > 0 ? 'dark' : 'default'}
            />
            <KpiCard
              label="Vencido"
              value={clp(data.totalVencido)}
              sub="deuda atrasada"
            />
          </div>

          <Card padding="comfortable">
            <CardLabel>Detalle de cobros</CardLabel>
            {data.cobros.length === 0 ? (
              <p className="text-sm text-ink-mute mt-2 italic">
                Tu club no tiene cobros registrados.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                      <th className="py-2 pr-3">Concepto</th>
                      <th className="py-2 pr-3">Torneo</th>
                      <th className="py-2 pr-3">Vence</th>
                      <th className="py-2 pr-3 text-right">Monto</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2 pr-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cobros.map((c) => {
                      const pagable = c.estado === 'PENDIENTE' || c.estado === 'VENCIDO';
                      const pagandoEste = pagar.isPending && pagar.variables === c.id;
                      return (
                        <tr key={c.id} className="border-b border-line/50">
                          <td className="py-2 pr-3 font-medium text-ink">{c.concepto}</td>
                          <td className="py-2 pr-3 text-ink-mute">{c.torneoNombre ?? '—'}</td>
                          <td className="py-2 pr-3 text-ink-mute">
                            {c.vencimiento ? formatFecha(c.vencimiento) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums font-semibold">
                            {clp(c.monto)}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={cn(
                                'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold',
                                ESTADO_CLASS[c.estado],
                              )}
                            >
                              {c.estado}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {pagable && (
                              <Button
                                variant="accent"
                                size="sm"
                                loading={pagandoEste}
                                disabled={pagar.isPending}
                                onClick={() => onPagar(c.id)}
                              >
                                <CreditCard size={14} /> Pagar
                              </Button>
                            )}
                            {c.estado === 'PAGADO' && (
                              <span className="text-xs text-green-bright">Pagado</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
