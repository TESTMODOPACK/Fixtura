/**
 * Cálculo de la tabla de posiciones de un torneo. Lógica PURA compartida
 * entre el portal público (PublicService) y el panel admin
 * (TorneosAdminService) — sin esto cada vista calcularía distinto.
 *
 * Reglas:
 *   - Solo cuentan partidos ya jugados. El caller filtra los estados
 *     (FINALIZADO / WALKOVER) antes de pasar la lista.
 *   - Puntos configurables por torneo (victoria / empate / derrota).
 *   - Orden por tiebreakers configurables (Sprint 12 + AUDIT-4):
 *       pts → puntos
 *       dg  → diferencia de gol
 *       gf  → goles a favor
 *       gc  → goles en contra (MENOS es mejor)
 *       pg  → partidos ganados
 *       ed  → enfrentamiento directo (head-to-head)
 *       nombre → alfabético (último recurso, determinístico)
 *     Default: ['pts','dg','gf','nombre'].
 */

export interface EquipoParaTabla {
  id: string;
  nombre: string;
  slug: string;
  escudoUrl: string | null;
}

export interface PartidoParaTabla {
  equipoLocalId: string;
  equipoVisitaId: string;
  golesLocal: number | null;
  golesVisita: number | null;
}

export interface ConfigTabla {
  puntosVictoria: number;
  puntosEmpate: number;
  puntosDerrota: number;
  tiebreakers: string[];
}

export interface FilaPosicion {
  posicion: number;
  equipoId: string;
  equipoNombre: string;
  equipoSlug: string;
  escudoUrl: string | null;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
}

const TIEBREAKERS_DEFAULT = ['pts', 'dg', 'gf', 'nombre'];

export function calcularTablaPosiciones(
  equipos: EquipoParaTabla[],
  partidos: PartidoParaTabla[],
  config: ConfigTabla,
): FilaPosicion[] {
  const stats = new Map<
    string,
    { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number }
  >();
  for (const eq of equipos) {
    stats.set(eq.id, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });
  }

  for (const p of partidos) {
    const gl = p.golesLocal ?? 0;
    const gv = p.golesVisita ?? 0;
    const sL = stats.get(p.equipoLocalId);
    const sV = stats.get(p.equipoVisitaId);
    if (!sL || !sV) continue;
    sL.pj++;
    sV.pj++;
    sL.gf += gl;
    sL.gc += gv;
    sV.gf += gv;
    sV.gc += gl;
    if (gl > gv) {
      sL.pg++;
      sV.pp++;
    } else if (gl < gv) {
      sV.pg++;
      sL.pp++;
    } else {
      sL.pe++;
      sV.pe++;
    }
  }

  const filas: FilaPosicion[] = equipos.map((eq) => {
    const s = stats.get(eq.id)!;
    return {
      posicion: 0,
      equipoId: eq.id,
      equipoNombre: eq.nombre,
      equipoSlug: eq.slug,
      escudoUrl: eq.escudoUrl,
      pj: s.pj,
      pg: s.pg,
      pe: s.pe,
      pp: s.pp,
      gf: s.gf,
      gc: s.gc,
      dg: s.gf - s.gc,
      pts:
        s.pg * config.puntosVictoria +
        s.pe * config.puntosEmpate +
        s.pp * config.puntosDerrota,
    };
  });

  const orden =
    Array.isArray(config.tiebreakers) && config.tiebreakers.length > 0
      ? config.tiebreakers
      : TIEBREAKERS_DEFAULT;

  const headToHead = calcularHeadToHead(partidos, config);

  filas.sort((a, b) => {
    for (const key of orden) {
      const cmp = compararTiebreaker(a, b, key, headToHead);
      if (cmp !== 0) return cmp;
    }
    return a.equipoNombre.localeCompare(b.equipoNombre);
  });

  return filas.map((f, idx) => ({ ...f, posicion: idx + 1 }));
}

/**
 * Compara dos filas según un criterio. >0 si b va antes que a, <0 si a va
 * antes. Casi todos DESC (mayor es mejor) salvo `gc` y `nombre`.
 */
function compararTiebreaker(
  a: FilaPosicion,
  b: FilaPosicion,
  key: string,
  headToHead: Map<string, Map<string, number>>,
): number {
  switch (key) {
    case 'pts':
      return b.pts - a.pts;
    case 'dg':
      return b.dg - a.dg;
    case 'gf':
      return b.gf - a.gf;
    case 'gc':
      return a.gc - b.gc;
    case 'pg':
      return b.pg - a.pg;
    case 'ed': {
      const ptsAvsB = headToHead.get(a.equipoId)?.get(b.equipoId) ?? 0;
      const ptsBvsA = headToHead.get(b.equipoId)?.get(a.equipoId) ?? 0;
      return ptsBvsA - ptsAvsB;
    }
    case 'nombre':
      return a.equipoNombre.localeCompare(b.equipoNombre);
    default:
      return 0;
  }
}

/**
 * Precomputa puntos head-to-head para el tiebreaker 'ed'.
 * headToHead[A][B] = puntos que A hizo CONTRA B en los partidos entre ellos.
 */
function calcularHeadToHead(
  partidos: PartidoParaTabla[],
  config: ConfigTabla,
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  const sumar = (de: string, contra: string, pts: number): void => {
    let inner = m.get(de);
    if (!inner) {
      inner = new Map();
      m.set(de, inner);
    }
    inner.set(contra, (inner.get(contra) ?? 0) + pts);
  };
  for (const p of partidos) {
    const gl = p.golesLocal ?? 0;
    const gv = p.golesVisita ?? 0;
    if (gl > gv) {
      sumar(p.equipoLocalId, p.equipoVisitaId, config.puntosVictoria);
      sumar(p.equipoVisitaId, p.equipoLocalId, config.puntosDerrota);
    } else if (gl < gv) {
      sumar(p.equipoVisitaId, p.equipoLocalId, config.puntosVictoria);
      sumar(p.equipoLocalId, p.equipoVisitaId, config.puntosDerrota);
    } else {
      sumar(p.equipoLocalId, p.equipoVisitaId, config.puntosEmpate);
      sumar(p.equipoVisitaId, p.equipoLocalId, config.puntosEmpate);
    }
  }
  return m;
}
