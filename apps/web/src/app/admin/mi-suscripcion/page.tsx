'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
} from 'lucide-react';

import { ESTADO_FACTURA_LABEL, METODO_PAGO_LABEL } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useMisFacturas,
  useMiSuscripcion,
  usePagarFacturaWebpay,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatFecha } from '@/lib/format';
import { redirectToPasarela } from '@/lib/pasarela';

export default function MiSuscripcionPage(): React.ReactElement {
  const { data: cuenta, isLoading: loadCuenta, error: errCuenta } = useMiSuscripcion();
  const { data: facturas, isLoading: loadFact, error: errFact } = useMisFacturas();
  const pagar = usePagarFacturaWebpay();
  const apiError = (errCuenta ?? errFact) as ApiError | undefined;

  function handlePagar(facturaId: string): void {
    pagar.mutate(facturaId, {
      onSuccess: (r) => {
        // Redirige a la pasarela (valida destino). En modo mock vuelve a la app.
        try {
          redirectToPasarela(r.url);
        } catch (e) {
          alert(`Error al iniciar el pago: ${(e as Error).message}`);
        }
      },
      onError: (e) => alert(`Error al iniciar el pago: ${(e as Error).message}`),
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Tu liga"
        title="Mi suscripción"
        sub="Resumen de tu plan de LigaPlus, facturas y opciones de pago."
      />

      {apiError && (
        <Card padding="roomy" className="mb-5 border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR TU SUSCRIPCIÓN
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {(loadCuenta || loadFact) && (
        <Card padding="roomy">
          <div className="text-center text-ink-mute py-8">
            <Loader2 size={20} className="inline animate-spin mr-2" />
            Cargando…
          </div>
        </Card>
      )}

      {/* Estado de cuenta */}
      {cuenta && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <Card padding="comfortable">
              <CardLabel>Plan actual</CardLabel>
              <div className="text-2xl font-display tracking-display text-ink mt-1">
                {cuenta.plan?.nombre ?? 'Sin plan'}
              </div>
              <div className="text-sm text-ink-mute mt-1">
                {cuenta.plan
                  ? `$${cuenta.plan.precioMensualClp.toLocaleString('es-CL')} CLP / mes`
                  : 'Contacta a LigaPlus'}
              </div>
              <div
                className={cn(
                  'inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium',
                  cuenta.estadoSuscripcion === 'ACTIVO'
                    ? 'bg-green-bright/15 text-green-bright'
                    : cuenta.estadoSuscripcion === 'TRIAL'
                      ? 'bg-orange-700/15 text-orange-700'
                      : 'bg-danger/15 text-danger',
                )}
              >
                {cuenta.estadoSuscripcion}
              </div>
            </Card>
            <Card padding="comfortable">
              <CardLabel>Total adeudado</CardLabel>
              <div
                className={cn(
                  'text-3xl font-display tracking-display mt-1',
                  cuenta.totalAdeudado > 0 ? 'text-danger' : 'text-green-bright',
                )}
              >
                ${cuenta.totalAdeudado.toLocaleString('es-CL')}
              </div>
              <div className="text-xs text-ink-mute mt-1">
                {cuenta.facturasPendientes} pendientes · {cuenta.facturasVencidas} vencidas
              </div>
            </Card>
            <Card padding="comfortable">
              <CardLabel>Última factura pagada</CardLabel>
              {cuenta.ultimaFacturaPagada ? (
                <>
                  <div className="text-2xl font-display tracking-display text-ink mt-1">
                    {String(cuenta.ultimaFacturaPagada.periodoMes).padStart(2, '0')}/
                    {cuenta.ultimaFacturaPagada.periodoAnio}
                  </div>
                  <div className="text-xs text-ink-mute mt-1">
                    {formatFecha(cuenta.ultimaFacturaPagada.fechaPago)}
                  </div>
                </>
              ) : (
                <div className="text-ink-mute mt-2">Sin pagos registrados aún.</div>
              )}
            </Card>
          </div>

          {/* Aviso de mora */}
          {cuenta.diasMaxMora > 0 && (
            <Card padding="roomy" className="mb-5 border-2 border-orange-700/40 bg-orange-700/5">
              <div className="flex items-start gap-3">
                <Clock size={22} className="text-orange-700 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-display tracking-display text-xl text-orange-700 mb-1">
                    TIENES PAGOS PENDIENTES
                  </div>
                  <div className="text-sm">
                    Tu factura más antigua tiene <strong>{cuenta.diasMaxMora} días</strong>{' '}
                    de mora.
                    {cuenta.diasMaxMora >= 20 && (
                      <>
                        {' '}
                        A los 30 días, tu liga se suspende automáticamente. Paga ahora
                        para evitar interrupciones.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Listado de facturas */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display tracking-display text-xl text-ink">
          Historial de facturas
        </h2>
      </div>

      {facturas && facturas.length === 0 && (
        <Card padding="roomy">
          <div className="text-center text-ink-mute py-8">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            Aún no se generaron facturas para tu liga.
          </div>
        </Card>
      )}

      {facturas && facturas.length > 0 && (
        <Card padding="comfortable" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-mute text-left text-xs uppercase text-ink-mute">
                <th className="py-2 pr-3">Período</th>
                <th className="py-2 pr-3">Monto</th>
                <th className="py-2 pr-3">Vencimiento</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Método</th>
                <th className="py-2 pr-3">Boleta</th>
                <th className="py-2 pr-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-paper-mute/30 hover:bg-paper/50">
                  <td className="py-2 pr-3">
                    {String(f.periodoMes).padStart(2, '0')}/{f.periodoAnio}
                  </td>
                  <td className="py-2 pr-3 font-medium">
                    ${f.monto.toLocaleString('es-CL')}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{f.fechaVencimiento}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded text-xs font-medium',
                        f.estado === 'PAGADA'
                          ? 'bg-green-bright/15 text-green-bright'
                          : f.estado === 'VENCIDA'
                            ? 'bg-danger/15 text-danger'
                            : f.estado === 'PENDIENTE'
                              ? 'bg-orange-700/15 text-orange-700'
                              : 'bg-ink-mute/15 text-ink-mute',
                      )}
                    >
                      {ESTADO_FACTURA_LABEL[f.estado]}
                      {f.diasMora > 0 && f.estado !== 'PAGADA' && f.estado !== 'ANULADA' && (
                        <> · {f.diasMora}d mora</>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">
                    {f.metodoPago ? METODO_PAGO_LABEL[f.metodoPago] : '—'}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">
                    {f.docTributarioId ? (
                      <CheckCircle2 size={16} className="text-green-bright" />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {(f.estado === 'PENDIENTE' || f.estado === 'VENCIDA') && (
                      <Button
                        size="sm"
                        onClick={() => handlePagar(f.id)}
                        disabled={pagar.isPending}
                      >
                        <CreditCard size={14} className="mr-1" />
                        {pagar.isPending ? 'Procesando…' : 'Pagar'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card padding="comfortable" className="mt-5">
        <CardLabel>Métodos de pago aceptados</CardLabel>
        <ul className="mt-2 text-sm text-ink-mute space-y-1">
          <li>· Webpay (tarjetas de crédito y débito chilenas)</li>
          <li>· MercadoPago (próximamente)</li>
          <li>· Transferencia bancaria (pide los datos a contacto@fixtura.cl)</li>
        </ul>
      </Card>
    </>
  );
}
