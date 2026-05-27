'use client';

import { useEffect } from 'react';

/**
 * Registra el Service Worker /sw.js al primer render del cliente.
 *
 * Solo registra en producción (`process.env.NODE_ENV === 'production'`)
 * para no enmascarar bugs durante dev local con cache agresiva.
 *
 * En dev, si necesitás probar offline:
 *   1. Build de producción: `pnpm --filter @fixtura/web build && start`
 *   2. O comentá temporalmente el check de NODE_ENV abajo.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const handler = (): void => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // Si hay un SW nuevo esperando, lo activamos inmediatamente
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          // Listener para detectar cuando llega un update
          registration.addEventListener('updatefound', () => {
            const newSw = registration.installing;
            if (!newSw) return;
            newSw.addEventListener('statechange', () => {
              if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
                // Hay un SW nuevo listo. Notificamos al usuario via console
                // (toast/UI banner se puede agregar después).
                // eslint-disable-next-line no-console
                console.log('[fixtura] Nueva versión disponible. Refrescá para aplicarla.');
              }
            });
          });
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[fixtura] Service Worker no se pudo registrar:', err);
        });
    };

    // Registramos después de window load para no competir con el FCP.
    if (document.readyState === 'complete') {
      handler();
    } else {
      window.addEventListener('load', handler, { once: true });
    }
  }, []);

  return null;
}
