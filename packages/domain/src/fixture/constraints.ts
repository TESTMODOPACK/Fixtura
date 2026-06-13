import type { EquipoFixture, FixtureGenerado, PartidoFixture } from './types';

/**
 * Sprint 15 — Constraints avanzados sobre el fixture generado por Berger.
 *
 * Berger produce un fixture válido (todos juegan contra todos) pero no
 * optimiza dos restricciones operativas:
 *
 *   1. "No 3 locales seguidos": ningún equipo debería tener más de 2
 *      partidos consecutivos como local. Berger tiende a generar rachas
 *      largas, especialmente en torneos chicos.
 *
 *   2. "Equipos que comparten cancha no simultáneos": si dos equipos
 *      juegan en la misma cancha, no deben hacerlo en la misma fecha
 *      como local — uno tendría que ser visita o no jugar.
 *
 * Estrategia: swap de localía. Si detectamos un equipo con 3 locales
 * seguidos, intentamos invertir local↔visita en uno de los 3 partidos
 * (preferentemente el del medio) sin generar otra violación.
 *
 * Es un best-effort. Para fixtures imposibles (ej: liga muy chica con
 * todos en la misma cancha) devolvemos `warnings` y dejamos al admin
 * resolver manualmente.
 */

export interface ConstraintsInput {
  fixture: FixtureGenerado;
  equipos: EquipoFixture[];
  /**
   * Mapa opcional: equipo.id → canchaId. Si dos equipos tienen la misma
   * canchaId y juegan ambos como local en la misma fecha → conflicto.
   */
  canchaPorEquipo?: Record<string, string | null>;
  /** Cuántos locales seguidos máximo. Default 2. */
  maxLocalesSeguidos?: number;
}

export interface ConstraintsResult {
  fixture: FixtureGenerado;
  swapsAplicados: number;
  warnings: string[];
}

export function aplicarConstraintsFixture(input: ConstraintsInput): ConstraintsResult {
  const maxLocales = input.maxLocalesSeguidos ?? 2;
  const canchaPorEquipo = input.canchaPorEquipo ?? {};
  const partidos = input.fixture.partidos.map((p) => ({ ...p }));
  const warnings: string[] = [];
  let swapsAplicados = 0;

  const totalFechas = input.fixture.fechas;

  // ── Iterar varias pasadas hasta no mejorar más, con límite de
  // iteraciones para evitar loops infinitos.
  const MAX_ITER = 5;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let cambios = 0;

    // ── 1. Conflicto cancha compartida en misma fecha ───────────────
    for (let fecha = 1; fecha <= totalFechas; fecha++) {
      const ps = partidos.filter((p) => p.fechaNumero === fecha);
      const localesPorCancha = new Map<string, PartidoFixture[]>();
      for (const p of ps) {
        const cancha = canchaPorEquipo[p.equipoLocalId];
        if (!cancha) continue;
        const arr = localesPorCancha.get(cancha) ?? [];
        arr.push(p);
        localesPorCancha.set(cancha, arr);
      }
      for (const [cancha, conflictivos] of localesPorCancha) {
        if (conflictivos.length <= 1) continue;
        // Más de un local en la misma cancha — intentar swap en uno
        // (dejando un local). Preferimos swappear el partido cuyo
        // visitante NO comparte cancha con nadie en esta fecha.
        for (const p of conflictivos.slice(1)) {
          // Verificar que invertir no genere otro conflicto.
          const visitaCancha = canchaPorEquipo[p.equipoVisitaId];
          const yaHayLocalDeVisitaCancha =
            visitaCancha &&
            ps.some(
              (q) =>
                q !== p &&
                q.equipoLocalId !== p.equipoVisitaId &&
                canchaPorEquipo[q.equipoLocalId] === visitaCancha,
            );
          if (!visitaCancha || !yaHayLocalDeVisitaCancha) {
            // OK swappear: el visitante pasa a local.
            const tmp = p.equipoLocalId;
            p.equipoLocalId = p.equipoVisitaId;
            p.equipoVisitaId = tmp;
            cambios++;
            swapsAplicados++;
          }
        }
        const restantes = ps.filter(
          (q) => canchaPorEquipo[q.equipoLocalId] === cancha,
        ).length;
        if (restantes > 1) {
          warnings.push(
            `Fecha ${fecha}: ${restantes} partidos comparten cancha "${cancha}" como local. Ajusta manualmente la cancha o el horario.`,
          );
        }
      }
    }

    // ── 2. No N locales seguidos (default 2 → no 3 seguidos) ───────
    for (const equipo of input.equipos) {
      const partidosEquipo = partidos
        .filter(
          (p) =>
            p.equipoLocalId === equipo.id || p.equipoVisitaId === equipo.id,
        )
        .sort((a, b) => a.fechaNumero - b.fechaNumero);

      let racha = 0;
      for (let i = 0; i < partidosEquipo.length; i++) {
        const p = partidosEquipo[i]!;
        if (p.equipoLocalId === equipo.id) {
          racha++;
          if (racha > maxLocales) {
            // Intentar swappear este partido si no genera otro problema.
            if (puedeInvertirseSinConflicto(p, partidos, canchaPorEquipo)) {
              const tmp = p.equipoLocalId;
              p.equipoLocalId = p.equipoVisitaId;
              p.equipoVisitaId = tmp;
              racha = 0;
              cambios++;
              swapsAplicados++;
            }
            // Si no se puede swappear, dejamos que se acumule warning
            // al final del loop.
          }
        } else {
          racha = 0;
        }
      }
    }

    if (cambios === 0) break;
  }

  // ── 3. Generar warnings finales de rachas no resueltas ────────────
  for (const equipo of input.equipos) {
    const partidosEquipo = partidos
      .filter(
        (p) =>
          p.equipoLocalId === equipo.id || p.equipoVisitaId === equipo.id,
      )
      .sort((a, b) => a.fechaNumero - b.fechaNumero);
    let racha = 0;
    let rachaMax = 0;
    for (const p of partidosEquipo) {
      if (p.equipoLocalId === equipo.id) {
        racha++;
        rachaMax = Math.max(rachaMax, racha);
      } else racha = 0;
    }
    if (rachaMax > maxLocales) {
      warnings.push(
        `Equipo "${equipo.nombre}": ${rachaMax} partidos seguidos como local (max recomendado: ${maxLocales}).`,
      );
    }
  }

  return {
    fixture: {
      ...input.fixture,
      partidos,
    },
    swapsAplicados,
    warnings,
  };
}

/**
 * Verifica si invertir local↔visita en `p` genera un conflicto de
 * cancha en su fecha (alguien más ya es local en esa cancha).
 */
function puedeInvertirseSinConflicto(
  p: PartidoFixture,
  todos: PartidoFixture[],
  canchaPorEquipo: Record<string, string | null>,
): boolean {
  const visitaCancha = canchaPorEquipo[p.equipoVisitaId];
  if (!visitaCancha) return true;
  const otroLocalMismaCancha = todos.some(
    (q) =>
      q !== p &&
      q.fechaNumero === p.fechaNumero &&
      canchaPorEquipo[q.equipoLocalId] === visitaCancha,
  );
  return !otroLocalMismaCancha;
}
