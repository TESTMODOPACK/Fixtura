'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { clearAll as clearOfflineQueue } from '@/lib/offline-queue';
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
    // SEC-5 — Limpia datos locales sensibles antes de soltar la sesión:
    // las caches del SW (respuestas autenticadas: planteles, actas,
    // personal) y la cola offline en IndexedDB (que persiste el JWT en
    // claro). Sin esto, en un dispositivo compartido el siguiente usuario
    // podía leer datos del anterior tras cerrar sesión. Best-effort: no
    // bloquea el logout.
    void limpiarDatosLocales();
    router.replace('/');
  }, [clearTokens, qc, router]);
}

/** Borra caches del Service Worker + cola offline (IndexedDB). */
async function limpiarDatosLocales(): Promise<void> {
  try {
    await clearOfflineQueue();
  } catch {
    /* noop — el logout no debe fallar por esto */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* noop */
  }
}
