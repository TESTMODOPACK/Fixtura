'use client';

import { AlertOctagon, CreditCard, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { LigaPlusLockup } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  useMiSuscripcion,
  useMisFacturas,
  usePagarFacturaWebpay,
} from '@/hooks/use-admin';
import { useLogout } from '@/hooks/use-logout';
import { formatFecha } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { useAuthStore } from '@/store/auth-store';

function clp(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

/**
 * F57 — Pantalla de pago para ligas suspendidas. A aquí redirige el front
 * cuando el backend responde 402 (SUBSCRIPTION_SUSPENDED). Solo usa los
 * endpoints de mi-suscripción, que el SubscriptionGuard deja pasar.
 */
export default function SuscripcionSuspendidaPage(): React.ReactElement | null {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useLogout();

  const { data: cuenta, isLoading } = useMiSuscripcion();
  const { data: facturas } = useMisFacturas();
  const pagar = usePagarFacturaWebpay();

  useEffect(() => {
    if (!accessToken) router.replace('/');
  }, [accessToken, router]);

  // Si la liga NO está suspendida (reactivada, trial o activa), no tiene
  // sentido esta pantalla → al panel.
  useEffect(() => {
    if (cuenta && cuenta.estadoSuscripcion !== 'SUSPENDIDO' && cuenta.estadoSuscripcion !== 'CANCELADO') {
      router.replace('/admin');
    }
  }, [cuenta, router]);

  if (!accessToken) return null;

  const impagas = (facturas ?? [])
    .filter((f) => f.estado === 'VENCIDA' || f.estado === 'PENDIENTE')
    .sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : 1));

  const onPagar = (facturaId: string): void => {
    pagar.mutate(facturaId, {
      onSuccess: (r) => {
        window.location.href = r.url;
      },
      onError: (e) => toastError(e),
    });
  };

  return (
    <div className="min-h-screen bg-paper flex items-start md:items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup showTag={false} />
        </div>

        <Card padding="roomy">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-card bg-danger/10 text-danger">
              <AlertOctagon size={22} />
            </span>
            <div>
              <h1 className="font-display text-2xl text-green-deep tracking-display leading-none">
                SUSCRIPCIÓN SUSPENDIDA
              </h1>
              <p className="text-sm text-ink-mute mt-1.5">
                El acceso de tu liga está bloqueado por falta de pago de la
                suscripción a LigaPlus. Regulariza el saldo para volver a operar
                — los datos de tu liga están a salvo.
              </p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-ink-mute text-center py-6">Cargando estado de cuenta…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 my-5">
                <div className="rounded-card border border-line p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                    Total adeudado
                  </div>
                  <div className="font-display text-2xl text-danger tracking-display mt-1">
                    {clp(cuenta?.totalAdeudado ?? 0)}
                  </div>
                </div>
                <div className="rounded-card border border-line p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                    Facturas vencidas
                  </div>
                  <div className="font-display text-2xl text-green-deep tracking-display mt-1">
                    {cuenta?.facturasVencidas ?? 0}
                  </div>
                </div>
              </div>

              {impagas.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold">
                    → Facturas a pagar
                  </div>
                  {impagas.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-3 rounded-card border border-line px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-green-deep">
                          {String(f.periodoMes).padStart(2, '0')}/{f.periodoAnio} ·{' '}
                          {clp(f.monto)}
                        </div>
                        <div className="text-xs text-ink-mute">
                          Vence {formatFecha(f.fechaVencimiento)}
                          {f.estado === 'VENCIDA' && (
                            <span className="text-danger font-semibold"> · vencida</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="accent"
                        size="sm"
                        loading={pagar.isPending && pagar.variables === f.id}
                        onClick={() => onPagar(f.id)}
                      >
                        <CreditCard size={14} /> Pagar
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-serif italic text-ink-mute text-sm">
                  No encontramos facturas pendientes. Si ya pagaste por
                  transferencia, escribinos para que registremos el pago y
                  reactivemos tu liga.
                </p>
              )}

              <div className="mt-5 rounded-card bg-paper-dark border border-line p-3 text-xs text-ink-mute leading-relaxed">
                <div className="font-semibold text-green-deep mb-1">
                  ¿Pagaste por transferencia o tienes dudas?
                </div>
                Escribinos a{' '}
                <a href="mailto:contacto@ligaplus.cl" className="text-accent font-semibold">
                  contacto@ligaplus.cl
                </a>{' '}
                y reactivamos tu liga apenas confirmemos el pago.
              </div>
            </>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-green-deep"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
            <span className="text-[11px] text-ink-mute">
              {cuenta?.plan?.nombre ? `Plan ${cuenta.plan.nombre}` : 'Sin plan asignado'}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
