'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ActivarDelegadoInfo,
  DelegadoCuenta,
  EstadisticasDelegado,
  FinanzasDelegado,
  IniciarPagoResponse,
  InvitarDelegadoRequest,
  InvitarDelegadoResponse,
  MiClubDelegado,
  PartidoDelegado,
  PlantelCategoriaDelegado,
  ResumenDelegado,
  SancionVigente,
} from '@fixtura/types';

import { apiFetch } from '@/lib/api';
import { redirectToPasarela } from '@/lib/pasarela';
import { toastError } from '@/lib/toast';

// ─── Portal del delegado (rol DELEGADO_EQUIPO) ──────────────────────

export function useDelegadoResumen() {
  return useQuery({
    queryKey: ['delegado', 'resumen'],
    queryFn: () => apiFetch<ResumenDelegado>('/delegado/resumen'),
  });
}

export function useMiClub(enabled = true) {
  return useQuery({
    queryKey: ['delegado', 'mi-club'],
    enabled,
    queryFn: () => apiFetch<MiClubDelegado>('/delegado/mi-club'),
  });
}

export function useDelegadoPlantel() {
  return useQuery({
    queryKey: ['delegado', 'plantel'],
    queryFn: () => apiFetch<PlantelCategoriaDelegado[]>('/delegado/plantel'),
  });
}

export function useDelegadoPartidos() {
  return useQuery({
    queryKey: ['delegado', 'partidos'],
    queryFn: () => apiFetch<PartidoDelegado[]>('/delegado/partidos'),
  });
}

export function useDelegadoSancionados() {
  return useQuery({
    queryKey: ['delegado', 'disciplina', 'sancionados'],
    queryFn: () =>
      apiFetch<SancionVigente[]>('/delegado/disciplina/sancionados'),
  });
}

export function useDelegadoEstadisticas() {
  return useQuery({
    queryKey: ['delegado', 'estadisticas'],
    queryFn: () => apiFetch<EstadisticasDelegado>('/delegado/estadisticas'),
  });
}

export function useDelegadoFinanzas() {
  return useQuery({
    queryKey: ['delegado', 'finanzas'],
    queryFn: () => apiFetch<FinanzasDelegado>('/delegado/finanzas'),
  });
}

/** Inicia el pago de un cobro propio y redirige a la pasarela. */
export function usePagarCobroDelegado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cobroId: string) =>
      apiFetch<IniciarPagoResponse>(`/delegado/cobros/${cobroId}/pagar`, {
        method: 'POST',
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['delegado', 'finanzas'] });
      if (res.urlRedireccion) {
        try {
          redirectToPasarela(res.urlRedireccion);
        } catch (e) {
          toastError(e);
        }
      }
    },
  });
}

// ─── Admin: gestión de la cuenta del delegado del club ──────────────

export function useDelegadoCuenta(clubId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'clubes', clubId, 'delegado'],
    enabled: !!clubId,
    queryFn: () => apiFetch<DelegadoCuenta>(`/admin/clubes/${clubId}/delegado`),
  });
}

export function useInvitarDelegado(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvitarDelegadoRequest) =>
      apiFetch<InvitarDelegadoResponse>(`/admin/clubes/${clubId}/delegado/invitar`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes', clubId, 'delegado'] });
    },
  });
}

// ─── Activación pública (sin auth) ──────────────────────────────────

export function useActivarInfo(token: string | null) {
  return useQuery({
    queryKey: ['delegado-activar', token],
    enabled: !!token,
    retry: false,
    queryFn: () =>
      apiFetch<ActivarDelegadoInfo>(
        `/public/delegado/activar?token=${encodeURIComponent(token ?? '')}`,
        { skipAuth: true },
      ),
  });
}

export function useActivarDelegado() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      apiFetch<{ ok: boolean }>('/public/delegado/activar', {
        method: 'POST',
        body: input,
        skipAuth: true,
      }),
  });
}
