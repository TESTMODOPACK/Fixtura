import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CanchaAdmin } from '@fixtura/types';

import { Cancha } from '../../competition/entities/cancha.entity';
import type { CreateCanchaDto, UpdateCanchaDto } from './dto';

@Injectable()
export class CanchasAdminService {
  constructor(
    @InjectRepository(Cancha) private readonly repo: Repository<Cancha>,
  ) {}

  async list(tenantId: string, soloActivas = false): Promise<CanchaAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .orderBy('c.activa', 'DESC')
      .addOrderBy('c.nombre', 'ASC');
    if (soloActivas) qb.andWhere('c.activa = true');
    const items = await qb.getMany();
    return items.map(this.toDto);
  }

  async findOne(id: string, tenantId: string): Promise<CanchaAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);
    return this.toDto(c);
  }

  async create(tenantId: string, input: CreateCanchaDto): Promise<CanchaAdmin> {
    const entity = this.repo.create({
      tenantId,
      nombre: input.nombre,
      direccion: input.direccion?.trim() || null,
      lat: input.lat != null ? String(input.lat) : null,
      lng: input.lng != null ? String(input.lng) : null,
      capacidad: input.capacidad ?? null,
      superficie: input.superficie ?? 'PASTO_NATURAL',
      iluminacion: input.iluminacion ?? false,
      tieneCamarines: input.tieneCamarines ?? false,
      observaciones: input.observaciones?.trim() || null,
      activa: true,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateCanchaDto,
  ): Promise<CanchaAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);

    if (input.nombre !== undefined) c.nombre = input.nombre;
    if (input.direccion !== undefined) c.direccion = input.direccion?.trim() || null;
    if (input.lat !== undefined) c.lat = input.lat != null ? String(input.lat) : null;
    if (input.lng !== undefined) c.lng = input.lng != null ? String(input.lng) : null;
    if (input.capacidad !== undefined) c.capacidad = input.capacidad ?? null;
    if (input.superficie !== undefined) c.superficie = input.superficie;
    if (input.iluminacion !== undefined) c.iluminacion = input.iluminacion;
    if (input.tieneCamarines !== undefined) c.tieneCamarines = input.tieneCamarines;
    if (input.observaciones !== undefined) c.observaciones = input.observaciones?.trim() || null;
    if (input.activa !== undefined) c.activa = input.activa;

    const saved = await this.repo.save(c);
    return this.toDto(saved);
  }

  /** Soft delete: marcar como inactiva. Preserva historial. */
  async deactivate(id: string, tenantId: string): Promise<void> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);
    c.activa = false;
    await this.repo.save(c);
  }

  private toDto(c: Cancha): CanchaAdmin {
    return {
      id: c.id,
      nombre: c.nombre,
      direccion: c.direccion,
      // numeric viene como string desde PG — casteamos a number
      lat: c.lat != null ? Number(c.lat) : null,
      lng: c.lng != null ? Number(c.lng) : null,
      capacidad: c.capacidad,
      superficie: c.superficie,
      iluminacion: c.iluminacion,
      tieneCamarines: c.tieneCamarines,
      observaciones: c.observaciones,
      activa: c.activa,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
