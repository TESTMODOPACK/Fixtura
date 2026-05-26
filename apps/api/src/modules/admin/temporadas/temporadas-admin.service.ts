import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateTemporadaRequest } from '@fixtura/types';

import { Temporada } from '../../competition/entities/temporada.entity';

@Injectable()
export class TemporadasAdminService {
  constructor(@InjectRepository(Temporada) private readonly repo: Repository<Temporada>) {}

  async list(tenantId: string): Promise<Temporada[]> {
    return this.repo.find({ where: { tenantId }, order: { anio: 'DESC', nombre: 'ASC' } });
  }

  async findByIdOrFail(id: string, tenantId: string): Promise<Temporada> {
    const t = await this.repo.findOne({ where: { id, tenantId } });
    if (!t) throw new NotFoundException(`Temporada ${id} no encontrada`);
    return t;
  }

  async create(tenantId: string, input: CreateTemporadaRequest): Promise<Temporada> {
    const t = this.repo.create({
      tenantId,
      nombre: input.nombre,
      anio: input.anio,
      fechaInicio: input.fechaInicio ?? null,
      fechaFin: input.fechaFin ?? null,
    });
    return this.repo.save(t);
  }
}
