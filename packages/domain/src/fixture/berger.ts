import type { EquipoFixture, FixtureGenerado, FixtureOptions, PartidoFixture } from './types';

/**
 * Generador de fixture estilo Round Robin usando la tabla de Berger.
 *
 * Algoritmo clásico: si N es impar, se agrega un equipo "BYE" virtual y el
 * equipo enfrentado al BYE descansa esa fecha. Para N pares, se fijan el
 * primer equipo y se rotan los demás en sentido horario. Esto genera
 * (N-1) fechas si ruedas = 1, o 2*(N-1) si ruedas = 2 (ida y vuelta).
 *
 * No incluye las restricciones de "no 3 locales seguidos" ni "equipos que
 * comparten cancha no simultáneos" — esas se aplican en una capa superior
 * (FixtureEngineService) que recibe este output y reasigna conflictos.
 */
export function generarFixtureBerger(
  equiposInput: EquipoFixture[],
  opts: FixtureOptions = { ruedas: 1 },
): FixtureGenerado {
  if (equiposInput.length < 2) {
    throw new Error('Se requieren al menos 2 equipos para generar fixture');
  }

  const BYE_ID = '__BYE__';
  const equipos = [...equiposInput];
  const esImpar = equipos.length % 2 === 1;
  if (esImpar) {
    equipos.push({ id: BYE_ID, nombre: 'Libre' });
  }

  const n = equipos.length;
  const fechasPorRueda = n - 1;
  const partidos: PartidoFixture[] = [];
  const libresPorFecha: Record<number, string | null> = {};

  // Berger: fijar el primer equipo, rotar el resto.
  // Array de índices que rotará.
  const idx = Array.from({ length: n }, (_, i) => i);

  for (let rueda = 0; rueda < opts.ruedas; rueda++) {
    for (let fecha = 0; fecha < fechasPorRueda; fecha++) {
      const fechaGlobal = rueda * fechasPorRueda + fecha + 1;
      libresPorFecha[fechaGlobal] = null;

      for (let i = 0; i < n / 2; i++) {
        const localIdx = idx[i]!;
        const visitaIdx = idx[n - 1 - i]!;
        const local = equipos[localIdx]!;
        const visita = equipos[visitaIdx]!;

        // Alternar localía en la segunda rueda (vuelta).
        const swap = rueda === 1;
        const equipoLocal = swap ? visita : local;
        const equipoVisita = swap ? local : visita;

        if (equipoLocal.id === BYE_ID || equipoVisita.id === BYE_ID) {
          libresPorFecha[fechaGlobal] =
            equipoLocal.id === BYE_ID ? equipoVisita.id : equipoLocal.id;
          continue;
        }

        partidos.push({
          fechaNumero: fechaGlobal,
          equipoLocalId: equipoLocal.id,
          equipoVisitaId: equipoVisita.id,
          esLibre: false,
        });
      }

      // Rotar todos menos el primero.
      const last = idx.pop()!;
      idx.splice(1, 0, last);
    }
  }

  return {
    fechas: fechasPorRueda * opts.ruedas,
    partidos,
    libresPorFecha,
  };
}
