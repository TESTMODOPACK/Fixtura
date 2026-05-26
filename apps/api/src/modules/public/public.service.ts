import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  FixturePublico,
  LigaPublica,
  PartidoPublico,
  Ranking,
  RankingItem,
  ResumenLiga,
  TablaPosiciones,
  TorneoPublico,
} from '@fixtura/types';

/**
 * Servicio MOCK del portal público.
 *
 * Devuelve data plausible para una liga "Liga Demo" con un torneo
 * "Apertura 2026" (8 equipos, fechas 1–4 jugadas, fecha 5 próxima).
 * Esto permite construir y deployar el portal antes de tener las
 * tablas de torneos/partidos en la DB.
 *
 * Cuando lleguen las migraciones del Sprint 2 (torneos, equipos,
 * partidos, incidencias), reemplazamos cada método por queries reales
 * y mantenemos los contratos (DTOs) intactos.
 */
@Injectable()
export class PublicService {
  private readonly LIGA_DEMO: LigaPublica = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'liga-demo',
    nombre: 'Liga Demo',
    brandingJson: {},
  };

  private readonly TORNEO: TorneoPublico = {
    id: '00000000-0000-0000-0000-000000000002',
    nombre: 'Apertura 2026',
    temporada: '2026',
    estado: 'ACTIVO',
    fechaActual: 4,
    fechasTotales: 14,
  };

  private readonly EQUIPOS = [
    { id: 'e1', nombre: 'Halcones FC', slug: 'halcones-fc' },
    { id: 'e2', nombre: 'Pumas Unidos', slug: 'pumas-unidos' },
    { id: 'e3', nombre: 'Zorros del Valle', slug: 'zorros-del-valle' },
    { id: 'e4', nombre: 'Cóndores Sur', slug: 'condores-sur' },
    { id: 'e5', nombre: 'Estrella Polar', slug: 'estrella-polar' },
    { id: 'e6', nombre: 'Rayo Andino', slug: 'rayo-andino' },
    { id: 'e7', nombre: 'Trueno FC', slug: 'trueno-fc' },
    { id: 'e8', nombre: 'Lobos Negros', slug: 'lobos-negros' },
  ];

  private getLigaOrFail(slug: string): LigaPublica {
    if (slug !== this.LIGA_DEMO.slug) {
      throw new NotFoundException(`Liga "${slug}" no encontrada`);
    }
    return this.LIGA_DEMO;
  }

  // ─── Resumen (home pública) ────────────────────────────────────────
  async getResumen(slug: string): Promise<ResumenLiga> {
    const liga = this.getLigaOrFail(slug);
    return {
      liga,
      torneoActivo: this.TORNEO,
      proximaFecha: {
        numero: 5,
        etiqueta: 'Fecha 5 · Sábado 30 y Domingo 31 de mayo',
        partidos: this.mkPartidos(5, 'PROGRAMADO'),
      },
      resultadosRecientes: this.mkPartidos(4, 'FINALIZADO').slice(0, 4),
      topGoleadores: this.mkRankingItems('GOLEADORES').slice(0, 5),
    };
  }

  // ─── Tabla de posiciones ──────────────────────────────────────────
  async getTabla(slug: string): Promise<TablaPosiciones> {
    this.getLigaOrFail(slug);
    // Datos plausibles, ordenados por pts desc, dg desc, gf desc
    const datos = [
      { i: 0, pj: 4, pg: 3, pe: 1, pp: 0, gf: 9, gc: 3 },
      { i: 1, pj: 4, pg: 3, pe: 0, pp: 1, gf: 8, gc: 4 },
      { i: 2, pj: 4, pg: 2, pe: 2, pp: 0, gf: 7, gc: 4 },
      { i: 3, pj: 4, pg: 2, pe: 1, pp: 1, gf: 6, gc: 5 },
      { i: 4, pj: 4, pg: 1, pe: 2, pp: 1, gf: 5, gc: 5 },
      { i: 5, pj: 4, pg: 1, pe: 1, pp: 2, gf: 4, gc: 7 },
      { i: 6, pj: 4, pg: 0, pe: 2, pp: 2, gf: 3, gc: 7 },
      { i: 7, pj: 4, pg: 0, pe: 1, pp: 3, gf: 2, gc: 9 },
    ];

    const filas = datos.map((d, idx) => {
      const eq = this.EQUIPOS[d.i]!;
      return {
        posicion: idx + 1,
        equipoId: eq.id,
        equipoNombre: eq.nombre,
        equipoSlug: eq.slug,
        escudoUrl: null,
        pj: d.pj,
        pg: d.pg,
        pe: d.pe,
        pp: d.pp,
        gf: d.gf,
        gc: d.gc,
        dg: d.gf - d.gc,
        pts: d.pg * 3 + d.pe,
      };
    });

    return {
      torneo: this.TORNEO,
      filas,
      actualizadaAt: new Date().toISOString(),
    };
  }

  // ─── Fixture completo ─────────────────────────────────────────────
  async getFixture(slug: string): Promise<FixturePublico> {
    this.getLigaOrFail(slug);
    const fechas = [];
    for (let n = 1; n <= 7; n++) {
      const estado: PartidoPublico['estado'] = n <= 4 ? 'FINALIZADO' : 'PROGRAMADO';
      fechas.push({
        numero: n,
        etiqueta: `Fecha ${n}`,
        partidos: this.mkPartidos(n, estado),
      });
    }
    return { torneo: this.TORNEO, fechas };
  }

  // ─── Rankings ─────────────────────────────────────────────────────
  async getRanking(slug: string, tipo: Ranking['tipo']): Promise<Ranking> {
    this.getLigaOrFail(slug);
    return {
      torneo: this.TORNEO,
      tipo,
      items: this.mkRankingItems(tipo),
    };
  }

  // ─── Helpers de mock ──────────────────────────────────────────────
  private mkPartidos(fechaNumero: number, estado: PartidoPublico['estado']): PartidoPublico[] {
    // Round Robin: en cada fecha N, equipo 0 vs N, después rotación.
    // Como esto es solo demo, generamos 4 partidos por fecha con pairs fijos por fecha.
    const pairings: Array<[number, number]>[] = [
      // fecha 1
      [
        [0, 7],
        [1, 6],
        [2, 5],
        [3, 4],
      ],
      // fecha 2
      [
        [0, 6],
        [7, 5],
        [1, 4],
        [2, 3],
      ],
      // fecha 3
      [
        [0, 5],
        [6, 4],
        [7, 3],
        [1, 2],
      ],
      // fecha 4
      [
        [0, 4],
        [5, 3],
        [6, 2],
        [7, 1],
      ],
      // fecha 5
      [
        [0, 3],
        [4, 2],
        [5, 1],
        [6, 7],
      ],
      // fecha 6
      [
        [0, 2],
        [3, 1],
        [4, 7],
        [5, 6],
      ],
      // fecha 7
      [
        [0, 1],
        [2, 7],
        [3, 6],
        [4, 5],
      ],
    ];
    const pairs = pairings[fechaNumero - 1] ?? pairings[0]!;

    // Hora plausible
    const baseDate = new Date(2026, 4, 9 + (fechaNumero - 1) * 7); // mayo
    const horarios = ['10:00', '12:00', '14:00', '16:00'];

    return pairs.map(([localIdx, visitaIdx], i) => {
      const local = this.EQUIPOS[localIdx]!;
      const visita = this.EQUIPOS[visitaIdx]!;
      const fechaHora = new Date(baseDate);
      const [h, m] = horarios[i]!.split(':').map(Number);
      fechaHora.setHours(h!, m!, 0, 0);

      const golesLocal = estado === 'FINALIZADO' ? ((localIdx + i) % 4) : null;
      const golesVisita = estado === 'FINALIZADO' ? ((visitaIdx + i + 1) % 3) : null;

      return {
        id: `partido-${fechaNumero}-${i}`,
        fechaNumero,
        fechaHora: fechaHora.toISOString(),
        estado,
        local: {
          equipoId: local.id,
          nombre: local.nombre,
          slug: local.slug,
          escudoUrl: null,
          goles: golesLocal,
        },
        visita: {
          equipoId: visita.id,
          nombre: visita.nombre,
          slug: visita.slug,
          escudoUrl: null,
          goles: golesVisita,
        },
        canchaNombre: `Cancha ${i + 1}`,
      };
    });
  }

  private mkRankingItems(tipo: Ranking['tipo']): RankingItem[] {
    const jugadores = [
      { nombre: 'Carlos Pérez', club: 0, valores: { GOLEADORES: 7, ASISTENCIAS: 3, MVP: 2, FAIR_PLAY: 12 } },
      { nombre: 'Diego López', club: 1, valores: { GOLEADORES: 6, ASISTENCIAS: 5, MVP: 3, FAIR_PLAY: 11 } },
      { nombre: 'Matías Soto', club: 2, valores: { GOLEADORES: 5, ASISTENCIAS: 2, MVP: 1, FAIR_PLAY: 10 } },
      { nombre: 'Juan Méndez', club: 3, valores: { GOLEADORES: 5, ASISTENCIAS: 4, MVP: 2, FAIR_PLAY: 9 } },
      { nombre: 'Pablo Rojas', club: 4, valores: { GOLEADORES: 4, ASISTENCIAS: 6, MVP: 0, FAIR_PLAY: 8 } },
      { nombre: 'Andrés Vega', club: 5, valores: { GOLEADORES: 4, ASISTENCIAS: 3, MVP: 1, FAIR_PLAY: 7 } },
      { nombre: 'Felipe Castro', club: 6, valores: { GOLEADORES: 3, ASISTENCIAS: 2, MVP: 0, FAIR_PLAY: 6 } },
      { nombre: 'Sebastián Núñez', club: 7, valores: { GOLEADORES: 3, ASISTENCIAS: 4, MVP: 2, FAIR_PLAY: 5 } },
    ];

    return jugadores
      .map((j, idx) => ({
        jugadorIdx: idx,
        jugador: j,
        valor: j.valores[tipo],
      }))
      .sort((a, b) => b.valor - a.valor)
      .map((it, posicion) => {
        const eq = this.EQUIPOS[it.jugador.club]!;
        return {
          posicion: posicion + 1,
          jugadorId: `jugador-${it.jugadorIdx}`,
          jugadorNombre: it.jugador.nombre,
          jugadorSlug: it.jugador.nombre.toLowerCase().replace(/\s+/g, '-'),
          fotoUrl: null,
          equipoNombre: eq.nombre,
          equipoSlug: eq.slug,
          valor: it.valor,
        };
      });
  }
}
