import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ActaResumen,
  AsignarDesignacionRequest,
  BulkCreateJugadoresRequest,
  CerrarActaRequest,
  DashboardAdmin,
  JugadorGlobal,
  CreateEquipoRequest,
  CreateIncidenciaRequest,
  CreateJugadorRequest,
  CreatePersonalRequest,
  CreateSancionTribunalRequest,
  CreateTemporadaRequest,
  CreateTorneoRequest,
  DesignacionAdmin,
  DesignacionesPorFecha,
  EquipoAdmin,
  EstadoDesignacion,
  FixtureAdminFull,
  FixtureGenerationResult,
  GenerarFixtureRequest,
  IncidenciaAdmin,
  JugadorAdmin,
  PartidoAdmin,
  PartidoDetalle,
  PersonalAdmin,
  SancionAdmin,
  Temporada,
  TorneoAdmin,
  UpdatePartidoRequest,
  UpdatePersonalRequest,
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

export function useBulkCreateJugadores(equipoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkCreateJugadoresRequest) =>
      apiFetch<JugadorAdmin[]>(`/admin/equipos/${equipoId}/jugadores/bulk`, {
        method: 'POST',
        body: input,
      }),
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

// ─── Personal ─────────────────────────────────────────────────────────
export function usePersonal(soloActivos = false) {
  return useQuery({
    queryKey: ['admin', 'personal', { soloActivos }],
    queryFn: () =>
      apiFetch<PersonalAdmin[]>(
        soloActivos ? '/admin/personal?activos=true' : '/admin/personal',
      ),
  });
}

export function usePersona(id: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'personal', id],
    queryFn: () => apiFetch<PersonalAdmin>(`/admin/personal/${id}`),
    enabled: !!id,
  });
}

export function useCreatePersonal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePersonalRequest) =>
      apiFetch<PersonalAdmin>('/admin/personal', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'personal'] });
    },
  });
}

export function useUpdatePersonal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePersonalRequest) =>
      apiFetch<PersonalAdmin>(`/admin/personal/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'personal'] });
    },
  });
}

export function useDeactivatePersonal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/personal/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'personal'] });
    },
  });
}

// ─── Designaciones ────────────────────────────────────────────────────
export function useDesignacionesPorFecha(
  torneoId: string | null | undefined,
  fechaId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'fechas', fechaId, 'designaciones'],
    queryFn: () =>
      apiFetch<DesignacionesPorFecha>(
        `/admin/torneos/${torneoId}/fechas/${fechaId}/designaciones`,
      ),
    enabled: !!torneoId && !!fechaId,
  });
}

export function useDesignacionesPorPartido(partidoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'partidos', partidoId, 'designaciones'],
    queryFn: () =>
      apiFetch<DesignacionAdmin[]>(`/admin/partidos/${partidoId}/designaciones`),
    enabled: !!partidoId,
  });
}

export function useAsignarDesignacion(invalidate: { torneoId?: string; fechaId?: string; partidoId?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AsignarDesignacionRequest) =>
      apiFetch<DesignacionAdmin>('/admin/designaciones', { method: 'POST', body: input }),
    onSuccess: () => {
      if (invalidate.torneoId && invalidate.fechaId) {
        qc.invalidateQueries({
          queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'designaciones'],
        });
      }
      if (invalidate.partidoId) {
        qc.invalidateQueries({ queryKey: ['admin', 'partidos', invalidate.partidoId, 'designaciones'] });
      }
    },
  });
}

export function useUpdateDesignacionEstado(invalidate: { torneoId?: string; fechaId?: string; partidoId?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoDesignacion }) =>
      apiFetch<DesignacionAdmin>(`/admin/designaciones/${id}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      if (invalidate.torneoId && invalidate.fechaId) {
        qc.invalidateQueries({
          queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'designaciones'],
        });
      }
      if (invalidate.partidoId) {
        qc.invalidateQueries({ queryKey: ['admin', 'partidos', invalidate.partidoId, 'designaciones'] });
      }
    },
  });
}

export function useRemoveDesignacion(invalidate: { torneoId?: string; fechaId?: string; partidoId?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/designaciones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (invalidate.torneoId && invalidate.fechaId) {
        qc.invalidateQueries({
          queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'designaciones'],
        });
      }
      if (invalidate.partidoId) {
        qc.invalidateQueries({ queryKey: ['admin', 'partidos', invalidate.partidoId, 'designaciones'] });
      }
    },
  });
}

// ─── Actas global (cross-torneo) ──────────────────────────────────────
export function useActasGlobal(filters: {
  torneoId?: string;
  fechaId?: string;
  estado?: string;
  filtro?: 'todas' | 'pendientes' | 'cerradas';
}) {
  const qs = new URLSearchParams();
  if (filters.torneoId) qs.set('torneoId', filters.torneoId);
  if (filters.fechaId) qs.set('fechaId', filters.fechaId);
  if (filters.estado) qs.set('estado', filters.estado);
  if (filters.filtro) qs.set('filtro', filters.filtro);
  const query = qs.toString();

  return useQuery({
    queryKey: ['admin', 'actas-global', filters],
    queryFn: () =>
      apiFetch<ActaResumen[]>(`/admin/actas${query ? `?${query}` : ''}`),
  });
}

// ─── Jugadores global (cross-torneo) ──────────────────────────────────
export function useJugadoresGlobal(filters: {
  search?: string;
  torneoId?: string;
  equipoId?: string;
  estado?: 'activos' | 'todos';
}) {
  const qs = new URLSearchParams();
  if (filters.search) qs.set('search', filters.search);
  if (filters.torneoId) qs.set('torneoId', filters.torneoId);
  if (filters.equipoId) qs.set('equipoId', filters.equipoId);
  if (filters.estado) qs.set('estado', filters.estado);
  const query = qs.toString();

  return useQuery({
    queryKey: ['admin', 'jugadores-global', filters],
    queryFn: () =>
      apiFetch<JugadorGlobal[]>(`/admin/jugadores${query ? `?${query}` : ''}`),
  });
}

// ─── Dashboard admin ──────────────────────────────────────────────────
export function useDashboardAdmin() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiFetch<DashboardAdmin>('/admin/dashboard'),
    // Refresh cada 60s para que los KPIs se actualicen sin recargar
    refetchInterval: 60_000,
  });
}
