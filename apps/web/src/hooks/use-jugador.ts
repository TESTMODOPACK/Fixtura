'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ActivarJugadorInfo,
  CarnetJugador,
  InvitarJugadorRequest,
  InvitarJugadorResponse,
  InvitarPlantelMasivoResponse,
  JugadorCuenta,
  JugadorGlobalDetalle,
  PartidoDelegado,
  VerificacionCarnet,
  VerificarCarnetRequest,
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

// ─── Carnet digital con QR ───────────────────────────────────────────

/** Carnet del jugador logueado: token firmado + datos visibles. TTL 48h. */
export function useMiCarnet() {
  return useQuery({
    queryKey: ['jugador', 'carnet'],
    queryFn: () => apiFetch<CarnetJugador>('/jugador/carnet'),
    // El token dura 48h: con refrescarlo al montar la vista alcanza.
    staleTime: 1000 * 60 * 30,
  });
}

/** Verificación en cancha (personal/admin): por QR escaneado o RUT manual. */
export function useVerificarCarnet() {
  return useMutation({
    mutationFn: (input: VerificarCarnetRequest) =>
      apiFetch<VerificacionCarnet>('/personal/verificar-carnet', {
        method: 'POST',
        body: input,
      }),
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

/**
 * Invitación masiva al portal: todo el plantel activo del club (todas las
 * categorías), solo por email. Devuelve el resumen de enviados / saltados.
 */
export function useInvitarPlantelMasivo(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<InvitarPlantelMasivoResponse>(
        `/admin/jugadores/club/${clubId}/invitar-masivo`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'jugadores'] });
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
