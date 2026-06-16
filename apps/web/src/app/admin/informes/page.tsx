'use client';

import { AlertTriangle, Download, FileText, Gavel, ShieldAlert, UserX } from 'lucide-react';
import { useState } from 'react';

import type {
  EnRiesgoAmarilla,
  EstadoMultaInforme,
  ExpulsadoFecha,
  SancionVigente,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { API_URL } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import {
  useClubes,
  useInformeEnRiesgo,
  useInformeExpulsados,
  useInformeSancionados,
  useTorneos,
} from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

type Vista = 'expulsados' | 'sancionados' | 'enRiesgo';

function clp(n: number | null): string {
  return n == null ? '—' : `$${n.toLocaleString('es-CL')}`;
}

const MULTA_BADGE: Record<EstadoMultaInforme, string> = {
  PAGADO: 'bg-green-bright/15 text-green-bright',
  PENDIENTE: 'bg-orange-700/15 text-orange-700',
  VENCIDO: 'bg-danger/15 text-danger',
};

const TIPO_LABEL: Record<ExpulsadoFecha['tipo'], string> = {
  ROJA: 'Roja directa',
  AMARILLA_ROJA: 'Doble amarilla',
};

/** Exporta filas (array de objetos planos) a un .xlsx descargable. */
async function exportarExcel(
  filas: Record<string, unknown>[],
  nombreArchivo: string,
  hoja = 'Informe',
): Promise<void> {
  if (filas.length === 0) return;
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  XLSX.writeFile(wb, nombreArchivo);
}

/** Descarga un PDF autenticado (el endpoint exige Bearer) vía blob. */
async function descargarPdf(path: string, filename: string): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MultaBadge({
  monto,
  estado,
}: {
  monto: number | null;
  estado: EstadoMultaInforme | null;
}): React.ReactElement {
  if (monto == null || estado == null) {
    return <span className="text-ink-mute">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="tabular-nums">{clp(monto)}</span>
      <span
        className={cn(
          'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold',
          MULTA_BADGE[estado],
        )}
      >
        {estado === 'PAGADO' ? 'Pagada' : estado === 'VENCIDO' ? 'Vencida' : 'Pendiente'}
      </span>
    </span>
  );
}

export default function InformesPage(): React.ReactElement {
  const [vista, setVista] = useState<Vista>('expulsados');
  const [torneoId, setTorneoId] = useState('');
  const [fechaNumero, setFechaNumero] = useState('');
  const [clubId, setClubId] = useState('');
  const [incluirCumplidas, setIncluirCumplidas] = useState(false);

  const { data: torneos } = useTorneos();
  const { data: clubes } = useClubes();

  return (
    <>
      <PageHead
        eyebrow="Reportes"
        title="Informes"
        sub="Visibilidad de disciplina para la administración. Filtra y descarga a Excel."
      />

      <div className="border-b border-line mb-6 -mx-6 md:-mx-10 px-6 md:px-10">
        <nav className="flex gap-1 flex-wrap">
          <TabBtn active={vista === 'expulsados'} onClick={() => setVista('expulsados')}>
            <UserX size={14} className="inline mr-1" /> Expulsados por fecha
          </TabBtn>
          <TabBtn active={vista === 'sancionados'} onClick={() => setVista('sancionados')}>
            <Gavel size={14} className="inline mr-1" /> Sancionados
          </TabBtn>
          <TabBtn active={vista === 'enRiesgo'} onClick={() => setVista('enRiesgo')}>
            <ShieldAlert size={14} className="inline mr-1" /> En riesgo
          </TabBtn>
        </nav>
      </div>

      {/* Filtros */}
      <div className="mb-5 p-3 rounded-card border border-line bg-paper/40 flex flex-col md:flex-row md:flex-wrap gap-3 md:items-end">
        <div className="md:min-w-[220px] md:flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Torneo {vista !== 'sancionados' && <span className="text-danger">*</span>}
          </label>
          <select
            className="input w-full"
            value={torneoId}
            onChange={(e) => setTorneoId(e.target.value)}
          >
            <option value="">
              {vista === 'sancionados' ? 'Todos los torneos' : 'Selecciona un torneo…'}
            </option>
            {torneos?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        {vista === 'expulsados' && (
          <div className="md:min-w-[120px]">
            <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
              N° de fecha
            </label>
            <input
              type="number"
              min={1}
              className="input w-full"
              placeholder="Todas"
              value={fechaNumero}
              onChange={(e) => setFechaNumero(e.target.value)}
            />
          </div>
        )}

        {vista === 'sancionados' && (
          <>
            <div className="md:min-w-[200px]">
              <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
                Club
              </label>
              <select
                className="input w-full"
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
              >
                <option value="">Todos los clubes</option>
                {clubes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-mute md:pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={incluirCumplidas}
                onChange={(e) => setIncluirCumplidas(e.target.checked)}
              />
              Incluir cumplidas
            </label>
          </>
        )}
      </div>

      {vista === 'expulsados' && (
        <ExpulsadosView
          torneoId={torneoId}
          fechaNumero={fechaNumero ? Number.parseInt(fechaNumero, 10) : undefined}
        />
      )}
      {vista === 'sancionados' && (
        <SancionadosView
          torneoId={torneoId || undefined}
          clubId={clubId || undefined}
          incluirCumplidas={incluirCumplidas}
        />
      )}
      {vista === 'enRiesgo' && <EnRiesgoView torneoId={torneoId} />}
    </>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-semibold tracking-wide border-b-2 -mb-px transition-colors',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-ink-mute hover:text-ink hover:border-line',
      )}
    >
      {children}
    </button>
  );
}

function SinTorneo(): React.ReactElement {
  return (
    <Card padding="roomy" className="text-center">
      <p className="font-serif italic text-ink-mute">
        Selecciona un torneo para ver el informe.
      </p>
    </Card>
  );
}

function Vacio({ texto }: { texto: string }): React.ReactElement {
  return (
    <div className="p-12 text-center">
      <p className="font-serif italic text-ink-mute">{texto}</p>
    </div>
  );
}

function BotonExcel({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled}>
      <Download size={14} /> Excel
    </Button>
  );
}

function BotonPdf({ path, filename, disabled }: { path: string; filename: string; disabled: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void descargarPdf(path, filename)}
      disabled={disabled}
    >
      <FileText size={14} /> PDF
    </Button>
  );
}

// ─── Vista: expulsados por fecha ─────────────────────────────────────
function ExpulsadosView({
  torneoId,
  fechaNumero,
}: {
  torneoId: string;
  fechaNumero: number | undefined;
}): React.ReactElement {
  const { data, isLoading, error } = useInformeExpulsados(torneoId || undefined, fechaNumero);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((e) => ({
        Fecha: e.fechaNumero,
        Jugador: e.jugadorNombre,
        RUT: e.rut ?? '',
        Club: e.clubNombre ?? '',
        Tipo: TIPO_LABEL[e.tipo],
        Minuto: e.minuto ?? '',
        Partido: e.partidoLabel,
        'Fechas sanción': e.fechasSancion ?? '',
        Multa: e.multaMonto ?? '',
        'Estado multa': e.multaEstado ?? '',
      })),
      `expulsados${fechaNumero ? `-fecha-${fechaNumero}` : ''}.xlsx`,
      'Expulsados',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Expulsados {fechaNumero ? `· fecha ${fechaNumero}` : '· todas las fechas'}</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/disciplina/expulsados.pdf?torneoId=${torneoId}${
              fechaNumero ? `&fechaNumero=${fechaNumero}` : ''
            }`}
            filename={`expulsados${fechaNumero ? `-fecha-${fechaNumero}` : ''}.pdf`}
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay expulsados para los filtros elegidos." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Fecha</th>
                <th className="py-2 pr-3">Jugador</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Partido</th>
                <th className="py-2 pr-3 text-center">Sanción</th>
                <th className="py-2 pr-5">Multa</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((e) => (
                <tr key={e.incidenciaId} className="border-b border-line/50">
                  <td className="py-2 px-5 tabular-nums">{e.fechaNumero}</td>
                  <td className="py-2 pr-3 font-medium text-ink">
                    {e.jugadorNombre}
                    {e.rut && <span className="text-ink-mute text-xs"> · {e.rut}</span>}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{e.clubNombre ?? '—'}</td>
                  <td className="py-2 pr-3">{TIPO_LABEL[e.tipo]}</td>
                  <td className="py-2 pr-3 text-ink-mute">
                    {e.partidoLabel}
                    {e.minuto != null && <span> · {e.minuto}′</span>}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums">
                    {e.fechasSancion != null ? `${e.fechasSancion} fecha(s)` : '—'}
                  </td>
                  <td className="py-2 pr-5">
                    <MultaBadge monto={e.multaMonto} estado={e.multaEstado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: sancionados vigentes ─────────────────────────────────────
function SancionadosView({
  torneoId,
  clubId,
  incluirCumplidas,
}: {
  torneoId: string | undefined;
  clubId: string | undefined;
  incluirCumplidas: boolean;
}): React.ReactElement {
  const { data, isLoading, error } = useInformeSancionados({
    torneoId,
    clubId,
    incluirCumplidas,
  });
  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((s) => ({
        Jugador: s.jugadorNombre,
        RUT: s.rut ?? '',
        Club: s.clubNombre ?? '',
        Torneo: s.torneoNombre ?? '',
        Motivo: s.motivo,
        'Fechas totales': s.fechasTotales,
        Cumplidas: s.fechasCumplidas,
        Pendientes: s.fechasPendientes,
        'Vuelve en fecha': s.vuelveEnFecha,
        Estado: s.cumplida ? 'Cumplida' : 'Vigente',
        Multa: s.multaMonto ?? '',
        'Estado multa': s.multaEstado ?? '',
      })),
      'sancionados.xlsx',
      'Sancionados',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Sancionados</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/disciplina/sancionados.pdf?${new URLSearchParams({
              ...(torneoId ? { torneoId } : {}),
              ...(clubId ? { clubId } : {}),
              ...(incluirCumplidas ? { incluirCumplidas: 'true' } : {}),
            }).toString()}`}
            filename="sancionados.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay sancionados para los filtros elegidos." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Jugador</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-3">Motivo</th>
                <th className="py-2 pr-3 text-center">Total</th>
                <th className="py-2 pr-3 text-center">Cumplidas</th>
                <th className="py-2 pr-3 text-center">Pendientes</th>
                <th className="py-2 pr-3 text-center">Vuelve</th>
                <th className="py-2 pr-5">Multa</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((s) => (
                <tr key={s.sancionId} className="border-b border-line/50">
                  <td className="py-2 px-5 font-medium text-ink">
                    {s.jugadorNombre}
                    {s.rut && <span className="text-ink-mute text-xs"> · {s.rut}</span>}
                    {s.cumplida && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute font-semibold">
                        cumplida
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{s.clubNombre ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-mute">{s.motivo}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{s.fechasTotales}</td>
                  <td className="py-2 pr-3 text-center tabular-nums text-green-bright">
                    {s.fechasCumplidas}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums font-semibold text-orange-700">
                    {s.fechasPendientes}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums">
                    {s.cumplida ? '—' : `fecha ${s.vuelveEnFecha}`}
                  </td>
                  <td className="py-2 pr-5">
                    <MultaBadge monto={s.multaMonto} estado={s.multaEstado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: en riesgo de suspensión ──────────────────────────────────
function EnRiesgoView({ torneoId }: { torneoId: string }): React.ReactElement {
  const { data, isLoading, error } = useInformeEnRiesgo(torneoId || undefined);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((r: EnRiesgoAmarilla) => ({
        Jugador: r.jugadorNombre,
        RUT: r.rut ?? '',
        Club: r.clubNombre ?? '',
        Amarillas: r.amarillas,
        'Faltan para suspensión': r.faltanParaSuspension,
      })),
      'en-riesgo.xlsx',
      'En riesgo',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>A una amarilla de la suspensión (acumulación cada 5)</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/disciplina/en-riesgo.pdf?torneoId=${torneoId}`}
            filename="en-riesgo.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="Ningún jugador está al borde de suspensión por amarillas." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Jugador</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-3 text-center">Amarillas</th>
                <th className="py-2 pr-5 text-center">Faltan</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.jugadorId} className="border-b border-line/50">
                  <td className="py-2 px-5 font-medium text-ink">
                    {r.jugadorNombre}
                    {r.rut && <span className="text-ink-mute text-xs"> · {r.rut}</span>}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{r.clubNombre ?? '—'}</td>
                  <td className="py-2 pr-3 text-center tabular-nums font-semibold">
                    {r.amarillas}
                  </td>
                  <td className="py-2 pr-5 text-center tabular-nums text-orange-700 font-semibold">
                    {r.faltanParaSuspension}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ErrorBox(): React.ReactElement {
  return (
    <div className="p-8 flex items-center gap-3 text-danger">
      <AlertTriangle size={18} className="flex-shrink-0" />
      <span className="text-sm">No pudimos cargar el informe. Reintenta en unos segundos.</span>
    </div>
  );
}
