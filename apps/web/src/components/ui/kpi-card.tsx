import { cn } from '@/lib/cn';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  deltaDown?: boolean;
  variant?: 'default' | 'dark' | 'lime';
  density?: 'comoda' | 'compacta';
}

/**
 * Tarjeta de KPI estilo prototipo:
 *  → LABEL (eyebrow naranja)
 *   123     (display Anton, gigante)
 *   sub     (serif italic, mute)
 *   +10.4%  (badge verde o naranja)
 */
export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaDown,
  variant = 'default',
  density = 'comoda',
}: KpiCardProps): React.ReactElement {
  const isDark = variant === 'dark';
  const isLime = variant === 'lime';
  const baseClass = isDark ? 'card-dark' : isLime ? 'card-lime' : 'card';
  const pad = density === 'compacta' ? 'p-4' : 'p-6';

  const labelClass = isDark ? 'eyebrow-lime' : 'eyebrow';
  const valueClass = isDark ? 'text-chalk' : 'text-green-deep';
  const subClass = isDark ? 'text-green-lime' : 'text-ink-mute';

  return (
    <div className={cn(baseClass, pad)}>
      <div className={cn(labelClass, 'mb-2')}>→ {label}</div>
      <div
        className={cn(
          'font-display tracking-display leading-none',
          density === 'compacta' ? 'text-3xl' : 'text-4xl md:text-5xl',
          valueClass,
        )}
      >
        {value}
      </div>
      {sub && <div className={cn('font-serif italic text-sm mt-2', subClass)}>{sub}</div>}
      {delta && (
        <div
          className={cn(
            'inline-flex mt-3 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-semibold',
            deltaDown
              ? 'bg-danger/10 text-danger'
              : isDark
                ? 'bg-green-lime/20 text-green-lime'
                : 'bg-green-bright/10 text-green-bright',
          )}
        >
          {delta}
        </div>
      )}
    </div>
  );
}
