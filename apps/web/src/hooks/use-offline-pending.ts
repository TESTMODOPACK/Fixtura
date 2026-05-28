'use client';

import { useEffect, useState } from 'react';

import { pendingCount } from '@/lib/offline-queue';

/**
 * Sprint 13: hook que devuelve la cantidad de operaciones pendientes
 * en la cola IndexedDB. Se actualiza al online/offline y por polling
 * suave (cada 2 segundos cuando hay pending).
 *
 * Usado en el acta para mostrar feedback al árbitro de cuántas
 * incidencias quedaron por sincronizar.
 */
export function useOfflinePending(): { count: number; isOnline: boolean } {
  const [count, setCount] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async (): Promise<void> => {
      try {
        const n = await pendingCount();
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    const schedule = (): void => {
      // Poll cada 2s si hay pending, 10s si no.
      const delay = count > 0 ? 2000 : 10000;
      timer = setTimeout(async () => {
        await refresh();
        if (!cancelled) schedule();
      }, delay);
    };

    const handleOnline = (): void => {
      setIsOnline(true);
      void refresh();
    };
    const handleOffline = (): void => {
      setIsOnline(false);
      void refresh();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    void refresh();
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [count]);

  return { count, isOnline };
}
