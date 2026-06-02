import { calcularEdadCalendario } from '../edad';

/**
 * Validar si un plantel encaja en una categoría con su regla de excepciones.
 *
 * Reglas:
 *   - edadCalendario >= edadMinimaGeneral → válido sin restricción.
 *   - edadMinimaExcepcion <= edadCalendario < edadMinimaGeneral → válido
 *     SI hay cupo disponible. Si superan el cupo → bloquea.
 *   - edadCalendario < edadMinimaExcepcion (o < edadMinimaGeneral cuando
 *     cupo=0) → siempre bloqueado.
 *   - fechaNac null → cuenta como "sinFecha" (no se puede validar).
 *
 * El resultado le dice al caller si el plantel es apto, cuántos jugadores
 * caen en cada bucket y qué motivos hay para rechazarlo (para mostrar
 * en UI o devolver como error de validación).
 */
export interface JugadorParaValidar {
  id: string;
  nombre?: string;
  apellido?: string;
  fechaNac: string | null;
}

export interface ReglaCategoria {
  edadMinimaGeneral: number;
  cupoExcepcionesPorEquipo: number;
  edadMinimaExcepcion: number | null;
}

export interface PlantelValidacionResult {
  validos: number;
  enExcepcion: number;
  bloqueados: number;
  sinFecha: number;
  cupoExcepcionesDisponibles: number;
  cupoExcepcionesUsado: number;
  apto: boolean;
  motivosRechazo: string[];
  /** Detalle por jugador para que la UI pueda marcar quiénes son problema. */
  detalle: Array<{
    jugadorId: string;
    estado: 'VALIDO' | 'EN_EXCEPCION' | 'BLOQUEADO' | 'SIN_FECHA';
    edadCalendario: number | null;
  }>;
}

export function validarPlantelCategoria(
  jugadores: JugadorParaValidar[],
  regla: ReglaCategoria,
  anioRef: number = new Date().getUTCFullYear(),
): PlantelValidacionResult {
  // Piso absoluto: si hay cupo de excepciones, usar edadMinimaExcepcion
  // como piso. Si no hay cupo, el piso es la edad mínima general.
  const piso =
    regla.cupoExcepcionesPorEquipo > 0 && regla.edadMinimaExcepcion != null
      ? regla.edadMinimaExcepcion
      : regla.edadMinimaGeneral;

  const detalle: PlantelValidacionResult['detalle'] = [];
  let validos = 0;
  let enExcepcion = 0;
  let bloqueados = 0;
  let sinFecha = 0;
  const bloqueadosNombres: string[] = [];
  const enExcepcionNombres: string[] = [];

  for (const j of jugadores) {
    const edadCal = calcularEdadCalendario(j.fechaNac, anioRef);
    if (edadCal == null) {
      sinFecha++;
      detalle.push({ jugadorId: j.id, estado: 'SIN_FECHA', edadCalendario: null });
      continue;
    }

    if (edadCal >= regla.edadMinimaGeneral) {
      validos++;
      detalle.push({ jugadorId: j.id, estado: 'VALIDO', edadCalendario: edadCal });
    } else if (edadCal >= piso && regla.cupoExcepcionesPorEquipo > 0) {
      enExcepcion++;
      detalle.push({
        jugadorId: j.id,
        estado: 'EN_EXCEPCION',
        edadCalendario: edadCal,
      });
      enExcepcionNombres.push(nombreCorto(j, edadCal));
    } else {
      bloqueados++;
      detalle.push({
        jugadorId: j.id,
        estado: 'BLOQUEADO',
        edadCalendario: edadCal,
      });
      bloqueadosNombres.push(nombreCorto(j, edadCal));
    }
  }

  const motivosRechazo: string[] = [];
  if (sinFecha > 0) {
    motivosRechazo.push(
      `${sinFecha} jugador(es) sin fecha de nacimiento. Cargá la fecha para poder validar.`,
    );
  }
  if (bloqueados > 0) {
    motivosRechazo.push(
      `${bloqueados} jugador(es) por debajo del piso de edad (${piso} años): ${bloqueadosNombres.slice(0, 3).join(', ')}${bloqueadosNombres.length > 3 ? '…' : ''}.`,
    );
  }
  if (enExcepcion > regla.cupoExcepcionesPorEquipo) {
    motivosRechazo.push(
      `Excede el cupo de excepciones (${enExcepcion} en uso, máximo ${regla.cupoExcepcionesPorEquipo}). Jugadores en excepción: ${enExcepcionNombres.join(', ')}.`,
    );
  }

  return {
    validos,
    enExcepcion,
    bloqueados,
    sinFecha,
    cupoExcepcionesDisponibles: regla.cupoExcepcionesPorEquipo,
    cupoExcepcionesUsado: enExcepcion,
    apto:
      bloqueados === 0 &&
      sinFecha === 0 &&
      enExcepcion <= regla.cupoExcepcionesPorEquipo,
    motivosRechazo,
    detalle,
  };
}

function nombreCorto(j: JugadorParaValidar, edad: number): string {
  const nombre = `${j.nombre ?? ''} ${j.apellido ?? ''}`.trim() || j.id.slice(0, 8);
  return `${nombre} (${edad}a)`;
}
