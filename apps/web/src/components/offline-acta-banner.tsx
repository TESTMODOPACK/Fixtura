'use client';

import { CheckCircle2, CloudOff, Loader2 } from 'lucide-react';

import { useOfflinePending } from '@/hooks/use-offline-pending';
import { cn } from '@/lib/cn';

/**
 * Sprint 13: banner persistente para el acta que avisa al árbitro:
 *   - Online sin pending → no se renderiza (null).
 *   - Online con pending → "sincronizando N operaciones".
 *   - Offline → "modo offline, las acciones se guardan localmente".
 *
 * Se usa dentro del partido detail (no es un banner global como
 * <OfflineBanner /> del Sprint 5, ese sigue existiendo arriba).
 */
export function OfflineActaBanner(): React.ReactElement | null {
  const { count, isOnline } = useOfflinePending();

  if (isOnline && count === 0) return null;

  if (!isOnline) {
    return (
      <div
        className={cn(
          'mb-4 p-3 rounded-card border-2 flex items-start gap-3',
          'border-orange-700/40 bg-orange-700/10 text-orange-700',
        )}
        role="status"
      >
        <CloudOff size={20} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Modo offline</div>
          <div className="text-sm mt-1">
            Las incidencias que cargues se guardan en este dispositivo y se sincronizan
            automáticamente cuando vuelva la conexión.
            {count > 0 && (
              <>
                {' '}
                <strong>{count}</strong> operación{count === 1 ? '' : 'es'} en cola.
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Online con pending → sincronizando.
  return (
    <div
      className={cn(
        'mb-4 p-3 rounded-card border-2 flex items-start gap-3',
        'border-accent/40 bg-accent/10 text-accent',
      )}
      role="status"
    >
      <Loader2 size={20} className="flex-shrink-0 mt-0.5 animate-spin" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">Sincronizando…</div>
        <div className="text-sm mt-1">
          {count} operación{count === 1 ? '' : 'es'} pendiente{count === 1 ? '' : 's'} de
          sincronizar. Mantenete con conexión hasta que termine.
        </div>
      </div>
    </div>
  );
}

/**
 * Variante compacta para botones de submit ("Cerrar acta") que avisa
 * que la acción va a quedar encolada si está offline.
 */
export function OfflineSubmitHint(): React.ReactElement | null {
  const { isOnline } = useOfflinePending();
  if (isOnline) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-700 font-serif italic">
      <CloudOff size={12} /> Sin conexión: se guarda localmente y se sincroniza al volver.
    </span>
  );
}

/**
 * Indicador "todo OK" sutil cuando recién terminó de sincronizar
 * (cuando el contador pasa de >0 a 0). Sprint 13 v2: animación 3s y
 * desaparecer. Por ahora simple.
 */
export function OfflineSyncDone(): React.ReactElement | null {
  const { count, isOnline } = useOfflinePending();
  if (!isOnline || count > 0) return null;
  // En v1 no renderizamos nada (sería ruidoso mostrar siempre "OK").
  // v2: detectar la transición count > 0 → count = 0 con un useEffect
  // y mostrar un toast efímero.
  return null;
}
