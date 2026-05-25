import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'default' | 'accent' | 'dark' | 'ghost';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  default: 'btn',
  accent: 'btn btn-accent',
  dark: 'btn btn-dark',
  ghost: 'btn btn-ghost',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', loading, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={cn(variantClass[variant], size === 'sm' && 'btn-sm', className)}
      {...rest}
    >
      {loading ? '...' : children}
    </button>
  );
});
