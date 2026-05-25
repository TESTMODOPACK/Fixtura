import { cn } from '@/lib/cn';

type Variant = 'default' | 'dark' | 'lime' | 'accent' | 'paper';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: 'tight' | 'comfortable' | 'roomy' | 'none';
}

const variantClasses: Record<Variant, string> = {
  default: 'card',
  dark: 'card-dark',
  lime: 'card-lime',
  accent: 'card-accent',
  paper: 'card-paper',
};

const padding: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  tight: 'p-4',
  comfortable: 'p-6',
  roomy: 'p-9',
};

export function Card({
  variant = 'default',
  padding: pad = 'comfortable',
  className,
  ...rest
}: CardProps): React.ReactElement {
  return <div className={cn(variantClasses[variant], padding[pad], className)} {...rest} />;
}

interface CardLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'accent' | 'lime' | 'mute';
}

export function CardLabel({
  tone = 'accent',
  className,
  children,
  ...rest
}: CardLabelProps): React.ReactElement {
  const toneClass =
    tone === 'accent' ? 'eyebrow' : tone === 'lime' ? 'eyebrow-lime' : 'eyebrow-mute';
  return (
    <div className={cn(toneClass, 'mb-3', className)} {...rest}>
      → {children}
    </div>
  );
}
