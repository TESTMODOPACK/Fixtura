import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...rest },
  ref,
) {
  const autoId = id ?? `input-${rest.name ?? 'field'}`;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={autoId} className="label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={autoId}
        className={cn('input', error && 'border-danger focus:border-danger', className)}
        {...rest}
      />
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
});
