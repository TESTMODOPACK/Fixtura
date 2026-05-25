/**
 * Reglas de sanción por acumulación de tarjetas.
 *
 * IMPORTANTE — Anexo de Correcciones (RF-20):
 * la sanción se aplica sobre RUT × torneo_id, NO sobre equipo. Un jugador
 * sancionado no puede evadir cambiándose de club dentro del mismo torneo.
 */

export interface IncidenciaJugador {
  tipo: 'AMARILLA' | 'ROJA' | 'AMARILLA_ROJA';
  partidoId: string;
  fechaNumero: number;
}

export interface SancionPropuesta {
  motivo: 'ACUMULACION_AMARILLAS' | 'ROJA_DIRECTA' | 'DOBLE_AMARILLA';
  fechasSuspension: number;
  origenIncidenciaPartidoId: string;
  desdeFechaNumero: number;
}

export interface ConfiguracionDisciplinaria {
  amarillasPorSuspension: number; // default 5
  fechasPorRoja: number; // default 1
  fechasPorDobleAmarilla: number; // default 1
}

export const DEFAULT_CONFIG_DISCIPLINARIA: ConfiguracionDisciplinaria = {
  amarillasPorSuspension: 5,
  fechasPorRoja: 1,
  fechasPorDobleAmarilla: 1,
};

/**
 * Calcula las sanciones automáticas (no las del tribunal) a partir del
 * historial de incidencias del jugador en un torneo.
 *
 * Retorna las sanciones nuevas a aplicar después del partido recién cerrado.
 * El caller debe persistirlas con `cumplida=false` y la propia lógica de
 * `sanciones_activas` se encarga de descontarlas en partidos siguientes.
 */
export function calcularSancionesPostPartido(
  incidenciasPreviasOrdenadas: IncidenciaJugador[],
  incidenciasDelUltimoPartido: IncidenciaJugador[],
  config: ConfiguracionDisciplinaria = DEFAULT_CONFIG_DISCIPLINARIA,
): SancionPropuesta[] {
  const sanciones: SancionPropuesta[] = [];

  // 1) Roja directa o doble amarilla en el partido actual → suspensión inmediata
  for (const inc of incidenciasDelUltimoPartido) {
    const proxFecha = inc.fechaNumero + 1;
    if (inc.tipo === 'ROJA') {
      sanciones.push({
        motivo: 'ROJA_DIRECTA',
        fechasSuspension: config.fechasPorRoja,
        origenIncidenciaPartidoId: inc.partidoId,
        desdeFechaNumero: proxFecha,
      });
    } else if (inc.tipo === 'AMARILLA_ROJA') {
      sanciones.push({
        motivo: 'DOBLE_AMARILLA',
        fechasSuspension: config.fechasPorDobleAmarilla,
        origenIncidenciaPartidoId: inc.partidoId,
        desdeFechaNumero: proxFecha,
      });
    }
  }

  // 2) Acumulación de amarillas → al alcanzar el umbral, 1 fecha
  const todasAmarillas = [...incidenciasPreviasOrdenadas, ...incidenciasDelUltimoPartido].filter(
    (i) => i.tipo === 'AMARILLA',
  );
  if (todasAmarillas.length >= config.amarillasPorSuspension) {
    const acumuladasPrevias = incidenciasPreviasOrdenadas.filter(
      (i) => i.tipo === 'AMARILLA',
    ).length;
    const acumuladasAhora = todasAmarillas.length;
    // Solo emitir si el partido actual completó el umbral (evita duplicados).
    const cruceUmbral =
      Math.floor(acumuladasAhora / config.amarillasPorSuspension) >
      Math.floor(acumuladasPrevias / config.amarillasPorSuspension);
    if (cruceUmbral) {
      const ultimoPartido = incidenciasDelUltimoPartido[0];
      if (ultimoPartido) {
        sanciones.push({
          motivo: 'ACUMULACION_AMARILLAS',
          fechasSuspension: 1,
          origenIncidenciaPartidoId: ultimoPartido.partidoId,
          desdeFechaNumero: ultimoPartido.fechaNumero + 1,
        });
      }
    }
  }

  return sanciones;
}
