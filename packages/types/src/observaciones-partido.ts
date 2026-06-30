import { z } from 'zod';

/**
 * Informe del partido — antecedentes disciplinarios que el árbitro, el
 * planillero o el admin registran sobre un partido (conducta de la barra, del
 * DT, incidentes fuera del marcador). Cada entrada se asocia a un lado para que
 * el tribunal sepa contra qué club aplica.
 */
export const LADO_OBSERVACION = ['LOCAL', 'VISITA', 'GENERAL'] as const;
export type LadoObservacion = (typeof LADO_OBSERVACION)[number];

export const LADO_OBSERVACION_LABEL: Record<LadoObservacion, string> = {
  LOCAL: 'Equipo local',
  VISITA: 'Equipo visita',
  GENERAL: 'General',
};

export const ROL_AUTOR_OBSERVACION = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
  'PLANILLERO',
  'PARAMEDICO',
  'OTRO',
  'ADMIN',
] as const;
export type RolAutorObservacion = (typeof ROL_AUTOR_OBSERVACION)[number];

export const ROL_AUTOR_OBSERVACION_LABEL: Record<RolAutorObservacion, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Árbitro asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Personal',
  ADMIN: 'Admin',
};

export interface ObservacionPartido {
  id: string;
  partidoId: string;
  lado: LadoObservacion;
  texto: string;
  autorNombre: string;
  autorRol: RolAutorObservacion;
  createdAt: string;
}

/** Observación con el contexto del partido — lo que ve el tribunal del torneo. */
export interface ObservacionTribunalItem {
  id: string;
  partidoId: string;
  fechaNumero: number;
  equipoLocalNombre: string;
  equipoVisitaNombre: string;
  lado: LadoObservacion;
  /** Nombre del club al que apunta la observación (null si es GENERAL). */
  equipoNombre: string | null;
  texto: string;
  autorNombre: string;
  autorRol: RolAutorObservacion;
  createdAt: string;
}

export const CrearObservacionPartidoSchema = z.object({
  lado: z.enum(LADO_OBSERVACION),
  texto: z
    .string()
    .trim()
    .min(3, 'Escribe al menos 3 caracteres.')
    .max(1000, 'Máximo 1000 caracteres.'),
});
export type CrearObservacionPartidoInput = z.infer<typeof CrearObservacionPartidoSchema>;
