'use client';

import { AlertTriangle, CheckCircle2, KeyRound, Lock } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_URL } from '@/lib/api';

/**
 * Página de reset de contraseña. Recibe ?token=... y permite al usuario
 * crear una nueva contraseña. Después de aplicar el reset, todos los
 * refresh tokens del user quedan invalidados (forzando re-login en
 * todos los dispositivos).
 */
function ResetContent(): React.ReactElement {
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Card padding="roomy" className="max-w-md w-full">
        <div className="text-center py-4">
          <AlertTriangle size={48} className="mx-auto text-danger mb-4" />
          <CardLabel className="text-danger">Link inválido</CardLabel>
          <p className="text-ink mt-3">Falta el token en la URL.</p>
          <p className="text-sm text-ink-mute font-serif italic mt-4">
            Si el link es muy viejo, pedí uno nuevo desde la pantalla de inicio.
          </p>
          <div className="mt-6">
            <Link
              href="/forgot-password"
              className="inline-block px-4 py-2 rounded-card text-sm font-semibold bg-green-deep text-chalk hover:bg-green-deep/90"
            >
              Pedir nuevo link
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (pwd.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (pwd !== pwd2) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ message: 'Error' }));
        throw new Error(body.message ?? 'No se pudo cambiar la contraseña');
      }
      setExito(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (exito) {
    return (
      <Card padding="roomy" className="max-w-md w-full">
        <div className="text-center py-4">
          <CheckCircle2 size={56} className="mx-auto text-green-bright mb-4" />
          <CardLabel className="text-green-bright">Contraseña actualizada</CardLabel>
          <p className="text-ink mt-4">
            Ya podés iniciar sesión con tu nueva contraseña.
          </p>
          <p className="text-sm text-ink-mute font-serif italic mt-4">
            Si tenías sesión abierta en otro dispositivo, vas a tener que volver a
            iniciar sesión allí también.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-card text-sm font-semibold bg-green-deep text-chalk hover:bg-green-deep/90"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="roomy" className="max-w-md w-full">
      <div className="text-center mb-6">
        <KeyRound size={36} className="mx-auto text-green-deep mb-3" />
        <CardLabel>Nueva contraseña</CardLabel>
        <p className="text-sm text-ink-mute mt-2">
          Elegí una contraseña segura. Mínimo 8 caracteres.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          label="Nueva contraseña"
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          required
          minLength={8}
          maxLength={200}
          disabled={enviando}
        />
        <Input
          label="Repetir contraseña"
          type="password"
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          required
          minLength={8}
          maxLength={200}
          disabled={enviando}
        />
        {error && (
          <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error}
          </div>
        )}
        <Button type="submit" variant="accent" loading={enviando} className="w-full">
          <Lock size={14} /> Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <Suspense
        fallback={
          <div className="text-ink-mute">
            <KeyRound size={36} className="animate-pulse" />
          </div>
        }
      >
        <ResetContent />
      </Suspense>
    </div>
  );
}
