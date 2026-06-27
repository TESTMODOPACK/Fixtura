import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ActaResumen,
  AnalyticsAdmin,
  AsignarDesignacionRequest,
  BulkCreateJugadoresRequest,
  CerrarActaRequest,
  CreateSponsorRequest,
  DashboardAdmin,
  InvitarMiembroRequest,
  JugadorGlobal,
  MiembroAdmin,
  SponsorAdmin,
  TenantSettings,
  UpdateSponsorRequest,
  UpdateTenantSettingsRequest,
  CreateEquipoRequest,
  AjustarSancionRequest,
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
  TablaPosicionesAdmin,
  TablasPorGrupoAdmin,
  GruposTorneoResponse,
  MoverInscripcionGrupoRequest,
  BracketPlayoffResponse,
  DefinirGanadorLlaveRequest,
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

export function useTablaAdmin(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'tabla'],
    queryFn: () =>
      apiFetch<TablaPosicionesAdmin>(`/admin/torneos/${torneoId}/tabla`),
    enabled: !!torneoId,
  });
}

// ─── Fase de grupos (G6) ─────────────────────────────────────────────
export function useGruposTorneo(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'grupos'],
    queryFn: () =>
      apiFetch<GruposTorneoResponse>(`/admin/torneos/${torneoId}/grupos`),
    enabled: !!torneoId,
  });
}

export function useTablasPorGrupo(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'grupos', 'tabla'],
    queryFn: () =>
      apiFetch<TablasPorGrupoAdmin>(`/admin/torneos/${torneoId}/grupos/tabla`),
    enabled: !!torneoId,
  });
}

export function useSortearGrupos(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GruposTorneoResponse>(`/admin/torneos/${torneoId}/grupos/sortear`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'grupos'] });
    },
  });
}

export function useMoverInscripcionGrupo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MoverInscripcionGrupoRequest) =>
      apiFetch<GruposTorneoResponse>(`/admin/torneos/${torneoId}/grupos/mover`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'grupos'] });
    },
  });
}

export function useLimpiarGrupos(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GruposTorneoResponse>(`/admin/torneos/${torneoId}/grupos`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'grupos'] });
    },
  });
}

// ─── Fase de playoffs / bracket (P5) ─────────────────────────────────
export function useBracketPlayoffs(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'playoffs'],
    queryFn: () =>
      apiFetch<BracketPlayoffResponse>(`/admin/torneos/${torneoId}/playoffs`),
    enabled: !!torneoId,
  });
}

export function useSortearPlayoffs(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<BracketPlayoffResponse>(`/admin/torneos/${torneoId}/playoffs/sortear`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

export function useLimpiarPlayoffs(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<BracketPlayoffResponse>(`/admin/torneos/${torneoId}/playoffs`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

export function useSincronizarPlayoffs(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<BracketPlayoffResponse>(
        `/admin/torneos/${torneoId}/playoffs/sincronizar`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      // Crea/avanza partidos → refrescar también fixture y tabla.
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

export function useDefinirGanadorLlave(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { llaveId: string } & DefinirGanadorLlaveRequest) =>
      apiFetch<BracketPlayoffResponse>(
        `/admin/torneos/${torneoId}/playoffs/llaves/${input.llaveId}/ganador`,
        { method: 'POST', body: { ganadorInscripcionId: input.ganadorInscripcionId } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
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

/**
 * Sprint 31 — eliminar torneo. Solo permitido en estado DRAFT (backend
 * lo valida con BadRequestException si está ACTIVO/CERRADO).
 */
export function useDeleteTorneo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/torneos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos'] });
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

/**
 * Re-sincroniza los planteles del torneo desde los clubes (cuando se
 * cargaron jugadores al club después de inscribirlo y el torneo muestra 0).
 */
export function useResyncPlanteles(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ inscripcionesProcesadas: number; jugadoresSincronizados: number }>(
        `/admin/torneos/${torneoId}/inscripciones/resync-planteles`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'equipos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'equipos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'partidos'] });
    },
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

export function useDeleteEquipo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipoId: string) =>
      apiFetch<void>(`/admin/equipos/${equipoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'equipos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

/**
 * Sprint 44 — Suspender un equipo del torneo. El backend dispara walkover
 * 3-0 en partidos PROGRAMADO/EN_CURSO. Devuelve resumen.
 */
export function useSuspenderEquipo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      equipoId,
      motivo,
      observaciones,
      aplicarMultaWalkover,
    }: {
      equipoId: string;
      motivo: 'DEPORTIVA' | 'ECONOMICA' | 'OTRA';
      observaciones?: string | null;
      aplicarMultaWalkover?: boolean;
    }) =>
      apiFetch<{ equipoId: string; partidosWalkover: number; partidosCancelados: number }>(
        `/admin/equipos/${equipoId}/suspender`,
        {
          method: 'POST',
          body: {
            motivo,
            observaciones: observaciones ?? null,
            aplicarMultaWalkover: aplicarMultaWalkover === true,
          },
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'equipos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture'] });
      // Multas walkover impactan en finanzas si el operador activó el flag.
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

/**
 * Sprint 44 — Reactivar un equipo suspendido (vuelve a INSCRITO).
 */
export function useReactivarEquipo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipoId: string) =>
      apiFetch(`/admin/equipos/${equipoId}/reactivar`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'equipos'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
      // Sprint 44 fix I4 — la UI del fixture muestra el equipo. Si volvió
      // a INSCRITO necesitamos refrescarlo (los walkovers ya disparados
      // siguen como historia, eso no cambia).
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture'] });
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
      // Sprint 25: agregar un jugador puede cambiar el estado de validez
      // del plantel (suma a validos, en excepción o bloqueados).
      qc.invalidateQueries({
        queryKey: ['admin', 'equipos', equipoId, 'validar-plantel'],
      });
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
      qc.invalidateQueries({
        queryKey: ['admin', 'equipos', equipoId, 'validar-plantel'],
      });
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
        // Si estamos en cancha sin señal, encolar en IndexedDB y resolver
        // optimista. El banner offline + auto-flush hacen el resto.
        enqueueIfOffline: { kind: 'incidencia', partidoId },
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

export function useAtribuirIncidencia(partidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidenciaId,
      jugadorInscritoId,
    }: {
      incidenciaId: string;
      jugadorInscritoId: string;
    }) =>
      apiFetch<IncidenciaAdmin>(
        `/admin/partidos/${partidoId}/incidencias/${incidenciaId}/jugador`,
        { method: 'PATCH', body: { jugadorInscritoId } },
      ),
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
        // Si se cierra el acta sin señal, encolar. La operación es
        // idempotente: si llegan 2 cierres, el segundo da 409 y la
        // queue lo absorbe.
        enqueueIfOffline: { kind: 'cerrar-acta', partidoId },
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

// ─── F46.4 — Roster del acta + certificación de presentes ─────────────
import type { ActaRoster, CertificarPresentesRequest } from '@fixtura/types';

export function useRosterActa(partidoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'partidos', partidoId, 'roster'],
    queryFn: () => apiFetch<ActaRoster>(`/admin/partidos/${partidoId}/roster`),
    enabled: !!partidoId,
  });
}

export function useCertificarPresentes(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CertificarPresentesRequest) =>
      apiFetch<ActaRoster>(`/admin/partidos/${partidoId}/certificar-presentes`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId, 'roster'] });
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
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

export function useAjustarSancion(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AjustarSancionRequest }) =>
      apiFetch<SancionAdmin>(`/admin/torneos/${torneoId}/sanciones/${id}`, {
        method: 'PATCH',
        body: input,
      }),
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

export function useInvitarPersonal() {
  return useMutation({
    mutationFn: ({
      id,
      canal,
    }: {
      id: string;
      canal?: 'EMAIL' | 'WHATSAPP' | 'AMBOS';
    }) =>
      apiFetch<import('@fixtura/types').InvitarPersonalResponse>(
        `/admin/personal/${id}/invitar`,
        { method: 'POST', body: { canal: canal ?? 'EMAIL' } },
      ),
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

// ─── Ausencias del personal (F48) ─────────────────────────────────────
import type { AusenciaPersonal, CrearAusenciaRequest } from '@fixtura/types';

export function useAusencias(personalId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'personal', personalId, 'ausencias'],
    queryFn: () =>
      apiFetch<AusenciaPersonal[]>(`/admin/personal/${personalId}/ausencias`),
    enabled: !!personalId,
  });
}

export function useCrearAusencia(personalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearAusenciaRequest) =>
      apiFetch<AusenciaPersonal>(`/admin/personal/${personalId}/ausencias`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'personal', personalId, 'ausencias'] });
    },
  });
}

export function useEliminarAusencia(personalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ausenciaId: string) =>
      apiFetch<void>(`/admin/personal/${personalId}/ausencias/${ausenciaId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'personal', personalId, 'ausencias'] });
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
  filtro?: 'todas' | 'pendientes' | 'cerradas' | 'vencidas';
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

// ─── Jugadores global (cross-club) ────────────────────────────────────
// Sprint 28' (ADR-0004) — Refactor al modelo Clubes. Filtros ahora son
// clubId/categoriaId (en vez de torneoId/equipoId del modelo viejo).
export function useJugadoresGlobal(filters: {
  search?: string;
  clubId?: string;
  categoriaId?: string;
  estado?: 'activos' | 'todos' | 'vetados';
}) {
  const qs = new URLSearchParams();
  if (filters.search) qs.set('search', filters.search);
  if (filters.clubId) qs.set('clubId', filters.clubId);
  if (filters.categoriaId) qs.set('categoriaId', filters.categoriaId);
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

// ─── Analytics admin (módulo M5) ──────────────────────────────────────
export function useAnalytics() {
  return useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => apiFetch<AnalyticsAdmin>('/admin/analytics'),
  });
}

// ─── NPS (encuestas de satisfacción, módulo M5 etapa 2) ───────────────
import type { DispararNpsResultado, NpsResumenAdmin } from '@fixtura/types';

export function useNpsResumen() {
  return useQuery({
    queryKey: ['admin', 'nps', 'resumen'],
    queryFn: () => apiFetch<NpsResumenAdmin>('/admin/nps/resumen'),
  });
}

export function useDispararNps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (torneoId: string) =>
      apiFetch<DispararNpsResultado>('/admin/nps/disparar', {
        method: 'POST',
        body: { torneoId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'nps', 'resumen'] });
    },
  });
}

// ─── Ajustes del tenant (settings + miembros) ─────────────────────────
export function useTenantSettings() {
  return useQuery({
    queryKey: ['admin', 'ajustes'],
    queryFn: () => apiFetch<TenantSettings>('/admin/ajustes'),
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantSettingsRequest) =>
      apiFetch<TenantSettings>('/admin/ajustes', { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'ajustes'] });
      qc.invalidateQueries({ queryKey: ['public'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

export function useMiembros() {
  return useQuery({
    queryKey: ['admin', 'ajustes', 'miembros'],
    queryFn: () => apiFetch<MiembroAdmin[]>('/admin/ajustes/miembros'),
  });
}

export function useInvitarMiembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvitarMiembroRequest) =>
      apiFetch<MiembroAdmin>('/admin/ajustes/miembros', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'ajustes', 'miembros'] });
    },
  });
}

export function useRemoveMiembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userRoleId: string) =>
      apiFetch<void>(`/admin/ajustes/miembros/${userRoleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'ajustes', 'miembros'] });
    },
  });
}

// ─── Auto-asignación de designaciones ─────────────────────────────────
import type { AutoAsignarRequest, AutoAsignarResult, CoberturaFecha } from '@fixtura/types';

/**
 * F48 — Análisis de cobertura de la fecha (dry-run). La queryKey comparte
 * el prefijo de designaciones para que asignar/quitar/auto-asignar (que ya
 * invalidan ese prefijo) refresquen también el panel de cobertura.
 */
export function useCobertura(
  torneoId: string | null | undefined,
  fechaId: string | null | undefined,
  roles?: string[],
) {
  const rolesParam = roles && roles.length > 0 ? roles.join(',') : '';
  const qs = rolesParam ? `?roles=${encodeURIComponent(rolesParam)}` : '';
  return useQuery({
    queryKey: [
      'admin',
      'torneos',
      torneoId,
      'fechas',
      fechaId,
      'designaciones',
      'cobertura',
      rolesParam,
    ],
    queryFn: () =>
      apiFetch<CoberturaFecha>(
        `/admin/torneos/${torneoId}/fechas/${fechaId}/designaciones/cobertura${qs}`,
      ),
    enabled: !!torneoId && !!fechaId,
  });
}

export function useAutoAsignarDesignaciones(invalidate: { torneoId: string; fechaId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutoAsignarRequest) =>
      apiFetch<AutoAsignarResult>(
        `/admin/torneos/${invalidate.torneoId}/fechas/${invalidate.fechaId}/designaciones/auto`,
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'designaciones'],
      });
      // El auto-asignar también cubre el recinto (paramédicos + otros).
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'recinto'],
      });
    },
  });
}

// ─── Sponsors (admin) ────────────────────────────────────────────────
export function useSponsors(posicion?: string) {
  const qs = posicion ? `?posicion=${posicion}` : '';
  return useQuery({
    queryKey: ['admin', 'sponsors', { posicion: posicion ?? null }],
    queryFn: () => apiFetch<SponsorAdmin[]>(`/admin/sponsors${qs}`),
  });
}

export function useCreateSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSponsorRequest) =>
      apiFetch<SponsorAdmin>('/admin/sponsors', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'sponsors'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

export function useUpdateSponsor(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSponsorRequest) =>
      apiFetch<SponsorAdmin>(`/admin/sponsors/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'sponsors'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

export function useDeleteSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/sponsors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'sponsors'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

// ─── Designaciones de RECINTO (paramédicos por jornada) ──────────────
import type {
  AsignarRecintoRequest,
  DesignacionRecinto as DesignacionRecintoType,
} from '@fixtura/types';

export function useDesignacionesRecinto(
  torneoId: string | null | undefined,
  fechaId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'fechas', fechaId, 'recinto'],
    queryFn: () =>
      apiFetch<DesignacionRecintoType[]>(
        `/admin/torneos/${torneoId}/fechas/${fechaId}/recinto`,
      ),
    enabled: !!torneoId && !!fechaId,
  });
}

export function useAsignarRecinto(invalidate: { torneoId: string; fechaId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AsignarRecintoRequest) =>
      apiFetch<DesignacionRecintoType>('/admin/designaciones-recinto', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'recinto'],
      });
    },
  });
}

export function useRemoveRecinto(invalidate: { torneoId: string; fechaId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/designaciones-recinto/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', invalidate.torneoId, 'fechas', invalidate.fechaId, 'recinto'],
      });
    },
  });
}

// ─── Canchas ─────────────────────────────────────────────────────────
import type {
  CanchaAdmin,
  CreateCanchaRequest,
  UpdateCanchaRequest,
} from '@fixtura/types';

export function useCanchas(soloActivas = false) {
  return useQuery({
    queryKey: ['admin', 'canchas', { soloActivas }],
    queryFn: () =>
      apiFetch<CanchaAdmin[]>(
        soloActivas ? '/admin/canchas?activas=true' : '/admin/canchas',
      ),
  });
}

export function useCreateCancha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCanchaRequest) =>
      apiFetch<CanchaAdmin>('/admin/canchas', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'canchas'] });
    },
  });
}

export function useUpdateCancha(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCanchaRequest) =>
      apiFetch<CanchaAdmin>(`/admin/canchas/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'canchas'] });
    },
  });
}

export function useDeactivateCancha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/canchas/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'canchas'] });
    },
  });
}

// Sprint 40 — Cambiar estado DISPONIBLE / NO_DISPONIBLE con motivo opcional.
export function useCambiarEstadoCancha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      estado,
      motivo,
    }: {
      id: string;
      estado: 'DISPONIBLE' | 'NO_DISPONIBLE';
      motivo?: string | null;
    }) =>
      apiFetch<CanchaAdmin>(`/admin/canchas/${id}/estado`, {
        method: 'PATCH',
        body: { estado, motivo: motivo ?? null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'canchas'] });
    },
  });
}

// ─── Dunning (cobranza automática) ──────────────────────────────────
export function useDunningRecalcular() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ actualizados: number }>('/admin/dunning/recalcular', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

export function useDunningEnviarAvisos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ enviados: number; saltados: number }>('/admin/dunning/enviar-avisos', {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

export function useDunningAvisarUno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cobroId: string) =>
      apiFetch<{ enviado: boolean; razon?: string }>(
        `/admin/dunning/cobros/${cobroId}/avisar`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

// ─── Documentos tributarios (SII) ───────────────────────────────────
import type { DocumentoTributarioAdmin } from '@fixtura/types';

export function useDocumentosTributarios(estado?: string) {
  const qs = estado ? `?estado=${estado}` : '';
  return useQuery({
    queryKey: ['admin', 'documentos-tributarios', { estado: estado ?? null }],
    queryFn: () =>
      apiFetch<DocumentoTributarioAdmin[]>(`/admin/documentos-tributarios${qs}`),
    // Refresh cada 30s para mostrar cambios de estado cuando el cron emite
    refetchInterval: 30_000,
  });
}

export function useReintentarBoleta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DocumentoTributarioAdmin>(
        `/admin/documentos-tributarios/${id}/reintentar`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'documentos-tributarios'] });
    },
  });
}

// ─── Pagos online (Webpay) ──────────────────────────────────────────
import type { IniciarPagoResponse } from '@fixtura/types';

export function useIniciarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cobroId, urlRetornoBase }: { cobroId: string; urlRetornoBase?: string }) =>
      apiFetch<IniciarPagoResponse>('/admin/pagos/iniciar', {
        method: 'POST',
        body: { cobroId, urlRetornoBase },
      }),
    onSuccess: () => {
      // El cobro va a cambiar de estado cuando llegue la confirmación.
      // Invalidamos para que el listado se refresque al volver.
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

// ─── Ocupación de canchas ───────────────────────────────────────────
import type { OcupacionCancha } from '@fixtura/types';

export function useCanchasOcupacion(desde?: string, hasta?: string) {
  const qs = new URLSearchParams();
  if (desde) qs.set('desde', desde);
  if (hasta) qs.set('hasta', hasta);
  const query = qs.toString();
  return useQuery({
    queryKey: ['admin', 'canchas', 'ocupacion', { desde: desde ?? null, hasta: hasta ?? null }],
    queryFn: () =>
      apiFetch<OcupacionCancha[]>(`/admin/canchas/ocupacion${query ? `?${query}` : ''}`),
  });
}

// ─── Cobros (finanzas) ──────────────────────────────────────────────
import type {
  CobroAdmin,
  CreateCobroRequest,
  MarcarPagadoRequest,
  UpdateCobroRequest,
} from '@fixtura/types';

export interface CobrosFiltros {
  filtro?: string;
  equipoId?: string;
  // Sprint 34E
  torneoId?: string;
  clubId?: string;
  soloAuto?: boolean;
  // F51.1 — filtro por concepto (categoría).
  categoria?: string;
}

export function useCobros(
  filtroOrArgs?: string | CobrosFiltros,
  equipoId?: string,
) {
  // Soporta firma vieja useCobros(filtro, equipoId) y nueva useCobros({ ... }).
  const args: CobrosFiltros =
    typeof filtroOrArgs === 'string' || filtroOrArgs === undefined
      ? { filtro: filtroOrArgs, equipoId }
      : filtroOrArgs;
  const qs = new URLSearchParams();
  if (args.filtro) qs.set('filtro', args.filtro);
  if (args.equipoId) qs.set('equipoId', args.equipoId);
  if (args.torneoId) qs.set('torneoId', args.torneoId);
  if (args.clubId) qs.set('clubId', args.clubId);
  if (args.soloAuto === true) qs.set('soloAuto', 'true');
  if (args.soloAuto === false) qs.set('soloAuto', 'false');
  if (args.categoria) qs.set('categoria', args.categoria);
  const query = qs.toString();
  return useQuery({
    queryKey: [
      'admin',
      'cobros',
      {
        filtro: args.filtro ?? null,
        equipoId: args.equipoId ?? null,
        torneoId: args.torneoId ?? null,
        clubId: args.clubId ?? null,
        soloAuto: args.soloAuto ?? null,
        categoria: args.categoria ?? null,
      },
    ],
    queryFn: () =>
      apiFetch<CobroAdmin[]>(`/admin/cobros${query ? `?${query}` : ''}`),
  });
}

export function useCreateCobro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCobroRequest) =>
      apiFetch<CobroAdmin>('/admin/cobros', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

export function useUpdateCobro(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCobroRequest) =>
      apiFetch<CobroAdmin>(`/admin/cobros/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

export function useMarcarPagado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MarcarPagadoRequest }) =>
      apiFetch<CobroAdmin>(`/admin/cobros/${id}/pagar`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

export function useRevertirPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CobroAdmin>(`/admin/cobros/${id}/revertir-pago`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

export function useDeleteCobro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/cobros/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

// ─── Sprint 8: Suspensión / reprogramación de partidos y fechas ────
import type {
  ReprogramarPartidoRequest,
  SuspenderFechaRequest,
  SuspenderPartidoRequest,
} from '@fixtura/types';

export function useSuspenderPartido(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SuspenderPartidoRequest) =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/suspender`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'fixture', torneoId] });
    },
  });
}

export function useReprogramarPartido(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReprogramarPartidoRequest) =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/reprogramar`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'fixture', torneoId] });
    },
  });
}

export function useReactivarPartido(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/reactivar`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'fixture', torneoId] });
    },
  });
}

/** Marca un partido vencido como NO_JUGADO (no suma a posiciones). Reversible con reactivar. */
export function useMarcarNoJugado(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (observaciones?: string | null) =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/no-jugado`, {
        method: 'POST',
        body: { observaciones: observaciones ?? null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'fixture', torneoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin', 'actas-global'] });
    },
  });
}

export function useSuspenderFecha(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fechaId, input }: { fechaId: string; input: SuspenderFechaRequest }) =>
      apiFetch<{ fechasAfectadas: number; nuevaFechaBisId: string | null }>(
        `/admin/fechas/${fechaId}/suspender`,
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      // El key correcto del useFixtureDetail es ['admin','torneos',torneoId,'fixture-detail'].
      // El key viejo ['admin','fixture',torneoId] no existe — el invalidate no hacía nada.
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

export function useDeclararWalkover(partidoId: string, torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { equipoPerdedorId: string; observaciones?: string | null }) =>
      apiFetch<PartidoAdmin>(`/admin/partidos/${partidoId}/walkover`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      // El detalle del partido usa key PLURAL 'partidos' (ver usePartido) y el
      // fixture usa ['admin','torneos',torneoId,'fixture-detail']. Antes se
      // invalidaban keys inexistentes ('partido' singular / 'fixture'), así que
      // el walkover se aplicaba en backend (cerraba el acta) pero la UI quedaba
      // stale: seguía "programado" y sin marcador.
      qc.invalidateQueries({ queryKey: ['admin', 'partidos', partidoId] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
    },
  });
}

export function useReactivarFecha(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fechaId: string) =>
      apiFetch<{ ok: boolean }>(`/admin/fechas/${fechaId}/reactivar`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId, 'fixture-detail'] });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

// ─── Sprint 16 — Días no jugables (RF-13) ────────────────────────────
import type {
  CreateDiaNoJugableRequest,
  DiaNoJugable,
  FeriadoChile,
} from '@fixtura/types';

export function useDiasNoJugables(torneoId?: string) {
  return useQuery({
    queryKey: ['admin', 'dias-no-jugables', { torneoId }],
    queryFn: () =>
      apiFetch<DiaNoJugable[]>(
        torneoId
          ? `/admin/dias-no-jugables?torneoId=${encodeURIComponent(torneoId)}`
          : '/admin/dias-no-jugables',
      ),
  });
}

export function useFeriadosChile(anio: number) {
  return useQuery({
    queryKey: ['admin', 'dias-no-jugables', 'feriados-chile', anio],
    queryFn: () =>
      apiFetch<FeriadoChile[]>(`/admin/dias-no-jugables/feriados-chile/${anio}`),
    staleTime: 60 * 60 * 1000, // los feriados no cambian, cache larga
  });
}

export function useCrearDiaNoJugable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDiaNoJugableRequest) =>
      apiFetch<DiaNoJugable>('/admin/dias-no-jugables', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'dias-no-jugables'] });
    },
  });
}

export function useImportarFeriados() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dias: CreateDiaNoJugableRequest[]) =>
      apiFetch<{ creados: number; saltados: number; items: DiaNoJugable[] }>(
        '/admin/dias-no-jugables/bulk',
        { method: 'POST', body: { dias } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'dias-no-jugables'] });
    },
  });
}

export function useEliminarDiaNoJugable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/dias-no-jugables/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'dias-no-jugables'] });
    },
  });
}

// ─── Sprint 20 — Audit log (RF-07) ──────────────────────────────────
import type { AuditLogPage } from '@fixtura/types';

export interface AuditLogQueryParams {
  action?: string;
  actionPrefix?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  limit?: number;
}

export function useAuditLog(params: AuditLogQueryParams = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  return useQuery({
    queryKey: ['admin', 'audit-log', params],
    queryFn: () =>
      apiFetch<AuditLogPage>(`/admin/audit-log${query ? `?${query}` : ''}`),
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: ['admin', 'audit-log', 'actions'],
    queryFn: () => apiFetch<string[]>('/admin/audit-log/actions'),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Sprint 21 — Impersonación (RF-06) ──────────────────────────────
import type { AuthTokens } from '@fixtura/types';

export interface ImpersonationCandidate {
  id: string;
  email: string;
  roles: string[];
}

export function useImpersonationCandidates(emailFilter: string) {
  const qs = emailFilter ? `?email=${encodeURIComponent(emailFilter)}` : '';
  return useQuery({
    queryKey: ['admin', 'impersonate', { emailFilter }],
    queryFn: () =>
      apiFetch<ImpersonationCandidate[]>(`/admin/impersonate${qs}`),
    staleTime: 30_000,
  });
}

export function useStartImpersonation() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<AuthTokens & { targetEmail: string; targetUserId: string }>(
        `/admin/impersonate/${userId}/start`,
        { method: 'POST', body: {} },
      ),
  });
}

export function useEndImpersonation() {
  return useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>(`/admin/impersonate/${targetUserId}/end`, {
        method: 'POST',
        body: {},
      }),
  });
}

// ─── Sprint 23 — Super Admin (RF plataforma) ────────────────────────
import type {
  CreatePlanRequest,
  CreateTenantPlatformRequest,
  EstadoSuscripcion,
  MetricasPlataforma,
  PlanSuscripcion,
  PortalConfig,
  SystemHealth,
  TenantPlatform,
  UpdatePlanRequest,
  UpdatePortalConfigRequest,
  UpdateTenantPlatformRequest,
} from '@fixtura/types';

// Tenants (plataforma)
export function useTenantsPlataforma(filter?: {
  estado?: EstadoSuscripcion;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (filter?.estado) qs.set('estado', filter.estado);
  if (filter?.search) qs.set('search', filter.search);
  const q = qs.toString();
  return useQuery({
    queryKey: ['super-admin', 'tenants', filter],
    queryFn: () =>
      apiFetch<TenantPlatform[]>(`/super-admin/tenants${q ? `?${q}` : ''}`),
  });
}

export function useTenantPlataforma(id: string | null | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'tenants', id],
    queryFn: () => apiFetch<TenantPlatform>(`/super-admin/tenants/${id}`),
    enabled: !!id,
  });
}

export function useCrearTenantPlataforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantPlatformRequest) =>
      apiFetch<TenantPlatform>('/super-admin/tenants', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
      qc.invalidateQueries({ queryKey: ['super-admin', 'metricas'] });
    },
  });
}

export function useUpdateTenantPlataforma(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantPlatformRequest) =>
      apiFetch<TenantPlatform>(`/super-admin/tenants/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
    },
  });
}

export function useSuspenderTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (motivo: string) =>
      apiFetch<TenantPlatform>(`/super-admin/tenants/${id}/suspender`, {
        method: 'POST',
        body: { motivo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
    },
  });
}

export function useReactivarTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TenantPlatform>(`/super-admin/tenants/${id}/reactivar`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
    },
  });
}

// Planes
export function usePlanesSuscripcion() {
  return useQuery({
    queryKey: ['super-admin', 'planes'],
    queryFn: () => apiFetch<PlanSuscripcion[]>('/super-admin/planes'),
  });
}

export function useCrearPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanRequest) =>
      apiFetch<PlanSuscripcion>('/super-admin/planes', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'planes'] });
    },
  });
}

export function useUpdatePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePlanRequest) =>
      apiFetch<PlanSuscripcion>(`/super-admin/planes/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'planes'] });
    },
  });
}

export function useDeactivarPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/super-admin/planes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'planes'] });
    },
  });
}

// Métricas + Health
export function useMetricasPlataforma() {
  return useQuery({
    queryKey: ['super-admin', 'metricas'],
    queryFn: () => apiFetch<MetricasPlataforma>('/super-admin/metricas'),
    staleTime: 30_000,
  });
}

// ─── Sprint 39 — Horarios del torneo ────────────────────────────────
import type {
  CreateHorarioTorneoRequest,
  HorarioTorneo,
  UpdateHorarioTorneoRequest,
} from '@fixtura/types';

export function useHorariosTorneo(torneoId: string) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'horarios'],
    queryFn: () =>
      apiFetch<HorarioTorneo[]>(`/admin/torneos/${torneoId}/horarios`),
    enabled: !!torneoId,
  });
}

export function useCrearHorarioTorneo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHorarioTorneoRequest) =>
      apiFetch<HorarioTorneo>(`/admin/torneos/${torneoId}/horarios`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', torneoId, 'horarios'],
      });
    },
  });
}

export function useActualizarHorarioTorneo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateHorarioTorneoRequest }) =>
      apiFetch<HorarioTorneo>(`/admin/torneos/${torneoId}/horarios/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', torneoId, 'horarios'],
      });
    },
  });
}

export function useEliminarHorarioTorneo(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/torneos/${torneoId}/horarios/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', torneoId, 'horarios'],
      });
    },
  });
}

// Sprint 43 — Pre-validación del fixture antes de generar
import type { FixturePrevalidacion } from '@fixtura/types';

export function useFixturePrevalidacion(
  torneoId: string,
  params: { fechaInicio?: string; diasEntreFechas?: number },
) {
  const qs = new URLSearchParams();
  if (params.fechaInicio) qs.set('fechaInicio', params.fechaInicio);
  if (params.diasEntreFechas !== undefined) {
    qs.set('diasEntreFechas', String(params.diasEntreFechas));
  }
  const q = qs.toString();
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'fixture', 'prevalidacion', params],
    queryFn: () =>
      apiFetch<FixturePrevalidacion>(
        `/admin/torneos/${torneoId}/fixture/prevalidacion${q ? `?${q}` : ''}`,
      ),
    enabled: !!torneoId,
    staleTime: 10_000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['super-admin', 'health'],
    queryFn: () => apiFetch<SystemHealth>('/super-admin/metricas/health'),
    refetchInterval: 30_000,
  });
}

// ─── Sprint 37 — Portal config (tenant default) ─────────────────────
export function usePortalConfig() {
  return useQuery({
    queryKey: ['super-admin', 'portal-config'],
    queryFn: () => apiFetch<PortalConfig>('/super-admin/portal-config'),
  });
}

export function useUpdatePortalConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePortalConfigRequest) =>
      apiFetch<PortalConfig>('/super-admin/portal-config', {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'portal-config'] });
    },
  });
}

// ─── Sprint 24A: Facturación plataforma (super admin) ───────────────
import type {
  AnularFacturaRequest,
  EstadoCuentaLiga,
  EstadoFacturaPlataforma,
  FacturaPlataforma,
  RegistrarPagoManualRequest,
} from '@fixtura/types';

export function useFacturasPlataforma(filter?: {
  tenantId?: string;
  estado?: EstadoFacturaPlataforma;
  anio?: number;
  mes?: number;
}) {
  return useQuery({
    queryKey: ['super-admin', 'facturas', filter ?? {}],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter?.tenantId) params.set('tenantId', filter.tenantId);
      if (filter?.estado) params.set('estado', filter.estado);
      if (filter?.anio) params.set('anio', String(filter.anio));
      if (filter?.mes) params.set('mes', String(filter.mes));
      const qs = params.toString();
      return apiFetch<FacturaPlataforma[]>(
        `/super-admin/facturas${qs ? `?${qs}` : ''}`,
      );
    },
    staleTime: 30_000,
  });
}

export function useFacturaPlataforma(id: string | null | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'facturas', id],
    queryFn: () => apiFetch<FacturaPlataforma>(`/super-admin/facturas/${id}`),
    enabled: !!id,
  });
}

export function useEstadoCuentaLiga(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'facturas', 'estado-cuenta', tenantId],
    queryFn: () =>
      apiFetch<EstadoCuentaLiga>(
        `/super-admin/facturas/estado-cuenta/${tenantId}`,
      ),
    enabled: !!tenantId,
  });
}

export function useRegistrarPagoManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      facturaId,
      input,
    }: {
      facturaId: string;
      input: RegistrarPagoManualRequest;
    }) =>
      apiFetch<FacturaPlataforma>(
        `/super-admin/facturas/${facturaId}/pago-manual`,
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'facturas'] });
    },
  });
}

export function useAnularFactura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      facturaId,
      input,
    }: {
      facturaId: string;
      input: AnularFacturaRequest;
    }) =>
      apiFetch<FacturaPlataforma>(
        `/super-admin/facturas/${facturaId}/anular`,
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'facturas'] });
    },
  });
}

export function useGenerarFacturasMes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ creadas: number; saltadas: number }>(
        `/super-admin/facturas/generar-mes`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'facturas'] });
    },
  });
}

// ─── Sprint 24A: Mi suscripción (LIGA_ADMIN) ────────────────────────
export function useMiSuscripcion(enabled = true) {
  return useQuery({
    queryKey: ['mi-suscripcion'],
    queryFn: () => apiFetch<EstadoCuentaLiga>('/admin/mi-suscripcion'),
    staleTime: 30_000,
    enabled,
    retry: false,
  });
}

export function useMisFacturas() {
  return useQuery({
    queryKey: ['mi-suscripcion', 'facturas'],
    queryFn: () =>
      apiFetch<FacturaPlataforma[]>('/admin/mi-suscripcion/facturas'),
    staleTime: 30_000,
  });
}

export function usePagarFacturaWebpay() {
  return useMutation({
    mutationFn: (facturaId: string) =>
      apiFetch<{ url: string; token: string; transaccionId: string }>(
        `/admin/mi-suscripcion/pagar/${facturaId}`,
        {
          method: 'POST',
          body: { baseUrlFrontend: window.location.origin },
        },
      ),
  });
}

// ─── User context (auto-poll del JWT actual) ────────────────────────
import type { UserContext } from '@fixtura/types';

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<UserContext>('/auth/me', { method: 'POST', body: {} }),
    staleTime: 60_000,
    retry: false,
  });
}

export function useIsSuperAdmin(): boolean {
  const { data } = useMe();
  return data?.roles.some((r) => r.role === 'SUPER_ADMIN') ?? false;
}

// ─── Sprint 25: Categorías de jugadores ─────────────────────────────
import type {
  CategoriaJugadores,
  CreateCategoriaRequest,
  UpdateCategoriaRequest,
  ValidarPlantelResult,
} from '@fixtura/types';

export function useCategorias() {
  return useQuery({
    queryKey: ['admin', 'categorias'],
    queryFn: () => apiFetch<CategoriaJugadores[]>('/admin/categorias'),
    staleTime: 30_000,
  });
}

export function useCreateCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoriaRequest) =>
      apiFetch<CategoriaJugadores>('/admin/categorias', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'categorias'] });
    },
  });
}

export function useUpdateCategoria(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCategoriaRequest) =>
      apiFetch<CategoriaJugadores>(`/admin/categorias/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'categorias'] });
    },
  });
}

export function useDeleteCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/categorias/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'categorias'] });
    },
  });
}

/**
 * Valida el plantel de un equipo contra la categoría del torneo.
 * Si el torneo no tiene categoría, devuelve apto=true sin validar.
 */
export function useValidarPlantel(equipoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'equipos', equipoId, 'validar-plantel'],
    queryFn: () =>
      apiFetch<ValidarPlantelResult>(`/admin/equipos/${equipoId}/validar-plantel`),
    enabled: !!equipoId,
    // Re-validar cada vez que la UI vuelve a montar — el plantel
    // puede haber cambiado en otra pestaña / por otro admin.
    staleTime: 0,
  });
}

// ─── Sprint 26 — Clubes y vetados (ADR-0004) ────────────────────────

import type {
  Club,
  ContactoDirectiva,
  CreateClubRequest,
  CreateJugadorClubRequest,
  CreateJugadorVetadoRequest,
  Jugador,
  JugadorVetado,
  UpdateClubRequest,
  UpdateJugadorClubRequest,
} from '@fixtura/types';

export function useClubes() {
  return useQuery({
    queryKey: ['admin', 'clubes'],
    queryFn: () => apiFetch<Club[]>('/admin/clubes'),
    staleTime: 30_000,
  });
}

export function useClub(id: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'clubes', id],
    queryFn: () => apiFetch<Club>(`/admin/clubes/${id}`),
    enabled: !!id,
  });
}

export function useCreateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClubRequest) =>
      apiFetch<Club>('/admin/clubes', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes'] });
    },
  });
}

export function useUpdateClub(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClubRequest) =>
      apiFetch<Club>(`/admin/clubes/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes'] });
      qc.invalidateQueries({ queryKey: ['admin', 'clubes', id] });
    },
  });
}

export function useDeleteClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/clubes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes'] });
    },
  });
}

/**
 * Lista el plantel de un club, opcionalmente filtrado por categoría.
 * Si no se pasa categoriaId, devuelve TODOS los jugadores del club.
 */
export function usePlantelClub(
  clubId: string | null | undefined,
  categoriaId?: string | null,
) {
  const qs = categoriaId ? `?categoriaId=${categoriaId}` : '';
  return useQuery({
    queryKey: ['admin', 'clubes', clubId, 'plantel', categoriaId ?? null],
    queryFn: () => apiFetch<Jugador[]>(`/admin/clubes/${clubId}/jugadores${qs}`),
    enabled: !!clubId,
  });
}

export function useAddJugadorClub(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJugadorClubRequest) =>
      apiFetch<Jugador>(`/admin/clubes/${clubId}/jugadores`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes', clubId] });
      qc.invalidateQueries({
        queryKey: ['admin', 'clubes', clubId, 'plantel'],
      });
    },
  });
}

export function useUpdateJugadorClub(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jugadorId,
      input,
    }: {
      jugadorId: string;
      input: UpdateJugadorClubRequest;
    }) =>
      apiFetch<Jugador>(`/admin/clubes/${clubId}/jugadores/${jugadorId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'clubes', clubId, 'plantel'],
      });
    },
  });
}

/**
 * Sprint 32 — actualiza la directiva específica de una (club, categoría)
 * sin tocar la directiva "madre" del club ni la de otras categorías.
 */
export function useUpdateDirectivaCategoria(clubId: string, categoriaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      presidente?: ContactoDirectiva | null;
      delegados?: ContactoDirectiva[];
    }) =>
      apiFetch<Club>(
        `/admin/clubes/${clubId}/categorias/${categoriaId}/directiva`,
        { method: 'PATCH', body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes'] });
      qc.invalidateQueries({ queryKey: ['admin', 'clubes', clubId] });
    },
  });
}

export function useDeleteJugadorClub(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jugadorId: string) =>
      apiFetch<void>(`/admin/clubes/${clubId}/jugadores/${jugadorId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes', clubId] });
      qc.invalidateQueries({
        queryKey: ['admin', 'clubes', clubId, 'plantel'],
      });
    },
  });
}

// ─── Vetados ────────────────────────────────────────────────────────

export function useVetados() {
  return useQuery({
    queryKey: ['admin', 'vetados'],
    queryFn: () => apiFetch<JugadorVetado[]>('/admin/vetados'),
    staleTime: 30_000,
  });
}

export function useCreateVetado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJugadorVetadoRequest) =>
      apiFetch<JugadorVetado>('/admin/vetados', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vetados'] });
    },
  });
}

export function useDeleteVetado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/vetados/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vetados'] });
    },
  });
}

// ─── Sprint 26E — Inscripciones a torneos + planilla del torneo ─────

import type {
  CreateInscripcionTorneoRequest,
  InscripcionTorneo,
} from '@fixtura/types';

export interface PlanillaTorneoItem {
  jugadorId: string;
  rut: string;
  nombres: string;
  apellidos: string;
  numeroCamiseta: number | null;
  posicion: string | null;
  capitan: boolean;
  fechaIncorporacion: string;
}

export function useInscripcionesTorneo(torneoId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'torneos', torneoId, 'inscripciones'],
    queryFn: () =>
      apiFetch<InscripcionTorneo[]>(
        `/admin/torneos/${torneoId}/inscripciones`,
      ),
    enabled: !!torneoId,
  });
}

export function useInscribirClub(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInscripcionTorneoRequest) =>
      apiFetch<InscripcionTorneo>(`/admin/torneos/${torneoId}/inscripciones`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', torneoId, 'inscripciones'],
      });
      qc.invalidateQueries({ queryKey: ['admin', 'torneos', torneoId] });
    },
  });
}

export function useDesinscribir(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inscripcionId: string) =>
      apiFetch<void>(`/admin/inscripciones/${inscripcionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'torneos', torneoId, 'inscripciones'],
      });
    },
  });
}

export function usePlanillaTorneo(
  inscripcionId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['admin', 'inscripciones', inscripcionId, 'planilla'],
    queryFn: () =>
      apiFetch<PlanillaTorneoItem[]>(
        `/admin/inscripciones/${inscripcionId}/planilla`,
      ),
    enabled: !!inscripcionId,
  });
}

export function useAddJugadorPlanilla(inscripcionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jugadorId: string) =>
      apiFetch<void>(`/admin/inscripciones/${inscripcionId}/planilla`, {
        method: 'POST',
        body: { jugadorId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'inscripciones', inscripcionId, 'planilla'],
      });
    },
  });
}

export function useRemoveJugadorPlanilla(inscripcionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jugadorId: string) =>
      apiFetch<void>(
        `/admin/inscripciones/${inscripcionId}/planilla/${jugadorId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['admin', 'inscripciones', inscripcionId, 'planilla'],
      });
    },
  });
}

// ─── Sprint 28 — Importación masiva de planteles desde Excel ────────

import type {
  BulkImportConfirmRequest,
  BulkImportPreview,
  BulkImportResult,
  BulkImportRow,
} from '@fixtura/types';

/**
 * Preview de import: no commitea. Devuelve detalle por fila para que
 * la UI muestre la tabla de revisión.
 */
export function usePreviewImportPlantel(clubId: string) {
  return useMutation({
    mutationFn: (input: { categoriaId: string; rows: BulkImportRow[] }) =>
      apiFetch<BulkImportPreview>(
        `/admin/clubes/${clubId}/plantel/import/preview`,
        { method: 'POST', body: input },
      ),
  });
}

/**
 * Confirma el import. Re-evalúa y aplica los cambios.
 */
export function useConfirmImportPlantel(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkImportConfirmRequest) =>
      apiFetch<BulkImportResult>(
        `/admin/clubes/${clubId}/plantel/import/confirm`,
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubes', clubId] });
      qc.invalidateQueries({
        queryKey: ['admin', 'clubes', clubId, 'plantel'],
      });
      qc.invalidateQueries({ queryKey: ['admin', 'jugadores-global'] });
    },
  });
}

// ─── Tarifario por torneo (Sprint 34B) ────────────────────────────
import type {
  CreateTarifaRequest,
  TarifaTorneo,
  UpdateTarifaRequest,
} from '@fixtura/types';

const tarifasKey = (torneoId: string) =>
  ['admin', 'torneos', torneoId, 'tarifario'] as const;

export function useTarifas(torneoId: string) {
  return useQuery({
    queryKey: tarifasKey(torneoId),
    queryFn: () =>
      apiFetch<TarifaTorneo[]>(`/admin/torneos/${torneoId}/tarifario`),
  });
}

export function useCreateTarifa(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTarifaRequest) =>
      apiFetch<TarifaTorneo>(`/admin/torneos/${torneoId}/tarifario`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifasKey(torneoId) });
    },
  });
}

export function useUpdateTarifa(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTarifaRequest }) =>
      apiFetch<TarifaTorneo>(`/admin/torneos/${torneoId}/tarifario/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifasKey(torneoId) });
    },
  });
}

export function useDeleteTarifa(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ cobrosDesvinculados: number }>(
        `/admin/torneos/${torneoId}/tarifario/${id}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifasKey(torneoId) });
    },
  });
}

/**
 * Recuperación manual: genera los cobros del tarifario para un torneo ya
 * activo (cuando se configuró el tarifario después de iniciarlo). Idempotente.
 */
export function useGenerarCobros(torneoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{
        equiposProcesados: number;
        matriculasCreadas: number;
        cuotasCreadas: number;
      }>(`/admin/torneos/${torneoId}/generar-cobros`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cobros'] });
    },
  });
}

// ─── F47: Pagos a personal (cuentas por pagar) ──────────────────────
import type {
  CrearLiquidacionRequest,
  CuentasPorPagarResumen,
  LiquidacionPersonal,
  LiquidacionPersonalDetalle,
} from '@fixtura/types';

const PAGOS_PERSONAL_KEY = ['admin', 'pagos-personal'] as const;

export function useCuentasPorPagar() {
  return useQuery({
    queryKey: [...PAGOS_PERSONAL_KEY, 'cuentas'],
    queryFn: () =>
      apiFetch<CuentasPorPagarResumen>('/admin/pagos-personal/cuentas-por-pagar'),
  });
}

export function useLiquidaciones() {
  return useQuery({
    queryKey: [...PAGOS_PERSONAL_KEY, 'liquidaciones'],
    queryFn: () =>
      apiFetch<LiquidacionPersonal[]>('/admin/pagos-personal/liquidaciones'),
  });
}

export function useLiquidacionDetalle(id: string | null) {
  return useQuery({
    queryKey: [...PAGOS_PERSONAL_KEY, 'liquidaciones', id],
    enabled: !!id,
    queryFn: () =>
      apiFetch<LiquidacionPersonalDetalle>(
        `/admin/pagos-personal/liquidaciones/${id}`,
      ),
  });
}

export function useLiquidar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearLiquidacionRequest) =>
      apiFetch<LiquidacionPersonalDetalle>('/admin/pagos-personal/liquidaciones', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGOS_PERSONAL_KEY });
      qc.invalidateQueries({ queryKey: ['admin', 'informes'] });
    },
  });
}

export function useEliminarLiquidacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/pagos-personal/liquidaciones/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGOS_PERSONAL_KEY });
      qc.invalidateQueries({ queryKey: ['admin', 'informes'] });
    },
  });
}

// ─── F49: Nóminas de pago (pago masivo) ─────────────────────────────
import type {
  EmitirNominaRequest,
  NominaPago,
  NominaPagoDetalle,
  NominaPreview,
} from '@fixtura/types';

export function usePreviewNomina(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...PAGOS_PERSONAL_KEY, 'nomina-preview', desde, hasta],
    enabled: !!desde && !!hasta && hasta >= desde,
    queryFn: () =>
      apiFetch<NominaPreview>(
        `/admin/pagos-personal/nominas/preview?desde=${desde}&hasta=${hasta}`,
      ),
  });
}

export function useNominas() {
  return useQuery({
    queryKey: [...PAGOS_PERSONAL_KEY, 'nominas'],
    queryFn: () => apiFetch<NominaPago[]>('/admin/pagos-personal/nominas'),
  });
}

export function useEmitirNomina() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmitirNominaRequest) =>
      apiFetch<NominaPagoDetalle>('/admin/pagos-personal/nominas', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGOS_PERSONAL_KEY });
      qc.invalidateQueries({ queryKey: ['admin', 'informes'] });
    },
  });
}

export function useEliminarNomina() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/pagos-personal/nominas/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGOS_PERSONAL_KEY });
      qc.invalidateQueries({ queryKey: ['admin', 'informes'] });
    },
  });
}

// ─── Informes (disciplina) ──────────────────────────────────────────
import type {
  EnRiesgoAmarilla,
  ExpulsadoFecha,
  SancionVigente,
} from '@fixtura/types';

export function useInformeExpulsados(
  torneoId: string | undefined,
  fechaNumero: number | undefined,
) {
  const qs = new URLSearchParams();
  if (torneoId) qs.set('torneoId', torneoId);
  if (fechaNumero != null) qs.set('fechaNumero', String(fechaNumero));
  return useQuery({
    queryKey: ['admin', 'informes', 'expulsados', { torneoId: torneoId ?? null, fechaNumero: fechaNumero ?? null }],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<ExpulsadoFecha[]>(`/admin/informes/disciplina/expulsados?${qs.toString()}`),
  });
}

export function useInformeSancionados(filtros: {
  torneoId?: string;
  clubId?: string;
  incluirCumplidas?: boolean;
}) {
  const qs = new URLSearchParams();
  if (filtros.torneoId) qs.set('torneoId', filtros.torneoId);
  if (filtros.clubId) qs.set('clubId', filtros.clubId);
  if (filtros.incluirCumplidas) qs.set('incluirCumplidas', 'true');
  const query = qs.toString();
  return useQuery({
    queryKey: ['admin', 'informes', 'sancionados', filtros],
    queryFn: () =>
      apiFetch<SancionVigente[]>(`/admin/informes/disciplina/sancionados${query ? `?${query}` : ''}`),
  });
}

export function useInformeEnRiesgo(torneoId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'informes', 'en-riesgo', { torneoId: torneoId ?? null }],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<EnRiesgoAmarilla[]>(`/admin/informes/disciplina/en-riesgo?torneoId=${torneoId}`),
  });
}

// ─── Informes (finanzas) ────────────────────────────────────────────
import type {
  EstadoCuentaClub,
  Moroso,
  MultaPendiente,
  RecaudacionConcepto,
} from '@fixtura/types';

export function useInformeEstadoCuenta(torneoId?: string) {
  const qs = torneoId ? `?torneoId=${torneoId}` : '';
  return useQuery({
    queryKey: ['admin', 'informes', 'estado-cuenta', { torneoId: torneoId ?? null }],
    queryFn: () => apiFetch<EstadoCuentaClub[]>(`/admin/informes/finanzas/estado-cuenta${qs}`),
  });
}

export function useInformeMultasPendientes(torneoId?: string, clubId?: string) {
  const p = new URLSearchParams();
  if (torneoId) p.set('torneoId', torneoId);
  if (clubId) p.set('clubId', clubId);
  const qs = p.toString();
  return useQuery({
    queryKey: ['admin', 'informes', 'multas', { torneoId: torneoId ?? null, clubId: clubId ?? null }],
    queryFn: () =>
      apiFetch<MultaPendiente[]>(`/admin/informes/finanzas/multas-pendientes${qs ? `?${qs}` : ''}`),
  });
}

export function useInformeMorosos(torneoId?: string) {
  const qs = torneoId ? `?torneoId=${torneoId}` : '';
  return useQuery({
    queryKey: ['admin', 'informes', 'morosos', { torneoId: torneoId ?? null }],
    queryFn: () => apiFetch<Moroso[]>(`/admin/informes/finanzas/morosos${qs}`),
  });
}

export function useInformeRecaudacion(torneoId?: string) {
  const qs = torneoId ? `?torneoId=${torneoId}` : '';
  return useQuery({
    queryKey: ['admin', 'informes', 'recaudacion', { torneoId: torneoId ?? null }],
    queryFn: () => apiFetch<RecaudacionConcepto[]>(`/admin/informes/finanzas/recaudacion${qs}`),
  });
}

// ─── Informes (competición) ─────────────────────────────────────────
import type {
  CoberturaPartido,
  DesignacionInforme,
  FilaPosicionInforme,
  GoleadorInforme,
  PagoPersonal,
  ResultadoPartidoInforme,
} from '@fixtura/types';

export function useInformePosiciones(torneoId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'informes', 'posiciones', { torneoId: torneoId ?? null }],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<FilaPosicionInforme[]>(`/admin/informes/competicion/posiciones?torneoId=${torneoId}`),
  });
}

export function useInformeGoleadores(torneoId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'informes', 'goleadores', { torneoId: torneoId ?? null }],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<GoleadorInforme[]>(`/admin/informes/competicion/goleadores?torneoId=${torneoId}`),
  });
}

export function useInformeResultados(
  torneoId: string | undefined,
  fechaNumero: number | undefined,
) {
  const qs = new URLSearchParams();
  if (torneoId) qs.set('torneoId', torneoId);
  if (fechaNumero != null) qs.set('fechaNumero', String(fechaNumero));
  return useQuery({
    queryKey: [
      'admin',
      'informes',
      'resultados',
      { torneoId: torneoId ?? null, fechaNumero: fechaNumero ?? null },
    ],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<ResultadoPartidoInforme[]>(
        `/admin/informes/competicion/resultados?${qs.toString()}`,
      ),
  });
}

// ─── Informes (arbitraje / operación) ───────────────────────────────
export function useInformeDesignaciones(
  torneoId: string | undefined,
  fechaNumero: number | undefined,
) {
  const qs = new URLSearchParams();
  if (torneoId) qs.set('torneoId', torneoId);
  if (fechaNumero != null) qs.set('fechaNumero', String(fechaNumero));
  return useQuery({
    queryKey: [
      'admin',
      'informes',
      'designaciones',
      { torneoId: torneoId ?? null, fechaNumero: fechaNumero ?? null },
    ],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<DesignacionInforme[]>(
        `/admin/informes/arbitraje/designaciones?${qs.toString()}`,
      ),
  });
}

export function useInformeCobertura(
  torneoId: string | undefined,
  fechaNumero: number | undefined,
) {
  const qs = new URLSearchParams();
  if (torneoId) qs.set('torneoId', torneoId);
  if (fechaNumero != null) qs.set('fechaNumero', String(fechaNumero));
  return useQuery({
    queryKey: [
      'admin',
      'informes',
      'cobertura',
      { torneoId: torneoId ?? null, fechaNumero: fechaNumero ?? null },
    ],
    enabled: !!torneoId,
    queryFn: () =>
      apiFetch<CoberturaPartido[]>(
        `/admin/informes/arbitraje/cobertura?${qs.toString()}`,
      ),
  });
}

export function useInformePagosPersonal(torneoId: string | undefined) {
  const qs = torneoId ? `?torneoId=${torneoId}` : '';
  return useQuery({
    queryKey: ['admin', 'informes', 'pagos-personal', { torneoId: torneoId ?? null }],
    queryFn: () =>
      apiFetch<PagoPersonal[]>(`/admin/informes/arbitraje/pagos-personal${qs}`),
  });
}

// ─── Usuarios del sistema (vista consolidada) ───────────────────────
import type { UsuarioSistema } from '@fixtura/types';

export function useUsuariosSistema() {
  return useQuery({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => apiFetch<UsuarioSistema[]>('/admin/ajustes/usuarios'),
  });
}
