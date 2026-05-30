'use client';

import { AlertTriangle, ArrowLeft, ShieldAlert, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useImpersonationCandidates,
  useStartImpersonation,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

/**
 * Sprint 21 — RF-06. Página solo para SUPER_ADMIN.
 *
 * Lista usuarios con filtro por email. Click en "Entrar como" inicia la
 * impersonación: pide tokens al backend con impersonatorId, los guarda
 * en el store y redirige a /admin.
 */
export default function ImpersonatePage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const router = useRouter();
  const { data, isLoading, error } = useImpersonationCandidates(email);
  const start = useStartImpersonation();
  const startStore = useAuthStore((s) => s.startImpersonation);
  const apiError = error as ApiError | undefined;

  const onEntrar = async (userId: string): Promise<void> => {
    if (
      !window.confirm(
        '¿Iniciar sesión impersonada? Quedará registrado en audit log. Algunas acciones (cambiar password, eliminar cuenta) estarán bloqueadas.',
      )
    ) {
      return;
    }
    try {
      const result = await start.mutateAsync(userId);
      startStore(
        {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessTokenExpiresIn: result.accessTokenExpiresIn,
        },
        { userId: result.targetUserId, email: result.targetEmail },
      );
      router.push('/admin');
      // Forzar reload para descartar queries cacheadas con el JWT anterior.
      window.location.href = '/admin';
    } catch (err) {
      alert(`No se pudo iniciar: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Entrar como otro usuario"
        sub="Modo soporte. Ingresá como otro usuario para ver lo mismo que él ve. Todo lo que hagas queda registrado en el historial de auditoría."
      >
        <Link href="/admin">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Panel
          </Button>
        </Link>
      </PageHead>

      <Card padding="comfortable" className="mb-5 border-2 border-orange-600/40 bg-orange-50">
        <div className="flex items-start gap-2">
          <ShieldAlert size={18} className="text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-900">
            <strong>Atención: modo soporte sensible.</strong> Mientras estés viendo la
            cuenta de otro usuario NO podrás cambiar contraseñas, eliminar
            cuentas ni transferir titularidad. Cualquier otra acción (crear o
            editar datos, cerrar actas, etc.) queda registrada en el historial
            de auditoría a tu nombre.
          </div>
        </div>
      </Card>

      <Card padding="comfortable" className="mb-5">
        <CardLabel>Buscar usuario por email</CardLabel>
        <div className="mt-3">
          <Input
            placeholder="alguien@liga.cl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </Card>

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando…</div>
      )}

      {apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR LA LISTA
              </div>
              <div className="text-sm text-danger">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      {data && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 bg-paper-dark border-b border-line">
            <CardLabel>{data.length} candidato{data.length === 1 ? '' : 's'}</CardLabel>
          </div>
          {data.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-mute font-serif italic">
              Sin resultados.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-ink truncate">
                      {c.email}
                    </div>
                    <div className="text-xs text-ink-mute mt-0.5">
                      {c.roles.length === 0 ? (
                        <span className="italic">sin roles</span>
                      ) : (
                        c.roles.map((r) => (
                          <span
                            key={r}
                            className="inline-block mr-1 px-1.5 py-0.5 rounded bg-paper-dark font-semibold uppercase tracking-wider text-[10px]"
                          >
                            {r}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={() => onEntrar(c.id)}
                    disabled={start.isPending}
                  >
                    <UserCheck size={14} /> Entrar como
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
