'use client';

import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Filter,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { ActaResumen } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useActasGlobal, useFixtureDetail, useTorneos } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { formatFecha } from '@/lib/format';

type Filtro = 'todas' | 'pendientes' | 'cerradas';

export default function ActasGlobalPage(): React.ReactElement {
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [torneoId, setTorneoId] = useState<string>('');
  const [fechaId, setFechaId] = useState<string>('');

  const { data: torneos } = useTorneos();
  // El filtro de fecha solo tiene sentido cuando hay un torneo seleccionado:
  // distintos torneos pueden tener fechas con el mismo número y mezclarlas
  // confundiría al usuario. El hook está deshabilitado sin torneoId.
  const { data: fixture } = useFixtureDetail(torneoId || null);
  const { data: actas, isLoading } = useActasGlobal({
    filtro,
    torneoId: torneoId || undefined,
    fechaId: fechaId || undefined,
  });

  // Si el usuario cambia el torneo (o lo deselecciona), la fecha previa
  // ya no aplica — la limpiamos para evitar mandar un fechaId huérfano.
  useEffect(() => {
    setFechaId('');
  }, [torneoId]);

  const stats = useMemo(() => {
    const all = actas ?? [];
    return {
      total: all.length,
      cerradas: all.filter((a) => !!a.actaCerradaAt).length,
      pendientes: all.filter((a) => !a.actaCerradaAt && a.estado !== 'FINALIZADO' && a.estado !== 'WALKOVER').length,
      walkovers: all.filter((a) => a.estado === 'WALKOVER').length,
    };
  }, [actas]);

  return (
    <>
      <PageHead
        eyebrow="Competición"
        title="Actas & resultados"
        sub="Vista cross-torneo de todos los partidos. Filtra por estado, torneo o fecha para encontrar actas pendientes de cierre."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Total visibles</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Pendientes</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.pendientes > 0 ? 'text-accent' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.pendientes}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Cerradas</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : stats.cerradas}
          </div>
        </Card>
        <Card padding="comfortable" variant="lime">
          <CardLabel tone="mute">Walkovers</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.walkovers}
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Filter size={14} className="text-ink-mute" />
        <div className="flex gap-2">
          {(['pendientes', 'cerradas', 'todas'] as Filtro[]).map((f) => (
            <FiltroChip key={f} active={filtro === f} onClick={() => setFiltro(f)}>
              {f === 'pendientes' ? 'Pendientes' : f === 'cerradas' ? 'Cerradas' : 'Todas'}
            </FiltroChip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            className="input text-sm"
            value={torneoId}
            onChange={(e) => setTorneoId(e.target.value)}
          >
            <option value="">Todos los torneos</option>
            {torneos?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <select
            className="input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            value={fechaId}
            onChange={(e) => setFechaId(e.target.value)}
            disabled={!torneoId || !fixture}
            title={!torneoId ? 'Selecciona primero un torneo' : undefined}
          >
            <option value="">
              {torneoId ? 'Todas las fechas' : 'Elige un torneo primero'}
            </option>
            {fixture?.fechas.map((f) => (
              <option key={f.id} value={f.id}>
                Fecha {f.numero}
                {f.etiqueta ? ` — ${f.etiqueta}` : ''}
                {f.tipoReprogramacion === 'REPROGRAMADA' ? ' (reprog.)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Listado */}
      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">
            Cargando actas…
          </div>
        )}
        {!isLoading && (actas?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <ClipboardList size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              No hay actas que coincidan con los filtros.
            </p>
          </div>
        )}
        {!isLoading && actas && actas.length > 0 && (
          <div className="divide-y divide-line">
            {actas.map((a) => (
              <ActaRow key={a.partidoId} acta={a} />
            ))}
          </div>
        )}
      </Card>
    </>
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

function ActaRow({ acta }: { acta: ActaResumen }): React.ReactElement {
  const fecha = acta.fechaHora ? new Date(acta.fechaHora) : null;
  const dia = formatFecha(fecha);
  const hora = fecha?.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const cerrada = !!acta.actaCerradaAt;

  return (
    <Link
      href={`/admin/torneos/${acta.torneoId}/partidos/${acta.partidoId}`}
      className="px-5 py-4 grid grid-cols-[110px_1fr_auto_1fr_auto_auto] gap-4 items-center hover:bg-paper transition-colors"
    >
      <div className="text-xs">
        <div className="text-[10px] uppercase tracking-[0.15em] text-ink-mute font-semibold truncate">
          {acta.torneoNombre} · F{acta.fechaNumero}
        </div>
        <div className="font-mono text-ink-mute mt-0.5">
          {dia ?? 'Sin fecha'}
          {hora && <span className="font-semibold text-ink ml-1">{hora}</span>}
        </div>
      </div>

      <div className="text-right font-semibold truncate">{acta.equipoLocalNombre}</div>

      <div className="flex items-center gap-2 font-display tracking-display text-xl text-green-deep min-w-[60px] justify-center">
        {acta.estado === 'FINALIZADO' || acta.estado === 'WALKOVER' ? (
          <>
            <span>{acta.golesLocal ?? '-'}</span>
            <span className="text-ink-mute">:</span>
            <span>{acta.golesVisita ?? '-'}</span>
          </>
        ) : (
          <span className="text-ink-mute font-serif italic text-xs">vs</span>
        )}
      </div>

      <div className="font-semibold truncate">{acta.equipoVisitaNombre}</div>

      <div className="flex items-center gap-2 text-xs">
        {cerrada ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-bright/10 text-green-bright text-[10px] uppercase tracking-wider font-semibold">
            <Lock size={11} /> Cerrada
          </span>
        ) : acta.estado === 'EN_CURSO' ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] uppercase tracking-wider font-semibold">
            <Clock size={11} /> En curso
          </span>
        ) : acta.estado === 'WALKOVER' ? (
          <span className="px-2 py-0.5 rounded bg-orange-700/10 text-orange-700 text-[10px] uppercase tracking-wider font-semibold">
            Walkover
          </span>
        ) : acta.estado === 'SUSPENDIDO_FUERZA_MAYOR' || acta.estado === 'REPROGRAMADO' ? (
          <span className="px-2 py-0.5 rounded bg-danger/10 text-danger text-[10px] uppercase tracking-wider font-semibold">
            {acta.estado.replace('_', ' ')}
          </span>
        ) : acta.estado === 'FINALIZADO' ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-deep/10 text-green-deep text-[10px] uppercase tracking-wider font-semibold">
            <CheckCircle2 size={11} /> Finalizado
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-ink-mute/10 text-ink-mute text-[10px] uppercase tracking-wider font-semibold">
            Programado
          </span>
        )}
        <span className="text-ink-mute">·</span>
        <span className="text-ink-mute">{acta.incidenciasCount} incidencias</span>
      </div>

      <ChevronRight size={16} className="text-line" />
    </Link>
  );
}
