import { DeepPartial, QueryFailedError, Repository } from 'typeorm';

import { IncidenciaPartido } from './entities/incidencia-partido.entity';

/** Código SQLSTATE de violación de UNIQUE en PostgreSQL. */
const PG_UNIQUE_VIOLATION = '23505';

export function isPgUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as QueryFailedError & { driverError?: { code?: string } }).driverError
      ?.code === PG_UNIQUE_VIOLATION
  );
}

/**
 * MOV-1 (auditoría) — guarda una incidencia de forma idempotente respecto de
 * `clientKey`. Si el cliente reintenta la misma acción (replay de cola
 * offline, doble-tap, reconexión) con la misma clave, devuelve la incidencia
 * ya persistida en vez de crear un duplicado.
 *
 * Doble red: un `findOne` previo cubre el caso común (el replay llega después
 * de que la original ya commiteó) y el `catch` de la violación de UNIQUE cubre
 * el race (dos requests con la misma clave insertando en paralelo). Sin
 * `clientKey` se comporta como un `save` normal.
 *
 * El UNIQUE parcial (partido_id, client_key) vive en cleanup-orphans; acá solo
 * lo aprovechamos. Requiere `partidoId` y `clientKey` en `data`.
 */
export async function saveIncidenciaIdempotente(
  repo: Repository<IncidenciaPartido>,
  data: DeepPartial<IncidenciaPartido>,
): Promise<IncidenciaPartido> {
  const clientKey = (data.clientKey as string | null | undefined) ?? null;
  const partidoId = data.partidoId as string;

  if (clientKey) {
    const existente = await repo.findOne({ where: { partidoId, clientKey } });
    if (existente) return existente;
  }

  try {
    return await repo.save(repo.create(data));
  } catch (err) {
    if (clientKey && isPgUniqueViolation(err)) {
      const existente = await repo.findOne({ where: { partidoId, clientKey } });
      if (existente) return existente;
    }
    throw err;
  }
}
