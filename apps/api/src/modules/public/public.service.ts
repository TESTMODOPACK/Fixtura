import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  FilaTabla,
  FixturePublico,
  PartidoPublico,
  Ranking,
  RankingItem,
  ResumenLiga,
  TablaPosiciones,
  TorneoPublico,
} from '@fixtura/types';

import { Designacion } from '../competition/entities/designacion.entity';
import { Equipo } from '../competition/entities/equipo.entity';
import { Fecha } from '../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../competition/entities/incidencia-partido.entity';
import { Partido } from '../competition/entities/partido.entity';
import { Torneo } from '../competition/entities/torneo.entity';

/**
 * Servicio del portal público. Lee directamente de la DB — sin mocks.
 *
 * El tenant context ya viene seteado por TenantContextInterceptor cuando
 * el request llega. RLS filtra los resultados al tenant correcto
 * automáticamente.
 */
@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
  ) {}

  // ─── Resumen home pública ────────────────────────────────────────
  async getResumen(slug: string): Promise<ResumenLiga> {
    const torneo = await this.findTorneoActivo(slug);
    const liga = torneo.tenant!;

    if (!torneo) {
      return {
        liga: this.toLigaPublica(liga),
        torneoActivo: null,
        proximaFecha: null,
        resultadosRecientes: [],
        topGoleadores: [],
      };
    }

    const torneoDto = await this.buildTorneoPublico(torneo);
    const proximaFechaData = await this.getProximaFecha(torneo.id);
    const resultadosRecientes = await this.getResultadosRecientes(torneo.id, 4);
    const topGoleadores = (await this.computeRanking(torneo.id, 'GOLEADORES')).slice(0, 5);

    return {
      liga: this.toLigaPublica(liga),
      torneoActivo: torneoDto,
      proximaFecha: proximaFechaData,
      resultadosRecientes,
      topGoleadores,
    };
  }

  // ─── Tabla de posiciones ──────────────────────────────────────────
  async getTabla(slug: string): Promise<TablaPosiciones> {
    const torneo = await this.findTorneoActivo(slug);
    const torneoDto = await this.buildTorneoPublico(torneo);

    const equipos = await this.equipoRepo.find({ where: { torneoId: torneo.id } });
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId: torneo.id })
      .andWhere('p.estado = :estado', { estado: 'FINALIZADO' })
      .getMany();

    // Calcular stats por equipo en JS — simple y suficiente para volúmenes
    // de torneo amateur (8-20 equipos × 14-28 partidos). Para escala mayor
    // se mueve a una vista materializada.
    const stats = new Map<string, { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number }>();
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

    const filasSinOrdenar: FilaTabla[] = equipos.map((eq) => {
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
        pts: s.pg * torneo.puntosVictoria + s.pe * torneo.puntosEmpate + s.pp * torneo.puntosDerrota,
      };
    });

    filasSinOrdenar.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.equipoNombre.localeCompare(b.equipoNombre);
    });

    const filas = filasSinOrdenar.map((f, idx) => ({ ...f, posicion: idx + 1 }));

    return {
      torneo: torneoDto,
      filas,
      actualizadaAt: new Date().toISOString(),
    };
  }

  // ─── Fixture ──────────────────────────────────────────────────────
  async getFixture(slug: string): Promise<FixturePublico> {
    const torneo = await this.findTorneoActivo(slug);
    const torneoDto = await this.buildTorneoPublico(torneo);

    const fechas = await this.fechaRepo.find({
      where: { torneoId: torneo.id },
      order: { numero: 'ASC' },
    });

    const fechaIds = fechas.map((f) => f.id);
    const partidos = fechaIds.length
      ? await this.partidoRepo.find({
          where: fechaIds.map((id) => ({ fechaId: id })),
          relations: { equipoLocal: true, equipoVisita: true, fecha: true },
          order: { fechaHora: 'ASC' },
        })
      : [];

    const partidosPorFecha = new Map<string, Partido[]>();
    for (const p of partidos) {
      const arr = partidosPorFecha.get(p.fechaId) ?? [];
      arr.push(p);
      partidosPorFecha.set(p.fechaId, arr);
    }

    // Cargar designaciones confirmadas / asistidas para los partidos del
    // fixture en una sola query, agrupadas por partido_id.
    const arbitrosPorPartido = await this.cargarArbitrosPublicos(
      partidos.map((p) => p.id),
    );

    return {
      torneo: torneoDto,
      fechas: fechas.map((f) => ({
        numero: f.numero,
        etiqueta: f.etiqueta ?? `Fecha ${f.numero}`,
        partidos: (partidosPorFecha.get(f.id) ?? []).map((p) => ({
          ...this.toPartidoPublico(p, f.numero),
          arbitros: arbitrosPorPartido.get(p.id) ?? [],
        })),
      })),
    };
  }

  /**
   * Carga los árbitros visibles públicamente para una lista de partidos.
   * Sólo expone nombre + apellido + rol de designaciones CONFIRMADAS,
   * ASISTIO o PROPUESTA (para no esperar a la confirmación). NO expone
   * carnet, tarifa, contacto — eso queda en admin.
   */
  private async cargarArbitrosPublicos(
    partidoIds: string[],
  ): Promise<Map<string, PartidoPublico['arbitros']>> {
    const out = new Map<string, PartidoPublico['arbitros']>();
    if (partidoIds.length === 0) return out;

    const rows = await this.designacionRepo
      .createQueryBuilder('d')
      .leftJoin('d.personal', 'personal')
      .select([
        'd.partido_id AS "partidoId"',
        'd.rol_asignado AS "rol"',
        'd.estado AS "estado"',
        'personal.nombre AS "nombre"',
        'personal.apellido AS "apellido"',
      ])
      .where('d.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere(`d.estado IN ('PROPUESTA','CONFIRMADA','ASISTIO')`)
      .getRawMany<{
        partidoId: string;
        rol: PartidoPublico['arbitros'][number]['rol'];
        estado: string;
        nombre: string;
        apellido: string;
      }>();

    for (const r of rows) {
      const arr = out.get(r.partidoId) ?? [];
      arr.push({ nombre: r.nombre, apellido: r.apellido, rol: r.rol });
      out.set(r.partidoId, arr);
    }
    return out;
  }

  // ─── Rankings ─────────────────────────────────────────────────────
  async getRanking(slug: string, tipo: Ranking['tipo']): Promise<Ranking> {
    const torneo = await this.findTorneoActivo(slug);
    const torneoDto = await this.buildTorneoPublico(torneo);
    const items = await this.computeRanking(torneo.id, tipo);
    return { torneo: torneoDto, tipo, items };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Busca el torneo "activo" más reciente del tenant. Si no hay torneo
   * con estado ACTIVO, devuelve el último creado (incluso DRAFT).
   * Esto permite que el portal muestre algo siempre que haya al menos
   * un torneo en la DB.
   */
  private async findTorneoActivo(slug: string): Promise<Torneo & { tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> } }> {
    // Buscar tenant primero
    const torneo = await this.torneoRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.tenant', 'tenant')
      .where('tenant.slug = :slug', { slug })
      .orderBy(`CASE WHEN t.estado = 'ACTIVO' THEN 0 WHEN t.estado = 'DRAFT' THEN 1 ELSE 2 END`)
      .addOrderBy('t.created_at', 'DESC')
      .getOne();

    if (!torneo) {
      throw new NotFoundException(`Liga "${slug}" no tiene torneos creados aún`);
    }
    return torneo as Torneo & {
      tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> };
    };
  }

  private async buildTorneoPublico(torneo: Torneo): Promise<TorneoPublico> {
    const fechas = await this.fechaRepo.find({ where: { torneoId: torneo.id } });
    const fechasFinalizadas = fechas.filter((f) => f.estado === 'FINALIZADA').length;

    return {
      id: torneo.id,
      nombre: torneo.nombre,
      temporada: String(new Date(torneo.createdAt).getFullYear()),
      estado: torneo.estado,
      fechaActual: fechasFinalizadas,
      fechasTotales: fechas.length,
    };
  }

  private async getProximaFecha(
    torneoId: string,
  ): Promise<ResumenLiga['proximaFecha']> {
    const fecha = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`f.estado IN ('PROGRAMADA', 'EN_CURSO')`)
      .orderBy('f.numero', 'ASC')
      .getOne();

    if (!fecha) return null;

    const partidos = await this.partidoRepo.find({
      where: { fechaId: fecha.id },
      relations: { equipoLocal: true, equipoVisita: true },
      order: { fechaHora: 'ASC' },
    });

    return {
      numero: fecha.numero,
      etiqueta: fecha.etiqueta ?? `Fecha ${fecha.numero}`,
      partidos: partidos.map((p) => this.toPartidoPublico(p, fecha.numero)),
    };
  }

  private async getResultadosRecientes(torneoId: string, limit: number): Promise<PartidoPublico[]> {
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.fecha', 'f')
      .innerJoinAndSelect('p.equipoLocal', 'eL')
      .innerJoinAndSelect('p.equipoVisita', 'eV')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('p.estado = :estado', { estado: 'FINALIZADO' })
      .orderBy('p.fecha_hora', 'DESC')
      .limit(limit)
      .getMany();

    return partidos.map((p) => this.toPartidoPublico(p, p.fecha!.numero));
  }

  private toPartidoPublico(p: Partido, fechaNumero: number): PartidoPublico {
    return {
      id: p.id,
      fechaNumero,
      fechaHora: (p.fechaHora ?? new Date()).toISOString(),
      estado: p.estado,
      local: {
        equipoId: p.equipoLocalId,
        nombre: p.equipoLocal?.nombre ?? '',
        slug: p.equipoLocal?.slug ?? '',
        escudoUrl: p.equipoLocal?.escudoUrl ?? null,
        goles: p.golesLocal,
      },
      visita: {
        equipoId: p.equipoVisitaId,
        nombre: p.equipoVisita?.nombre ?? '',
        slug: p.equipoVisita?.slug ?? '',
        escudoUrl: p.equipoVisita?.escudoUrl ?? null,
        goles: p.golesVisita,
      },
      canchaNombre: p.canchaNombre,
      // Las designaciones se enriquecen sólo en endpoints que lo necesiten
      // (ver getFixture). Aquí dejamos default vacío para no cargar
      // designaciones en queries que no las muestran (resumen, recientes).
      arbitros: [],
    };
  }

  private toLigaPublica(t: {
    id: string;
    slug: string;
    nombre: string;
    brandingJson: Record<string, unknown>;
  }): ResumenLiga['liga'] {
    return {
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      brandingJson: t.brandingJson ?? {},
    };
  }

  /**
   * Computa ranking de jugadores por tipo. Hace SQL crudo porque la
   * agrupación con joins múltiples es más eficiente que el query builder.
   */
  private async computeRanking(torneoId: string, tipo: Ranking['tipo']): Promise<RankingItem[]> {
    const tipoIncidencia = tipo === 'MVP' ? 'MVP' : tipo === 'ASISTENCIAS' ? 'ASISTENCIA' : 'GOL';

    // Para FAIR_PLAY más adelante: contar AMARILLA + ROJA × 3 invertido.
    // Para ahora solo soportamos GOLEADORES / ASISTENCIAS / MVP.
    const rows = (await this.incidenciaRepo
      .createQueryBuilder('i')
      .select('i.jugador_inscrito_id', 'jugadorId')
      .addSelect('j.nombre', 'nombre')
      .addSelect('j.apellido', 'apellido')
      .addSelect('e.nombre', 'equipoNombre')
      .addSelect('e.slug', 'equipoSlug')
      .addSelect('COUNT(*)::int', 'valor')
      .innerJoin('jugadores_inscritos', 'j', 'j.id = i.jugador_inscrito_id')
      .innerJoin('equipos', 'e', 'e.id = j.equipo_id')
      .innerJoin('partidos', 'p', 'p.id = i.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('i.tipo = :tipo', { tipo: tipoIncidencia })
      .andWhere('i.jugador_inscrito_id IS NOT NULL')
      .groupBy('i.jugador_inscrito_id, j.nombre, j.apellido, e.nombre, e.slug')
      .orderBy('valor', 'DESC')
      .addOrderBy('j.apellido', 'ASC')
      .limit(50)
      .getRawMany()) as Array<{
      jugadorId: string;
      nombre: string;
      apellido: string;
      equipoNombre: string;
      equipoSlug: string;
      valor: number;
    }>;

    return rows.map((r, idx) => ({
      posicion: idx + 1,
      jugadorId: r.jugadorId,
      jugadorNombre: `${r.nombre} ${r.apellido}`,
      jugadorSlug: `${r.nombre}-${r.apellido}`.toLowerCase().replace(/\s+/g, '-'),
      fotoUrl: null,
      equipoNombre: r.equipoNombre,
      equipoSlug: r.equipoSlug,
      valor: r.valor,
    }));
  }
}
