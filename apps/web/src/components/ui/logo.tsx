import { cn } from '@/lib/cn';

interface LogoProps {
  size?: number;
  variant?: 'default' | 'lime' | 'mono';
  className?: string;
}

/**
 * Símbolo LigaPlus — círculo verde profundo con un "+" cruzado
 * (naranja + lime). El "+" representa el "Plus" de la marca: la liga y
 * todo lo que suma alrededor (operación, finanzas, comunidad).
 */
export function LigaPlusMark({ size = 32, variant = 'default', className }: LogoProps): React.ReactElement {
  const fill = variant === 'mono' ? '#FFFFFF' : '#0F2A1F';
  // Barra horizontal (naranja) + vertical (lime). En dark/lime o mono el
  // "+" va de un solo color para máximo contraste.
  const barH = variant === 'lime' ? '#95D5B2' : variant === 'mono' ? '#0F2A1F' : '#E76F26';
  const barV = variant === 'lime' ? '#95D5B2' : variant === 'mono' ? '#0F2A1F' : '#95D5B2';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('flex-shrink-0', className)}
      aria-label="LigaPlus"
    >
      <circle cx="60" cy="60" r="56" fill={fill} />
      {/* Barra horizontal del "+" */}
      <line
        x1="34"
        y1="60"
        x2="86"
        y2="60"
        stroke={barH}
        strokeWidth="15"
        strokeLinecap="round"
      />
      {/* Barra vertical del "+" */}
      <line
        x1="60"
        y1="34"
        x2="60"
        y2="86"
        stroke={barV}
        strokeWidth="15"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Wordmark "Liga+" — "Liga" en verde profundo y el "+" en naranja.
 * Para headers, splashes, footers.
 */
export function LigaPlusWordmark({
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
      Liga<span className="text-accent">+</span>
    </span>
  );
}

/**
 * Lockup horizontal completo: símbolo + wordmark + tagline.
 */
export function LigaPlusLockup({
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
      <LigaPlusMark size={40} variant={inverse ? 'lime' : 'default'} />
      <div>
        <div
          className={cn(
            'font-display tracking-[0.12em] text-2xl leading-none',
            inverse ? 'text-chalk' : 'text-green-deep',
          )}
        >
          LIGA<span className="text-accent">+</span>
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
