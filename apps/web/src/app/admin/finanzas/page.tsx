'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Coins,
  DollarSign,
  Download,
  FileText,
  Filter,
  PiggyBank,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  CATEGORIA_COBRO,
  CATEGORIA_LABEL,
  ESTADO_DOCUMENTO_LABEL,
  ESTADO_DUNNING_LABEL,
  METODO_LABEL,
  METODO_PAGO,
  type CategoriaCobro,
  type CobroAdmin,
  type DocumentoTributarioAdmin,
  type EstadoDocumentoTributario,
  type EstadoDunning,
  type MetodoPago,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useClubes,
  useCobros,
  useCreateCobro,
  useDeleteCobro,
  useDocumentosTributarios,
  useDunningAvisarUno,
  useDunningEnviarAvisos,
  useDunningRecalcular,
  useIniciarPago,
  useMarcarPagado,
  useReintentarBoleta,
  useRevertirPago,
  useTorneos,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatFecha } from '@/lib/format';

type Filtro = 'todos' | 'pendientes' | 'vencidos' | 'pagados' | 'cancelados';

const ESTADO_BADGE: Record<CobroAdmin['estado'], string> = {
  PENDIENTE: 'bg-orange-700/15 text-orange-700',
  VENCIDO: 'bg-danger/15 text-danger',
  PAGADO: 'bg-green-bright/15 text-green-bright',
  CANCELADO: 'bg-ink-mute/15 text-ink-mute',
};

const ESTADO_LABEL: Record<CobroAdmin['estado'], string> = {
  PENDIENTE: 'Pendiente',
  VENCIDO: 'Vencido',
  PAGADO: 'Pagado',
  CANCELADO: 'Cancelado',
};

function formatCLP(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

type Tab = 'cobros' | 'boletas';

export default function FinanzasPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('cobros');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [adding, setAdding] = useState(false);
  // Sprint 34E — filtros nuevos.
  const [torneoFiltro, setTorneoFiltro] = useState<string>('');
  const [clubFiltro, setClubFiltro] = useState<string>('');
  const [soloAuto, setSoloAuto] = useState<'todos' | 'auto' | 'manual'>('todos');
  const [conceptoFiltro, setConceptoFiltro] = useState<string>('');
  const { data: cobros, isLoading, error } = useCobros({
    filtro: filtro === 'todos' ? undefined : filtro,
    torneoId: torneoFiltro || undefined,
    clubId: clubFiltro || undefined,
    soloAuto: soloAuto === 'auto' ? true : soloAuto === 'manual' ? false : undefined,
    categoria: conceptoFiltro || undefined,
  });
  const apiError = error as ApiError | undefined;

  const stats = useMemo(() => {
    const all = cobros ?? [];
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const cobradoMes = all
      .filter((c) => c.pagadoAt && new Date(c.pagadoAt).getTime() >= inicioMes.getTime())
      .reduce((acc, c) => acc + c.monto, 0);
    const pendienteTotal = all
      .filter((c) => c.estado === 'PENDIENTE' || c.estado === 'VENCIDO')
      .reduce((acc, c) => acc + c.monto, 0);
    const morosos = all.filter((c) => c.estado === 'VENCIDO').length;
    return {
      total: all.length,
      cobradoMes,
      pendienteTotal,
      morosos,
    };
  }, [cobros]);

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Finanzas & cobros"
        sub="Cobros manuales, pagos online y boletas SII en un solo lugar."
      >
        {tab === 'cobros' && (
          <Button variant="accent" size="sm" onClick={() => setAdding((v: boolean) => !v)}>
            <Plus size={14} /> {adding ? 'Cancelar' : 'Nuevo cobro'}
          </Button>
        )}
      </PageHead>

      <div className="flex gap-2 mb-5 border-b border-line">
        <TabButton active={tab === 'cobros'} onClick={() => setTab('cobros')}>
          <DollarSign size={14} className="inline mr-1" />
          Cobros
        </TabButton>
        <TabButton active={tab === 'boletas'} onClick={() => setTab('boletas')}>
          <FileText size={14} className="inline mr-1" />
          Boletas SII
        </TabButton>
      </div>

      {tab === 'boletas' ? (
        <BoletasTab />
      ) : (
        <CobrosTab
          cobros={cobros}
          stats={stats}
          isLoading={isLoading}
          apiError={apiError}
          filtro={filtro}
          setFiltro={setFiltro}
          torneoFiltro={torneoFiltro}
          setTorneoFiltro={setTorneoFiltro}
          clubFiltro={clubFiltro}
          setClubFiltro={setClubFiltro}
          soloAuto={soloAuto}
          setSoloAuto={setSoloAuto}
          conceptoFiltro={conceptoFiltro}
          setConceptoFiltro={setConceptoFiltro}
          adding={adding}
          setAdding={setAdding}
        />
      )}
    </>
  );
}

function TabButton({
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

interface CobrosTabProps {
  cobros: CobroAdmin[] | undefined;
  stats: { total: number; cobradoMes: number; pendienteTotal: number; morosos: number };
  isLoading: boolean;
  apiError: ApiError | undefined;
  filtro: Filtro;
  setFiltro: React.Dispatch<React.SetStateAction<Filtro>>;
  // Sprint 34E
  torneoFiltro: string;
  setTorneoFiltro: React.Dispatch<React.SetStateAction<string>>;
  clubFiltro: string;
  setClubFiltro: React.Dispatch<React.SetStateAction<string>>;
  soloAuto: 'todos' | 'auto' | 'manual';
  setSoloAuto: React.Dispatch<React.SetStateAction<'todos' | 'auto' | 'manual'>>;
  conceptoFiltro: string;
  setConceptoFiltro: React.Dispatch<React.SetStateAction<string>>;
  adding: boolean;
  setAdding: React.Dispatch<React.SetStateAction<boolean>>;
}

function CobrosTab({
  cobros,
  stats,
  isLoading,
  apiError,
  filtro,
  setFiltro,
  torneoFiltro,
  setTorneoFiltro,
  clubFiltro,
  setClubFiltro,
  soloAuto,
  setSoloAuto,
  conceptoFiltro,
  setConceptoFiltro,
  adding,
  setAdding,
}: CobrosTabProps): React.ReactElement {
  // Desglose por concepto de cobro (sobre la lista actualmente visible, que
  // por default son los pendientes): count + monto por categoría.
  const desglose = useMemo(() => {
    const map = new Map<CategoriaCobro, { count: number; monto: number }>();
    for (const c of cobros ?? []) {
      const cur = map.get(c.categoria) ?? { count: 0, monto: 0 };
      cur.count += 1;
      cur.monto += c.monto;
      map.set(c.categoria, cur);
    }
    return CATEGORIA_COBRO.filter((cat) => map.has(cat)).map((cat) => ({
      categoria: cat,
      ...map.get(cat)!,
    }));
  }, [cobros]);

  // Lista agrupada por concepto, ordenada: las CUOTAS de menor a mayor
  // (por club, año, mes); el resto por club + vencimiento.
  const grupos = useMemo(() => {
    const byCat = new Map<CategoriaCobro, CobroAdmin[]>();
    for (const c of cobros ?? []) {
      const arr = byCat.get(c.categoria) ?? [];
      arr.push(c);
      byCat.set(c.categoria, arr);
    }
    const cmpClub = (a: CobroAdmin, b: CobroAdmin): number =>
      (a.clubNombre ?? a.equipoNombre ?? '').localeCompare(
        b.clubNombre ?? b.equipoNombre ?? '',
        'es',
      );
    const cmpCuota = (a: CobroAdmin, b: CobroAdmin): number =>
      cmpClub(a, b) ||
      (a.periodoAnio ?? 0) - (b.periodoAnio ?? 0) ||
      (a.periodoMes ?? 0) - (b.periodoMes ?? 0) ||
      (a.periodoSemana ?? 0) - (b.periodoSemana ?? 0);
    const cmpOtros = (a: CobroAdmin, b: CobroAdmin): number =>
      cmpClub(a, b) || (a.vencimiento ?? '').localeCompare(b.vencimiento ?? '');
    return CATEGORIA_COBRO.filter((cat) => byCat.has(cat)).map((cat) => {
      const items = byCat
        .get(cat)!
        .slice()
        .sort(cat === 'CUOTA' ? cmpCuota : cmpOtros);
      return {
        categoria: cat,
        items,
        subtotal: items.reduce((acc, c) => acc + c.monto, 0),
      };
    });
  }, [cobros]);

  return (
    <>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Visibles</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Cobrado este mes</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : formatCLP(stats.cobradoMes)}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Pendiente</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.pendienteTotal > 0 ? 'text-orange-700' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : formatCLP(stats.pendienteTotal)}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Morosos</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.morosos > 0 ? 'text-danger' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.morosos}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Cobros vencidos</div>
        </Card>
      </div>

      {/* Desglose por concepto de cobro (sobre lo que muestra el filtro). */}
      {!isLoading && desglose.length > 0 && (
        <Card padding="comfortable" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <CardLabel>Desglose por concepto</CardLabel>
            <span className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold">
              {filtro === 'todos' ? 'Todos' : filtro}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {desglose.map((d) => (
              <div
                key={d.categoria}
                className="rounded-card border border-line bg-paper/50 px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold truncate">
                  {CATEGORIA_LABEL[d.categoria]}
                </div>
                <div className="font-display text-lg text-green-deep tracking-display leading-tight">
                  {formatCLP(d.monto)}
                </div>
                <div className="text-xs text-ink-mute">
                  {d.count} cobro{d.count === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {adding && (
        <Card padding="comfortable" className="mb-5">
          <CobroForm onDone={() => setAdding(false)} />
        </Card>
      )}

      {/* Sprint 34E — selectores por torneo / club / origen. F51.1 — concepto. */}
      <FiltrosAvanzados
        torneoFiltro={torneoFiltro}
        setTorneoFiltro={setTorneoFiltro}
        clubFiltro={clubFiltro}
        setClubFiltro={setClubFiltro}
        soloAuto={soloAuto}
        setSoloAuto={setSoloAuto}
        conceptoFiltro={conceptoFiltro}
        setConceptoFiltro={setConceptoFiltro}
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-ink-mute" />
        {(['pendientes', 'vencidos', 'pagados', 'cancelados', 'todos'] as Filtro[]).map(
          (f) => (
            <FiltroChip key={f} active={filtro === f} onClick={() => setFiltro(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </FiltroChip>
          ),
        )}

        {filtro === 'vencidos' && <DunningActions />}
      </div>

      {apiError && (
        <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5 mb-4">
          <div className="flex items-start gap-3 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">No pudimos cargar los cobros</div>
              <div className="text-sm mt-1">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
        )}
        {!isLoading && !apiError && (cobros?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <PiggyBank size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              No hay cobros{filtro !== 'todos' ? ` en estado "${filtro}"` : ''}.
            </p>
          </div>
        )}
        {!isLoading && cobros && cobros.length > 0 && (
          <div>
            {grupos.map((g) => (
              <div key={g.categoria}>
                <div className="px-5 py-2 bg-green-deep/5 border-y border-line flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-green-deep">
                    {CATEGORIA_LABEL[g.categoria]}
                    <span className="text-ink-mute font-normal"> · {g.items.length}</span>
                  </span>
                  <span className="text-xs font-semibold text-ink-mute">
                    {formatCLP(g.subtotal)}
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {g.items.map((c) => (
                    <CobroRow key={c.id} cobro={c} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

const ESTADO_DOC_BADGE: Record<EstadoDocumentoTributario, string> = {
  PENDIENTE_EMISION: 'bg-orange-700/15 text-orange-700',
  EMITIDO: 'bg-green-bright/15 text-green-bright',
  RECHAZADO_SII: 'bg-danger/15 text-danger',
  FALLIDO: 'bg-danger/20 text-danger',
};

const ESTADO_DUNNING_BADGE: Record<EstadoDunning, string> = {
  AL_DIA: 'bg-green-bright/10 text-green-bright',
  MOROSO: 'bg-orange-700/15 text-orange-700',
  SUSPENDIDO: 'bg-danger/15 text-danger',
};

function BoletasTab(): React.ReactElement {
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>(undefined);
  const { data: docs, isLoading, error } = useDocumentosTributarios(estadoFiltro);
  const apiError = error as ApiError | undefined;

  const stats = useMemo(() => {
    const all = docs ?? [];
    const emitidos = all.filter((d) => d.estado === 'EMITIDO').length;
    const pendientes = all.filter(
      (d) => d.estado === 'PENDIENTE_EMISION' || d.estado === 'RECHAZADO_SII',
    ).length;
    const fallidos = all.filter((d) => d.estado === 'FALLIDO').length;
    const totalFacturado = all
      .filter((d) => d.estado === 'EMITIDO')
      .reduce((acc, d) => acc + d.monto, 0);
    return { emitidos, pendientes, fallidos, totalFacturado };
  }, [docs]);

  const estados: Array<{ key: string | undefined; label: string }> = [
    { key: undefined, label: 'Todos' },
    { key: 'EMITIDO', label: 'Emitidos' },
    { key: 'PENDIENTE_EMISION', label: 'Pendientes' },
    { key: 'RECHAZADO_SII', label: 'Rechazados' },
    { key: 'FALLIDO', label: 'Fallidos' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Boletas emitidas</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : stats.emitidos}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Total facturado</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : formatCLP(stats.totalFacturado)}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Pendientes</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.pendientes > 0 ? 'text-orange-700' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.pendientes}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Cron reintenta cada 30min</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Fallidos</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.fallidos > 0 ? 'text-danger' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.fallidos}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Revisión manual</div>
        </Card>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-ink-mute" />
        {estados.map((e) => (
          <FiltroChip
            key={e.key ?? 'todos'}
            active={estadoFiltro === e.key}
            onClick={() => setEstadoFiltro(e.key)}
          >
            {e.label}
          </FiltroChip>
        ))}
      </div>

      {apiError && (
        <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5 mb-4">
          <div className="flex items-start gap-3 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">No pudimos cargar las boletas</div>
              <div className="text-sm mt-1">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
        )}
        {!isLoading && !apiError && (docs?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <FileText size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              No hay boletas{estadoFiltro ? ` en estado "${ESTADO_DOCUMENTO_LABEL[estadoFiltro as EstadoDocumentoTributario]}"` : ''}.
              <br />
              Las boletas se emiten automáticamente cuando se aprueba un pago online.
            </p>
          </div>
        )}
        {!isLoading && docs && docs.length > 0 && (
          <div className="divide-y divide-line">
            {docs.map((d) => (
              <BoletaRow key={d.id} doc={d} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function BoletaRow({ doc }: { doc: DocumentoTributarioAdmin }): React.ReactElement {
  const reintentar = useReintentarBoleta();
  const reintentarError = reintentar.error as ApiError | undefined;

  return (
    <div className="p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-ink">
              {doc.cobroConcepto ?? 'Sin cobro asociado'}
            </span>
            <span
              className={cn(
                'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                ESTADO_DOC_BADGE[doc.estado],
              )}
            >
              {ESTADO_DOCUMENTO_LABEL[doc.estado]}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-ink-mute flex-wrap">
            <span className="font-display tracking-display text-xl text-green-deep">
              {formatCLP(doc.monto)}
            </span>
            {doc.folioSii && (
              <span>
                Folio: <span className="font-mono">{doc.folioSii}</span>
              </span>
            )}
            {doc.emitidoAt && (
              <span className="text-green-bright">
                Emitida el{' '}
                <span className="font-mono">
                  {formatFecha(doc.emitidoAt)}
                </span>
              </span>
            )}
            {doc.intentos > 0 && doc.estado !== 'EMITIDO' && (
              <span>
                Intentos: <span className="font-mono">{doc.intentos}</span>
              </span>
            )}
          </div>
          {doc.ultimoError && doc.estado !== 'EMITIDO' && (
            <div className="mt-1 text-xs text-danger font-serif italic">
              Último error: {doc.ultimoError}
            </div>
          )}
          {reintentarError && (
            <div className="mt-1 text-xs text-danger">
              {reintentarError.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {doc.estado === 'EMITIDO' && doc.urlPdf && (
            <a
              href={doc.urlPdf}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 rounded text-xs uppercase tracking-wider font-semibold bg-green-deep text-chalk hover:bg-green-deep/90 inline-flex items-center gap-1"
              title="Descargar boleta PDF"
            >
              <Download size={12} /> PDF
            </a>
          )}
          {(doc.estado === 'PENDIENTE_EMISION' || doc.estado === 'RECHAZADO_SII') && (
            <button
              type="button"
              onClick={() => reintentar.mutate(doc.id)}
              disabled={reintentar.isPending}
              className="px-2 py-1 rounded text-xs uppercase tracking-wider font-semibold bg-accent text-chalk hover:bg-accent/90 disabled:opacity-50 inline-flex items-center gap-1"
              title="Reintentar emisión ahora"
            >
              <RefreshCw size={12} className={reintentar.isPending ? 'animate-spin' : ''} />
              Reintentar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DunningActions(): React.ReactElement {
  const recalcular = useDunningRecalcular();
  const enviar = useDunningEnviarAvisos();
  const enviarResult = enviar.data;
  const enviarErr = enviar.error as ApiError | undefined;

  return (
    <div className="ml-auto flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => recalcular.mutate()}
        disabled={recalcular.isPending}
        className="px-3 py-1.5 rounded-card text-xs uppercase tracking-wider font-semibold border border-line text-ink hover:border-green-deep hover:text-green-deep disabled:opacity-50 inline-flex items-center gap-1"
        title="Recalcular estados AL_DIA/MOROSO/SUSPENDIDO según vencimientos"
      >
        <RefreshCw size={12} className={recalcular.isPending ? 'animate-spin' : ''} />
        Recalcular estados
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              'Enviar avisos por email a todos los equipos con cobros vencidos (respeta throttle de 7 días)?',
            )
          ) {
            enviar.mutate();
          }
        }}
        disabled={enviar.isPending}
        className="px-3 py-1.5 rounded-card text-xs uppercase tracking-wider font-semibold bg-orange-700 text-chalk hover:bg-orange-700/90 disabled:opacity-50 inline-flex items-center gap-1"
        title="Disparar el cron de dunning ahora"
      >
        <Send size={12} />
        {enviar.isPending ? 'Enviando…' : 'Avisos masivos'}
      </button>
      {enviarResult && (
        <span className="text-xs text-ink-mute">
          Enviados: <strong>{enviarResult.enviados}</strong> · Saltados:{' '}
          <strong>{enviarResult.saltados}</strong>
        </span>
      )}
      {enviarErr && <span className="text-xs text-danger">{enviarErr.message}</span>}
    </div>
  );
}

function FiltroChip({
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
        'px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] font-semibold border transition-colors',
        active
          ? 'bg-green-deep text-chalk border-green-deep'
          : 'bg-paper text-ink-mute border-line hover:border-green-deep hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function CobroRow({ cobro }: { cobro: CobroAdmin }): React.ReactElement {
  const remove = useDeleteCobro();
  const revertir = useRevertirPago();
  const avisarUno = useDunningAvisarUno();
  const [pagando, setPagando] = useState(false);
  const avisarError = avisarUno.error as ApiError | undefined;
  const mostrarDunning =
    cobro.estado === 'VENCIDO' && cobro.estadoDunning !== 'AL_DIA';

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-ink">{cobro.concepto}</span>
            <span
              className={cn(
                'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                ESTADO_BADGE[cobro.estado],
              )}
            >
              {ESTADO_LABEL[cobro.estado]}
            </span>
            {mostrarDunning && (
              <span
                className={cn(
                  'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                  ESTADO_DUNNING_BADGE[cobro.estadoDunning],
                )}
                title={`${cobro.diasMorosidad} días de mora`}
              >
                {ESTADO_DUNNING_LABEL[cobro.estadoDunning]} · {cobro.diasMorosidad}d
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
              {CATEGORIA_LABEL[cobro.categoria]}
            </span>
            {/* Sprint 34E — badge AUTO si el cobro fue generado automaticamente. */}
            {cobro.generadoAuto && (
              <span
                className="text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded bg-accent/15 text-accent"
                title={
                  cobro.tarifaTipo
                    ? `Generado automaticamente · tarifa ${cobro.tarifaTipo}`
                    : 'Generado automaticamente'
                }
              >
                Auto
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-ink-mute flex-wrap">
            <span className="font-display tracking-display text-2xl text-green-deep">
              {formatCLP(cobro.monto)}
            </span>
            {cobro.clubNombre && <span>· {cobro.clubNombre}</span>}
            {!cobro.clubNombre && cobro.equipoNombre && (
              <span>· {cobro.equipoNombre}</span>
            )}
            {cobro.torneoNombre && (
              <span className="text-ink-mute/80">en {cobro.torneoNombre}</span>
            )}
            {cobro.vencimiento && (
              <span>
                Vence: <span className="font-mono">{formatFecha(cobro.vencimiento)}</span>
              </span>
            )}
            {cobro.pagadoAt && (
              <span className="text-green-bright">
                Pagado el{' '}
                <span className="font-mono">
                  {formatFecha(cobro.pagadoAt)}
                </span>
                {cobro.pagadoMetodo && ` · ${METODO_LABEL[cobro.pagadoMetodo]}`}
                {cobro.pagadoReferencia && ` · ref: ${cobro.pagadoReferencia}`}
              </span>
            )}
          </div>
          {cobro.notas && (
            <div className="mt-1 text-xs text-ink-mute font-serif italic truncate">
              {cobro.notas}
            </div>
          )}

          {mostrarDunning && cobro.dunningAvisosEnviados > 0 && (
            <div className="mt-1 text-xs text-ink-mute flex items-center gap-2">
              <Bell size={12} className="text-orange-700" />
              <span>
                {cobro.dunningAvisosEnviados} aviso{cobro.dunningAvisosEnviados === 1 ? '' : 's'} enviado{cobro.dunningAvisosEnviados === 1 ? '' : 's'}
                {cobro.dunningUltimoAvisoAt && (
                  <>
                    {' '}· último el{' '}
                    <span className="font-mono">
                      {formatFecha(cobro.dunningUltimoAvisoAt)}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {avisarError && (
            <div className="mt-1 text-xs text-danger">{avisarError.message}</div>
          )}

          {pagando && (
            <div className="mt-3">
              <MarcarPagadoForm
                cobroId={cobro.id}
                onDone={() => setPagando(false)}
              />
            </div>
          )}

        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {cobro.estado === 'PENDIENTE' || cobro.estado === 'VENCIDO' ? (
            <>
              <button
                type="button"
                onClick={() => setPagando((v) => !v)}
                className="px-2 py-1 rounded text-xs uppercase tracking-wider font-semibold bg-accent text-chalk hover:bg-accent/90"
                title="Registrar pago (efectivo / transferencia + voucher)"
              >
                <Coins size={12} className="inline mr-1" /> Registrar pago
              </button>
              {cobro.estado === 'VENCIDO' && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Enviar aviso de cobranza al equipo por "${cobro.concepto}"?`,
                      )
                    ) {
                      avisarUno.mutate(cobro.id);
                    }
                  }}
                  disabled={avisarUno.isPending}
                  className="p-1 rounded text-orange-700 hover:bg-orange-700/10 disabled:opacity-50"
                  title="Enviar aviso de cobranza ahora"
                >
                  <Send size={14} className={avisarUno.isPending ? 'animate-pulse' : ''} />
                </button>
              )}
            </>
          ) : null}
          {cobro.estado === 'PAGADO' && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Revertir el pago de "${cobro.concepto}"?`)) {
                  revertir.mutate(cobro.id);
                }
              }}
              className="p-1 rounded text-ink-mute hover:text-orange-700 hover:bg-orange-700/10"
              title="Revertir pago"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `¿Eliminar el cobro "${cobro.concepto}"? Esta acción no se puede deshacer.`,
                )
              ) {
                remove.mutate(cobro.id);
              }
            }}
            className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CobroForm({ onDone }: { onDone: () => void }): React.ReactElement {
  const create = useCreateCobro();
  const error = create.error as ApiError | undefined;

  const Schema = z.object({
    concepto: z.string().min(2).max(200),
    categoria: z.enum(CATEGORIA_COBRO),
    monto: z.coerce.number().int().min(0).max(100_000_000),
    vencimiento: z.string().optional(),
    notas: z.string().max(1000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { categoria: 'CUOTA', monto: 0 },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    await create.mutateAsync({
      concepto: vals.concepto,
      categoria: vals.categoria,
      monto: vals.monto,
      vencimiento: vals.vencimiento || null,
      notas: vals.notas || null,
    });
    form.reset();
    onDone();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={18} className="text-accent" />
        <CardLabel>Nuevo cobro</CardLabel>
      </div>

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({ formName: 'cobro' }),
        )}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <Input
          label="Concepto"
          placeholder="Inscripción Apertura 2026 — Halcones FC"
          {...form.register('concepto')}
          error={form.formState.errors.concepto?.message}
        />
        <div>
          <label className="label">Categoría</label>
          <select className="input" {...form.register('categoria')}>
            {CATEGORIA_COBRO.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Monto (CLP)"
          type="number"
          min={0}
          step={1000}
          {...form.register('monto', { valueAsNumber: true })}
          error={form.formState.errors.monto?.message}
        />
        <Input
          label="Vencimiento (opcional)"
          type="date"
          {...form.register('vencimiento')}
        />
        <div className="md:col-span-2">
          <label className="label">Notas</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Ej: descuento por pago anticipado, factura emitida #123"
            {...form.register('notas')}
          />
        </div>

        {error && (
          <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" variant="accent" loading={create.isPending}>
            <Plus size={14} /> Crear cobro
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            <X size={14} /> Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

function MarcarPagadoForm({
  cobroId,
  onDone,
}: {
  cobroId: string;
  onDone: () => void;
}): React.ReactElement {
  const marcar = useMarcarPagado();
  const error = marcar.error as ApiError | undefined;
  const [metodo, setMetodo] = useState<MetodoPago>('TRANSFERENCIA');
  const [referencia, setReferencia] = useState('');

  const submit = async (): Promise<void> => {
    await marcar.mutateAsync({
      id: cobroId,
      input: {
        metodo,
        referencia: referencia.trim() || null,
      },
    });
    onDone();
  };

  return (
    <div className="bg-paper border border-line rounded-card p-3 flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Método</label>
        <select
          className="input"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoPago)}
        >
          {METODO_PAGO.map((m) => (
            <option key={m} value={m}>
              {METODO_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[180px]">
        <label className="label">Referencia (opcional)</label>
        <input
          type="text"
          className="input"
          placeholder="N° transferencia / boleta"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="accent"
        size="sm"
        onClick={submit}
        loading={marcar.isPending}
      >
        <CheckCircle2 size={14} /> Confirmar pago
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        <X size={14} />
      </Button>
      {error && (
        <div className="w-full text-sm text-danger mt-2">{error.message}</div>
      )}
    </div>
  );
}

/**
 * Sprint 34E — Selectores torneo + club + origen (auto/manual). Si todos
 * los selectores estan en default, la fila se ve discreta. Cuando el
 * operador elige algo, queda marcado con borde accent para que sea claro
 * que la lista esta filtrada.
 */
function FiltrosAvanzados({
  torneoFiltro,
  setTorneoFiltro,
  clubFiltro,
  setClubFiltro,
  soloAuto,
  setSoloAuto,
  conceptoFiltro,
  setConceptoFiltro,
}: {
  torneoFiltro: string;
  setTorneoFiltro: React.Dispatch<React.SetStateAction<string>>;
  clubFiltro: string;
  setClubFiltro: React.Dispatch<React.SetStateAction<string>>;
  soloAuto: 'todos' | 'auto' | 'manual';
  setSoloAuto: React.Dispatch<React.SetStateAction<'todos' | 'auto' | 'manual'>>;
  conceptoFiltro: string;
  setConceptoFiltro: React.Dispatch<React.SetStateAction<string>>;
}): React.ReactElement {
  const { data: torneos } = useTorneos();
  const { data: clubes } = useClubes();
  const hayFiltro =
    !!torneoFiltro || !!clubFiltro || soloAuto !== 'todos' || !!conceptoFiltro;

  return (
    <div
      className={cn(
        'mb-3 p-3 rounded-card border',
        hayFiltro ? 'border-accent/40 bg-accent/5' : 'border-line bg-paper/40',
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Torneo
          </label>
          <select
            className="input w-full"
            value={torneoFiltro}
            onChange={(e) => setTorneoFiltro(e.target.value)}
          >
            <option value="">Todos los torneos</option>
            {torneos?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Club
          </label>
          <select
            className="input w-full"
            value={clubFiltro}
            onChange={(e) => setClubFiltro(e.target.value)}
          >
            <option value="">Todos los clubes</option>
            {clubes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Origen
          </label>
          <select
            className="input"
            value={soloAuto}
            onChange={(e) =>
              setSoloAuto(e.target.value as 'todos' | 'auto' | 'manual')
            }
          >
            <option value="todos">Auto + manual</option>
            <option value="auto">Solo automáticos</option>
            <option value="manual">Solo manuales</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Concepto
          </label>
          <select
            className="input"
            value={conceptoFiltro}
            onChange={(e) => setConceptoFiltro(e.target.value)}
          >
            <option value="">Todos los conceptos</option>
            {CATEGORIA_COBRO.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        {hayFiltro && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTorneoFiltro('');
              setClubFiltro('');
              setSoloAuto('todos');
              setConceptoFiltro('');
            }}
            title="Limpiar filtros"
          >
            <X size={14} /> Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
