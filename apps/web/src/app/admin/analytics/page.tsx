'use client';

import {
  AlertTriangle,
  BarChart3,
  Coins,
  Megaphone,
  ShieldOff,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { AnalyticsAdmin } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useAnalytics } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { EncuestasTab } from './_encuestas-tab';

// Paleta de marca para los gráficos (recharts no lee variables CSS).
const VERDE = '#0F2A1F';
const VERDE_LIMA = '#639922';
const NARANJA = '#E76F26';
const AMARILLO = '#E0A91B';
const ROJO = '#C2410C';
const GRIS = '#888278';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function clp(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

/** "2026-01" → "ene 26" para el eje de los gráficos. */
function mesCorto(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const idx = Number(m) - 1;
  return `${MESES[idx] ?? m} ${(y ?? '').slice(2)}`;
}

type Tab = 'analytics' | 'nps';

export default function AnalyticsPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('analytics');

  return (
    <>
      <PageHead
        eyebrow="Analytics & NPS"
        title="Analytics de la liga"
        sub="Tendencias de crecimiento, finanzas y disciplina, y la satisfacción de los clubes (NPS)."
      />

      <div className="flex gap-1 mb-5 border-b border-line">
        <TabBtn active={tab === 'analytics'} onClick={() => setTab('analytics')} icon={BarChart3}>
          Analytics
        </TabBtn>
        <TabBtn active={tab === 'nps'} onClick={() => setTab('nps')} icon={Megaphone}>
          Encuestas
        </TabBtn>
      </div>

      {tab === 'analytics' ? <AnalyticsTab /> : <EncuestasTab />}
    </>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BarChart3;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2 text-sm font-display tracking-display -mb-px border-b-2 transition-colors',
        active
          ? 'border-orange text-green-deep'
          : 'border-transparent text-ink-mute hover:text-green-deep',
      )}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

// ══════════════════════════ ANALYTICS ══════════════════════════════════

function AnalyticsTab(): React.ReactElement {
  const { data, isLoading, error } = useAnalytics();
  const apiError = error as ApiError | undefined;

  return (
    <>
      {isLoading && (
        <div className="font-serif italic text-ink-mute py-8">Calculando métricas…</div>
      )}

      {!isLoading && apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR ANALYTICS
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {data && <AnalyticsContent data={data} />}
    </>
  );
}

function AnalyticsContent({ data }: { data: AnalyticsAdmin }): React.ReactElement {
  const r = data.resumen;
  const jugadoresMes = data.jugadoresPorMes.map((p) => ({
    mes: mesCorto(p.etiqueta),
    valor: p.valor,
  }));
  const cobros = [
    { nombre: 'Recaudado', valor: data.cobros.recaudado, color: VERDE_LIMA },
    { nombre: 'Por vencer', valor: data.cobros.porVencer, color: AMARILLO },
    { nombre: 'Vencido', valor: data.cobros.vencido, color: ROJO },
  ];
  const categorias = data.jugadoresPorCategoria.map((p) => ({
    nombre: p.etiqueta,
    valor: p.valor,
  }));

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={Trophy} label="Clubes activos" valor={r.clubesActivos} />
        <Stat icon={Users} label="Jugadores activos" valor={r.jugadoresActivos} />
        <Stat icon={BarChart3} label="Partidos jugados" valor={r.partidosJugados} />
        <Stat icon={Coins} label="Recaudado" valor={clp(r.recaudado)} tono="ok" />
        <Stat icon={Wallet} label="Por cobrar" valor={clp(r.pendiente)} tono="warn" />
        <Stat icon={ShieldOff} label="Tarjetas" valor={r.tarjetas} />
      </div>

      {/* Crecimiento + Finanzas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard titulo="Jugadores nuevos por mes" hint="Altas registradas en los últimos 12 meses.">
          {jugadoresMes.length === 0 ? (
            <Vacio>Aún no hay altas de jugadores para graficar.</Vacio>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={jugadoresMes} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E2D8" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: GRIS }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: GRIS }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(15,42,31,0.05)' }} />
                <Bar dataKey="valor" name="Jugadores" fill={VERDE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Estado de cobros" hint="Montos en pesos según el estado de pago.">
          {data.cobros.recaudado + data.cobros.porVencer + data.cobros.vencido === 0 ? (
            <Vacio>Todavía no hay cobros generados.</Vacio>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cobros} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E2D8" vertical={false} />
                <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: GRIS }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: GRIS }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip cursor={{ fill: 'rgba(15,42,31,0.05)' }} formatter={(v) => clp(Number(v))} />
                <Bar dataKey="valor" name="Monto" radius={[4, 4, 0, 0]}>
                  {cobros.map((c) => (
                    <Cell key={c.nombre} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Disciplina + Categorías */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard titulo="Disciplina por torneo" hint="Tarjetas amarillas y rojas por competición.">
          {data.disciplinaPorTorneo.length === 0 ? (
            <Vacio>Sin tarjetas registradas todavía.</Vacio>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.disciplinaPorTorneo} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E2D8" vertical={false} />
                <XAxis dataKey="torneo" tick={{ fontSize: 10, fill: GRIS }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={48} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: GRIS }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(15,42,31,0.05)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="amarillas" name="Amarillas" stackId="d" fill={AMARILLO} radius={[0, 0, 0, 0]} />
                <Bar dataKey="rojas" name="Rojas" stackId="d" fill={ROJO} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Jugadores por categoría" hint="Distribución del plantel activo de la liga.">
          {categorias.length === 0 ? (
            <Vacio>Sin jugadores activos para distribuir.</Vacio>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                layout="vertical"
                data={categorias}
                margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E2D8" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: GRIS }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11, fill: GRIS }} tickLine={false} width={96} />
                <Tooltip cursor={{ fill: 'rgba(15,42,31,0.05)' }} />
                <Bar dataKey="valor" name="Jugadores" fill={NARANJA} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ══════════════════════════ Compartidos ════════════════════════════════

function Stat({
  icon: Icon,
  label,
  valor,
  tono,
}: {
  icon: typeof Trophy;
  label: string;
  valor: string | number;
  tono?: 'ok' | 'warn';
}): React.ReactElement {
  return (
    <Card padding="comfortable">
      <div className="flex items-center gap-1.5">
        <Icon
          size={14}
          className={cn(
            tono === 'ok' ? 'text-green-bright' : tono === 'warn' ? 'text-orange-700' : 'text-ink-mute',
          )}
        />
        <CardLabel>{label}</CardLabel>
      </div>
      <div
        className={cn(
          'font-display tracking-display mt-1 truncate',
          typeof valor === 'string' ? 'text-2xl' : 'text-3xl',
          tono === 'ok' ? 'text-green-bright' : tono === 'warn' ? 'text-orange-700' : 'text-green-deep',
        )}
        title={String(valor)}
      >
        {valor}
      </div>
    </Card>
  );
}

function ChartCard({
  titulo,
  hint,
  children,
}: {
  titulo: string;
  hint: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card padding="roomy">
      <CardLabel>{titulo}</CardLabel>
      <p className="text-xs font-serif italic text-ink-mute mt-1 mb-4">{hint}</p>
      {children}
    </Card>
  );
}

function Vacio({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-[260px] text-sm font-serif italic text-ink-mute text-center px-4">
      {children}
    </div>
  );
}
