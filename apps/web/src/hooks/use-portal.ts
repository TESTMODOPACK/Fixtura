import { useQuery } from '@tanstack/react-query';

import type { FixturePublico, Ranking, ResumenLiga, TablaPosiciones } from '@fixtura/types';

import { apiFetch } from '@/lib/api';

export function useResumenLiga(ligaSlug: string) {
  return useQuery({
    queryKey: ['public', ligaSlug, 'resumen'],
    queryFn: () => apiFetch<ResumenLiga>(`/public/${ligaSlug}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useTabla(ligaSlug: string) {
  return useQuery({
    queryKey: ['public', ligaSlug, 'tabla'],
    queryFn: () => apiFetch<TablaPosiciones>(`/public/${ligaSlug}/tabla`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useFixture(ligaSlug: string) {
  return useQuery({
    queryKey: ['public', ligaSlug, 'fixture'],
    queryFn: () => apiFetch<FixturePublico>(`/public/${ligaSlug}/fixture`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}

export function useRanking(ligaSlug: string, tipo: 'goleadores' | 'asistencias' | 'mvp') {
  return useQuery({
    queryKey: ['public', ligaSlug, 'ranking', tipo],
    queryFn: () => apiFetch<Ranking>(`/public/${ligaSlug}/${tipo}`, { skipAuth: true }),
    staleTime: 60 * 1000,
  });
}
