import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { calcularTablaPosiciones } from '@fixtura/domain';
import type {
  BracketPlayoffResponse,
  GrupoInscripcionItem,
  LlavePlayoffAdmin,
  LlavePlayoffSlot,
} from '@fixtura/types';

/** Llave de ronda 1 en construcción: visitaId null = bye (el local avanza). */
type ParRonda1 = { localId: string; visitaId: string | null };

import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { LlavePlayoff } from '../../competition/entities/llave-playoff.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { GruposAdminService } from './grupos-admin.service';

/**
 * Fase Playoffs (P3) — siembra y gestión del bracket de eliminación directa
 * de un torneo con formato PLAYOFFS.
 *
 * Siembra: sorteo aleatorio (shuffle Fisher-Yates). Con un número de equipos
 * que no es potencia de 2 se agregan byes (el equipo pasa directo a la ronda
 * siguiente); los byes se reparten espaciados para que dos byes no se crucen
 * en la primera ronda jugada.
 *
 * Topología implícita: la llave (ronda R, orden O) alimenta la (ronda R+1,
 * orden floor(O/2)); el ganador entra como local si O es par, visita si impar.
 * El partido por el 3er puesto vive en la ronda final (orden 1, esTercerPuesto)
 * y lo alimentan los perdedores de las dos semifinales (lo resuelve P4).
 *
 * Invariante: sembrar/re-sembrar/limpiar solo si el torneo NO tiene fixture
 * generado todavía (sin fechas). `partidos.llave_id` queda en SET NULL si se
 * borra la llave, pero re-sembrar con fixture armado dejaría partidos
 * huérfanos sin cruce — por eso se bloquea.
 */
@Injectable()
export class PlayoffsAdminService {
  private readonly logger = new Logger(PlayoffsAdminService.name);

  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(LlavePlayoff)
    private readonly llaveRepo: Repository<LlavePlayoff>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    private readonly gruposService: GruposAdminService,
  ) {}

  async getBracket(
    torneoId: string,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    const llaves = await this.llaveRepo.find({
      where: { torneoId, tenantId },
      order: { ronda: 'ASC', orden: 'ASC' },
    });
    const activas = await this.inscripcionesActivas(torneoId, tenantId);
    const inscMap = new Map(activas.map((i) => [i.id, i]));
    // Las llaves pueden referenciar inscripciones que dejaron de estar activas
    // (raro, pero defensivo): cargar también las referenciadas que falten.
    const refIds = new Set<string>();
    for (const l of llaves) {
      for (const id of [l.inscripcionLocalId, l.inscripcionVisitaId]) {
        if (id && !inscMap.has(id)) refIds.add(id);
      }
    }
    if (refIds.size > 0) {
      const extra = await this.inscRepo.find({
        where: { id: In([...refIds]), torneoId, tenantId },
        relations: { club: true },
      });
      for (const i of extra) inscMap.set(i.id, i);
    }

    const slot = (id: string | null): LlavePlayoffSlot => {
      if (!id) return null;
      const insc = inscMap.get(id);
      if (!insc) return null;
      return this.item(insc);
    };

    // Agrupar por ronda preservando el orden.
    const porRonda = new Map<number, LlavePlayoff[]>();
    for (const l of llaves) {
      const arr = porRonda.get(l.ronda) ?? [];
      arr.push(l);
      porRonda.set(l.ronda, arr);
    }
    const rondaMax = llaves.length > 0 ? Math.max(...llaves.map((l) => l.ronda)) : 0;

    const rondas = [...porRonda.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ronda, ls]) => {
        // Cantidad de cruces "reales" de la ronda (sin contar el 3er puesto)
        // para nombrarla (Final / Semifinal / Cuartos…).
        const cruces = ls.filter((l) => !l.esTercerPuesto).length;
        const adminLlaves: LlavePlayoffAdmin[] = ls.map((l) => ({
          id: l.id,
          ronda: l.ronda,
          orden: l.orden,
          nombre: l.nombre,
          esTercerPuesto: l.esTercerPuesto,
          local: slot(l.inscripcionLocalId),
          visita: slot(l.inscripcionVisitaId),
          ganadorInscripcionId: l.ganadorInscripcionId,
        }));
        return {
          ronda,
          nombre: this.nombreRonda(cruces),
          esRondaFinal: ronda === rondaMax,
          llaves: adminLlaves,
        };
      });

    return {
      sembrado: llaves.length > 0,
      idaVuelta: torneo.playoffIdaVuelta ?? false,
      tercerPuesto: torneo.playoffTercerPuesto ?? false,
      cantidadEquipos: activas.length,
      rondas,
      participantes: activas.map((i) => this.item(i)),
    };
  }

  @Transactional()
  async sortear(
    torneoId: string,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    this.assertFormatoPlayoffs(torneo);

    // Mixto "fase regular + playoffs": la siembra sale de la fase regular y el
    // fixture de la eliminatoria se agrega detrás de ella. Round robin → por
    // posición de la tabla; grupos → por los clasificados de cada grupo.
    if (this.esRoundRobinAPlayoffs(torneo)) {
      return this.sembrarDesdeTabla(torneo, tenantId);
    }
    if (this.esGruposAPlayoffs(torneo)) {
      return this.sembrarDesdeGrupos(torneo, tenantId);
    }

    // PLAYOFFS puro: siembra aleatoria; el fixture se genera aparte (generar()).
    await this.assertSinFixture(torneoId, tenantId, 're-sembrar el cuadro');
    const activas = await this.inscripcionesActivas(torneoId, tenantId);
    if (activas.length < 2) {
      throw new BadRequestException(
        'Se necesitan al menos 2 equipos inscritos para sembrar el cuadro.',
      );
    }

    // Orden aleatorio de seeds; el cuadro se arma con el orden estándar de
    // siembra (mismo helper que la siembra por tabla) para repartir los byes
    // entre las mejores posiciones y no amontonarlos.
    const seeds = this.shuffle(activas).map((i) => i.id);
    await this.llaveRepo.delete({ torneoId, tenantId });
    await this.armarYGuardarBracket(
      torneoId,
      tenantId,
      this.construirRonda1DesdeSeeds(seeds),
      torneo.playoffTercerPuesto,
    );
    this.logger.log(
      `[playoffs] torneo=${torneoId} sembrado (aleatorio): ${seeds.length} equipos`,
    );
    return this.getBracket(torneoId, tenantId);
  }

  /**
   * Siembra el cuadro por posición en la tabla (Mixto round robin → playoffs)
   * y genera el fixture de la eliminatoria agregándolo tras la fase regular.
   * Requiere la fase regular completa (sin partidos pendientes) y que no haya
   * un cuadro de playoffs ya generado (si lo hay, primero limpiar).
   */
  @Transactional()
  private async sembrarDesdeTabla(
    torneo: Torneo,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    const n = torneo.clasificanPlayoffs ?? 0;
    if (n < 2) {
      throw new BadRequestException(
        'Configura cuántos equipos clasifican a los playoffs (mínimo 2).',
      );
    }
    await this.assertFaseRegularLista(torneo, tenantId);

    const orden = await this.ordenPorTabla(torneo, tenantId);
    if (orden.length < n) {
      throw new BadRequestException(
        `Clasifican ${n} equipos pero la tabla tiene ${orden.length}. ` +
          'Ajusta cuántos clasifican o revisa las inscripciones.',
      );
    }
    this.logger.log(
      `[playoffs] torneo=${torneo.id} sembrado (tabla): ${n} clasificados`,
    );
    return this.finalizarSiembra(torneo, tenantId, orden.slice(0, n));
  }

  /**
   * Mixto "grupos + playoffs": siembra el cuadro con los `clasificanPorGrupo`
   * mejores de cada grupo y agrega el fixture de la eliminatoria tras la fase
   * de grupos. Ranking combinado: primero por posición en el grupo (todos los
   * 1° antes que los 2°…), luego por rendimiento (pts/dg/gf).
   */
  @Transactional()
  private async sembrarDesdeGrupos(
    torneo: Torneo,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    const porGrupo = torneo.clasificanPorGrupo ?? 0;
    if (porGrupo < 1) {
      throw new BadRequestException(
        'Configura cuántos equipos clasifican por grupo a los playoffs (mínimo 1).',
      );
    }
    await this.assertFaseRegularLista(torneo, tenantId);

    const seeds = await this.ordenPorGrupos(torneo, tenantId, porGrupo);
    if (seeds.length < 2) {
      throw new BadRequestException(
        `Solo hay ${seeds.length} clasificado(s); se necesitan al menos 2 para armar el cuadro.`,
      );
    }
    this.logger.log(
      `[playoffs] torneo=${torneo.id} sembrado (grupos): ${seeds.length} clasificados`,
    );
    return this.finalizarSiembra(torneo, tenantId, seeds);
  }

  /**
   * Valida que la fase regular (liga o grupos) esté lista para sembrar: que
   * exista su fixture, que esté completa (sin partidos pendientes) y que no
   * haya ya un cuadro de playoffs generado (en ese caso, primero limpiar).
   */
  private async assertFaseRegularLista(
    torneo: Torneo,
    tenantId: string,
  ): Promise<void> {
    const torneoId = torneo.id;
    const fechasRegulares = await this.fechaRepo.count({
      where: { torneoId, tenantId, esPlayoffs: false },
    });
    if (fechasRegulares === 0) {
      throw new BadRequestException(
        'Genera el fixture de la fase regular antes de armar los playoffs.',
      );
    }
    const pendientes = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.llave_id IS NULL')
      // NO_JUGADO está resuelto (el admin decidió que no se juega): no cuenta
      // como pendiente y no bloquea la siembra de playoffs.
      .andWhere(`p.estado NOT IN ('FINALIZADO','WALKOVER','NO_JUGADO')`)
      .getCount();
    if (pendientes > 0) {
      throw new BadRequestException(
        `La fase regular todavía tiene ${pendientes} partido(s) sin jugar. ` +
          'Termínalos antes de armar los playoffs.',
      );
    }
    const playoffFechas = await this.fechaRepo.count({
      where: { torneoId, tenantId, esPlayoffs: true },
    });
    if (playoffFechas > 0) {
      throw new BadRequestException(
        'Ya hay un cuadro de playoffs generado. Bórralo (Limpiar) antes de re-sembrar.',
      );
    }
  }

  /** Borra el cuadro previo, lo arma desde los seeds y genera el fixture appended. */
  private async finalizarSiembra(
    torneo: Torneo,
    tenantId: string,
    seeds: string[],
  ): Promise<BracketPlayoffResponse> {
    await this.llaveRepo.delete({ torneoId: torneo.id, tenantId });
    await this.armarYGuardarBracket(
      torneo.id,
      tenantId,
      this.construirRonda1DesdeSeeds(seeds),
      torneo.playoffTercerPuesto,
    );
    await this.generarFixturePlayoffs(torneo, tenantId);
    return this.getBracket(torneo.id, tenantId);
  }

  /**
   * Orden de siembra desde los grupos: los `porGrupo` mejores de cada grupo
   * (filas ya rankeadas), combinados por posición y luego por rendimiento.
   */
  private async ordenPorGrupos(
    torneo: Torneo,
    tenantId: string,
    porGrupo: number,
  ): Promise<string[]> {
    const tablas = await this.gruposService.getTablasPorGrupo(torneo.id, tenantId);
    const clasificados: Array<{
      equipoId: string;
      posicion: number;
      pts: number;
      dg: number;
      gf: number;
    }> = [];
    for (const g of tablas.grupos) {
      g.filas.slice(0, porGrupo).forEach((f) => {
        clasificados.push({
          equipoId: f.equipoId,
          posicion: f.posicion,
          pts: f.pts,
          dg: f.dg,
          gf: f.gf,
        });
      });
    }
    clasificados.sort(
      (a, b) =>
        a.posicion - b.posicion ||
        b.pts - a.pts ||
        b.dg - a.dg ||
        b.gf - a.gf ||
        a.equipoId.localeCompare(b.equipoId),
    );
    return clasificados.map((c) => c.equipoId);
  }

  /**
   * Construye las llaves de ronda 1 a partir de una lista ordenada de seeds
   * (seeds[0] = mejor). Usa el orden estándar de siembra: los seeds que no
   * existen (posición > n) son byes y el equipo enfrentado avanza directo.
   */
  private construirRonda1DesdeSeeds(seeds: string[]): ParRonda1[] {
    const n = seeds.length;
    const cuadro = this.nextPow2(n);
    const llavesRonda1 = cuadro / 2;
    const posiciones = this.ordenSiembra(cuadro);
    const equipoDeSeed = (s: number): string | null => (s <= n ? seeds[s - 1]! : null);

    const ronda1: ParRonda1[] = [];
    for (let j = 0; j < llavesRonda1; j++) {
      const e1 = equipoDeSeed(posiciones[2 * j]!);
      const e2 = equipoDeSeed(posiciones[2 * j + 1]!);
      if (e1 && e2) ronda1.push({ localId: e1, visitaId: e2 });
      else if (e1) ronda1.push({ localId: e1, visitaId: null });
      else ronda1.push({ localId: e2!, visitaId: null });
    }
    return ronda1;
  }

  @Transactional()
  async limpiar(
    torneoId: string,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    if (this.esConPlayoffsPorFase(torneo)) {
      // Mixto (liga o grupos → playoffs): borrar solo las fechas de la
      // eliminatoria (cascade → sus partidos) y las llaves; la fase regular
      // (liga o grupos) queda intacta.
      await this.fechaRepo.delete({ torneoId, tenantId, esPlayoffs: true });
      await this.llaveRepo.delete({ torneoId, tenantId });
    } else {
      await this.assertSinFixture(torneoId, tenantId, 'borrar el cuadro');
      await this.llaveRepo.delete({ torneoId, tenantId });
    }
    return this.getBracket(torneoId, tenantId);
  }

  /**
   * Avanza los ganadores por el cuadro: lee los partidos finalizados, resuelve
   * el ganador de cada llave (único: más goles; ida/vuelta: agregado de los 2
   * partidos; empate → indeciso, queda al override manual), propaga el ganador
   * al slot de la ronda siguiente, resuelve el 3er puesto con los perdedores de
   * las semifinales y crea los partidos de las llaves que recién se completaron.
   *
   * Idempotente: se puede llamar tantas veces como se quiera (p. ej. después de
   * cerrar cada acta). No pisa un ganador definido manualmente si los partidos
   * todavía no deciden la llave.
   */
  @Transactional()
  async sincronizar(
    torneoId: string,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    this.assertFormatoPlayoffs(torneo);

    const llaves = await this.llaveRepo.find({
      where: { torneoId, tenantId },
      order: { ronda: 'ASC', orden: 'ASC' },
    });
    if (llaves.length === 0) {
      throw new BadRequestException('Todavía no hay cuadro sembrado.');
    }
    const fechas = await this.fechaRepo.find({ where: { torneoId, tenantId } });
    if (fechas.length === 0) {
      throw new BadRequestException(
        'Genera el fixture de playoffs antes de avanzar ganadores.',
      );
    }
    // Mapa numero→fechaId para ubicar los partidos de cada ronda. Excluir las
    // fechas SUSPENDIDAS: si una fecha se reprogramó, conviven la ORIGINAL
    // (SUSPENDIDA) y la REPROGRAMADA con el mismo numero — los partidos nuevos
    // deben ir a la activa, no a la suspendida (y evita el resultado no
    // determinista de quedarse con la última fila sin ORDER BY).
    const fechaIdByNumero = new Map(
      fechas
        .filter((f) => f.estado !== 'SUSPENDIDA')
        .map((f) => [f.numero, f.id] as const),
    );
    const idaVuelta = torneo.playoffIdaVuelta ?? false;
    const rondaFinal = Math.max(...llaves.map((l) => l.ronda));
    // Offset de fechas: en Mixto los playoffs van detrás de la fase regular.
    // Las fechas de la eliminatoria tienen numero = offset + fechasDeRonda(R),
    // donde offset = MAYOR número de fecha regular (coincide con cómo las creó
    // generarFixturePlayoffs). En PLAYOFFS puro no hay fechas regulares → 0.
    const numerosRegulares = fechas
      .filter((f) => !f.esPlayoffs)
      .map((f) => f.numero);
    const offset = numerosRegulares.length ? Math.max(...numerosRegulares) : 0;

    // Partidos del torneo con llave, agrupados por llave.
    const partidos = await this.partidoRepo.find({
      where: { fechaId: In(fechas.map((f) => f.id)), tenantId },
    });
    const porLlave = new Map<string, Partido[]>();
    for (const p of partidos) {
      if (!p.llaveId) continue;
      const arr = porLlave.get(p.llaveId) ?? [];
      arr.push(p);
      porLlave.set(p.llaveId, arr);
    }

    const llaveByRO = new Map<string, LlavePlayoff>();
    for (const l of llaves) {
      if (!l.esTercerPuesto) llaveByRO.set(`${l.ronda}:${l.orden}`, l);
    }

    // Calcular ganadores y propagar, ronda por ronda (forward).
    for (let r = 1; r <= rondaFinal; r++) {
      const delaRonda = llaves
        .filter((l) => l.ronda === r && !l.esTercerPuesto)
        .sort((a, b) => a.orden - b.orden);
      for (const l of delaRonda) {
        const auto = this.calcularGanadorLlave(l, porLlave.get(l.id) ?? [], idaVuelta);
        const ganador = auto ?? l.ganadorInscripcionId;
        if (ganador !== l.ganadorInscripcionId) {
          l.ganadorInscripcionId = ganador;
          await this.llaveRepo.save(l);
        }
        if (ganador && r < rondaFinal) {
          const dest = llaveByRO.get(`${r + 1}:${Math.floor(l.orden / 2)}`);
          if (dest) {
            if (l.orden % 2 === 0) {
              if (dest.inscripcionLocalId !== ganador) {
                dest.inscripcionLocalId = ganador;
                await this.llaveRepo.save(dest);
              }
            } else if (dest.inscripcionVisitaId !== ganador) {
              dest.inscripcionVisitaId = ganador;
              await this.llaveRepo.save(dest);
            }
          }
        }
      }
    }

    // 3er puesto: perdedores de las dos semifinales (ronda final - 1).
    const tercer = llaves.find((l) => l.esTercerPuesto) ?? null;
    if (tercer && rondaFinal >= 2) {
      const semis = llaves
        .filter((l) => l.ronda === rondaFinal - 1 && !l.esTercerPuesto)
        .sort((a, b) => a.orden - b.orden);
      const perdedor = (l: LlavePlayoff): string | null => {
        if (!l.ganadorInscripcionId || !l.inscripcionLocalId || !l.inscripcionVisitaId) {
          return null;
        }
        return l.ganadorInscripcionId === l.inscripcionLocalId
          ? l.inscripcionVisitaId
          : l.inscripcionLocalId;
      };
      const p0 = semis[0] ? perdedor(semis[0]) : null;
      const p1 = semis[1] ? perdedor(semis[1]) : null;
      let cambio = false;
      if (p0 && tercer.inscripcionLocalId !== p0) {
        tercer.inscripcionLocalId = p0;
        cambio = true;
      }
      if (p1 && tercer.inscripcionVisitaId !== p1) {
        tercer.inscripcionVisitaId = p1;
        cambio = true;
      }
      if (cambio) await this.llaveRepo.save(tercer);
    }

    // Crear partidos de las llaves que ya tienen ambos equipos y aún no tienen
    // partido (las rondas siguientes a la 1, y el 3er puesto).
    for (const l of llaves) {
      if (!l.inscripcionLocalId || !l.inscripcionVisitaId) continue;
      if ((porLlave.get(l.id) ?? []).length > 0) continue;
      await this.crearPartidosLlave(l, tenantId, idaVuelta, fechaIdByNumero, offset);
    }

    this.logger.log(`[playoffs] torneo=${torneoId} sincronizado`);
    return this.getBracket(torneoId, tenantId);
  }

  /**
   * Define manualmente el ganador de una llave (para resolver empates: penales,
   * gol de visita, etc., que el cálculo automático deja indecisos) y vuelve a
   * sincronizar para propagarlo.
   */
  @Transactional()
  async definirGanador(
    torneoId: string,
    tenantId: string,
    llaveId: string,
    ganadorInscripcionId: string,
  ): Promise<BracketPlayoffResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    this.assertFormatoPlayoffs(torneo);
    const llave = await this.llaveRepo.findOne({
      where: { id: llaveId, torneoId, tenantId },
    });
    if (!llave) throw new NotFoundException('La llave no existe en este torneo.');
    if (
      ganadorInscripcionId !== llave.inscripcionLocalId &&
      ganadorInscripcionId !== llave.inscripcionVisitaId
    ) {
      throw new BadRequestException(
        'El ganador debe ser uno de los dos equipos del cruce.',
      );
    }
    llave.ganadorInscripcionId = ganadorInscripcionId;
    await this.llaveRepo.save(llave);
    return this.sincronizar(torneoId, tenantId);
  }

  // ── Helpers ────────────────────────────────────────────────────────
  private async ensureTorneo(torneoId: string, tenantId: string): Promise<Torneo> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado.`);
    return t;
  }

  /** Inscripciones que entran al sorteo (no retiradas ni suspendidas). */
  private inscripcionesActivas(
    torneoId: string,
    tenantId: string,
  ): Promise<InscripcionTorneo[]> {
    return this.inscRepo.find({
      where: { torneoId, tenantId, estado: In(['INSCRITO', 'ACTIVO']) },
      relations: { club: true },
    });
  }

  private item(insc: InscripcionTorneo): GrupoInscripcionItem {
    return {
      inscripcionId: insc.id,
      clubNombre: insc.club?.nombre ?? '—',
      serieSlug: insc.serieSlug,
    };
  }

  private assertFormatoPlayoffs(torneo: Torneo): void {
    const ok = torneo.tipoFormato === 'PLAYOFFS' || this.esConPlayoffsPorFase(torneo);
    if (!ok) {
      throw new BadRequestException(
        'El torneo no tiene fase de playoffs (eliminación directa).',
      );
    }
  }

  /** True si es un round robin que clasifica a playoffs. */
  private esRoundRobinAPlayoffs(torneo: Torneo): boolean {
    return torneo.tipoFormato === 'ROUND_ROBIN' && !!torneo.roundRobinAPlayoffs;
  }

  /** True si es una fase de grupos que clasifica a playoffs. */
  private esGruposAPlayoffs(torneo: Torneo): boolean {
    return torneo.tipoFormato === 'GROUPS' && !!torneo.gruposAPlayoffs;
  }

  /** True si el torneo tiene una fase regular (liga o grupos) que va a playoffs. */
  private esConPlayoffsPorFase(torneo: Torneo): boolean {
    return this.esRoundRobinAPlayoffs(torneo) || this.esGruposAPlayoffs(torneo);
  }

  /**
   * Orden de la tabla de la fase regular (solo partidos sin llave): devuelve
   * los inscripcionIds de mejor a peor posición. Mismo cálculo que la tabla
   * admin (calcularTablaPosiciones + tiebreakers del torneo).
   */
  private async ordenPorTabla(torneo: Torneo, tenantId: string): Promise<string[]> {
    const torneoId = torneo.id;
    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true },
    });
    const equipos = inscripciones
      .filter((i) => i.estado !== 'RETIRADO')
      .map((i) => ({
        id: i.id,
        nombre: i.club?.nombre ?? '',
        slug: i.club?.slug ?? '',
        escudoUrl: i.club?.escudoUrl ?? null,
      }));
    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
      .andWhere('p.llave_id IS NULL')
      .getMany();
    const partidos = partidosRaw.map((p) => ({
      equipoLocalId: p.inscripcionLocalId ?? '',
      equipoVisitaId: p.inscripcionVisitaId ?? '',
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
    }));
    const tiebreakers =
      Array.isArray(torneo.tablaTiebreakers) && torneo.tablaTiebreakers.length > 0
        ? torneo.tablaTiebreakers
        : ['pts', 'dg', 'gf', 'nombre'];
    const filas = calcularTablaPosiciones(equipos, partidos, {
      puntosVictoria: torneo.puntosVictoria,
      puntosEmpate: torneo.puntosEmpate,
      puntosDerrota: torneo.puntosDerrota,
      tiebreakers,
    });
    return filas.map((f) => f.equipoId);
  }

  /**
   * Orden de siembra estándar para un cuadro de tamaño `b` (potencia de 2):
   * la posición de cada hoja en el orden tal que los seeds 1 y 2 se cruzan en
   * la final (1 vs último, y los punteros separados en mitades opuestas).
   */
  private ordenSiembra(b: number): number[] {
    let pls = [1, 2];
    while (pls.length < b) {
      const suma = pls.length * 2 + 1;
      const next: number[] = [];
      for (const x of pls) {
        next.push(x);
        next.push(suma - x);
      }
      pls = next;
    }
    return pls;
  }

  private async assertSinFixture(
    torneoId: string,
    tenantId: string,
    accion: string,
  ): Promise<void> {
    const fechas = await this.fechaRepo.count({ where: { torneoId, tenantId } });
    if (fechas > 0) {
      throw new BadRequestException(
        `El torneo ya tiene fixture generado. Borra el fixture antes de ${accion}.`,
      );
    }
  }

  /**
   * Ganador de una llave a partir de sus partidos finalizados. Único: el de
   * más goles (empate → null = indeciso). Ida/vuelta: agregado de los 2
   * partidos (empate global → null). Devuelve null si todavía no se decide.
   */
  private calcularGanadorLlave(
    llave: LlavePlayoff,
    partidos: Partido[],
    idaVuelta: boolean,
  ): string | null {
    if (!llave.inscripcionLocalId || !llave.inscripcionVisitaId) return null;
    const jugados = partidos.filter(
      (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
    );

    if (!idaVuelta) {
      const p = jugados[0];
      if (!p || p.golesLocal === null || p.golesVisita === null) return null;
      if (p.golesLocal > p.golesVisita) return p.inscripcionLocalId;
      if (p.golesVisita > p.golesLocal) return p.inscripcionVisitaId;
      return null; // empate → manual
    }

    // Ida/vuelta: exactamente 2 partidos jugados. Más de 2 = anomalía (no
    // sumamos de más: queda indeciso para que el admin resuelva a mano).
    if (jugados.length !== 2) return null;
    let golLocal = 0;
    let golVisita = 0;
    for (const p of jugados) {
      if (p.golesLocal === null || p.golesVisita === null) return null;
      // Sumar al marcador agregado de la llave según quién jugó de local.
      if (p.inscripcionLocalId === llave.inscripcionLocalId) {
        golLocal += p.golesLocal;
        golVisita += p.golesVisita;
      } else {
        golLocal += p.golesVisita;
        golVisita += p.golesLocal;
      }
    }
    if (golLocal > golVisita) return llave.inscripcionLocalId;
    if (golVisita > golLocal) return llave.inscripcionVisitaId;
    return null; // empate global → manual (penales / gol de visita)
  }

  /**
   * Fase Playoffs — número(s) de fecha que ocupa una ronda. Partido único: la
   * ronda R cae en la fecha R. Ida/vuelta: ida en 2R-1, vuelta en 2R.
   */
  private fechasDeRonda(
    ronda: number,
    idaVuelta: boolean,
  ): { ida: number; vuelta: number | null } {
    if (!idaVuelta) return { ida: ronda, vuelta: null };
    return { ida: 2 * ronda - 1, vuelta: 2 * ronda };
  }

  /**
   * Crea el/los partido(s) de una llave ya completa en la(s) fecha(s) que le
   * tocan. `offset` desplaza el número de fecha cuando los playoffs van detrás
   * de una fase regular (Mixto): la ronda R cae en offset + fechasDeRonda(R).
   */
  private async crearPartidosLlave(
    llave: LlavePlayoff,
    tenantId: string,
    idaVuelta: boolean,
    fechaIdByNumero: Map<number, string>,
    offset = 0,
  ): Promise<void> {
    const { ida, vuelta } = this.fechasDeRonda(llave.ronda, idaVuelta);
    const fechaIdIda = fechaIdByNumero.get(offset + ida);
    if (fechaIdIda) {
      await this.partidoRepo.save(
        this.partidoRepo.create({
          tenantId,
          fechaId: fechaIdIda,
          inscripcionLocalId: llave.inscripcionLocalId,
          inscripcionVisitaId: llave.inscripcionVisitaId,
          llaveId: llave.id,
          estado: 'PROGRAMADO',
        }),
      );
    }
    if (idaVuelta && vuelta) {
      const fechaIdVuelta = fechaIdByNumero.get(offset + vuelta);
      if (fechaIdVuelta) {
        await this.partidoRepo.save(
          this.partidoRepo.create({
            tenantId,
            fechaId: fechaIdVuelta,
            inscripcionLocalId: llave.inscripcionVisitaId,
            inscripcionVisitaId: llave.inscripcionLocalId,
            llaveId: llave.id,
            estado: 'PROGRAMADO',
          }),
        );
      }
    }
  }

  /**
   * Construye todas las rondas del cuadro a partir de las llaves de ronda 1
   * (cada par {localId, visitaId|null}; visitaId null = bye) y las guarda:
   * rondas vacías 2..final, 3er puesto si corresponde, y propaga los byes a la
   * ronda 2. El llamador ya borró el bracket previo.
   */
  private async armarYGuardarBracket(
    torneoId: string,
    tenantId: string,
    ronda1: ParRonda1[],
    tercerPuesto: boolean,
  ): Promise<void> {
    const llavesRonda1 = ronda1.length;
    const cuadro = llavesRonda1 * 2;
    const rondaFinal = Math.log2(cuadro);

    type Borrador = {
      ronda: number;
      orden: number;
      nombre: string;
      esTercerPuesto: boolean;
      localId: string | null;
      visitaId: string | null;
      ganadorId: string | null;
    };
    const borradores: Borrador[] = [];

    ronda1.forEach((par, j) => {
      const nombre =
        llavesRonda1 === 1
          ? this.nombreRonda(1)
          : `${this.nombreRonda(llavesRonda1)} ${j + 1}`;
      borradores.push({
        ronda: 1,
        orden: j,
        nombre,
        esTercerPuesto: false,
        localId: par.localId,
        visitaId: par.visitaId,
        ganadorId: par.visitaId === null ? par.localId : null, // bye avanza
      });
    });

    for (let r = 2; r <= rondaFinal; r++) {
      const count = cuadro / 2 ** r;
      for (let j = 0; j < count; j++) {
        borradores.push({
          ronda: r,
          orden: j,
          nombre:
            count === 1 ? this.nombreRonda(1) : `${this.nombreRonda(count)} ${j + 1}`,
          esTercerPuesto: false,
          localId: null,
          visitaId: null,
          ganadorId: null,
        });
      }
    }

    if (tercerPuesto && rondaFinal >= 2) {
      borradores.push({
        ronda: rondaFinal,
        orden: 1,
        nombre: '3er puesto',
        esTercerPuesto: true,
        localId: null,
        visitaId: null,
        ganadorId: null,
      });
    }

    // Propagar byes a la ronda 2 (local si el orden es par, visita si impar).
    const byRondaOrden = new Map<string, Borrador>();
    for (const b of borradores) byRondaOrden.set(`${b.ronda}:${b.orden}`, b);
    for (const b of borradores) {
      if (b.ronda !== 1 || b.ganadorId === null) continue;
      const destino = byRondaOrden.get(`2:${Math.floor(b.orden / 2)}`);
      if (!destino) continue;
      if (b.orden % 2 === 0) destino.localId = b.ganadorId;
      else destino.visitaId = b.ganadorId;
    }

    await this.llaveRepo.save(
      borradores.map((b) =>
        this.llaveRepo.create({
          tenantId,
          torneoId,
          ronda: b.ronda,
          orden: b.orden,
          nombre: b.nombre,
          esTercerPuesto: b.esTercerPuesto,
          inscripcionLocalId: b.localId,
          inscripcionVisitaId: b.visitaId,
          ganadorInscripcionId: b.ganadorId,
        }),
      ),
    );
  }

  /**
   * Mixto — crea las fechas de la eliminatoria (es_playoffs=true) detrás de la
   * fase regular y los partidos de la ronda 1 (y las llaves ya completas por
   * bye). Las fechas se programan una semana después de la última fecha regular.
   */
  private async generarFixturePlayoffs(
    torneo: Torneo,
    tenantId: string,
  ): Promise<void> {
    const torneoId = torneo.id;
    const idaVuelta = torneo.playoffIdaVuelta ?? false;
    const llaves = await this.llaveRepo.find({
      where: { torneoId, tenantId },
      order: { ronda: 'ASC', orden: 'ASC' },
    });
    const rondaFinal = Math.max(...llaves.map((l) => l.ronda));
    const slots = rondaFinal * (idaVuelta ? 2 : 1);

    // Las fechas de la eliminatoria van después del MAYOR número de fecha
    // regular (offset). Usar el máximo (no el conteo) evita colisiones de
    // numero si hubiera huecos. Fecha calendario: última regular + 7 días.
    const ultimaRegular = await this.fechaRepo.findOne({
      where: { torneoId, tenantId, esPlayoffs: false },
      order: { numero: 'DESC' },
    });
    const offset = ultimaRegular?.numero ?? 0;
    const base = ultimaRegular?.fechaInicio
      ? new Date(`${ultimaRegular.fechaInicio}T00:00:00`)
      : new Date('2026-01-01T00:00:00');

    const fechaIdByNumero = new Map<number, string>();
    for (let s = 1; s <= slots; s++) {
      const numero = offset + s;
      const dia = new Date(base);
      dia.setDate(base.getDate() + s * 7);
      const fin = new Date(dia);
      fin.setDate(dia.getDate() + 1);
      const fmt = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      const saved = await this.fechaRepo.save(
        this.fechaRepo.create({
          tenantId,
          torneoId,
          numero,
          etiqueta: `Playoffs · fecha ${s}`,
          fechaInicio: fmt(dia),
          fechaFin: fmt(fin),
          estado: 'PROGRAMADA',
          esPlayoffs: true,
        }),
      );
      fechaIdByNumero.set(numero, saved.id);
    }

    // Partidos de las llaves ya completas (ronda 1 + dobles byes en ronda 2).
    for (const l of llaves) {
      if (!l.inscripcionLocalId || !l.inscripcionVisitaId) continue;
      await this.crearPartidosLlave(l, tenantId, idaVuelta, fechaIdByNumero, offset);
    }
  }

  /** Menor potencia de 2 mayor o igual a n (n ≥ 1). */
  private nextPow2(n: number): number {
    let b = 1;
    while (b < n) b *= 2;
    return b;
  }

  /** Nombre de una ronda según cuántos cruces tiene. */
  private nombreRonda(cruces: number): string {
    switch (cruces) {
      case 1:
        return 'Final';
      case 2:
        return 'Semifinal';
      case 4:
        return 'Cuartos de final';
      case 8:
        return 'Octavos de final';
      case 16:
        return '16avos de final';
      default:
        return `Ronda de ${cruces * 2}`;
    }
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}
