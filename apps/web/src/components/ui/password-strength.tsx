'use client';

import {
  calcularFortalezaPassword,
  validarPasswordSegura,
  type PasswordContext,
} from '@fixtura/domain';

import { cn } from '@/lib/cn';

/** Color de las barras según el score (0–4). */
const BAR_COLOR = [
  'bg-line',
  'bg-danger',
  'bg-orange-700',
  'bg-green-bright',
  'bg-green-bright',
];

const TEXT_COLOR = [
  'text-ink-mute',
  'text-danger',
  'text-orange-700',
  'text-green-deep',
  'text-green-deep',
];

/**
 * Medidor de fortaleza de contraseña, alimentado por el validador
 * compartido (@fixtura/domain). Muestra una barra de 4 segmentos + una
 * pista: si la contraseña aún no cumple la política, muestra el motivo;
 * si cumple, muestra el nivel (Aceptable / Buena / Fuerte).
 */
export function PasswordStrengthMeter({
  password,
  ctx,
}: {
  password: string;
  ctx?: PasswordContext;
}): React.ReactElement | null {
  if (!password) return null;
  const { score, etiqueta } = calcularFortalezaPassword(password, ctx);
  const error = validarPasswordSegura(password, ctx);

  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i <= score ? BAR_COLOR[score] : 'bg-line',
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs', error ? 'text-danger' : TEXT_COLOR[score])}>
        {error ?? `Fortaleza: ${etiqueta}`}
      </p>
    </div>
  );
}
