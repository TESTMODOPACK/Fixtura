'use client';

import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';

import { ROLE_LABEL, type Role } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import {
  useAceptarInvitacionMiembro,
  useInvitacionMiembroInfo,
} from '@/hooks/use-admin';
import { parseApiErrorMessage } from '@/lib/api';
import { useTokenDeUrl } from '@/lib/token-url';

/**
 * T25 — aceptación de invitación a miembro admin para cuentas EXISTENTES:
 * el rol se otorga recién cuando el dueño de la cuenta acepta acá.
 */
function InvitacionInner(): React.ReactElement {
  const router = useRouter();
  // T27 — token desde el fragment (#token=…), con fallback a ?token= viejo.
  const { token, listo } = useTokenDeUrl();
  const { data: info, isLoading, error } = useInvitacionMiembroInfo(token);
  const aceptar = useAceptarInvitacionMiembro();
  const [localError, setLocalError] = useState<string | null>(null);
  const [aceptada, setAceptada] = useState<{ liga: string } | null>(null);

  const onAceptar = (): void => {
    if (!token) return;
    setLocalError(null);
    aceptar.mutate(token, {
      onSuccess: (r) => setAceptada({ liga: r.liga }),
      onError: (err) => setLocalError(parseApiErrorMessage(err)),
    });
  };

  const rolLabel = info ? (ROLE_LABEL[info.rol as Role] ?? info.rol) : '';

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <LigaPlusLockup showTag={false} />
        </div>
        <Card padding="roomy">
          {isLoading && <p className="text-ink-mute text-center">Validando invitación…</p>}

          {listo && !token && !isLoading && (
            <p className="text-danger font-semibold text-center">
              Falta el token de la invitación. Abre el link desde tu email.
            </p>
          )}

          {error && (
            <div className="text-center">
              <p className="text-danger font-semibold mb-2">
                No pudimos validar la invitación.
              </p>
              <p className="text-sm text-ink-mute">{parseApiErrorMessage(error)}</p>
            </div>
          )}

          {aceptada && (
            <div className="text-center">
              <CheckCircle2 size={40} className="text-green-bright mx-auto mb-3" />
              <h2 className="font-display text-2xl text-green-deep mb-2">
                Invitación aceptada
              </h2>
              <p className="text-sm text-ink-mute mb-4">
                Ya tienes acceso a <strong>{aceptada.liga}</strong>. Entra con tu
                email y tu contraseña de siempre.
              </p>
              <Button variant="accent" onClick={() => router.push('/')}>
                Ir a iniciar sesión
              </Button>
            </div>
          )}

          {info && !aceptada && (
            <div>
              <div className="eyebrow mb-2">→ Invitación a administrar una liga</div>
              <h2 className="font-display text-2xl text-green-deep leading-tight mb-1">
                {info.liga}
              </h2>
              <p className="text-sm text-ink-mute mb-5">
                Te invitaron como <strong>{rolLabel}</strong> de{' '}
                <strong>{info.liga}</strong>
                {info.email ? (
                  <>
                    {' '}
                    para tu cuenta <strong>{info.email}</strong>
                  </>
                ) : null}
                . Tu contraseña no cambia: solo se agrega este acceso si aceptas.
              </p>

              <div className="flex items-start gap-2 text-xs text-ink-mute font-serif italic bg-paper-dark/40 rounded-card px-3 py-2 mb-4">
                <ShieldCheck size={16} className="shrink-0 text-accent mt-0.5" />
                <span>
                  Si no esperabas esta invitación, cierra esta página — no se
                  agregará ningún acceso a tu cuenta.
                </span>
              </div>

              {localError && (
                <p className="text-sm text-danger font-semibold mb-3">{localError}</p>
              )}

              <Button
                type="button"
                variant="accent"
                className="w-full"
                loading={aceptar.isPending}
                onClick={onAceptar}
              >
                Aceptar invitación
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function InvitacionPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <InvitacionInner />
    </Suspense>
  );
}
