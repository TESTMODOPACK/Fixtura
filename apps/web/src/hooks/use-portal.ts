import { useQuery } from '@tanstack/react-query';

import type { FixturePublico, Ranking, ResumenLiga, TablaPosiciones, Tenant } from '@fixtura/types';

import { apiFetch } from '@/lib/api';

/**
 * Hooks del portal público. El tenant se identifica por el hostname del
 * request (en backend) — los endpoints NO reciben ligaSlug en la URL.
 */

export function useTenantActual() {
  return useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => apiFetch<Tenant | null>('/tenants/me', { skipAuth: true }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useResumenLiga() {
  return useQuery({
    queryKey: ['public', 'resumen'],
    queryFn: () => apiFetch<ResumenLiga>('/public', { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useTabla() {
  return useQuery({
    queryKey: ['public', 'tabla'],
    queryFn: () => apiFetch<TablaPosiciones>('/public/tabla', { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useFixture() {
  return useQuery({
    queryKey: ['public', 'fixture'],
    queryFn: () => apiFetch<FixturePublico>('/public/fixture', { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useRanking(tipo: 'goleadores' | 'asistencias' | 'mvp') {
  return useQuery({
    queryKey: ['public', 'ranking', tipo],
    queryFn: () => apiFetch<Ranking>(`/public/${tipo}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}
