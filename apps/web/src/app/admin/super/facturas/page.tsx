'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Filter,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  ESTADO_FACTURA_LABEL,
  METODO_PAGO_LABEL,
  type EstadoFacturaPlataforma,
  type FacturaPlataforma,
} from '@fixtura/types';

import { AnularFacturaModal } from '@/components/facturas/anular-factura-modal';
import { RegistrarPagoModal } from '@/components/facturas/registrar-pago-modal';
import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useFacturasPlataforma,
  useGenerarFacturasMes,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const BADGE_ESTADO: Record<EstadoFacturaPlataforma, string> = {
  PENDIENTE: 'bg-orange-700/15 text-orange-700',
  PAGADA: 'bg-green-bright/15 text-green-bright',
  VENCIDA: 'bg-danger/15 text-danger',
  ANULADA: 'bg-ink-mute/15 text-ink-mute',
};

const ESTADOS: Array<{ value: EstadoFacturaPlataforma | 'TODOS'; label: string }> = [
  { value: 'TODOS', label: 'Todas' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'VENCIDA', label: 'Vencidas' },
  { value: 'PAGADA', label: 'Pagadas' },
  { value: 'ANULADA', label: 'Anuladas' },
];

export default function FacturasPlataformaPage(): React.ReactElement {
  const [estado, setEstado] = useState<EstadoFacturaPlataforma | 'TODOS'>('TODOS');
  const [anio, setAnio] = useState<number | undefined>(undefined);
  const [mes, setMes] = useState<number | undefined>(undefined);
  const [pagarFactura, setPagarFactura] = useState<FacturaPlataforma | null>(null);
  const [anularFactura, setAnularFactura] = useState<FacturaPlataforma | null>(null);

  const { data: facturas, isLoading, error } = useFacturasPlataforma({
    estado: estado === 'TODOS' ? undefined : estado,
    anio,
    mes,
  });
  const apiError = error as ApiError | undefined;
  const generar = useGenerarFacturasMes();

  const totales = useMemo(() => {
    if (!facturas) return { totalAdeudado: 0, cantidadVencidas: 0, cantidadPagadas: 0 };
    return facturas.reduce(
      (acc, f) => {
        if (f.estado === 'VENCIDA' || f.estado === 'PENDIENTE')
          acc.totalAdeudado += f.monto;
        if (f.estado === 'VENCIDA') acc.cantidadVencidas += 1;
        if (f.estado === 'PAGADA') acc.cantidadPagadas += 1;
        return acc;
      },
      { totalAdeudado: 0, cantidadVencidas: 0, cantidadPagadas: 0 },
    );
  }, [facturas]);

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Facturación a ligas"
        sub="Cobros mensuales de Fixtura a las ligas suscriptas. Acciones solo para el administrador del sistema."
      >
        <Link href="/admin/super">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} className="mr-1" />
            Volver
          </Button>
        </Link>
        <Button
          onClick={() => {
            if (
              confirm(
                '¿Generar facturas del mes actual para todas las ligas activas? ' +
                  'Es idempotente: si ya existen, no se duplican.',
              )
            ) {
              generar.mutate(undefined, {
                onSuccess: (r) =>
                  alert(`${r.creadas} facturas creadas, ${r.saltadas} saltadas.`),
                onError: (e) => alert(`Error: ${(e as Error).message}`),
              });
            }
          }}
          disabled={generar.isPending}
        >
          <PlayCircle size={16} className="mr-1" />
          Generar mes actual
        </Button>
      </PageHead>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Card padding="comfortable">
          <CardLabel>Total adeudado</CardLabel>
          <div className="text-3xl font-display tracking-display text-ink mt-1">
            ${totales.totalAdeudado.toLocaleString('es-CL')}
          </div>
          <div className="text-xs text-ink-mute">CLP — pendiente + vencido</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Facturas vencidas</CardLabel>
          <div className="text-3xl font-display tracking-display text-danger mt-1">
            {totales.cantidadVencidas}
          </div>
          <div className="text-xs text-ink-mute">Ligas con mora activa</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Facturas pagadas</CardLabel>
          <div className="text-3xl font-display tracking-display text-green-bright mt-1">
            {totales.cantidadPagadas}
          </div>
          <div className="text-xs text-ink-mute">Histórico filtrado</div>
        </Card>
      </div>

      {/* Filtros */}
      <Card padding="comfortable" className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={16} className="text-ink-mute" />
          <span className="text-sm text-ink-mute mr-2">Filtrar:</span>
          <div className="flex flex-wrap gap-1">
            {ESTADOS.map((e) => (
              <button
                key={e.value}
                onClick={() => setEstado(e.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-sm transition-colors',
                  estado === e.value
                    ? 'bg-accent text-white'
                    : 'bg-paper hover:bg-paper-mute border border-paper-mute',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <select
              value={anio ?? ''}
              onChange={(ev) => setAnio(ev.target.value ? Number(ev.target.value) : undefined)}
              className="text-sm border border-paper-mute rounded px-2 py-1"
            >
              <option value="">Todos los años</option>
              {[2026, 2025, 2024].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={mes ?? ''}
              onChange={(ev) => setMes(ev.target.value ? Number(ev.target.value) : undefined)}
              className="text-sm border border-paper-mute rounded px-2 py-1"
            >
              <option value="">Todos los meses</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {apiError && (
        <Card padding="roomy" className="mb-5 border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR LAS FACTURAS
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {isLoading && (
        <Card padding="roomy">
          <div className="text-center text-ink-mute py-8">Cargando…</div>
        </Card>
      )}

      {!isLoading && facturas && facturas.length === 0 && (
        <Card padding="roomy">
          <div className="text-center text-ink-mute py-8">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            No hay facturas que coincidan con los filtros.
          </div>
        </Card>
      )}

      {facturas && facturas.length > 0 && (
        <Card padding="comfortable" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-mute text-left text-xs uppercase text-ink-mute">
                <th className="py-2 pr-3">Liga</th>
                <th className="py-2 pr-3">Período</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Monto</th>
                <th className="py-2 pr-3">Vencimiento</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Método</th>
                <th className="py-2 pr-3">Días mora</th>
                <th className="py-2 pr-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-paper-mute/30 hover:bg-paper/50">
                  <td className="py-2 pr-3 font-medium">{f.tenantNombre}</td>
                  <td className="py-2 pr-3">
                    {String(f.periodoMes).padStart(2, '0')}/{f.periodoAnio}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{f.planNombre ?? '—'}</td>
                  <td className="py-2 pr-3">${f.monto.toLocaleString('es-CL')}</td>
                  <td className="py-2 pr-3 text-ink-mute">{f.fechaVencimiento}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded text-xs font-medium',
                        BADGE_ESTADO[f.estado],
                      )}
                    >
                      {ESTADO_FACTURA_LABEL[f.estado]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">
                    {f.metodoPago ? METODO_PAGO_LABEL[f.metodoPago] : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {f.diasMora > 0 ? (
                      <span className="text-danger font-medium">{f.diasMora}</span>
                    ) : (
                      <span className="text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {(f.estado === 'PENDIENTE' || f.estado === 'VENCIDA') && (
                      <>
                        <button
                          onClick={() => setPagarFactura(f)}
                          className="text-xs text-green-bright hover:underline mr-2"
                        >
                          <CheckCircle2 size={14} className="inline mr-0.5" />
                          Registrar pago
                        </button>
                        <button
                          onClick={() => setAnularFactura(f)}
                          className="text-xs text-danger hover:underline"
                        >
                          <XCircle size={14} className="inline mr-0.5" />
                          Anular
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pagarFactura && (
        <RegistrarPagoModal
          factura={pagarFactura}
          onClose={() => setPagarFactura(null)}
        />
      )}
      {anularFactura && (
        <AnularFacturaModal
          factura={anularFactura}
          onClose={() => setAnularFactura(null)}
        />
      )}
    </>
  );
}
