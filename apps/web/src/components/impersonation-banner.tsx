'use client';

import { LogOut, ShieldAlert } from 'lucide-react';

import { useEndImpersonation } from '@/hooks/use-admin';
import { useAuthStore } from '@/store/auth-store';

/**
 * Sprint 21 — RF-06. Banner persistente que avisa al super admin que
 * está viendo la cuenta de otro usuario. Botón "Salir" restaura los
 * tokens originales y recarga la página para limpiar el estado de
 * React Query.
 */
export function ImpersonationBanner(): React.ReactElement | null {
  const target = useAuthStore((s) => s.impersonationTarget);
  const endImpersonation = useAuthStore((s) => s.endImpersonation);
  const endCall = useEndImpersonation();

  if (!target) return null;

  const onSalir = async (): Promise<void> => {
    try {
      await endCall.mutateAsync(target.userId);
    } catch {
      // El backend ya loggeó si pudo; igual restauramos los tokens.
    }
    endImpersonation();
    // Recargar para que TODOS los queries refresquen con el nuevo JWT.
    window.location.href = '/admin';
  };

  return (
    <div className="sticky top-0 z-50 bg-orange-600 text-chalk shadow-md">
      <div className="px-4 py-2 flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert size={18} className="flex-shrink-0" />
          <span className="text-sm font-semibold truncate">
            Modo impersonación · viendo como{' '}
            <span className="font-mono">{target.email}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onSalir}
          disabled={endCall.isPending}
          className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded text-xs uppercase tracking-wider font-bold bg-chalk text-orange-600 hover:bg-chalk/90 disabled:opacity-50"
        >
          <LogOut size={12} /> Salir del modo soporte
        </button>
      </div>
    </div>
  );
}
