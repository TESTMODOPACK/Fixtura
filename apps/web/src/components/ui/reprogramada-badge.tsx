import { RefreshCw } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Distintivo para jornadas/partidos que pertenecen a una fecha REPROGRAMADA
 * (reemplazo de una jornada suspendida). Una sola fuente de verdad para que
 * se vea idéntico en fixture, designaciones, detalle de partido y portales.
 */
export function ReprogramadaBadge({
  className,
  label = 'Reprogramada',
}: {
  className?: string;
  label?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-orange-700/15 text-orange-700 font-semibold whitespace-nowrap',
        className,
      )}
    >
      <RefreshCw size={11} /> {label}
    </span>
  );
}
