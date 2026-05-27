'use client';

import { useEffect, useState } from 'react';

/**
 * Hook que retorna el estado de conexión del navegador.
 *
 * Retorna `null` durante el SSR (evita hydration mismatch) y `true`/`false`
 * tras el primer render del cliente.
 *
 * Usa `navigator.onLine` + listeners de `online`/`offline`. Es un proxy
 * imperfecto (sólo detecta el link layer; un wifi sin internet retorna
 * true), pero suficiente como indicador inicial. Para detección más
 * precisa habría que pingear periódicamente al backend.
 */
export function useOnlineStatus(): boolean | null {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
