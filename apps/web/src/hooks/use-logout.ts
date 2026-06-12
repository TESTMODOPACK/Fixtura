'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useAuthStore } from '@/store/auth-store';

/**
 * Cierra la sesión de forma segura.
 *
 * Limpia los tokens Y la caché de TanStack Query. Sin el `qc.clear()`, al
 * re-loguearse con otra cuenta en la misma pestaña las queries cacheadas
 * (en particular `['auth','me']`, con staleTime 60s) devuelven los datos del
 * usuario anterior. Eso provocaba que, tras salir de un super admin y entrar
 * como admin de liga, `useIsSuperAdmin()` siguiera dando true por un rato y el
 * layout redirigiera a `/admin/super` (fuga de panel entre cuentas).
 */
export function useLogout(): () => void {
  const router = useRouter();
  const qc = useQueryClient();
  const clearTokens = useAuthStore((s) => s.clearTokens);

  return useCallback(() => {
    clearTokens();
    qc.clear();
    router.replace('/');
  }, [clearTokens, qc, router]);
}
