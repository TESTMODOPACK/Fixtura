import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { PersonalAdmin } from '@fixtura/types';

import { Personal } from '../../competition/entities/personal.entity';
import type { CreatePersonalDto, UpdatePersonalDto } from './dto';

@Injectable()
export class PersonalAdminService {
  constructor(
    @InjectRepository(Personal) private readonly repo: Repository<Personal>,
  ) {}

  async list(tenantId: string, soloActivos = false): Promise<PersonalAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.apellido', 'ASC')
      .addOrderBy('p.nombre', 'ASC');
    if (soloActivos) qb.andWhere('p.activo = true');
    const rows = await qb.getMany();
    return rows.map(this.toDto);
  }

  async findOne(id: string, tenantId: string): Promise<PersonalAdmin> {
    const p = await this.repo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException(`Personal ${id} no encontrado`);
    return this.toDto(p);
  }

  async create(tenantId: string, input: CreatePersonalDto): Promise<PersonalAdmin> {
    const entity = this.repo.create({
      tenantId,
      nombre: input.nombre,
      apellido: input.apellido,
      rol: input.rol,
      rut: input.rut ?? null,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      tarifaBase: input.tarifaBase ?? null,
      carnetAnfaNumero: input.carnetAnfaNumero ?? null,
      carnetAnfaVence: input.carnetAnfaVence ?? null,
      notas: input.notas ?? null,
      activo: true,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdatePersonalDto,
  ): Promise<PersonalAdmin> {
    const p = await this.repo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException(`Personal ${id} no encontrado`);
    Object.assign(p, {
      nombre: input.nombre ?? p.nombre,
      apellido: input.apellido ?? p.apellido,
      rol: input.rol ?? p.rol,
      rut: input.rut === undefined ? p.rut : input.rut,
      telefono: input.telefono === undefined ? p.telefono : input.telefono,
      email: input.email === undefined ? p.email : input.email,
      tarifaBase:
        input.tarifaBase === undefined ? p.tarifaBase : input.tarifaBase,
      carnetAnfaNumero:
        input.carnetAnfaNumero === undefined
          ? p.carnetAnfaNumero
          : input.carnetAnfaNumero,
      carnetAnfaVence:
        input.carnetAnfaVence === undefined
          ? p.carnetAnfaVence
          : input.carnetAnfaVence,
      notas: input.notas === undefined ? p.notas : input.notas,
      activo: input.activo ?? p.activo,
    });
    const saved = await this.repo.save(p);
    return this.toDto(saved);
  }

  /**
   * Soft delete: marcar como inactivo. NO eliminamos para preservar
   * historial de designaciones pasadas.
   */
  async deactivate(id: string, tenantId: string): Promise<void> {
    const p = await this.repo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException(`Personal ${id} no encontrado`);
    p.activo = false;
    await this.repo.save(p);
  }

  private toDto(p: Personal): PersonalAdmin {
    return {
      id: p.id,
      userId: p.userId,
      nombre: p.nombre,
      apellido: p.apellido,
      rut: p.rut,
      rol: p.rol,
      telefono: p.telefono,
      email: p.email,
      tarifaBase: p.tarifaBase,
      carnetAnfaNumero: p.carnetAnfaNumero,
      carnetAnfaVence: p.carnetAnfaVence,
      activo: p.activo,
      notas: p.notas,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
