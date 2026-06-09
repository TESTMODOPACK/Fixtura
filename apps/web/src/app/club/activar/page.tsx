'use client';

import { CheckCircle2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { PasswordInput } from '@/components/ui/password-input';
import { useActivarDelegado, useActivarInfo } from '@/hooks/use-delegado';
import { parseApiErrorMessage } from '@/lib/api';

function ActivarInner(): React.ReactElement {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get('token');
  const { data: info, isLoading, error } = useActivarInfo(token);
  const activar = useActivarDelegado();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== password2) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }
    if (!token) return;
    activar.mutate(
      { token, password },
      {
        onSuccess: () => setListo(true),
        onError: (err) => setLocalError(parseApiErrorMessage(err)),
      },
    );
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup showTag={false} />
        </div>
        <Card padding="roomy">
          {isLoading && <p className="text-ink-mute text-center">Validando invitación…</p>}

          {error && (
            <div className="text-center">
              <p className="text-danger font-semibold mb-2">No pudimos validar la invitación.</p>
              <p className="text-sm text-ink-mute">{parseApiErrorMessage(error)}</p>
            </div>
          )}

          {listo && (
            <div className="text-center">
              <CheckCircle2 size={40} className="text-green-bright mx-auto mb-3" />
              <h2 className="font-display text-2xl text-green-deep mb-2">¡Cuenta activada!</h2>
              <p className="text-sm text-ink-mute mb-4">
                Ya podés iniciar sesión con tu email y la contraseña que creaste.
              </p>
              <Button variant="accent" onClick={() => router.push('/')}>
                Ir a iniciar sesión
              </Button>
            </div>
          )}

          {info && !listo && (
            <form onSubmit={onSubmit}>
              <div className="eyebrow mb-2">→ Activar cuenta de delegado</div>
              <h2 className="font-display text-2xl text-green-deep leading-tight mb-1">
                Hola {info.nombre}
              </h2>
              <p className="text-sm text-ink-mute mb-5">
                Delegado de <strong>{info.clubNombre}</strong>
                {info.ligaNombre ? ` · ${info.ligaNombre}` : ''}. Creá tu contraseña para
                acceder al portal de tu club.
              </p>

              {info.email && (
                <div className="mb-4">
                  <label className="label">Email (tu usuario)</label>
                  <input className="input bg-paper-dark" value={info.email} disabled readOnly />
                </div>
              )}

              <div className="mb-3">
                <label className="label">Contraseña</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="mb-4">
                <label className="label">Repetir contraseña</label>
                <PasswordInput
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {localError && (
                <p className="text-sm text-danger font-semibold mb-3">{localError}</p>
              )}

              <Button
                type="submit"
                variant="accent"
                className="w-full"
                loading={activar.isPending}
              >
                Activar mi cuenta
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ActivarDelegadoPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ActivarInner />
    </Suspense>
  );
}
