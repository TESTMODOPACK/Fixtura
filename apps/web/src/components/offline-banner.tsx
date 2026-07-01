'use client';

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useOnlineStatus } from '@/hooks/use-online-status';
import { API_URL } from '@/lib/api';
import { clearDeadLetter, deadLetterCount, flushQueue, pendingCount } from '@/lib/offline-queue';
import { useAuthStore } from '@/store/auth-store';

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
  const [deadLetter, setDeadLetter] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState<number | null>(null);

  // Un solo ciclo (inmediato + cada 5s, re-creado al cambiar isOnline): si
  // estamos online y hay pendientes, intenta un flush (flushQueue respeta el
  // backoff internamente, así drena los items cuya ventana ya se cumplió), y
  // refresca los contadores de pendientes / dead-letter. MOV-4.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelado = false;
    let flushing = false;

    const cycle = async (): Promise<void> => {
      try {
        if (isOnline === true && !flushing && (await pendingCount()) > 0) {
          flushing = true;
          setSyncing(true);
          try {
            const result = await flushQueue(API_URL, {
              currentToken: useAuthStore.getState().accessToken,
            });
            if (!cancelado && result.syncedOk > 0) {
              setJustSynced(result.syncedOk);
              setTimeout(() => {
                if (!cancelado) setJustSynced(null);
              }, 3500);
            }
          } finally {
            flushing = false;
            if (!cancelado) setSyncing(false);
          }
        }
        const [p, d] = await Promise.all([pendingCount(), deadLetterCount()]);
        if (!cancelado) {
          setPending(p);
          setDeadLetter(d);
        }
      } catch {
        /* IDB no disponible, swallow */
      }
    };

    void cycle();
    const interval = setInterval(() => void cycle(), 5000);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, [isOnline]);

  // SSR / antes del primer effect: no mostrar
  if (isOnline === null) return null;

  // Online + sin cola + sin dead-letter + sin recién sincronizado: no se muestra
  if (isOnline && pending === 0 && deadLetter === 0 && justSynced === null) return null;

  // Decidir contenido
  let content: React.ReactNode;
  let tone: 'warning' | 'success' | 'info' | 'danger';

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
  } else if (syncing) {
    tone = 'info';
    content = (
      <>
        <RefreshCw size={16} className="flex-shrink-0 animate-spin" />
        <span>Sincronizando {pending} {pending === 1 ? 'cambio' : 'cambios'}…</span>
      </>
    );
  } else if (deadLetter > 0) {
    // MOV-4 — items que fallaron permanentemente: no se pierden en silencio.
    tone = 'danger';
    content = (
      <>
        <AlertTriangle size={16} className="flex-shrink-0" />
        <span>
          <strong>{deadLetter}</strong> {deadLetter === 1 ? 'cambio' : 'cambios'} no se{' '}
          {deadLetter === 1 ? 'pudo' : 'pudieron'} sincronizar · revisá y volvé a cargar
        </span>
        <button
          type="button"
          onClick={() => {
            void clearDeadLetter().then(() => setDeadLetter(0));
          }}
          className="ml-2 underline underline-offset-2 hover:opacity-80"
        >
          descartar
        </button>
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
  } else if (!isOnline) {
    tone = 'warning';
    content = (
      <>
        <CloudOff size={16} className="flex-shrink-0" />
        <span>Sin conexión · los cambios se guardarán localmente</span>
      </>
    );
  } else {
    // Online con pendientes en backoff (reintentando).
    tone = 'info';
    content = (
      <>
        <RefreshCw size={16} className="flex-shrink-0" />
        <span>
          <strong>{pending}</strong> {pending === 1 ? 'cambio' : 'cambios'} esperando
          reintento…
        </span>
      </>
    );
  }

  const bgClass =
    tone === 'success'
      ? 'bg-green-bright text-chalk'
      : tone === 'info'
        ? 'bg-accent text-chalk'
        : tone === 'danger'
          ? 'bg-danger text-chalk'
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
