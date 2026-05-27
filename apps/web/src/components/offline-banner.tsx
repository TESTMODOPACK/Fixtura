'use client';

import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useOnlineStatus } from '@/hooks/use-online-status';
import { API_URL } from '@/lib/api';
import { flushQueue, pendingCount } from '@/lib/offline-queue';

/**
 * Banner global pegado al top de la pantalla cuando el usuario está
 * offline o cuando hay operaciones encoladas esperando sincronización.
 *
 * Estados:
 *   - Offline + sin cola → "Sin conexión. Tus cambios se van a guardar
 *     localmente."
 *   - Offline + cola pendiente → "Sin conexión. N cambios esperando
 *     sincronización."
 *   - Online recién recuperado + flush ejecutándose → "Sincronizando..."
 *   - Online + flush OK con N items → "✓ N cambios sincronizados" (3s y se oculta)
 *   - Online + sin cola → no se muestra
 */
export function OfflineBanner(): React.ReactElement | null {
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState<number | null>(null);

  // Refrescar el count de pending cada 5s mientras estamos offline
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = (): void => {
      pendingCount()
        .then(setPending)
        .catch(() => {
          /* IDB no disponible, swallow */
        });
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  // Al pasar de offline a online, drenar la cola
  useEffect(() => {
    if (isOnline !== true) return;
    if (pending === 0) return;
    if (syncing) return;

    const doFlush = async (): Promise<void> => {
      setSyncing(true);
      try {
        const result = await flushQueue(API_URL);
        const newPending = await pendingCount();
        setPending(newPending);
        if (result.syncedOk > 0) {
          setJustSynced(result.syncedOk);
          setTimeout(() => setJustSynced(null), 3500);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[offline-banner] flush falló:', err);
      } finally {
        setSyncing(false);
      }
    };
    void doFlush();
  }, [isOnline, pending, syncing]);

  // SSR / antes del primer effect: no mostrar
  if (isOnline === null) return null;

  // Online + sin cola + sin recién sincronizado: no se muestra
  if (isOnline && pending === 0 && justSynced === null) return null;

  // Decidir contenido
  let content: React.ReactNode;
  let tone: 'warning' | 'success' | 'info';

  if (justSynced !== null && isOnline && !syncing) {
    tone = 'success';
    content = (
      <>
        <CheckCircle2 size={16} className="flex-shrink-0" />
        <span>
          ✓ {justSynced} {justSynced === 1 ? 'cambio sincronizado' : 'cambios sincronizados'}
        </span>
      </>
    );
  } else if (isOnline && syncing) {
    tone = 'info';
    content = (
      <>
        <RefreshCw size={16} className="flex-shrink-0 animate-spin" />
        <span>Sincronizando {pending} {pending === 1 ? 'cambio' : 'cambios'}…</span>
      </>
    );
  } else if (!isOnline && pending > 0) {
    tone = 'warning';
    content = (
      <>
        <CloudOff size={16} className="flex-shrink-0" />
        <span>
          Sin conexión · <strong>{pending}</strong> {pending === 1 ? 'cambio' : 'cambios'}{' '}
          esperando sincronizar
        </span>
      </>
    );
  } else {
    // !isOnline && pending === 0
    tone = 'warning';
    content = (
      <>
        <CloudOff size={16} className="flex-shrink-0" />
        <span>Sin conexión · los cambios se guardarán localmente</span>
      </>
    );
  }

  const bgClass =
    tone === 'success'
      ? 'bg-green-bright text-chalk'
      : tone === 'info'
        ? 'bg-accent text-chalk'
        : 'bg-orange-700 text-chalk';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] ${bgClass}`}
    >
      {content}
    </div>
  );
}
