import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CerrarActaRequest,
  CreateEquipoRequest,
  CreateIncidenciaRequest,
  CreateJugadorRequest,
  CreateSancionTribunalRequest,
  CreateTemporadaRequest,
  CreateTorneoRequest,
  EquipoAdmin,
  FixtureAdminFull,
  FixtureGenerationResult,
  GenerarFixtureRequest,
  IncidenciaAdmin,
  JugadorAdmin,
  PartidoAdmin,
  PartidoDetalle,
  SancionAdmin,
  Temporada,
  TorneoAdmin,
  UpdatePartidoRequest,
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

export function useFixtureDetail(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'],
    queryFn: () => apiFetch<FixtureAdminFull>(`/admin/torneos/${torneoId}/fixture-detail`),
    enabled: !!torneoId,
  });
}

// ─── Partidos ────────────────────────────────────────────────────────
export function usePartido(partidoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'partidos', partidoId],
    queryFn: () => apiFetch<PartidoDetalle>(`/admin/partidos/${partidoId}`),
    enabled: !!partidoId,
  });
}

export function useUpdatePartido(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePartidoRequest) =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

export function useAddIncidencia(partidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIncidenciaRequest) =>
      apiFetch<IncidenciaAdmin>(`/admin/partidos/${partidoId}/incidencias`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
    },
  });
}

export function useRemoveIncidencia(partidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (incidenciaId: string) =>
      apiFetch<void>(`/admin/partidos/incidencias/${incidenciaId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
    },
  });
}

export function useCerrarActa(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CerrarActaRequest) =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/cerrar-acta`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

export function useReabrirActa(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/reabrir-acta`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

// ─── Sanciones / Tribunal ────────────────────────────────────────────
export function useSanciones(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'sanciones'],
    queryFn: () => apiFetch<SancionAdmin[]>(`/admin/torneos/${torneoId}/sanciones`),
    enabled: !!torneoId,
  });
}

export function useJugadoresBloqueados(
  torneoId: string | null | undefined,
  fechaNumero: number | null | undefined,
) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'sanciones', 'bloqueados', fechaNumero],
    queryFn: () =>
      apiFetch<Array<{ jugadorInscritoId: string; rut: string | null; motivo: string }>>(
        `/admin/torneos/${torneoId}/sanciones/bloqueados?fechaNumero=${fechaNumero}`,
      ),
    enabled: !!torneoId && !!fechaNumero,
  });
}

export function useCreateSancionTribunal(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSancionTribunalRequest) =>
      apiFetch<SancionAdmin>(`/admin/torneos/${torneoId}/sanciones`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'sanciones'] });
    },
  });
}

export function useRevokeSancion(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/torneos/${torneoId}/sanciones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'sanciones'] });
    },
  });
}
