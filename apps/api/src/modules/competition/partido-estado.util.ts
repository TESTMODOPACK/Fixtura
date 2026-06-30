import { ConflictException } from '@nestjs/common';

/**
 * Estados desde los que un partido ya NO se juega ni se opera: o es una
 * resolución sin jugarse (no jugado / suspendido por fuerza mayor /
 * reprogramado) o un resultado administrativo cerrado (walkover).
 *
 * Operar el match center, cargar acta/incidencias, certificar presentes o
 * designar personal sobre uno de estos estados corrompe datos: revive el
 * partido a EN_CURSO, le suma stats y plata (devengos/multas) o desperdicia
 * personal. El frontend ya oculta esas acciones; esto es la barrera dura de
 * backend (defensa en profundidad).
 */
export const ESTADOS_PARTIDO_NO_OPERABLES: readonly string[] = [
  'NO_JUGADO',
  'SUSPENDIDO_FUERZA_MAYOR',
  'REPROGRAMADO',
  'WALKOVER',
];

/** Tira ConflictException si el partido está en un estado no operable. */
export function assertPartidoEstadoOperable(estado: string): void {
  if (ESTADOS_PARTIDO_NO_OPERABLES.includes(estado)) {
    throw new ConflictException(
      `El partido está marcado como ${estado
        .replace(/_/g, ' ')
        .toLowerCase()} y no se puede operar. Reactívalo primero.`,
    );
  }
}
