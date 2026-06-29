'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  LogOut,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { MiDesignacion, MiPortalPersonal } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { useLogout } from '@/hooks/use-logout';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatFecha, formatFechaHora } from '@/lib/format';
import { useAuthStore } from '@/store/auth-store';

function formatCLP(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

const METODO_PAGO_LABEL: Record<string, string> = {
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO: 'Efectivo',
  OTRO: 'Otro',
};

const ROL_LABEL: Record<string, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Árbitro asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

const ESTADO_BADGE: Record<MiDesignacion['estado'], string> = {
  PROPUESTA: 'bg-ink-mute/15 text-ink-mute',
  CONFIRMADA: 'bg-accent/15 text-accent',
  RECHAZADA: 'bg-danger/15 text-danger',
  ASISTIO: 'bg-green-bright/15 text-green-bright',
  AUSENTE: 'bg-orange-700/15 text-orange-700',
};

const ESTADO_LABEL: Record<MiDesignacion['estado'], string> = {
  PROPUESTA: 'Propuesta',
  CONFIRMADA: 'Confirmada',
  RECHAZADA: 'Rechazada',
  ASISTIO: 'Asistió',
  AUSENTE: 'Ausente',
};

export default function PersonalPortalPage(): React.ReactElement | null {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useLogout();

  // Espera la rehidratación de sessionStorage antes de evaluar el guard
  // (mismo motivo que en /admin: si no, un refresh expulsa a "/").
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/');
  }, [hydrated, accessToken, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['personal', 'mi-portal'],
    enabled: hydrated && !!accessToken,
    queryFn: () => apiFetch<MiPortalPersonal>('/personal/mi-portal'),
  });

  if (!hydrated || !accessToken) return null;

  const rolLabel = (r: string): string => ROL_LABEL[r] ?? r;

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-green-deep text-chalk">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <LigaPlusLockup inverse showTag={false} />
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 text-sm text-chalk/80 hover:text-chalk"
          >
            <LogOut size={15} /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-8">
        <div className="eyebrow mb-2">→ Mi portal</div>
        <h1 className="font-display text-3xl text-green-deep tracking-display mb-6">
          {data ? `Hola, ${data.perfil.nombre}` : 'Mi portal'}
        </h1>

        {isLoading && <p className="font-serif italic text-ink-mute">Cargando…</p>}
        {error && (
          <Card padding="roomy" className="text-center">
            <p className="text-danger font-semibold">No pudimos cargar tu información.</p>
            <p className="text-sm text-ink-mute mt-1">
              Si recién activaste tu cuenta, vuelve a iniciar sesión.
            </p>
          </Card>
        )}

        {data && (
          <div className="space-y-6">
            {/* Perfil */}
            <Card padding="comfortable">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={16} className="text-accent" />
                <CardLabel>Mi ficha</CardLabel>
              </div>
              <div className="text-sm text-ink">
                <span className="font-semibold">
                  {data.perfil.nombre} {data.perfil.apellido}
                </span>
                <span className="text-ink-mute">
                  {' '}
                  · {data.perfil.roles.map(rolLabel).join(', ')}
                </span>
              </div>
              {data.perfil.carnetAnfaNumero && (
                <div className="text-xs text-ink-mute mt-1">
                  Carnet ANFA {data.perfil.carnetAnfaNumero}
                  {data.perfil.carnetAnfaVence
                    ? ` · vence ${formatFecha(data.perfil.carnetAnfaVence)}`
                    : ''}
                </div>
              )}
            </Card>

            {/* Mis pagos */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wallet size={16} className="text-accent" />
                <CardLabel>Mis pagos</CardLabel>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Card padding="comfortable">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
                    Pendiente de pago
                  </div>
                  <div className="font-display text-2xl text-orange-700 tracking-display mt-1">
                    {formatCLP(data.pagos.pendienteTotal)}
                  </div>
                  <div className="text-[11px] text-ink-mute mt-0.5">
                    Partidos dirigidos aún no liquidados
                  </div>
                </Card>
                <Card padding="comfortable">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
                    Total recibido
                  </div>
                  <div className="font-display text-2xl text-green-deep tracking-display mt-1">
                    {formatCLP(data.pagos.recibidoTotal)}
                  </div>
                  <div className="text-[11px] text-ink-mute mt-0.5">
                    {data.pagos.recibidos.length} pago(s) registrado(s)
                  </div>
                </Card>
              </div>
              {data.pagos.recibidos.length > 0 && (
                <div className="space-y-2">
                  {data.pagos.recibidos.map((p) => (
                    <Card key={p.id} padding="tight" className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-[140px]">
                        <div className="font-medium text-ink">{formatCLP(p.total)}</div>
                        <div className="text-[11px] text-ink-mute">
                          {formatFecha(p.fecha)} · {METODO_PAGO_LABEL[p.metodo] ?? p.metodo}
                          {p.comprobante ? ` · ${p.comprobante}` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-green-bright/15 text-green-bright">
                        Pagado
                      </span>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Designaciones */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={16} className="text-accent" />
                <CardLabel>Mis designaciones</CardLabel>
              </div>
              {data.designaciones.length === 0 ? (
                <Card padding="roomy" className="text-center">
                  <p className="font-serif italic text-ink-mute">
                    Todavía no tienes designaciones asignadas.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {data.designaciones.map((d) => {
                    // El planillero/árbitro designado puede abrir la planilla del
                    // partido (cronómetro + incidencias + cierre). Para roles que
                    // no operan en cancha (paramédico, etc.) la tarjeta es informativa.
                    const operable =
                      (d.rolAsignado === 'PLANILLERO' ||
                        d.rolAsignado === 'ARBITRO_PRINCIPAL' ||
                        d.rolAsignado === 'ARBITRO_ASISTENTE') &&
                      d.estado !== 'RECHAZADA' &&
                      d.estado !== 'AUSENTE';
                    const inner = (
                      <>
                        <div className="text-xs text-ink-mute w-36 shrink-0">
                          <div className="text-[10px] uppercase tracking-wider font-semibold truncate">
                            {d.torneoNombre}
                            {d.fechaNumero != null ? ` · F${d.fechaNumero}` : ''}
                          </div>
                          <div className="mt-0.5">
                            {d.fechaHora ? formatFechaHora(d.fechaHora) : 'Por confirmar'}
                          </div>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <div className="font-medium text-ink">
                            {d.localNombre} vs {d.visitaNombre}
                          </div>
                          <div className="text-[11px] text-ink-mute">
                            {rolLabel(d.rolAsignado)}
                            {d.canchaNombre ? ` · ${d.canchaNombre}` : ''}
                          </div>
                          {operable && (
                            <div className="text-[11px] font-semibold text-accent mt-1 flex items-center gap-1">
                              <ClipboardList size={11} /> Abrir planilla
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 ml-auto">
                          {d.montoPago != null && d.montoPago > 0 && (
                            <span
                              className={cn(
                                'text-xs font-semibold tabular-nums',
                                d.pagada ? 'text-green-deep' : 'text-orange-700',
                              )}
                              title={d.pagada ? 'Pagado' : 'Pendiente de pago'}
                            >
                              {formatCLP(d.montoPago)}
                              {d.pagada ? ' ✓' : ''}
                            </span>
                          )}
                          <span
                            className={cn(
                              'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold',
                              ESTADO_BADGE[d.estado],
                            )}
                          >
                            {ESTADO_LABEL[d.estado]}
                          </span>
                          {operable && <ChevronRight size={16} className="text-accent shrink-0" />}
                        </div>
                      </>
                    );
                    return operable ? (
                      <Link key={d.designacionId} href={`/personal/partido/${d.partidoId}`} className="block">
                        <Card
                          padding="tight"
                          className="flex items-center gap-4 flex-wrap hover:border-accent transition-colors"
                        >
                          {inner}
                        </Card>
                      </Link>
                    ) : (
                      <Card key={d.designacionId} padding="tight" className="flex items-center gap-4 flex-wrap">
                        {inner}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
