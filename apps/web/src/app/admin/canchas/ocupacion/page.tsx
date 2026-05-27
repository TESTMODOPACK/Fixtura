'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { OcupacionPartido } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useCanchasOcupacion } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/** Devuelve el lunes 00:00 (hora local) de la semana de `ref`. */
function lunesDeSemana(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Dom, 1=Lun...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatRangoSemana(lunes: Date): string {
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const fmt = (d: Date): string =>
    d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  return `${fmt(lunes)} – ${fmt(domingo)}`;
}

function diaDelLunes(fechaHoraIso: string, lunes: Date): number {
  const d = new Date(fechaHoraIso);
  const dStart = new Date(d);
  dStart.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (dStart.getTime() - lunes.getTime()) / (24 * 60 * 60 * 1000),
  );
  return diff; // 0=Lun, 6=Dom; fuera de rango ⇒ se filtra
}

function horaCorta(fechaHoraIso: string): string {
  return new Date(fechaHoraIso).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CanchasOcupacionPage(): React.ReactElement {
  const [anclaSemana, setAnclaSemana] = useState<Date>(() => new Date());
  const lunes = useMemo(() => lunesDeSemana(anclaSemana), [anclaSemana]);
  const domingoEx = useMemo(() => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + 7);
    return d;
  }, [lunes]);

  const { data: canchas, isLoading, error } = useCanchasOcupacion(
    lunes.toISOString(),
    domingoEx.toISOString(),
  );
  const apiError = error as ApiError | undefined;

  const semanaAnterior = (): void => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() - 7);
    setAnclaSemana(d);
  };
  const semanaSiguiente = (): void => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + 7);
    setAnclaSemana(d);
  };
  const hoy = (): void => setAnclaSemana(new Date());

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Calendario de ocupación"
        sub="Una grilla por cancha activa, semana lunes a domingo. Si una celda está vacía, la cancha está libre ese día."
      >
        <Link
          href="/admin/canchas"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-card text-sm font-semibold text-ink-mute hover:text-ink"
        >
          <ArrowLeft size={14} /> Volver al catálogo
        </Link>
      </PageHead>

      <Card padding="comfortable" className="mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarRange size={18} className="text-accent" />
            <span className="font-semibold text-ink">{formatRangoSemana(lunes)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={semanaAnterior}
              className="p-2 rounded-card hover:bg-line/40 text-ink-mute hover:text-ink"
              title="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={hoy}
              className="px-3 py-1.5 rounded-card text-xs uppercase tracking-wider font-semibold border border-line hover:border-green-deep hover:text-green-deep"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={semanaSiguiente}
              className="p-2 rounded-card hover:bg-line/40 text-ink-mute hover:text-ink"
              title="Semana siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Card>

      {apiError && (
        <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5 mb-4">
          <div className="flex items-start gap-3 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">No pudimos cargar la ocupación</div>
              <div className="text-sm mt-1">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {isLoading && (
        <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
      )}

      {!isLoading && !apiError && (canchas?.length ?? 0) === 0 && (
        <Card padding="roomy" className="text-center">
          <MapPin size={36} className="mx-auto text-line mb-3" />
          <p className="font-serif italic text-ink-mute">
            No hay canchas activas en el catálogo. Agregalas desde el listado de canchas.
          </p>
        </Card>
      )}

      {!isLoading && canchas && canchas.length > 0 && (
        <div className="space-y-5">
          {canchas.map((c) => (
            <CanchaCalendarioRow
              key={c.canchaId}
              canchaId={c.canchaId}
              canchaNombre={c.canchaNombre}
              partidos={c.partidos}
              lunes={lunes}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CanchaCalendarioRow({
  canchaId,
  canchaNombre,
  partidos,
  lunes,
}: {
  canchaId: string;
  canchaNombre: string;
  partidos: OcupacionPartido[];
  lunes: Date;
}): React.ReactElement {
  // Agrupar partidos por día de semana (0..6 = Lun..Dom)
  const porDia = useMemo(() => {
    const buckets: OcupacionPartido[][] = Array.from({ length: 7 }, () => []);
    for (const p of partidos) {
      const idx = diaDelLunes(p.fechaHora, lunes);
      if (idx < 0 || idx > 6) continue;
      const bucket = buckets[idx];
      if (bucket) bucket.push(p);
    }
    for (const b of buckets) {
      b.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    }
    return buckets;
  }, [partidos, lunes]);

  const totalSemana = partidos.length;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-paper-deep border-b border-line flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={14} className="text-accent flex-shrink-0" />
          <span className="font-semibold text-ink truncate">{canchaNombre}</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute">
          {totalSemana} partido{totalSemana === 1 ? '' : 's'} esta semana
        </span>
      </div>
      <div className="grid grid-cols-7 divide-x divide-line">
        {DIAS.map((dia, idx) => {
          const fechaDia = new Date(lunes);
          fechaDia.setDate(lunes.getDate() + idx);
          const esHoy = (() => {
            const hoy = new Date();
            return (
              hoy.getFullYear() === fechaDia.getFullYear() &&
              hoy.getMonth() === fechaDia.getMonth() &&
              hoy.getDate() === fechaDia.getDate()
            );
          })();
          const bucket = porDia[idx] ?? [];
          return (
            <div
              key={`${canchaId}-${dia}`}
              className={cn(
                'p-2 min-h-[80px]',
                esHoy ? 'bg-green-lime/10' : 'bg-paper',
              )}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wider font-semibold',
                    esHoy ? 'text-green-deep' : 'text-ink-mute',
                  )}
                >
                  {dia}
                </span>
                <span className="text-[10px] text-ink-mute font-mono">
                  {fechaDia.getDate().toString().padStart(2, '0')}
                </span>
              </div>
              <div className="space-y-1">
                {bucket.length === 0 ? (
                  <div className="text-[10px] font-serif italic text-ink-mute/60">Libre</div>
                ) : (
                  bucket.map((p) => (
                    <Link
                      key={p.partidoId}
                      href={`/admin/torneos/${p.torneoId}/partidos/${p.partidoId}`}
                      className="block p-1.5 rounded text-[10px] bg-green-deep/10 hover:bg-green-deep/20 text-ink leading-tight"
                      title={`${p.torneoNombre} · ${p.equipoLocal} vs ${p.equipoVisita} · ${p.estado}`}
                    >
                      <div className="font-mono font-semibold">{horaCorta(p.fechaHora)}</div>
                      <div className="truncate">{p.equipoLocal}</div>
                      <div className="truncate text-ink-mute">{p.equipoVisita}</div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
