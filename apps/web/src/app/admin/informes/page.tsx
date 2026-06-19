'use client';

import {
  AlertTriangle,
  Coins,
  Download,
  FileText,
  Gavel,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';

import type {
  EnRiesgoAmarilla,
  EstadoDesignacionInforme,
  EstadoMultaInforme,
  ExpulsadoFecha,
  ResultadoPartidoInforme,
  SancionVigente,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { API_URL } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import {
  useClubes,
  useInformeCobertura,
  useInformeDesignaciones,
  useInformeEnRiesgo,
  useInformeEstadoCuenta,
  useInformeExpulsados,
  useInformeGoleadores,
  useInformeMorosos,
  useInformeMultasPendientes,
  useInformePagosPersonal,
  useInformePosiciones,
  useInformeRecaudacion,
  useInformeResultados,
  useInformeSancionados,
  useTorneos,
} from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

type Grupo = 'disciplina' | 'finanzas' | 'competicion' | 'arbitraje';
type Vista =
  | 'expulsados'
  | 'sancionados'
  | 'enRiesgo'
  | 'estadoCuenta'
  | 'multas'
  | 'morosos'
  | 'recaudacion'
  | 'posiciones'
  | 'goleadores'
  | 'resultados'
  | 'designaciones'
  | 'cobertura'
  | 'pagosPersonal';

const VISTAS_POR_GRUPO: Record<Grupo, Vista[]> = {
  disciplina: ['expulsados', 'sancionados', 'enRiesgo'],
  finanzas: ['estadoCuenta', 'multas', 'morosos', 'recaudacion'],
  competicion: ['posiciones', 'goleadores', 'resultados'],
  arbitraje: ['designaciones', 'cobertura', 'pagosPersonal'],
};

const VISTA_LABEL: Record<Vista, string> = {
  expulsados: 'Expulsados por fecha',
  sancionados: 'Sancionados',
  enRiesgo: 'En riesgo',
  estadoCuenta: 'Estado de cuenta',
  multas: 'Multas pendientes',
  morosos: 'Morosos',
  recaudacion: 'Recaudación',
  posiciones: 'Tabla de posiciones',
  goleadores: 'Goleadores',
  resultados: 'Resultados por fecha',
  designaciones: 'Designaciones',
  cobertura: 'Cobertura arbitral',
  pagosPersonal: 'Pagos a personal',
};

const ROL_PERSONAL_LABEL: Record<string, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Árbitro asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

const ESTADO_DESIGNACION_LABEL: Record<EstadoDesignacionInforme, string> = {
  PROPUESTA: 'Propuesta',
  CONFIRMADA: 'Confirmada',
  RECHAZADA: 'Rechazada',
  ASISTIO: 'Asistió',
  AUSENTE: 'Ausente',
};

const ESTADO_DESIGNACION_BADGE: Record<EstadoDesignacionInforme, string> = {
  PROPUESTA: 'bg-ink-mute/15 text-ink-mute',
  CONFIRMADA: 'bg-accent/15 text-accent',
  RECHAZADA: 'bg-danger/15 text-danger',
  ASISTIO: 'bg-green-bright/15 text-green-bright',
  AUSENTE: 'bg-orange-700/15 text-orange-700',
};

function rolLabel(rol: string): string {
  return ROL_PERSONAL_LABEL[rol] ?? rol;
}

const ESTADO_PARTIDO_LABEL: Record<string, string> = {
  PROGRAMADO: 'Programado',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  SUSPENDIDO_FUERZA_MAYOR: 'Suspendido',
  REPROGRAMADO: 'Reprogramado',
  WALKOVER: 'Walkover',
};

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
  // Defensa contra formula injection: una celda de texto que empieza con
  // = + - @ (o tab/CR) la interpreta Excel como fórmula al abrir el archivo.
  // Prefijar con comilla simple la fuerza a texto literal (no se muestra).
  const sanear = (v: unknown): unknown =>
    typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  const filasSeguras = filas.map((f) =>
    Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sanear(v)])),
  );
  const ws = XLSX.utils.json_to_sheet(filasSeguras);
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
  const [grupo, setGrupo] = useState<Grupo>('disciplina');
  const [vista, setVista] = useState<Vista>('expulsados');
  const [torneoId, setTorneoId] = useState('');
  const [fechaNumero, setFechaNumero] = useState('');
  const [clubId, setClubId] = useState('');
  const [incluirCumplidas, setIncluirCumplidas] = useState(false);

  const { data: torneos } = useTorneos();
  const { data: clubes } = useClubes();

  const cambiarGrupo = (g: Grupo): void => {
    setGrupo(g);
    setVista(VISTAS_POR_GRUPO[g][0]!);
  };

  // Qué filtros muestra cada vista.
  const torneoObligatorio =
    vista === 'expulsados' ||
    vista === 'enRiesgo' ||
    vista === 'posiciones' ||
    vista === 'goleadores' ||
    vista === 'resultados' ||
    vista === 'designaciones' ||
    vista === 'cobertura';
  const muestraFecha =
    vista === 'expulsados' ||
    vista === 'resultados' ||
    vista === 'designaciones' ||
    vista === 'cobertura';
  const muestraClub = vista === 'sancionados' || vista === 'multas';
  const muestraIncluirCumplidas = vista === 'sancionados';

  return (
    <>
      <PageHead
        eyebrow="Reportes"
        title="Informes"
        sub="Visibilidad para la administración. Filtra y descarga a Excel o PDF."
      />

      {/* Grupos */}
      <div className="flex gap-2 mb-4">
        <GrupoBtn active={grupo === 'disciplina'} onClick={() => cambiarGrupo('disciplina')}>
          <Gavel size={14} className="inline mr-1" /> Disciplina
        </GrupoBtn>
        <GrupoBtn active={grupo === 'finanzas'} onClick={() => cambiarGrupo('finanzas')}>
          <Coins size={14} className="inline mr-1" /> Finanzas
        </GrupoBtn>
        <GrupoBtn active={grupo === 'competicion'} onClick={() => cambiarGrupo('competicion')}>
          <Trophy size={14} className="inline mr-1" /> Competición
        </GrupoBtn>
        <GrupoBtn active={grupo === 'arbitraje'} onClick={() => cambiarGrupo('arbitraje')}>
          <UserCheck size={14} className="inline mr-1" /> Arbitraje
        </GrupoBtn>
      </div>

      {/* Sub-vistas del grupo activo */}
      <div className="border-b border-line mb-6 -mx-6 md:-mx-10 px-6 md:px-10">
        <nav className="flex gap-1 flex-wrap">
          {VISTAS_POR_GRUPO[grupo].map((v) => (
            <TabBtn key={v} active={vista === v} onClick={() => setVista(v)}>
              {VISTA_LABEL[v]}
            </TabBtn>
          ))}
        </nav>
      </div>

      {/* Filtros */}
      <div className="mb-5 p-3 rounded-card border border-line bg-paper/40 flex flex-col md:flex-row md:flex-wrap gap-3 md:items-end">
        <div className="md:min-w-[220px] md:flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Torneo {torneoObligatorio && <span className="text-danger">*</span>}
          </label>
          <select
            className="input w-full"
            value={torneoId}
            onChange={(e) => setTorneoId(e.target.value)}
          >
            <option value="">
              {torneoObligatorio ? 'Selecciona un torneo…' : 'Todos los torneos'}
            </option>
            {torneos?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        {muestraFecha && (
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

        {muestraClub && (
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
        )}

        {muestraIncluirCumplidas && (
          <label className="flex items-center gap-2 text-sm text-ink-mute md:pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirCumplidas}
              onChange={(e) => setIncluirCumplidas(e.target.checked)}
            />
            Incluir cumplidas
          </label>
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
      {vista === 'estadoCuenta' && <EstadoCuentaView torneoId={torneoId || undefined} />}
      {vista === 'multas' && (
        <MultasView torneoId={torneoId || undefined} clubId={clubId || undefined} />
      )}
      {vista === 'morosos' && <MorososView torneoId={torneoId || undefined} />}
      {vista === 'recaudacion' && <RecaudacionView torneoId={torneoId || undefined} />}
      {vista === 'posiciones' && <PosicionesView torneoId={torneoId} />}
      {vista === 'goleadores' && <GoleadoresView torneoId={torneoId} />}
      {vista === 'resultados' && (
        <ResultadosView
          torneoId={torneoId}
          fechaNumero={fechaNumero ? Number.parseInt(fechaNumero, 10) : undefined}
        />
      )}
      {vista === 'designaciones' && (
        <DesignacionesView
          torneoId={torneoId}
          fechaNumero={fechaNumero ? Number.parseInt(fechaNumero, 10) : undefined}
        />
      )}
      {vista === 'cobertura' && (
        <CoberturaView
          torneoId={torneoId}
          fechaNumero={fechaNumero ? Number.parseInt(fechaNumero, 10) : undefined}
        />
      )}
      {vista === 'pagosPersonal' && <PagosPersonalView torneoId={torneoId || undefined} />}
    </>
  );
}

function GrupoBtn({
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
        'px-4 py-2 rounded-card text-sm font-semibold tracking-wide border transition-colors',
        active
          ? 'bg-green-deep text-chalk border-green-deep'
          : 'bg-paper text-ink-mute border-line hover:border-green-deep hover:text-ink',
      )}
    >
      {children}
    </button>
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

// ─── Vista: estado de cuenta por club ────────────────────────────────
function EstadoCuentaView({ torneoId }: { torneoId: string | undefined }): React.ReactElement {
  const { data, isLoading, error } = useInformeEstadoCuenta(torneoId);
  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((c) => ({
        Club: c.clubNombre ?? 'Sin club',
        Total: c.total,
        Pagado: c.pagado,
        Pendiente: c.pendiente,
        Vencido: c.vencido,
        Saldo: c.saldo,
      })),
      'estado-cuenta.xlsx',
      'Estado de cuenta',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Estado de cuenta por club</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/finanzas/estado-cuenta.pdf${torneoId ? `?torneoId=${torneoId}` : ''}`}
            filename="estado-cuenta.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && <Vacio texto="Sin cobros." />}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Club</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Pagado</th>
                <th className="py-2 pr-3 text-right">Pendiente</th>
                <th className="py-2 pr-3 text-right">Vencido</th>
                <th className="py-2 pr-5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.clubId ?? 'sin'} className="border-b border-line/50">
                  <td className="py-2 px-5 font-medium text-ink">{c.clubNombre ?? '— sin club —'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{clp(c.total)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-green-bright">{clp(c.pagado)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-orange-700">{clp(c.pendiente)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-danger">{clp(c.vencido)}</td>
                  <td className="py-2 pr-5 text-right tabular-nums font-semibold">{clp(c.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: multas pendientes ────────────────────────────────────────
function MultasView({
  torneoId,
  clubId,
}: {
  torneoId: string | undefined;
  clubId: string | undefined;
}): React.ReactElement {
  const { data, isLoading, error } = useInformeMultasPendientes(torneoId, clubId);
  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((m) => ({
        Concepto: m.concepto,
        Club: m.clubNombre ?? '',
        Torneo: m.torneoNombre ?? '',
        Monto: m.monto,
        Estado: m.estado === 'VENCIDO' ? 'Vencida' : 'Pendiente',
      })),
      'multas-pendientes.xlsx',
      'Multas',
    );

  const path = `/admin/informes/finanzas/multas-pendientes.pdf?${new URLSearchParams({
    ...(torneoId ? { torneoId } : {}),
    ...(clubId ? { clubId } : {}),
  }).toString()}`;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Multas pendientes de pago</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf path={path} filename="multas-pendientes.pdf" disabled={filas.length === 0} />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay multas pendientes. 👏" />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Concepto</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.cobroId} className="border-b border-line/50">
                  <td className="py-2 px-5 text-ink">{m.concepto}</td>
                  <td className="py-2 pr-3 text-ink-mute">{m.clubNombre ?? '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold">{clp(m.monto)}</td>
                  <td className="py-2 pr-5">
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold',
                        m.estado === 'VENCIDO'
                          ? 'bg-danger/15 text-danger'
                          : 'bg-orange-700/15 text-orange-700',
                      )}
                    >
                      {m.estado === 'VENCIDO' ? 'Vencida' : 'Pendiente'}
                    </span>
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

// ─── Vista: morosos ──────────────────────────────────────────────────
function MorososView({ torneoId }: { torneoId: string | undefined }): React.ReactElement {
  const { data, isLoading, error } = useInformeMorosos(torneoId);
  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((m) => ({
        Club: m.clubNombre ?? '',
        Concepto: m.concepto,
        Monto: m.monto,
        'Días mora': m.diasMora,
        Estado: m.estadoDunning,
        Avisos: m.avisos,
      })),
      'morosos.xlsx',
      'Morosos',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Morosos (cobros vencidos)</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/finanzas/morosos.pdf${torneoId ? `?torneoId=${torneoId}` : ''}`}
            filename="morosos.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay cobros vencidos. 👏" />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Club</th>
                <th className="py-2 pr-3">Concepto</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-3 text-center">Días mora</th>
                <th className="py-2 pr-5 text-center">Avisos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.cobroId} className="border-b border-line/50">
                  <td className="py-2 px-5 font-medium text-ink">{m.clubNombre ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-mute">{m.concepto}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{clp(m.monto)}</td>
                  <td className="py-2 pr-3 text-center tabular-nums font-semibold text-danger">
                    {m.diasMora}
                  </td>
                  <td className="py-2 pr-5 text-center tabular-nums">{m.avisos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: recaudación por concepto ─────────────────────────────────
function RecaudacionView({ torneoId }: { torneoId: string | undefined }): React.ReactElement {
  const { data, isLoading, error } = useInformeRecaudacion(torneoId);
  const filas = data ?? [];
  const totales = filas.reduce(
    (acc, r) => ({
      cobrado: acc.cobrado + r.cobrado,
      porCobrar: acc.porCobrar + r.porCobrar,
      total: acc.total + r.total,
    }),
    { cobrado: 0, porCobrar: 0, total: 0 },
  );
  const exportar = (): void =>
    void exportarExcel(
      filas.map((r) => ({
        Concepto: r.categoria,
        Cobrado: r.cobrado,
        'Por cobrar': r.porCobrar,
        Total: r.total,
        Cobros: r.cantidad,
      })),
      'recaudacion.xlsx',
      'Recaudación',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Recaudación por concepto</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/finanzas/recaudacion.pdf${torneoId ? `?torneoId=${torneoId}` : ''}`}
            filename="recaudacion.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && <Vacio texto="Sin cobros." />}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Concepto</th>
                <th className="py-2 pr-3 text-right">Cobrado</th>
                <th className="py-2 pr-3 text-right">Por cobrar</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-5 text-center">Cobros</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.categoria} className="border-b border-line/50">
                  <td className="py-2 px-5 font-medium text-ink">{r.categoria}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-green-bright">{clp(r.cobrado)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-orange-700">{clp(r.porCobrar)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{clp(r.total)}</td>
                  <td className="py-2 pr-5 text-center tabular-nums">{r.cantidad}</td>
                </tr>
              ))}
              <tr className="bg-green-deep/5 font-semibold">
                <td className="py-2 px-5">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums text-green-bright">{clp(totales.cobrado)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-orange-700">{clp(totales.porCobrar)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{clp(totales.total)}</td>
                <td className="py-2 pr-5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: tabla de posiciones ──────────────────────────────────────
function PosicionesView({ torneoId }: { torneoId: string }): React.ReactElement {
  const { data, isLoading, error } = useInformePosiciones(torneoId || undefined);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((f) => ({
        Pos: f.posicion,
        Club: f.clubNombre,
        PJ: f.pj,
        PG: f.pg,
        PE: f.pe,
        PP: f.pp,
        GF: f.gf,
        GC: f.gc,
        DG: f.dg,
        Pts: f.pts,
      })),
      'posiciones.xlsx',
      'Posiciones',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Tabla de posiciones</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/competicion/posiciones.pdf?torneoId=${torneoId}`}
            filename="posiciones.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="Todavía no hay partidos jugados en este torneo." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5 text-center">#</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-3 text-center">PJ</th>
                <th className="py-2 pr-3 text-center">PG</th>
                <th className="py-2 pr-3 text-center">PE</th>
                <th className="py-2 pr-3 text-center">PP</th>
                <th className="py-2 pr-3 text-center">GF</th>
                <th className="py-2 pr-3 text-center">GC</th>
                <th className="py-2 pr-3 text-center">DG</th>
                <th className="py-2 pr-5 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.posicion} className="border-b border-line/50">
                  <td className="py-2 px-5 text-center tabular-nums text-ink-mute">{f.posicion}</td>
                  <td className="py-2 pr-3 font-medium text-ink">{f.clubNombre}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{f.pj}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{f.pg}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{f.pe}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{f.pp}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{f.gf}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{f.gc}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">
                    {f.dg > 0 ? `+${f.dg}` : f.dg}
                  </td>
                  <td className="py-2 pr-5 text-center tabular-nums font-semibold text-green-deep">
                    {f.pts}
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

// ─── Vista: goleadores ───────────────────────────────────────────────
function GoleadoresView({ torneoId }: { torneoId: string }): React.ReactElement {
  const { data, isLoading, error } = useInformeGoleadores(torneoId || undefined);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((g) => ({
        Pos: g.posicion,
        Jugador: g.jugadorNombre,
        RUT: g.rut ?? '',
        Club: g.clubNombre ?? '',
        Goles: g.goles,
      })),
      'goleadores.xlsx',
      'Goleadores',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Tabla de goleadores</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/competicion/goleadores.pdf?torneoId=${torneoId}`}
            filename="goleadores.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="Todavía no hay goles registrados en este torneo." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5 text-center">#</th>
                <th className="py-2 pr-3">Jugador</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-5 text-center">Goles</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={`${g.posicion}-${g.jugadorNombre}`} className="border-b border-line/50">
                  <td className="py-2 px-5 text-center tabular-nums text-ink-mute">{g.posicion}</td>
                  <td className="py-2 pr-3 font-medium text-ink">
                    {g.jugadorNombre}
                    {g.rut && <span className="text-ink-mute text-xs"> · {g.rut}</span>}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{g.clubNombre ?? '—'}</td>
                  <td className="py-2 pr-5 text-center tabular-nums font-semibold text-green-deep">
                    {g.goles}
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

// ─── Vista: resultados por fecha ─────────────────────────────────────
function marcador(r: ResultadoPartidoInforme): string {
  if (r.golesLocal == null || r.golesVisita == null) return 'vs';
  return `${r.golesLocal} - ${r.golesVisita}`;
}

function ResultadosView({
  torneoId,
  fechaNumero,
}: {
  torneoId: string;
  fechaNumero: number | undefined;
}): React.ReactElement {
  const { data, isLoading, error } = useInformeResultados(torneoId || undefined, fechaNumero);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((r) => ({
        Fecha: r.fechaNumero,
        Local: r.localNombre ?? '',
        Marcador: marcador(r),
        Visita: r.visitaNombre ?? '',
        Estado: ESTADO_PARTIDO_LABEL[r.estado] ?? r.estado,
        Cancha: r.canchaNombre ?? '',
      })),
      `resultados${fechaNumero ? `-fecha-${fechaNumero}` : ''}.xlsx`,
      'Resultados',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>
          Resultados {fechaNumero ? `· fecha ${fechaNumero}` : '· todas las fechas'}
        </CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/competicion/resultados.pdf?torneoId=${torneoId}${
              fechaNumero ? `&fechaNumero=${fechaNumero}` : ''
            }`}
            filename={`resultados${fechaNumero ? `-fecha-${fechaNumero}` : ''}.pdf`}
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay partidos para los filtros elegidos." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5 text-center">Fecha</th>
                <th className="py-2 pr-3 text-right">Local</th>
                <th className="py-2 px-2 text-center">Marcador</th>
                <th className="py-2 pr-3">Visita</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-5">Cancha</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.partidoId} className="border-b border-line/50">
                  <td className="py-2 px-5 text-center tabular-nums text-ink-mute">{r.fechaNumero}</td>
                  <td className="py-2 pr-3 text-right font-medium text-ink">{r.localNombre ?? '—'}</td>
                  <td className="py-2 px-2 text-center tabular-nums font-semibold whitespace-nowrap">
                    {marcador(r)}
                  </td>
                  <td className="py-2 pr-3 font-medium text-ink">{r.visitaNombre ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-mute">
                    {ESTADO_PARTIDO_LABEL[r.estado] ?? r.estado}
                  </td>
                  <td className="py-2 pr-5 text-ink-mute">{r.canchaNombre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: designaciones ────────────────────────────────────────────
function DesignacionesView({
  torneoId,
  fechaNumero,
}: {
  torneoId: string;
  fechaNumero: number | undefined;
}): React.ReactElement {
  const { data, isLoading, error } = useInformeDesignaciones(torneoId || undefined, fechaNumero);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const exportar = (): void =>
    void exportarExcel(
      filas.map((d) => ({
        Fecha: d.fechaNumero,
        Partido: d.partidoLabel,
        Personal: d.personalNombre,
        RUT: d.rut ?? '',
        Rol: rolLabel(d.rol),
        Estado: ESTADO_DESIGNACION_LABEL[d.estado],
        Monto: d.monto ?? '',
        Cancha: d.canchaNombre ?? '',
      })),
      `designaciones${fechaNumero ? `-fecha-${fechaNumero}` : ''}.xlsx`,
      'Designaciones',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>
          Designaciones {fechaNumero ? `· fecha ${fechaNumero}` : '· todas las fechas'}
        </CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/arbitraje/designaciones.pdf?torneoId=${torneoId}${
              fechaNumero ? `&fechaNumero=${fechaNumero}` : ''
            }`}
            filename={`designaciones${fechaNumero ? `-fecha-${fechaNumero}` : ''}.pdf`}
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay designaciones para los filtros elegidos." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Fecha</th>
                <th className="py-2 pr-3">Partido</th>
                <th className="py-2 pr-3">Personal</th>
                <th className="py-2 pr-3">Rol</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((d) => (
                <tr key={d.designacionId} className="border-b border-line/50">
                  <td className="py-2 px-5 tabular-nums text-ink-mute">{d.fechaNumero}</td>
                  <td className="py-2 pr-3 text-ink">{d.partidoLabel}</td>
                  <td className="py-2 pr-3 font-medium text-ink">
                    {d.personalNombre}
                    {d.rut && <span className="text-ink-mute text-xs"> · {d.rut}</span>}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{rolLabel(d.rol)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold',
                        ESTADO_DESIGNACION_BADGE[d.estado],
                      )}
                    >
                      {ESTADO_DESIGNACION_LABEL[d.estado]}
                    </span>
                  </td>
                  <td className="py-2 pr-5 text-right tabular-nums">{clp(d.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Vista: cobertura arbitral ───────────────────────────────────────
function CoberturaView({
  torneoId,
  fechaNumero,
}: {
  torneoId: string;
  fechaNumero: number | undefined;
}): React.ReactElement {
  const { data, isLoading, error } = useInformeCobertura(torneoId || undefined, fechaNumero);
  if (!torneoId) return <SinTorneo />;

  const filas = data ?? [];
  const sinArbitro = filas.filter((c) => !c.tieneArbitroPrincipal).length;
  const exportar = (): void =>
    void exportarExcel(
      filas.map((c) => ({
        Fecha: c.fechaNumero,
        Partido: c.partidoLabel,
        'Árbitro principal': c.arbitroPrincipal,
        Asistentes: c.arbitroAsistente,
        Planillero: c.planillero,
        Cobertura: c.tieneArbitroPrincipal ? 'Con árbitro' : 'Sin árbitro',
        Cancha: c.canchaNombre ?? '',
      })),
      `cobertura${fechaNumero ? `-fecha-${fechaNumero}` : ''}.xlsx`,
      'Cobertura',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>
          Cobertura arbitral {fechaNumero ? `· fecha ${fechaNumero}` : '· todas las fechas'}
          {sinArbitro > 0 && (
            <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-danger/15 text-danger font-semibold">
              {sinArbitro} sin árbitro
            </span>
          )}
        </CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/arbitraje/cobertura.pdf?torneoId=${torneoId}${
              fechaNumero ? `&fechaNumero=${fechaNumero}` : ''
            }`}
            filename={`cobertura${fechaNumero ? `-fecha-${fechaNumero}` : ''}.pdf`}
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay partidos que requieran designación para los filtros elegidos." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Fecha</th>
                <th className="py-2 pr-3">Partido</th>
                <th className="py-2 pr-3 text-center">Árb. ppal</th>
                <th className="py-2 pr-3 text-center">Asist.</th>
                <th className="py-2 pr-3 text-center">Planill.</th>
                <th className="py-2 pr-5">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.partidoId} className="border-b border-line/50">
                  <td className="py-2 px-5 tabular-nums text-ink-mute">{c.fechaNumero}</td>
                  <td className="py-2 pr-3 text-ink">{c.partidoLabel}</td>
                  <td
                    className={cn(
                      'py-2 pr-3 text-center tabular-nums font-semibold',
                      c.tieneArbitroPrincipal ? 'text-green-bright' : 'text-danger',
                    )}
                  >
                    {c.arbitroPrincipal}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums">{c.arbitroAsistente}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{c.planillero}</td>
                  <td className="py-2 pr-5">
                    {c.tieneArbitroPrincipal ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-green-bright/15 text-green-bright font-semibold">
                        Con árbitro
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-danger/15 text-danger font-semibold">
                        Sin árbitro
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
  );
}

// ─── Vista: pagos a personal ─────────────────────────────────────────
function PagosPersonalView({ torneoId }: { torneoId: string | undefined }): React.ReactElement {
  const { data, isLoading, error } = useInformePagosPersonal(torneoId);
  const filas = data ?? [];
  const totales = filas.reduce(
    (acc, p) => ({
      devengado: acc.devengado + p.devengado,
      pagado: acc.pagado + p.pagado,
      pendiente: acc.pendiente + p.pendiente,
    }),
    { devengado: 0, pagado: 0, pendiente: 0 },
  );
  const exportar = (): void =>
    void exportarExcel(
      filas.map((p) => ({
        Personal: p.personalNombre,
        RUT: p.rut ?? '',
        Rol: rolLabel(p.rol),
        Designaciones: p.designaciones,
        Devengado: p.devengado,
        Pagado: p.pagado,
        Pendiente: p.pendiente,
      })),
      'pagos-personal.xlsx',
      'Pagos personal',
    );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <CardLabel>Pagos a personal (cuentas por pagar)</CardLabel>
        <div className="flex items-center gap-1">
          <BotonExcel onClick={exportar} disabled={filas.length === 0} />
          <BotonPdf
            path={`/admin/informes/arbitraje/pagos-personal.pdf${torneoId ? `?torneoId=${torneoId}` : ''}`}
            filename="pagos-personal.pdf"
            disabled={filas.length === 0}
          />
        </div>
      </div>
      {isLoading && <Vacio texto="Cargando…" />}
      {error && <ErrorBox />}
      {!isLoading && !error && filas.length === 0 && (
        <Vacio texto="No hay pagos pendientes ni devengados al personal." />
      )}
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                <th className="py-2 px-5">Personal</th>
                <th className="py-2 pr-3">Rol</th>
                <th className="py-2 pr-3 text-center">Designac.</th>
                <th className="py-2 pr-3 text-right">Devengado</th>
                <th className="py-2 pr-3 text-right">Pagado</th>
                <th className="py-2 pr-5 text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.personalId} className="border-b border-line/50">
                  <td className="py-2 px-5 font-medium text-ink">
                    {p.personalNombre}
                    {p.rut && <span className="text-ink-mute text-xs"> · {p.rut}</span>}
                  </td>
                  <td className="py-2 pr-3 text-ink-mute">{rolLabel(p.rol)}</td>
                  <td className="py-2 pr-3 text-center tabular-nums">{p.designaciones}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{clp(p.devengado)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-green-bright">
                    {clp(p.pagado)}
                  </td>
                  <td className="py-2 pr-5 text-right tabular-nums font-semibold text-orange-700">
                    {clp(p.pendiente)}
                  </td>
                </tr>
              ))}
              <tr className="bg-green-deep/5 font-semibold">
                <td className="py-2 px-5" colSpan={3}>
                  Total
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{clp(totales.devengado)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-green-bright">
                  {clp(totales.pagado)}
                </td>
                <td className="py-2 pr-5 text-right tabular-nums text-orange-700">
                  {clp(totales.pendiente)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
