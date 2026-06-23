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
