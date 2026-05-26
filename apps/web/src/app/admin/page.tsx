'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  ClipboardList,
  Gavel,
  Plus,
  Star,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHead } from '@/components/ui/page-head';
import { useDashboardAdmin } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

export default function AdminDashboardPage(): React.ReactElement {
  const { data, isLoading } = useDashboardAdmin();

  return (
    <>
      <PageHead
        eyebrow="Panel principal"
        title="Buenas, Admin"
        sub="Lo que necesita atención hoy."
      >
        <Link href="/admin/torneos/nuevo">
          <Button variant="accent" size="sm">
            <Plus size={14} /> Nuevo torneo
          </Button>
        </Link>
      </PageHead>

      {/* Alertas críticas */}
      {data && (
        <Alertas
          actasPendientes={data.actasPendientes}
          carnetVencido={data.carnetVencido}
          carnetPorVencer={data.carnetPorVencer}
          sancionesActivas={data.sancionesActivas}
          cobertura={data.proximaFecha?.cobertura ?? null}
          proximaFechaNumero={data.proximaFecha?.numero ?? null}
        />
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <KpiCard
          label="Torneos activos"
          value={isLoading ? '…' : data?.torneosActivos ?? 0}
          sub={`${data?.torneosDraft ?? 0} en borrador`}
        />
        <KpiCard
          label="Equipos"
          value={isLoading ? '…' : data?.equiposTotales ?? 0}
          sub={`${data?.jugadoresTotales ?? 0} jugadores activos`}
        />
        <KpiCard
          label="Próxima fecha"
          value={
            isLoading
              ? '…'
              : data?.proximaFecha
                ? `${data.proximaFecha.cobertura}%`
                : '—'
          }
          sub={
            data?.proximaFecha
              ? `Fecha ${data.proximaFecha.numero} · ${data.proximaFecha.arbitrosAsignados}/${data.proximaFecha.partidosCount} con árbitro`
              : 'Sin fecha programada'
          }
        />
        <KpiCard
          label="Sanciones activas"
          value={isLoading ? '…' : data?.sancionesActivas ?? 0}
          sub={data?.sancionesActivas ? 'Jugadores bloqueados' : 'Buen comportamiento'}
          variant="dark"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Torneo activo (placeholder si no hay) */}
        <Card padding="comfortable" className="lg:col-span-2">
          <div className="flex items-start justify-between mb-3">
            <div>
              <CardLabel>Torneo activo</CardLabel>
              <div className="font-display text-2xl text-green-deep tracking-display mt-1">
                {data?.torneoActivo?.nombre ?? 'NINGUNO'}
              </div>
              {data?.torneoActivo && (
                <div className="text-sm text-ink-mute mt-0.5">
                  {data.torneoActivo.temporadaNombre}
                </div>
              )}
            </div>
            {data?.torneoActivo && (
              <Link href={`/admin/torneos/${data.torneoActivo.id}`}>
                <Button variant="default" size="sm">
                  Ir al torneo <ArrowRight size={14} />
                </Button>
              </Link>
            )}
          </div>

          {/* Top equipos */}
          {data?.topEquipos && data.topEquipos.length > 0 ? (
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mute font-semibold mb-2">
                → Top 5 tabla
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-mute">
                    <th className="pb-1.5">#</th>
                    <th className="pb-1.5">Equipo</th>
                    <th className="pb-1.5 text-right">PJ</th>
                    <th className="pb-1.5 text-right">G</th>
                    <th className="pb-1.5 text-right">E</th>
                    <th className="pb-1.5 text-right">P</th>
                    <th className="pb-1.5 text-right">DG</th>
                    <th className="pb-1.5 text-right font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.topEquipos.map((e, idx) => (
                    <tr key={e.equipoId} className="text-sm">
                      <td className="py-1.5 font-mono text-ink-mute">{idx + 1}</td>
                      <td className="py-1.5 font-semibold truncate">{e.nombre}</td>
                      <td className="py-1.5 text-right font-mono">{e.partidosJugados}</td>
                      <td className="py-1.5 text-right font-mono">{e.victorias}</td>
                      <td className="py-1.5 text-right font-mono">{e.empates}</td>
                      <td className="py-1.5 text-right font-mono">{e.derrotas}</td>
                      <td className="py-1.5 text-right font-mono">
                        {e.golesFavor - e.golesContra}
                      </td>
                      <td className="py-1.5 text-right font-mono font-bold text-green-deep">
                        {e.puntos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            data?.torneoActivo && (
              <p className="font-serif italic text-ink-mute text-sm mt-3">
                Aún no hay partidos finalizados — la tabla se llena al cerrar las primeras actas.
              </p>
            )
          )}
        </Card>

        {/* Top goleadores */}
        <Card padding="comfortable">
          <div className="flex items-center justify-between mb-3">
            <CardLabel>Goleadores</CardLabel>
            <Trophy size={16} className="text-accent" />
          </div>
          {data?.topGoleadores && data.topGoleadores.length > 0 ? (
            <ul className="space-y-2.5">
              {data.topGoleadores.map((g, idx) => (
                <li key={g.jugadorId} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'font-display text-xl tracking-display',
                      idx === 0 ? 'text-accent' : 'text-ink-mute',
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {g.nombre} {g.apellido}
                    </div>
                    <div className="text-xs text-ink-mute truncate">{g.equipoNombre}</div>
                  </div>
                  <span className="font-display tracking-display text-green-deep">
                    {g.goles}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-serif italic text-ink-mute text-sm">
              {data?.torneoActivo
                ? 'Sin goles registrados todavía.'
                : 'Sin torneo activo.'}
            </p>
          )}
        </Card>
      </div>

      {/* Atajos a páginas frecuentes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Atajo
          href="/admin/actas"
          icon={ClipboardList}
          label="Actas"
          sub={`${data?.actasPendientes ?? 0} pendientes`}
        />
        <Atajo
          href="/admin/designaciones"
          icon={Activity}
          label="Designaciones"
          sub={
            data?.proximaFecha
              ? `Próx · F${data.proximaFecha.numero}`
              : '—'
          }
        />
        <Atajo
          href="/admin/tribunal"
          icon={Gavel}
          label="Tribunal"
          sub={`${data?.sancionesActivas ?? 0} activas`}
        />
        <Atajo
          href="/admin/personal"
          icon={UserCog}
          label="Personal"
          sub={`${data?.personalActivo ?? 0} activo`}
        />
      </div>
    </>
  );
}

// ─── Alertas críticas ────────────────────────────────────────────────
function Alertas({
  actasPendientes,
  carnetVencido,
  carnetPorVencer,
  sancionesActivas: _sancionesActivas,
  cobertura,
  proximaFechaNumero,
}: {
  actasPendientes: number;
  carnetVencido: number;
  carnetPorVencer: number;
  sancionesActivas: number;
  cobertura: number | null;
  proximaFechaNumero: number | null;
}): React.ReactElement | null {
  const alertas: Array<{
    tipo: 'danger' | 'warning';
    mensaje: React.ReactNode;
    href?: string;
  }> = [];

  if (actasPendientes > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: (
        <>
          <strong>{actasPendientes}</strong> acta{actasPendientes === 1 ? '' : 's'} con fecha pasada
          sin cerrar.
        </>
      ),
      href: '/admin/actas',
    });
  }
  if (carnetVencido > 0) {
    alertas.push({
      tipo: 'danger',
      mensaje: (
        <>
          <strong>{carnetVencido}</strong> árbitro{carnetVencido === 1 ? '' : 's'} con carnet ANFA
          vencido. No deberían designarse hasta renovar.
        </>
      ),
      href: '/admin/personal',
    });
  }
  if (carnetPorVencer > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: (
        <>
          <strong>{carnetPorVencer}</strong> carnet{carnetPorVencer === 1 ? '' : 's'} ANFA vencen en
          menos de 30 días.
        </>
      ),
      href: '/admin/personal',
    });
  }
  if (
    cobertura !== null &&
    cobertura < 100 &&
    proximaFechaNumero !== null
  ) {
    alertas.push({
      tipo: cobertura < 50 ? 'danger' : 'warning',
      mensaje: (
        <>
          Fecha <strong>{proximaFechaNumero}</strong>: solo el {cobertura}% de partidos tiene árbitro
          principal designado.
        </>
      ),
      href: '/admin/designaciones',
    });
  }

  if (alertas.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {alertas.map((a, idx) => {
        const node = (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-card border text-sm',
              a.tipo === 'danger'
                ? 'bg-danger/5 border-danger/30 text-danger'
                : 'bg-orange-700/5 border-orange-700/30 text-orange-700',
            )}
          >
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span className="flex-1">{a.mensaje}</span>
            {a.href && <ArrowRight size={14} />}
          </div>
        );
        return a.href ? (
          <Link key={idx} href={a.href} className="block hover:opacity-80">
            {node}
          </Link>
        ) : (
          <div key={idx}>{node}</div>
        );
      })}
    </div>
  );
}

// ─── Atajos ─────────────────────────────────────────────────────────
function Atajo({
  href,
  icon: Icon,
  label,
  sub,
}: {
  href: string;
  icon: typeof Activity;
  label: string;
  sub: string;
}): React.ReactElement {
  return (
    <Link href={href}>
      <Card
        padding="comfortable"
        className="hover:border-accent transition-colors h-full"
      >
        <div className="flex items-start gap-2">
          <Icon size={18} className="text-accent mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-display tracking-display text-lg text-green-deep">
              {label.toUpperCase()}
            </div>
            <div className="text-xs text-ink-mute truncate">{sub}</div>
          </div>
          <ArrowRight size={14} className="text-line mt-0.5" />
        </div>
      </Card>
    </Link>
  );
}
