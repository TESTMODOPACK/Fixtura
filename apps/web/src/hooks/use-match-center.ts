'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

import type { MatchCenterSnapshot } from '@fixtura/types';

import { apiFetch } from '@/lib/api';

/**
 * Sprint 18 — RF-17. Hook reactivo del Match Center.
 *
 * Estrategia:
 *   1. Snapshot inicial via HTTP (rápido, SSR-friendly).
 *   2. Conexión websocket al namespace /match-center.
 *   3. Subscribe a `partido:<id>` — el server emite snapshot cada 1s.
 *   4. Si la conexión cae, hace polling HTTP cada 5s como fallback.
 *
 * Devuelve el snapshot actualizado en tiempo real. Lectura — las
 * mutaciones (arrancar/sumar gol) las hace el panel cronista via
 * mutations REST autenticadas separadas.
 */
export function useMatchCenter(partidoId: string): {
  snapshot: MatchCenterSnapshot | null;
  conectado: boolean;
  error: string | null;
} {
  const [snapshot, setSnapshot] = useState<MatchCenterSnapshot | null>(null);
  const [conectado, setConectado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partidoId) return;

    // Snapshot inicial HTTP — no espera al WS.
    let cancelado = false;
    // Marca de cuándo llegó el último snapshot (WS o HTTP). Si el WS conecta
    // pero deja de emitir (proxy que corta el upgrade), polleamos igual.
    let ultimoSnapshot = Date.now();
    apiFetch<MatchCenterSnapshot>(`/public/match-center/${partidoId}`)
      .then((s) => {
        if (!cancelado) {
          setSnapshot(s);
          ultimoSnapshot = Date.now();
        }
      })
      .catch((err) => {
        if (!cancelado) setError(`Snapshot inicial: ${(err as Error).message}`);
      });

    // WebSocket — base URL del API quitando el /api final.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';
    const baseUrl = apiUrl.replace(/\/api\/?$/, '') || window.location.origin;

    const socket: Socket = io(`${baseUrl}/match-center`, {
      // polling PRIMERO y luego upgrade a websocket. Si el proxy que termina el
      // dominio no reenvía el upgrade WS, la conexión igual se establece por
      // long-polling (que también entrega los snapshots del gateway cada 1s) en
      // vez de tirar "websocket error". Con upgrade disponible, sube a WS solo.
      transports: ['polling', 'websocket'],
      // forceNew: cada montaje de la página crea su propio manager. Sin esto
      // socket.io reusa el manager cacheado por URL; al volver del detalle
      // (unmount→disconnect→remount) reusaría un manager ya desconectado y
      // emitiría connect_error. Es la causa del error "al volver del detalle".
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => {
      setConectado(true);
      setError(null);
      socket.emit('subscribe', { partidoId });
    });

    socket.on('snapshot', (snap: MatchCenterSnapshot) => {
      if (snap.partidoId === partidoId) {
        setSnapshot(snap);
        ultimoSnapshot = Date.now();
        setError(null);
      }
    });

    socket.on('error', (err: { message: string }) => {
      setError(err.message);
    });

    socket.on('disconnect', () => {
      setConectado(false);
    });

    // El error de conexión del WS NO es fatal: el polling HTTP de abajo cubre
    // la actualización. No mostramos un banner de error rojo cuando el
    // marcador igual llega por polling (el badge "Polling" ya comunica el
    // estado). Solo marcamos desconectado.
    socket.on('connect_error', () => {
      setConectado(false);
    });

    // Fallback HTTP — refrescamos cada 5s si el WS no está conectado, o si
    // está "conectado" pero hace > 6s que no emite un snapshot (proxy que
    // corta el upgrade y deja el socket colgado). Así el cronómetro y el
    // marcador resincronizan sí o sí.
    const interval = setInterval(() => {
      const snapshotViejo = Date.now() - ultimoSnapshot > 6000;
      if (socket.connected && !snapshotViejo) return;
      apiFetch<MatchCenterSnapshot>(`/public/match-center/${partidoId}`)
        .then((s) => {
          if (!cancelado) {
            setSnapshot(s);
            ultimoSnapshot = Date.now();
          }
        })
        .catch(() => {
          // silencioso en polling — el error principal ya está visible
        });
    }, 5000);

    return () => {
      cancelado = true;
      clearInterval(interval);
      socket.emit('unsubscribe', { partidoId });
      socket.disconnect();
    };
  }, [partidoId]);

  return { snapshot, conectado, error };
}

/**
 * Cronómetro que CORRE en el cliente, sembrado desde el snapshot del
 * servidor y resincronizado cada vez que llega uno nuevo.
 *
 * Por qué: mostrar `snapshot.segundosTranscurridos` directo deja el reloj
 * "congelado" entre snapshots (el WS puede venir irregular detrás de un
 * proxy). Aquí, mientras el partido está EN_VIVO, avanzamos un segundo por
 * segundo localmente; cuando llega un snapshot nuevo (tick o broadcast por
 * una acción como +GOL) reajustamos la base. Así el tiempo avanza fluido y
 * cambiar el marcador NO altera el cronómetro.
 */
export function useSegundosCronometro(
  snapshot: MatchCenterSnapshot | null,
): number {
  const base = useRef<{ segundos: number; desde: number; enVivo: boolean }>({
    segundos: 0,
    desde: Date.now(),
    enVivo: false,
  });
  const [, forzarRender] = useState(0);

  const segundosServidor = snapshot?.segundosTranscurridos ?? 0;
  const estado = snapshot?.estado;

  // Resincronizar la base con cada snapshot (cambia segundos o estado).
  useEffect(() => {
    base.current = {
      segundos: segundosServidor,
      desde: Date.now(),
      enVivo: estado === 'EN_VIVO',
    };
    forzarRender((n) => n + 1);
  }, [segundosServidor, estado]);

  // Tick local cada segundo mientras está EN_VIVO (avanza aunque el WS
  // no emita). Si no está en vivo, no corre y el valor queda fijo.
  useEffect(() => {
    if (estado !== 'EN_VIVO') return;
    const id = setInterval(() => forzarRender((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // Objetivo del período (duración + agregado). Capamos el reloj acá también
  // para que entre snapshots no muestre más que el límite (el server además
  // auto-pausa al llegar).
  const objetivo =
    snapshot != null
      ? (snapshot.minutosPorPeriodo + snapshot.minutosAgregados) * 60
      : Number.POSITIVE_INFINITY;
  const b = base.current;
  if (!b.enVivo) return Math.min(objetivo, b.segundos);
  return Math.min(
    objetivo,
    b.segundos + Math.max(0, Math.floor((Date.now() - b.desde) / 1000)),
  );
}

/**
 * Mutaciones REST del Match Center para uso del cronista.
 * Cada acción golpea su endpoint correspondiente; el broadcast WS se
 * dispara desde el backend → la UI se refresca via el hook anterior.
 */
export function useArrancarCentro(partidoId: string) {
  return useMutation({
    mutationFn: (input: { minutosPorPeriodo?: number; forzarDia?: boolean }) =>
      apiFetch<MatchCenterSnapshot>(`/admin/match-center/${partidoId}/arrancar`, {
        method: 'POST',
        body: input,
      }),
  });
}

export function usePausarCentro(partidoId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<MatchCenterSnapshot>(`/admin/match-center/${partidoId}/pausar`, {
        method: 'POST',
      }),
  });
}

export function useReanudarCentro(partidoId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<MatchCenterSnapshot>(`/admin/match-center/${partidoId}/reanudar`, {
        method: 'POST',
      }),
  });
}

export function useSumarGolCentro(partidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipo: 'LOCAL' | 'VISITA') =>
      apiFetch<MatchCenterSnapshot>(`/admin/match-center/${partidoId}/sumar-gol`, {
        method: 'POST',
        // MOV-1 — clientKey estable por invocación. useMutation no reintenta
        // solo, así que se genera una vez; si el request se reenvía (refresh
        // de token) reusa el mismo body y el backend no duplica el gol.
        body: { equipo, clientKey: crypto.randomUUID() },
      }),
    // F46.6 — +GOL crea una incidencia (marcador derivado); refrescar la
    // lista de incidencias del partido.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
    },
  });
}

export function useQuitarGolCentro(partidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipo: 'LOCAL' | 'VISITA') =>
      apiFetch<MatchCenterSnapshot>(`/admin/match-center/${partidoId}/quitar-gol`, {
        method: 'POST',
        body: { equipo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
    },
  });
}

export function useAjustarGolesCentro(partidoId: string) {
  return useMutation({
    mutationFn: (input: { golesLocal: number; golesVisita: number }) =>
      apiFetch<MatchCenterSnapshot>(
        `/admin/match-center/${partidoId}/ajustar-goles`,
        { method: 'POST', body: input },
      ),
  });
}

export function useSiguientePeriodoCentro(partidoId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<MatchCenterSnapshot>(
        `/admin/match-center/${partidoId}/siguiente-periodo`,
        { method: 'POST' },
      ),
  });
}

export function useFinalizarCentro(partidoId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<MatchCenterSnapshot>(
        `/admin/match-center/${partidoId}/finalizar`,
        { method: 'POST' },
      ),
  });
}

export function useAjustarTiempoAgregado(partidoId: string) {
  return useMutation({
    // minutos = total de agregado del período actual (no delta).
    mutationFn: (minutos: number) =>
      apiFetch<MatchCenterSnapshot>(
        `/admin/match-center/${partidoId}/tiempo-agregado`,
        { method: 'POST', body: { minutos } },
      ),
  });
}
