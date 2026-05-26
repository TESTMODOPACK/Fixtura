import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateEquipoRequest,
  CreateJugadorRequest,
  CreateTemporadaRequest,
  CreateTorneoRequest,
  EquipoAdmin,
  FixtureGenerationResult,
  GenerarFixtureRequest,
  JugadorAdmin,
  Temporada,
  TorneoAdmin,
  UpdateTorneoRequest,
} from '@fixtura/types';

import { apiFetch } from '@/lib/api';

// ─── Temporadas ──────────────────────────────────────────────────────
export function useTemporadas() {
  return useQuery({
    queryKey: ['admin', 'temporadas'],
    queryFn: () => apiFetch<Temporada[]>('/admin/temporadas'),
  });
}

export function useCreateTemporada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemporadaRequest) =>
      apiFetch<Temporada>('/admin/temporadas', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'temporadas'] });
    },
  });
}

// ─── Torneos ─────────────────────────────────────────────────────────
export function useTorneos() {
  return useQuery({
    queryKey: ['admin', 'torneos'],
    queryFn: () => apiFetch<TorneoAdmin[]>('/admin/torneos'),
  });
}

export function useTorneo(id: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', id],
    queryFn: () => apiFetch<TorneoAdmin>(`/admin/torneos/${id}`),
    enabled: !!id,
  });
}

export function useCreateTorneo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTorneoRequest) =>
      apiFetch<TorneoAdmin>('/admin/torneos', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos'] });
    },
  });
}

export function useUpdateTorneo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTorneoRequest) =>
      apiFetch<TorneoAdmin>(`/admin/torneos/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', id] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

// ─── Equipos ─────────────────────────────────────────────────────────
export function useEquipos(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'equipos'],
    queryFn: () => apiFetch<EquipoAdmin[]>(`/admin/torneos/${torneoId}/equipos`),
    enabled: !!torneoId,
  });
}

export function useCreateEquipo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEquipoRequest) =>
      apiFetch<EquipoAdmin>(`/admin/torneos/${torneoId}/equipos`, { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'equipos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

// ─── Jugadores ───────────────────────────────────────────────────────
export function useJugadores(equipoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'equipos', equipoId, 'jugadores'],
    queryFn: () => apiFetch<JugadorAdmin[]>(`/admin/equipos/${equipoId}/jugadores`),
    enabled: !!equipoId,
  });
}

export function useCreateJugador(equipoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJugadorRequest) =>
      apiFetch<JugadorAdmin>(`/admin/equipos/${equipoId}/jugadores`, { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'equipos', equipoId, 'jugadores'] });
    },
  });
}

// ─── Fixture ─────────────────────────────────────────────────────────
export function useGenerarFixture(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerarFixtureRequest) =>
      apiFetch<FixtureGenerationResult>(`/admin/torneos/${torneoId}/fixture/generar`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

export function useResetFixture(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number }>(`/admin/torneos/${torneoId}/fixture`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}
