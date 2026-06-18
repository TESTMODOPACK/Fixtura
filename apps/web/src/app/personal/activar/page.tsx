'use client';

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import type { ActivarPersonalInfo } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { PasswordInput } from '@/components/ui/password-input';
import { API_URL } from '@/lib/api';

/**
 * Activación de cuenta del personal (árbitros / planilleros). Valida el
 * token, muestra los datos y deja que la persona cree su contraseña →
 * recién ahí se crea su cuenta de login (rol según su función).
 */
type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'form'; info: ActivarPersonalInfo }
  | { tipo: 'listo' }
  | { tipo: 'error'; mensaje: string };

function ActivarContent(): React.ReactElement {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get('token');
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      setEstado({ tipo: 'error', mensaje: 'Falta el token en la URL.' });
      return;
    }
    fetch(`${API_URL}/public/personal/activacion-info?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ message: 'Error' }));
          throw new Error(body.message ?? 'No pudimos validar la invitación.');
        }
        return r.json() as Promise<ActivarPersonalInfo>;
      })
      .then((info) => setEstado({ tipo: 'form', info }))
      .catch((err) => setEstado({ tipo: 'error', mensaje: (err as Error).message }));
  }, [token]);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
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
    setEnviando(true);
    try {
      const r = await fetch(`${API_URL}/public/personal/activar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ message: 'Error' }));
        throw new Error(body.message ?? 'No pudimos activar la cuenta.');
      }
      setEstado({ tipo: 'listo' });
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup showTag={false} />
        </div>
        <Card padding="roomy">
          {estado.tipo === 'cargando' && (
            <div className="text-center py-6">
              <Clock size={40} className="mx-auto text-ink-mute animate-pulse mb-3" />
              <p className="font-serif italic text-ink-mute">Validando invitación…</p>
            </div>
          )}

          {estado.tipo === 'error' && (
            <div className="text-center py-4">
              <AlertTriangle size={44} className="mx-auto text-danger mb-3" />
              <p className="text-danger font-semibold mb-1">No pudimos validar la invitación.</p>
              <p className="text-sm text-ink-mute">{estado.mensaje}</p>
              <p className="text-xs text-ink-mute font-serif italic mt-4">
                Si el link expiró o ya fue usado, pídele al admin de la liga que te envíe uno
                nuevo.
              </p>
            </div>
          )}

          {estado.tipo === 'listo' && (
            <div className="text-center py-4">
              <CheckCircle2 size={48} className="text-green-bright mx-auto mb-3" />
              <h2 className="font-display text-2xl text-green-deep mb-2">¡Cuenta activada!</h2>
              <p className="text-sm text-ink-mute mb-4">
                Ya puedes iniciar sesión con tu email y la contraseña que creaste para ver tus
                designaciones.
              </p>
              <Button variant="accent" onClick={() => router.push('/')}>
                Ir a iniciar sesión
              </Button>
            </div>
          )}

          {estado.tipo === 'form' && (
            <form onSubmit={onSubmit}>
              <div className="eyebrow mb-2">→ Activar cuenta</div>
              <h2 className="font-display text-2xl text-green-deep leading-tight mb-1">
                Hola {estado.info.nombre}
              </h2>
              <p className="text-sm text-ink-mute mb-5">
                {estado.info.rol.replace('_', ' ').toLowerCase()}
                {estado.info.ligaNombre ? ` · ${estado.info.ligaNombre}` : ''}. Crea tu
                contraseña para acceder a tus designaciones.
              </p>

              {estado.info.email && (
                <div className="mb-4">
                  <label className="label">Email (tu usuario)</label>
                  <input className="input bg-paper-dark" value={estado.info.email} disabled readOnly />
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

              <Button type="submit" variant="accent" className="w-full" loading={enviando}>
                Activar mi cuenta
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ActivarPersonalPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ActivarContent />
    </Suspense>
  );
}
