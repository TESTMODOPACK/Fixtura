import { cn } from '@/lib/cn';

interface LogoProps {
  size?: number;
  variant?: 'default' | 'lime' | 'mono';
  className?: string;
}

/**
 * Símbolo LigaPlus — emblema (balón + cancha + "+"). Asset de marca
 * provisto por diseño en /brand/mark.png (recorte del logo oficial).
 * `variant` se mantiene por compatibilidad de firma; el raster ya trae
 * sus colores.
 */
export function LigaPlusMark({ size = 32, className }: LogoProps): React.ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/mark.png"
      alt="LigaPlus"
      width={size}
      height={size}
      className={cn('flex-shrink-0 rounded-[20%] object-contain', className)}
    />
  );
}

/**
 * Wordmark "LigaPlus" tipográfico — "Liga" en color base, "Plus" en naranja.
 * Para usos donde no entra el emblema (ej. textos inline).
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
      Liga<span className="text-accent">Plus</span>
    </span>
  );
}

/**
 * Lockup completo: el logo oficial (emblema + "LigaPlus") provisto por
 * diseño en /brand/logo.png. En fondos oscuros (sidebars) se redondea
 * para que el fondo crema del asset se lea como un badge.
 *
 * `inverse` y `showTag` se mantienen por compatibilidad de firma.
 */
export function LigaPlusLockup({
  inverse = false,
  className,
}: {
  inverse?: boolean;
  showTag?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo.png"
      alt="LigaPlus — para ligas amateur"
      className={cn(
        'h-16 w-auto rounded-xl object-contain',
        // El asset tiene fondo transparente; sobre fondos oscuros (sidebars)
        // ponemos un chip claro detrás para que el logo se lea como badge.
        inverse && 'bg-chalk p-1.5',
        className,
      )}
    />
  );
}
