import { useQuery } from '@tanstack/react-query';

import type {
  FixturePublico,
  Ranking,
  ResumenLiga,
  TablaPosiciones,
  Tenant,
  TorneoListaPublico,
} from '@fixtura/types';

import { apiFetch } from '@/lib/api';

/**
 * Hooks del portal público. El tenant se identifica por el hostname del
 * request (en backend) — los endpoints NO reciben ligaSlug en la URL.
 *
 * Sprint 36 — todos los hooks aceptan opcionalmente `torneoSlug` para
 * pedir un torneo específico. Si no se pasa, el backend elige el activo
 * más reciente (back-compat con el comportamiento anterior).
 */

function qs(torneoSlug?: string): string {
  return torneoSlug ? `?torneo=${encodeURIComponent(torneoSlug)}` : '';
}

export function useTenantActual() {
  return useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => apiFetch<Tenant | null>('/tenants/me', { skipAuth: true }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useResumenLiga(torneoSlug?: string) {
  return useQuery({
    queryKey: ['public', 'resumen', torneoSlug ?? null],
    queryFn: () =>
      apiFetch<ResumenLiga>(`/public${qs(torneoSlug)}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

/** Sprint 36A — lista de torneos del tenant para el hub público. */
export function usePublicTorneos() {
  return useQuery({
    queryKey: ['public', 'torneos'],
    queryFn: () =>
      apiFetch<TorneoListaPublico[]>('/public/torneos', { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useTabla(torneoSlug?: string) {
  return useQuery({
    queryKey: ['public', 'tabla', torneoSlug ?? null],
    queryFn: () =>
      apiFetch<TablaPosiciones>(`/public/tabla${qs(torneoSlug)}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useFixture(torneoSlug?: string) {
  return useQuery({
    queryKey: ['public', 'fixture', torneoSlug ?? null],
    queryFn: () =>
      apiFetch<FixturePublico>(`/public/fixture${qs(torneoSlug)}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useRanking(
  tipo: 'goleadores' | 'asistencias' | 'mvp',
  torneoSlug?: string,
) {
  return useQuery({
    queryKey: ['public', 'ranking', tipo, torneoSlug ?? null],
    queryFn: () =>
      apiFetch<Ranking>(`/public/${tipo}${qs(torneoSlug)}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}
