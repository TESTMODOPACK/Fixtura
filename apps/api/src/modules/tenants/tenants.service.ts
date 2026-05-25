import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateTenantRequest } from '@fixtura/types';

import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantsService {
  constructor(@InjectRepository(Tenant) private readonly repo: Repository<Tenant>) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async findById(id: string): Promise<Tenant> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant ${id} no existe`);
    return t;
  }

  async list(): Promise<Tenant[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async create(input: CreateTenantRequest): Promise<Tenant> {
    const existing = await this.findBySlug(input.slug);
    if (existing) {
      throw new ConflictException(`Slug "${input.slug}" ya está en uso`);
    }
    const tenant = this.repo.create({
      slug: input.slug,
      nombre: input.nombre,
      tipo: input.tipo,
      plan: input.plan,
    });
    return this.repo.save(tenant);
  }
}
