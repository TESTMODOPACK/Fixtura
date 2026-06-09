import { cn } from '@/lib/cn';

interface PageHeadProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Encabezado de página estilo prototipo LigaPlus:
 *   → EYEBROW (uppercase, naranja, letter-spacing alto)
 *   Buenas, Rodrigo (Anton, verde profundo, 40-48px)
 *   Hoy es viernes... (Newsreader italic, mute)
 *   [actions]
 */
export function PageHead({
  eyebrow,
  title,
  sub,
  children,
  className,
}: PageHeadProps): React.ReactElement {
  return (
    <header className={cn('mb-8 flex items-end justify-between gap-6 flex-wrap', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">→ {eyebrow}</div>}
        <h1 className="font-display text-4xl md:text-5xl text-green-deep tracking-display leading-none">
          {title}
        </h1>
        {sub && (
          <p className="font-serif italic text-base text-ink-mute mt-2 max-w-2xl">{sub}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </header>
  );
}
