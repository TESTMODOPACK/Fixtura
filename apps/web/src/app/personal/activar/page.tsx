'use client';

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Página pública de activación de cuenta de personal. Recibe el token
 * en query string, lo manda al backend y muestra el resultado.
 *
 * Por ahora MVP: confirma la activación + invita a iniciar sesión.
 * v2: pedir al user crear su contraseña en el mismo flujo.
 */
type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; nombre: string; rol: string }
  | { tipo: 'error'; mensaje: string };

function ActivarContent(): React.ReactElement {
  const sp = useSearchParams();
  const token = sp.get('token');
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  useEffect(() => {
    if (!token) {
      setEstado({ tipo: 'error', mensaje: 'Falta el token en la URL.' });
      return;
    }
    fetch(`${API_URL}/public/personal/activar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ message: 'Error desconocido' }));
          throw new Error(body.message ?? 'Error activando la cuenta');
        }
        return r.json() as Promise<{ personalId: string; nombre: string; rol: string }>;
      })
      .then((data) => setEstado({ tipo: 'ok', nombre: data.nombre, rol: data.rol }))
      .catch((err) => setEstado({ tipo: 'error', mensaje: (err as Error).message }));
  }, [token]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <Card padding="roomy" className="max-w-lg w-full">
        {estado.tipo === 'cargando' && (
          <div className="text-center py-8">
            <Clock size={48} className="mx-auto text-ink-mute animate-pulse mb-4" />
            <p className="font-serif italic text-ink-mute">Activando tu cuenta…</p>
          </div>
        )}

        {estado.tipo === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle size={48} className="mx-auto text-danger mb-4" />
            <CardLabel className="text-danger">No pudimos activar la cuenta</CardLabel>
            <p className="text-ink mt-3">{estado.mensaje}</p>
            <p className="text-sm text-ink-mute font-serif italic mt-4">
              Si el link expiró o ya fue usado, pedile al admin de la liga que te envíe
              uno nuevo.
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

        {estado.tipo === 'ok' && (
          <div className="text-center py-4">
            <CheckCircle2 size={56} className={cn('mx-auto mb-4 text-green-bright')} />
            <CardLabel className="text-green-bright">¡Cuenta activada!</CardLabel>
            <p className="text-ink mt-4">
              Bienvenido/a, <strong>{estado.nombre}</strong>.
            </p>
            <p className="text-sm text-ink-mute mt-2">
              Quedaste registrado/a como <strong>{estado.rol.replace('_', ' ').toLowerCase()}</strong>.
            </p>
            <p className="text-xs text-ink-mute font-serif italic mt-4">
              El admin de la liga te va a contactar con los datos de acceso al sistema.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-block px-4 py-2 rounded-card text-sm font-semibold bg-green-deep text-chalk hover:bg-green-deep/90"
              >
                Ir al portal de la liga
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ActivarPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-paper flex items-center justify-center">
          <Clock size={36} className="animate-pulse text-ink-mute" />
        </div>
      }
    >
      <ActivarContent />
    </Suspense>
  );
}
