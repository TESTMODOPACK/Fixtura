import { cn } from '@/lib/cn';

interface LogoProps {
  size?: number;
  variant?: 'default' | 'lime' | 'mono';
  className?: string;
}

/**
 * Símbolo Fixtura — círculo verde profundo con X cruzada (naranja + lime).
 * La X representa: dos partidos cruzándose en el fixture, dos equipos
 * enfrentándose, las hojas del calendario tachadas.
 */
export function FixturaMark({ size = 32, variant = 'default', className }: LogoProps): React.ReactElement {
  const fill = variant === 'mono' ? '#FFFFFF' : '#0F2A1F';
  const stroke1 = variant === 'lime' ? '#95D5B2' : variant === 'mono' ? '#E76F26' : '#E76F26';
  const stroke2 = variant === 'lime' ? '#95D5B2' : variant === 'mono' ? '#E76F26' : '#95D5B2';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('flex-shrink-0', className)}
      aria-label="Fixtura"
    >
      <circle cx="60" cy="60" r="56" fill={fill} />
      <line
        x1="32"
        y1="32"
        x2="88"
        y2="88"
        stroke={stroke1}
        strokeWidth="14"
        strokeLinecap="round"
      />
      <line
        x1="88"
        y1="32"
        x2="32"
        y2="88"
        stroke={stroke2}
        strokeWidth="14"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Wordmark "FIXTURA" con X en naranja. Para headers, splashes, footers.
 */
export function FixturaWordmark({
  size = 32,
  inverse = false,
  className,
}: {
  size?: number;
  inverse?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <span
      style={{ fontSize: `${size}px` }}
      className={cn(
        'font-display_alt leading-none tracking-tight',
        inverse ? 'text-chalk' : 'text-green-deep',
        className,
      )}
    >
      FI<span className="text-accent">X</span>TURA
    </span>
  );
}

/**
 * Lockup horizontal completo: símbolo + wordmark + tagline.
 */
export function FixturaLockup({
  inverse = false,
  showTag = true,
  className,
}: {
  inverse?: boolean;
  showTag?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <FixturaMark size={40} variant={inverse ? 'lime' : 'default'} />
      <div>
        <div
          className={cn(
            'font-display tracking-[0.18em] text-2xl leading-none',
            inverse ? 'text-chalk' : 'text-green-deep',
          )}
        >
          FIXTURA
        </div>
        {showTag && (
          <div
            className={cn(
              'mt-1 text-[10px] uppercase tracking-[0.3em] font-semibold',
              inverse ? 'text-green-lime' : 'text-ink-mute',
            )}
          >
            Para ligas amateur · Chile
          </div>
        )}
      </div>
    </div>
  );
}
