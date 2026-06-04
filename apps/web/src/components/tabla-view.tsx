'use client';

import { PublicHeader } from '@/components/public-header';
import { Card } from '@/components/ui/card';
import { useTabla } from '@/hooks/use-portal';
import { cn } from '@/lib/cn';

interface TablaViewProps {
  /** Sprint 36C — si está, filtra por torneo específico y los tabs del header navegan dentro del torneo. */
  torneoSlug?: string;
}

export function TablaView({ torneoSlug }: TablaViewProps): React.ReactElement {
  const { data, isLoading } = useTabla(torneoSlug);

  return (
    <>
      <PublicHeader ligaNombre={data?.torneo.nombre ?? 'Cargando…'} active="tabla" torneoSlug={torneoSlug} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="eyebrow mb-2">→ {data?.torneo.nombre ?? '...'}</div>
        <h1 className="font-display text-4xl text-green-deep tracking-display mb-6">
          TABLA DE POSICIONES
        </h1>

        {isLoading && <div className="font-serif italic text-ink-mute">Cargando tabla...</div>}

        {data && (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper-dark border-b border-line">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Equipo</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">PJ</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">G</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">E</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">P</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">GF</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">GC</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute w-12">DG</th>
                    <th className="text-center px-2 py-3 text-xs uppercase tracking-wider font-semibold text-green-deep w-12 bg-green-lime/30">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.filas.map((fila) => (
                    <tr key={fila.equipoId} className="hover:bg-paper transition-colors">
                      <td className={cn(
                        'px-4 py-3 font-mono text-xs font-semibold',
                        fila.posicion <= 4 && 'text-green-bright',
                        fila.posicion >= data.filas.length - 1 && 'text-danger',
                      )}>
                        {fila.posicion}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink truncate max-w-xs">{fila.equipoNombre}</td>
                      <td className="text-center px-2 py-3 text-ink-mute">{fila.pj}</td>
                      <td className="text-center px-2 py-3 text-ink-mute">{fila.pg}</td>
                      <td className="text-center px-2 py-3 text-ink-mute">{fila.pe}</td>
                      <td className="text-center px-2 py-3 text-ink-mute">{fila.pp}</td>
                      <td className="text-center px-2 py-3 text-ink-mute">{fila.gf}</td>
                      <td className="text-center px-2 py-3 text-ink-mute">{fila.gc}</td>
                      <td className={cn('text-center px-2 py-3', fila.dg > 0 ? 'text-green-bright' : fila.dg < 0 ? 'text-danger' : 'text-ink-mute')}>
                        {fila.dg > 0 ? '+' : ''}{fila.dg}
                      </td>
                      <td className="text-center px-2 py-3 bg-green-lime/20 font-display text-lg text-green-deep tracking-display">
                        {fila.pts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {data && (
          <p className="mt-4 text-xs text-ink-mute font-serif italic">
            Actualizada al cierre de la última acta · {new Date(data.actualizadaAt).toLocaleString('es-CL')}
          </p>
        )}
      </main>
    </>
  );
}
