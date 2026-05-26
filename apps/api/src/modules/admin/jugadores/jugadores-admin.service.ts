import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateJugadorRequest, JugadorAdmin } from '@fixtura/types';

import { Equipo } from '../../competition/entities/equipo.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';

@Injectable()
export class JugadoresAdminService {
  constructor(
    @InjectRepository(JugadorInscrito) private readonly repo: Repository<JugadorInscrito>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
  ) {}

  async listByEquipo(equipoId: string, tenantId: string): Promise<JugadorAdmin[]> {
    await this.ensureEquipo(equipoId, tenantId);
    const items = await this.repo.find({
      where: { equipoId, tenantId },
      order: { capitan: 'DESC', numeroCamiseta: 'ASC', apellido: 'ASC' },
    });
    return items.map(toDto);
  }

  async create(
    equipoId: string,
    tenantId: string,
    input: CreateJugadorRequest,
  ): Promise<JugadorAdmin> {
    await this.ensureEquipo(equipoId, tenantId);

    const j = this.repo.create({
      tenantId,
      equipoId,
      nombre: input.nombre,
      apellido: input.apellido,
      apodo: input.apodo ?? null,
      rut: input.rut ?? null,
      numeroCamiseta: input.numeroCamiseta ?? null,
      posicion: input.posicion ?? null,
      pieHabil: input.pieHabil ?? null,
      fechaNac: input.fechaNac ?? null,
      capitan: input.capitan ?? false,
      activo: true,
    });
    const saved = await this.repo.save(j);
    return toDto(saved);
  }

  async bulkCreate(
    equipoId: string,
    tenantId: string,
    inputs: CreateJugadorRequest[],
  ): Promise<JugadorAdmin[]> {
    await this.ensureEquipo(equipoId, tenantId);

    const entities = inputs.map((input) =>
      this.repo.create({
        tenantId,
        equipoId,
        nombre: input.nombre,
        apellido: input.apellido,
        apodo: input.apodo ?? null,
        rut: input.rut ?? null,
        numeroCamiseta: input.numeroCamiseta ?? null,
        posicion: input.posicion ?? null,
        pieHabil: input.pieHabil ?? null,
        fechaNac: input.fechaNac ?? null,
        capitan: input.capitan ?? false,
        activo: true,
      }),
    );
    const saved = await this.repo.save(entities);
    return saved.map(toDto);
  }

  private async ensureEquipo(equipoId: string, tenantId: string): Promise<void> {
    const exists = await this.equipoRepo.findOne({ where: { id: equipoId, tenantId } });
    if (!exists) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);
  }
}

function toDto(j: JugadorInscrito): JugadorAdmin {
  return {
    id: j.id,
    equipoId: j.equipoId,
    nombre: j.nombre,
    apellido: j.apellido,
    apodo: j.apodo,
    rut: j.rut,
    numeroCamiseta: j.numeroCamiseta,
    posicion: j.posicion,
    pieHabil: j.pieHabil,
    fechaNac: j.fechaNac,
    capitan: j.capitan,
    activo: j.activo,
  };
}
