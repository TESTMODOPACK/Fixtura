'use client';

import type { EstadoMultaInforme } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useDelegadoSancionados } from '@/hooks/use-delegado';
import { cn } from '@/lib/cn';

function clp(n: number | null): string {
  return n == null ? '—' : `$${n.toLocaleString('es-CL')}`;
}

const MULTA_BADGE: Record<EstadoMultaInforme, string> = {
  PAGADO: 'bg-green-bright/15 text-green-bright',
  PENDIENTE: 'bg-orange-700/15 text-orange-700',
  VENCIDO: 'bg-danger/15 text-danger',
};

export default function ClubDisciplinaPage(): React.ReactElement {
  const { data, isLoading } = useDelegadoSancionados();
  const sanciones = data ?? [];

  return (
    <div>
      <PageHead
        eyebrow="Mi club"
        title="Sanciones"
        sub="Jugadores de tu club con sanción vigente: cuántas fechas faltan, cuándo vuelven y si hay multa pendiente."
      />

      {isLoading && <p className="text-ink-mute">Cargando…</p>}

      {!isLoading && (
        <Card padding="comfortable">
          <CardLabel>Sancionados vigentes</CardLabel>
          {sanciones.length === 0 ? (
            <p className="text-sm text-ink-mute mt-2 italic">
              No tienes jugadores con sanción vigente. 👏
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                    <th className="py-2 pr-3">Jugador</th>
                    <th className="py-2 pr-3">Motivo</th>
                    <th className="py-2 pr-3 text-center">Total</th>
                    <th className="py-2 pr-3 text-center">Cumplidas</th>
                    <th className="py-2 pr-3 text-center">Pendientes</th>
                    <th className="py-2 pr-3 text-center">Vuelve</th>
                    <th className="py-2 pr-3">Multa</th>
                  </tr>
                </thead>
                <tbody>
                  {sanciones.map((s) => (
                    <tr key={s.sancionId} className="border-b border-line/50">
                      <td className="py-2 pr-3 font-medium text-ink">
                        {s.jugadorNombre}
                        {s.rut && <span className="text-ink-mute text-xs"> · {s.rut}</span>}
                      </td>
                      <td className="py-2 pr-3 text-ink-mute">{s.motivo}</td>
                      <td className="py-2 pr-3 text-center tabular-nums">{s.fechasTotales}</td>
                      <td className="py-2 pr-3 text-center tabular-nums text-green-bright">
                        {s.fechasCumplidas}
                      </td>
                      <td className="py-2 pr-3 text-center tabular-nums font-semibold text-orange-700">
                        {s.fechasPendientes}
                      </td>
                      <td className="py-2 pr-3 text-center tabular-nums">
                        fecha {s.vuelveEnFecha}
                      </td>
                      <td className="py-2 pr-3">
                        {s.multaMonto == null || s.multaEstado == null ? (
                          <span className="text-ink-mute">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className="tabular-nums">{clp(s.multaMonto)}</span>
                            <span
                              className={cn(
                                'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold',
                                MULTA_BADGE[s.multaEstado],
                              )}
                            >
                              {s.multaEstado === 'PAGADO'
                                ? 'Pagada'
                                : s.multaEstado === 'VENCIDO'
                                  ? 'Vencida'
                                  : 'Pendiente'}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
