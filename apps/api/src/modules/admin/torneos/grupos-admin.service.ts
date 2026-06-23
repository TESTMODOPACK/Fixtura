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
  GrupoInscripcionItem,
  GruposTorneoResponse,
  TablasPorGrupoAdmin,
} from '@fixtura/types';

import { Fecha } from '../../competition/entities/fecha.entity';
import { GrupoInscripcion } from '../../competition/entities/grupo-inscripcion.entity';
import { GrupoTorneo } from '../../competition/entities/grupo-torneo.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Fase Grupos (G3) — sorteo y gestión de los grupos de un torneo con formato
 * GROUPS/MIXTO.
 *
 * Reparto: aleatorio balanceado (sin cabezas de serie). Shuffle Fisher-Yates
 * + reparto round-robin → grupos parejos (difieren a lo sumo en 1 equipo).
 *
 * Invariante: sortear/mover/limpiar solo si el torneo NO tiene fixture
 * generado todavía (sin fechas). El generador de fixture (G4) lee los grupos,
 * y `partidos.grupo_id` no tiene FK con cascade a `grupos_torneo`; re-sortear
 * con fixture armado dejaría partidos apuntando a grupos borrados.
 */
@Injectable()
export class GruposAdminService {
  private readonly logger = new Logger(GruposAdminService.name);

  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(GrupoTorneo)
    private readonly grupoRepo: Repository<GrupoTorneo>,
    @InjectRepository(GrupoInscripcion)
    private readonly grupoInscRepo: Repository<GrupoInscripcion>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
  ) {}

  async getGrupos(torneoId: string, tenantId: string): Promise<GruposTorneoResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    const grupos = await this.grupoRepo.find({
      where: { torneoId, tenantId },
      order: { numero: 'ASC' },
    });
    const asignaciones = await this.grupoInscRepo.find({
      where: { torneoId, tenantId },
      relations: { inscripcion: { club: true } },
    });
    const activas = await this.inscripcionesActivas(torneoId, tenantId);

    const porGrupo = new Map<string, GrupoInscripcionItem[]>();
    const asignadas = new Set<string>();
    for (const a of asignaciones) {
      asignadas.add(a.inscripcionId);
      if (!a.inscripcion) continue;
      const arr = porGrupo.get(a.grupoId) ?? [];
      arr.push(this.item(a.inscripcion));
      porGrupo.set(a.grupoId, arr);
    }

    const porNombre = (a: GrupoInscripcionItem, b: GrupoInscripcionItem): number =>
      a.clubNombre.localeCompare(b.clubNombre, 'es');

    return {
      sorteado: grupos.length > 0,
      cantidadGrupos: torneo.cantidadGrupos ?? null,
      grupos: grupos.map((g) => ({
        id: g.id,
        numero: g.numero,
        nombre: g.nombre,
        inscripciones: (porGrupo.get(g.id) ?? []).sort(porNombre),
      })),
      sinAsignar: activas
        .filter((i) => !asignadas.has(i.id))
        .map((i) => this.item(i))
        .sort(porNombre),
    };
  }

  /**
   * Tabla de posiciones por grupo: mismo cálculo que la tabla global del
   * torneo (calcularTablaPosiciones) pero acotado a los equipos y partidos
   * (FINALIZADO/WALKOVER) de cada grupo.
   */
  async getTablasPorGrupo(
    torneoId: string,
    tenantId: string,
  ): Promise<TablasPorGrupoAdmin> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    const grupos = await this.grupoRepo.find({
      where: { torneoId, tenantId },
      order: { numero: 'ASC' },
    });
    const asignaciones = await this.grupoInscRepo.find({
      where: { torneoId, tenantId },
    });
    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true },
    });
    const inscMap = new Map(inscripciones.map((i) => [i.id, i]));

    const idsPorGrupo = new Map<string, string[]>();
    for (const a of asignaciones) {
      const arr = idsPorGrupo.get(a.grupoId) ?? [];
      arr.push(a.inscripcionId);
      idsPorGrupo.set(a.grupoId, arr);
    }

    // Solo partidos jugados (mismo criterio que la tabla global) y con grupo.
    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
      .andWhere('p.grupo_id IS NOT NULL')
      .getMany();
    const partidosPorGrupo = new Map<string, Partido[]>();
    for (const p of partidosRaw) {
      if (!p.grupoId) continue;
      const arr = partidosPorGrupo.get(p.grupoId) ?? [];
      arr.push(p);
      partidosPorGrupo.set(p.grupoId, arr);
    }

    const tiebreakers =
      Array.isArray(torneo.tablaTiebreakers) && torneo.tablaTiebreakers.length > 0
        ? torneo.tablaTiebreakers
        : ['pts', 'dg', 'gf', 'nombre'];
    const config = {
      puntosVictoria: torneo.puntosVictoria,
      puntosEmpate: torneo.puntosEmpate,
      puntosDerrota: torneo.puntosDerrota,
      tiebreakers,
    };

    let hayResultados = false;
    const gruposTabla = grupos.map((g) => {
      const equipos = (idsPorGrupo.get(g.id) ?? [])
        .map((id) => inscMap.get(id))
        .filter((i): i is InscripcionTorneo => !!i && i.estado !== 'RETIRADO')
        .map((i) => ({
          id: i.id,
          nombre: i.club?.nombre ?? '',
          slug: i.club?.slug ?? '',
          escudoUrl: i.club?.escudoUrl ?? null,
        }));
      const partidos = (partidosPorGrupo.get(g.id) ?? []).map((p) => ({
        equipoLocalId: p.inscripcionLocalId ?? '',
        equipoVisitaId: p.inscripcionVisitaId ?? '',
        golesLocal: p.golesLocal,
        golesVisita: p.golesVisita,
      }));
      if (partidos.length > 0) hayResultados = true;
      return {
        grupoId: g.id,
        numero: g.numero,
        nombre: g.nombre,
        filas: calcularTablaPosiciones(equipos, partidos, config),
      };
    });

    return { grupos: gruposTabla, tiebreakers, hayResultados };
  }

  @Transactional()
  async sortear(torneoId: string, tenantId: string): Promise<GruposTorneoResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    this.assertFormatoGrupos(torneo);
    await this.assertSinFixture(torneoId, tenantId, 're-sortear los grupos');

    const cantidad = torneo.cantidadGrupos!;
    const activas = await this.inscripcionesActivas(torneoId, tenantId);
    if (activas.length < cantidad) {
      throw new BadRequestException(
        `Hay ${activas.length} equipo(s) inscrito(s) y ${cantidad} grupos. ` +
          'Inscribe al menos un equipo por grupo antes de sortear.',
      );
    }

    // Borrar el sorteo previo (primero las asignaciones, luego los grupos —
    // no dependemos del ON DELETE CASCADE del schema).
    await this.grupoInscRepo.delete({ torneoId, tenantId });
    await this.grupoRepo.delete({ torneoId, tenantId });

    const grupos = await this.grupoRepo.save(
      Array.from({ length: cantidad }, (_, i) =>
        this.grupoRepo.create({
          tenantId,
          torneoId,
          numero: i + 1,
          nombre: `Grupo ${LETRAS[i] ?? String(i + 1)}`,
        }),
      ),
    );

    // Aleatorio balanceado: shuffle + reparto round-robin (idx % cantidad).
    const orden = this.shuffle(activas);
    await this.grupoInscRepo.save(
      orden.map((insc, idx) =>
        this.grupoInscRepo.create({
          tenantId,
          torneoId,
          grupoId: grupos[idx % cantidad]!.id,
          inscripcionId: insc.id,
        }),
      ),
    );

    this.logger.log(
      `[grupos] torneo=${torneoId} sorteado: ${activas.length} equipos en ${cantidad} grupos`,
    );
    return this.getGrupos(torneoId, tenantId);
  }

  @Transactional()
  async mover(
    torneoId: string,
    tenantId: string,
    inscripcionId: string,
    grupoId: string,
  ): Promise<GruposTorneoResponse> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    this.assertFormatoGrupos(torneo);
    await this.assertSinFixture(torneoId, tenantId, 'reasignar grupos');

    const grupo = await this.grupoRepo.findOne({
      where: { id: grupoId, torneoId, tenantId },
    });
    if (!grupo) throw new NotFoundException('El grupo no existe en este torneo.');

    const insc = await this.inscRepo.findOne({
      where: { id: inscripcionId, torneoId, tenantId },
    });
    if (!insc) {
      throw new NotFoundException('La inscripción no existe en este torneo.');
    }

    const existente = await this.grupoInscRepo.findOne({
      where: { torneoId, tenantId, inscripcionId },
    });
    if (existente) {
      existente.grupoId = grupoId;
      await this.grupoInscRepo.save(existente);
    } else {
      await this.grupoInscRepo.save(
        this.grupoInscRepo.create({ tenantId, torneoId, grupoId, inscripcionId }),
      );
    }
    return this.getGrupos(torneoId, tenantId);
  }

  @Transactional()
  async limpiar(torneoId: string, tenantId: string): Promise<GruposTorneoResponse> {
    await this.ensureTorneo(torneoId, tenantId);
    await this.assertSinFixture(torneoId, tenantId, 'borrar los grupos');
    await this.grupoInscRepo.delete({ torneoId, tenantId });
    await this.grupoRepo.delete({ torneoId, tenantId });
    return this.getGrupos(torneoId, tenantId);
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

  private assertFormatoGrupos(torneo: Torneo): void {
    const usaGrupos =
      torneo.tipoFormato === 'GROUPS' || torneo.tipoFormato === 'MIXTO';
    if (!usaGrupos || !torneo.cantidadGrupos || torneo.cantidadGrupos < 2) {
      throw new BadRequestException(
        'El torneo no tiene formato de grupos configurado (mínimo 2 grupos).',
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

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}
