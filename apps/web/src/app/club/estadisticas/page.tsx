'use client';

import { AlertTriangle } from 'lucide-react';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useDelegadoEstadisticas } from '@/hooks/use-delegado';

export default function ClubEstadisticasPage(): React.ReactElement {
  const { data, isLoading } = useDelegadoEstadisticas();

  return (
    <div>
      <PageHead
        eyebrow="Mi club"
        title="Estadísticas"
        sub="Rendimiento por torneo, tarjetas y sanciones activas."
      />

      {isLoading && <p className="text-ink-mute">Cargando…</p>}

      {data && (
        <div className="space-y-6">
          <Card>
            <CardLabel>Rendimiento por categoría</CardLabel>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                    <th className="py-2 pr-3">Torneo / Categoría</th>
                    <th className="py-2 px-2 text-center">PJ</th>
                    <th className="py-2 px-2 text-center">G</th>
                    <th className="py-2 px-2 text-center">E</th>
                    <th className="py-2 px-2 text-center">P</th>
                    <th className="py-2 px-2 text-center">GF</th>
                    <th className="py-2 px-2 text-center">GC</th>
                    <th className="py-2 px-2 text-center">Pts</th>
                    <th className="py-2 px-2 text-center">🟨</th>
                    <th className="py-2 px-2 text-center">🟥</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porInscripcion.map((s) => (
                    <tr key={s.inscripcionId} className="border-b border-line/50">
                      <td className="py-2 pr-3 font-medium text-ink">
                        {s.torneoNombre}
                        {s.categoriaNombre ? (
                          <span className="text-ink-mute font-normal"> · {s.categoriaNombre}</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.pj}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.pg}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.pe}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.pp}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.gf}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.gc}</td>
                      <td className="py-2 px-2 text-center tabular-nums font-semibold">{s.puntos}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.amarillas}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{s.rojas}</td>
                    </tr>
                  ))}
                  {data.porInscripcion.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-3 text-ink-mute italic text-center">
                        Sin partidos jugados aún.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardLabel tone="accent">Sanciones activas</CardLabel>
            {data.sanciones.length === 0 ? (
              <p className="text-sm text-ink-mute mt-2 italic">
                No hay jugadores con sanciones pendientes. 👏
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.sanciones.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 text-sm border-b border-line/50 pb-2"
                  >
                    <AlertTriangle size={16} className="text-danger shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium text-ink">{s.jugadorNombre}</span>
                      <span className="text-ink-mute"> — {s.motivo}</span>
                      {s.torneoNombre ? (
                        <span className="text-ink-mute"> · {s.torneoNombre}</span>
                      ) : null}
                    </div>
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-danger/15 text-danger font-semibold">
                      {s.fechasPendientes} fecha(s)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
