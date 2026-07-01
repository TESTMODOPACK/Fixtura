'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ActivarJugadorInfo,
  InvitarJugadorRequest,
  InvitarJugadorResponse,
  JugadorCuenta,
  JugadorGlobalDetalle,
  PartidoDelegado,
} from '@fixtura/types';

import { apiFetch } from '@/lib/api';

// ─── Portal del jugador (rol JUGADOR, auto-acotado al JWT) ───────────

/** Ficha + stats por torneo + sanciones vigentes del jugador logueado. */
export function useMiPerfil(enabled = true) {
  return useQuery({
    queryKey: ['jugador', 'mi-perfil'],
    enabled,
    queryFn: () => apiFetch<JugadorGlobalDetalle>('/jugador/mi-perfil'),
  });
}

/** Partidos del club del jugador (próximos + resultados). */
export function useMisPartidos() {
  return useQuery({
    queryKey: ['jugador', 'mis-partidos'],
    queryFn: () => apiFetch<PartidoDelegado[]>('/jugador/mis-partidos'),
  });
}

// ─── Gestión de la cuenta del jugador (lado admin) ──────────────────

export function useJugadorCuenta(jugadorId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'jugadores', jugadorId, 'cuenta'],
    enabled: !!jugadorId,
    queryFn: () =>
      apiFetch<JugadorCuenta>(`/admin/jugadores/${jugadorId}/cuenta`),
  });
}

export function useInvitarJugador(jugadorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvitarJugadorRequest) =>
      apiFetch<InvitarJugadorResponse>(`/admin/jugadores/${jugadorId}/invitar`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'jugadores', jugadorId, 'cuenta'] });
    },
  });
}

// ─── Activación pública (magic link, sin auth) ──────────────────────

export function useActivarJugadorInfo(token: string | null) {
  return useQuery({
    queryKey: ['jugador-activar', token],
    enabled: !!token,
    retry: false,
    queryFn: () =>
      apiFetch<ActivarJugadorInfo>(
        `/public/jugador/activar?token=${encodeURIComponent(token ?? '')}`,
        { skipAuth: true },
      ),
  });
}

export function useActivarJugador() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      apiFetch<{ ok: boolean }>('/public/jugador/activar', {
        method: 'POST',
        body: input,
        skipAuth: true,
      }),
  });
}
