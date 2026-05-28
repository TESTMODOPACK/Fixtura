'use client';

import { CheckCircle2, KeyRound, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_URL } from '@/lib/api';

/**
 * Página pública para solicitar recuperación de contraseña.
 *
 * Por seguridad, el backend SIEMPRE responde OK, no revela si el email
 * existe. La UI siempre muestra "te enviamos un email" después del submit.
 */
export default function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ message: 'Error' }));
        throw new Error(body.message ?? 'Error procesando la solicitud');
      }
      setEnviado(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <Card padding="roomy" className="max-w-md w-full">
        {!enviado ? (
          <>
            <div className="text-center mb-6">
              <KeyRound size={36} className="mx-auto text-green-deep mb-3" />
              <CardLabel>Recuperar contraseña</CardLabel>
              <p className="text-sm text-ink-mute mt-2">
                Ingresá tu email y te enviaremos un link para crear una nueva contraseña.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                label="Email"
                type="email"
                placeholder="tu@email.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={enviando}
              />
              {error && (
                <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
                  {error}
                </div>
              )}
              <Button type="submit" variant="accent" loading={enviando} className="w-full">
                <Mail size={14} /> Enviar email
              </Button>
              <div className="text-center">
                <Link href="/" className="text-xs text-ink-mute hover:text-green-deep">
                  Volver al inicio
                </Link>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 size={56} className="mx-auto text-green-bright mb-4" />
            <CardLabel className="text-green-bright">¡Listo!</CardLabel>
            <p className="text-ink mt-4">
              Si <strong>{email}</strong> está registrado en Fixtura, te enviamos un
              email con un link para recuperar tu contraseña.
            </p>
            <p className="text-sm text-ink-mute font-serif italic mt-4">
              El link expira en 30 minutos. Revisá también la carpeta de spam.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-block px-4 py-2 rounded-card text-sm font-semibold bg-green-deep text-chalk hover:bg-green-deep/90"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
