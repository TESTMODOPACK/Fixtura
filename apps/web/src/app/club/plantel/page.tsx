'use client';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useDelegadoPlantel } from '@/hooks/use-delegado';

export default function ClubPlantelPage(): React.ReactElement {
  const { data, isLoading } = useDelegadoPlantel();

  return (
    <div>
      <PageHead
        eyebrow="Mi club"
        title="Plantel"
        sub="Jugadores registrados de tu club, agrupados por categoría."
      />

      {isLoading && <p className="text-ink-mute">Cargando…</p>}
      {data && data.length === 0 && (
        <p className="text-ink-mute italic">Tu club todavía no tiene jugadores registrados.</p>
      )}

      <div className="space-y-6">
        {data?.map((grupo) => (
          <Card key={grupo.categoriaId} padding="comfortable">
            <CardLabel>{grupo.categoriaNombre ?? 'Sin categoría'}</CardLabel>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                    <th className="py-2 pr-3 w-12">#</th>
                    <th className="py-2 pr-3">Jugador</th>
                    <th className="py-2 pr-3">RUT</th>
                    <th className="py-2 pr-3">Posición</th>
                    <th className="py-2 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.jugadores.map((j) => (
                    <tr key={j.id} className="border-b border-line/50">
                      <td className="py-2 pr-3 text-ink-mute">{j.numeroCamiseta ?? '—'}</td>
                      <td className="py-2 pr-3 font-medium text-ink">
                        {j.nombre} {j.apellido}
                      </td>
                      <td className="py-2 pr-3 text-ink-mute">{j.rut ?? '—'}</td>
                      <td className="py-2 pr-3 text-ink-mute">{j.posicion ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-green-bright/15 text-green-bright">
                          {j.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
