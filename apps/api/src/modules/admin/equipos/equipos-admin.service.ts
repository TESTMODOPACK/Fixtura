import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateEquipoRequest, EquipoAdmin } from '@fixtura/types';

import { Equipo } from '../../competition/entities/equipo.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class EquiposAdminService {
  constructor(
    @InjectRepository(Equipo) private readonly repo: Repository<Equipo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
  ) {}

  async listByTorneo(torneoId: string, tenantId: string): Promise<EquipoAdmin[]> {
    await this.ensureTorneo(torneoId, tenantId);
    const equipos = await this.repo.find({
      where: { torneoId, tenantId },
      order: { nombre: 'ASC' },
    });
    return Promise.all(equipos.map((e) => this.toDto(e)));
  }

  async findOne(id: string, tenantId: string): Promise<EquipoAdmin> {
    const e = await this.repo.findOne({ where: { id, tenantId } });
    if (!e) throw new NotFoundException(`Equipo ${id} no encontrado`);
    return this.toDto(e);
  }

  async create(
    torneoId: string,
    tenantId: string,
    input: CreateEquipoRequest,
  ): Promise<EquipoAdmin> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);

    // No se pueden inscribir equipos en un torneo ya iniciado o cerrado.
    // Si la liga necesita agregar un equipo después de arrancar, primero
    // tiene que volver el torneo a DRAFT (resetea fixture).
    if (torneo.estado !== 'DRAFT') {
      throw new ConflictException(
        `No se pueden inscribir equipos en un torneo ${torneo.estado}. ` +
          'Para agregar equipos, el torneo debe estar en DRAFT (sin fixture generado).',
      );
    }

    const dup = await this.repo.findOne({ where: { torneoId, slug: input.slug } });
    if (dup) {
      throw new ConflictException(`Ya existe un equipo con slug "${input.slug}" en este torneo`);
    }

    const e = this.repo.create({
      tenantId,
      torneoId,
      nombre: input.nombre,
      slug: input.slug,
      escudoUrl: input.escudoUrl ?? null,
      colorPrimario: input.colorPrimario ?? null,
      colorSecundario: input.colorSecundario ?? null,
      delegadoUserId: input.delegadoUserId ?? null,
      estado: 'INSCRITO',
    });
    const saved = await this.repo.save(e);
    return this.findOne(saved.id, tenantId);
  }

  private async ensureTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<{ id: string; estado: 'DRAFT' | 'ACTIVO' | 'CERRADO' }> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    return { id: torneo.id, estado: torneo.estado };
  }

  private async toDto(e: Equipo): Promise<EquipoAdmin> {
    const jugadoresCount = await this.jugadorRepo.count({ where: { equipoId: e.id } });
    return {
      id: e.id,
      torneoId: e.torneoId,
      nombre: e.nombre,
      slug: e.slug,
      escudoUrl: e.escudoUrl,
      colorPrimario: e.colorPrimario,
      colorSecundario: e.colorSecundario,
      delegadoUserId: e.delegadoUserId,
      estado: e.estado,
      jugadoresCount,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
