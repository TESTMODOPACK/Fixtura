import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import type {
  LadoObservacion,
  ObservacionPartido as ObservacionPartidoDto,
  ObservacionTribunalItem,
  RolAutorObservacion,
  UserContext,
} from '@fixtura/types';

import {
  Designacion,
  type EstadoDesignacion,
} from '../../competition/entities/designacion.entity';
import { ObservacionPartido } from '../../competition/entities/observacion-partido.entity';
import { Partido } from '../../competition/entities/partido.entity';

const ESTADOS_DESIGNACION_OPERABLE: EstadoDesignacion[] = [
  'PROPUESTA',
  'CONFIRMADA',
  'ASISTIO',
];

/**
 * Informe del partido (INF) — observaciones disciplinarias que el árbitro, el
 * planillero o el admin cargan como antecedente. El tribunal las lee para
 * fundamentar sanciones a equipos. El autor se resuelve del actor: rol de liga
 * ⇒ ADMIN; personal ⇒ su designación operable en el partido (rol + nombre).
 */
@Injectable()
export class ObservacionesPartidoService {
  constructor(
    @InjectRepository(ObservacionPartido)
    private readonly repo: Repository<ObservacionPartido>,
    @InjectRepository(Partido)
    private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
  ) {}

  private toDto(o: ObservacionPartido): ObservacionPartidoDto {
    return {
      id: o.id,
      partidoId: o.partidoId,
      lado: o.lado,
      texto: o.texto,
      autorNombre: o.autorNombre,
      autorRol: o.autorRol,
      createdAt: o.createdAt.toISOString(),
    };
  }

  async listar(partidoId: string, tenantId: string): Promise<ObservacionPartidoDto[]> {
    const obs = await this.repo.find({
      where: { partidoId, tenantId },
      order: { createdAt: 'ASC' },
    });
    return obs.map((o) => this.toDto(o));
  }

  /**
   * Todas las observaciones de los partidos de un torneo, con el contexto
   * (fecha, equipos, club apuntado). Lo consume el tribunal para fundamentar
   * sanciones a equipos.
   */
  async observacionesDelTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<ObservacionTribunalItem[]> {
    const rows = await this.repo
      .createQueryBuilder('o')
      .innerJoin('partidos', 'p', 'p.id = o.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .leftJoin('inscripciones_torneo', 'il', 'il.id = p.inscripcion_local_id')
      .leftJoin('clubes', 'cl', 'cl.id = il.club_id')
      .leftJoin('inscripciones_torneo', 'iv', 'iv.id = p.inscripcion_visita_id')
      .leftJoin('clubes', 'cv', 'cv.id = iv.club_id')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId })
      .orderBy('f.numero', 'DESC')
      .addOrderBy('o.created_at', 'DESC')
      .select('o.id', 'id')
      .addSelect('o.partido_id', 'partidoId')
      .addSelect('o.lado', 'lado')
      .addSelect('o.texto', 'texto')
      .addSelect('o.autor_nombre', 'autorNombre')
      .addSelect('o.autor_rol', 'autorRol')
      .addSelect('o.created_at', 'createdAt')
      .addSelect('f.numero', 'fechaNumero')
      .addSelect('cl.nombre', 'localNombre')
      .addSelect('cv.nombre', 'visitaNombre')
      .getRawMany<{
        id: string;
        partidoId: string;
        lado: LadoObservacion;
        texto: string;
        autorNombre: string;
        autorRol: RolAutorObservacion;
        createdAt: Date | string;
        fechaNumero: number;
        localNombre: string | null;
        visitaNombre: string | null;
      }>();

    return rows.map((r) => {
      const local = r.localNombre ?? 'Local';
      const visita = r.visitaNombre ?? 'Visita';
      return {
        id: r.id,
        partidoId: r.partidoId,
        fechaNumero: Number(r.fechaNumero),
        equipoLocalNombre: local,
        equipoVisitaNombre: visita,
        lado: r.lado,
        equipoNombre: r.lado === 'LOCAL' ? local : r.lado === 'VISITA' ? visita : null,
        texto: r.texto,
        autorNombre: r.autorNombre,
        autorRol: r.autorRol,
        createdAt: new Date(r.createdAt).toISOString(),
      };
    });
  }

  async crear(
    partidoId: string,
    tenantId: string,
    user: UserContext,
    actorPersonalIds: string[] | null,
    input: { lado: LadoObservacion; texto: string },
  ): Promise<ObservacionPartidoDto> {
    const existe = await this.partidoRepo.findOne({
      where: { id: partidoId, tenantId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException(`Partido ${partidoId} no encontrado`);

    const autor = await this.resolverAutor(partidoId, tenantId, user, actorPersonalIds);
    const creada = await this.repo.save(
      this.repo.create({
        tenantId,
        partidoId,
        lado: input.lado,
        texto: input.texto.trim(),
        autorPersonalId: autor.personalId,
        autorUserId: user.userId,
        autorNombre: autor.nombre,
        autorRol: autor.rol,
      }),
    );
    return this.toDto(creada);
  }

  async eliminar(
    partidoId: string,
    observacionId: string,
    tenantId: string,
    actorPersonalIds: string[] | null,
  ): Promise<void> {
    const obs = await this.repo.findOne({
      where: { id: observacionId, partidoId, tenantId },
    });
    if (!obs) throw new NotFoundException('Observación no encontrada');
    // Rol de liga (null) borra cualquiera; el personal designado solo las suyas.
    if (actorPersonalIds !== null) {
      const propia =
        !!obs.autorPersonalId && actorPersonalIds.includes(obs.autorPersonalId);
      if (!propia) {
        throw new ForbiddenException('Solo puedes eliminar las observaciones que cargaste.');
      }
    }
    await this.repo.remove(obs);
  }

  private async resolverAutor(
    partidoId: string,
    tenantId: string,
    user: UserContext,
    actorPersonalIds: string[] | null,
  ): Promise<{ personalId: string | null; nombre: string; rol: RolAutorObservacion }> {
    if (actorPersonalIds === null) {
      return { personalId: null, nombre: user.email, rol: 'ADMIN' };
    }
    const desig = await this.designacionRepo.findOne({
      where: {
        partidoId,
        tenantId,
        personalId: In(actorPersonalIds),
        estado: In(ESTADOS_DESIGNACION_OPERABLE),
      },
      relations: { personal: true },
    });
    if (!desig || !desig.personal) {
      throw new ForbiddenException(
        'Solo puedes cargar observaciones de un partido para el que estás designado.',
      );
    }
    return {
      personalId: desig.personalId,
      nombre: `${desig.personal.nombre} ${desig.personal.apellido}`.trim(),
      rol: desig.rolAsignado as RolAutorObservacion,
    };
  }
}
