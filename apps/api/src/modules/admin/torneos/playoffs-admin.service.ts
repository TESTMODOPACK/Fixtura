import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type {
  BracketPlayoffResponse,
  GrupoInscripcionItem,
  LlavePlayoffAdmin,
  LlavePlayoffSlot,
} from '@fixtura/types';

import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { LlavePlayoff } from '../../competition/entities/llave-playoff.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

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
    await this.assertSinFixture(torneoId, tenantId, 're-sembrar el cuadro');

    const activas = await this.inscripcionesActivas(torneoId, tenantId);
    if (activas.length < 2) {
      throw new BadRequestException(
        'Se necesitan al menos 2 equipos inscritos para sembrar el cuadro.',
      );
    }

    // Borrar el bracket previo.
    await this.llaveRepo.delete({ torneoId, tenantId });

    const n = activas.length;
    const cuadro = this.nextPow2(n); // tamaño del cuadro (potencia de 2)
    const byes = cuadro - n;
    const rondaFinal = Math.log2(cuadro); // 2 equipos → 1, 4 → 2, 8 → 3…
    const llavesRonda1 = cuadro / 2;

    // Llaves de ronda 1 con reparto de byes espaciados.
    const orden = this.shuffle(activas);
    const byeIdx = new Set<number>();
    for (let i = 0; i < byes; i++) {
      byeIdx.add(Math.floor((i * llavesRonda1) / byes));
    }

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

    let p = 0;
    for (let j = 0; j < llavesRonda1; j++) {
      const nombre =
        llavesRonda1 === 1
          ? this.nombreRonda(1)
          : `${this.nombreRonda(llavesRonda1)} ${j + 1}`;
      if (byeIdx.has(j)) {
        const local = orden[p++]!;
        borradores.push({
          ronda: 1,
          orden: j,
          nombre,
          esTercerPuesto: false,
          localId: local.id,
          visitaId: null,
          ganadorId: local.id, // bye: avanza directo
        });
      } else {
        const local = orden[p++]!;
        const visita = orden[p++]!;
        borradores.push({
          ronda: 1,
          orden: j,
          nombre,
          esTercerPuesto: false,
          localId: local.id,
          visitaId: visita.id,
          ganadorId: null,
        });
      }
    }

    // Rondas vacías 2..rondaFinal (se llenan con los ganadores en P4).
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

    // Partido por el 3er puesto: solo si hay semifinales (cuadro ≥ 4).
    if (torneo.playoffTercerPuesto && rondaFinal >= 2) {
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

    // Propagar los byes a la ronda 2: el equipo con bye entra al slot que le
    // corresponde por la topología (local si el orden es par, visita si impar).
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

    this.logger.log(
      `[playoffs] torneo=${torneoId} sembrado: ${n} equipos, cuadro=${cuadro}, byes=${byes}`,
    );
    return this.getBracket(torneoId, tenantId);
  }

  @Transactional()
  async limpiar(
    torneoId: string,
    tenantId: string,
  ): Promise<BracketPlayoffResponse> {
    await this.ensureTorneo(torneoId, tenantId);
    await this.assertSinFixture(torneoId, tenantId, 'borrar el cuadro');
    await this.llaveRepo.delete({ torneoId, tenantId });
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
    const fechaIdByNumero = new Map(fechas.map((f) => [f.numero, f.id]));
    const idaVuelta = torneo.playoffIdaVuelta ?? false;
    const rondaFinal = Math.max(...llaves.map((l) => l.ronda));

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
      await this.crearPartidosLlave(l, tenantId, idaVuelta, fechaIdByNumero);
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
    if (torneo.tipoFormato !== 'PLAYOFFS') {
      throw new BadRequestException(
        'El torneo no tiene formato de playoffs (eliminación directa).',
      );
    }
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

    if (jugados.length < 2) return null;
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

  /** Crea el/los partido(s) de una llave ya completa en la(s) fecha(s) que le tocan. */
  private async crearPartidosLlave(
    llave: LlavePlayoff,
    tenantId: string,
    idaVuelta: boolean,
    fechaIdByNumero: Map<number, string>,
  ): Promise<void> {
    const { ida, vuelta } = this.fechasDeRonda(llave.ronda, idaVuelta);
    const fechaIdIda = fechaIdByNumero.get(ida);
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
      const fechaIdVuelta = fechaIdByNumero.get(vuelta);
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
