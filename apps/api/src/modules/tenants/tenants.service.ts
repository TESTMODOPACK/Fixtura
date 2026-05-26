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

  /**
   * Mapea un hostname al tenant correspondiente.
   *
   * Reglas:
   *   - Si el host coincide exactamente con `tenants.custom_domain`, devuelve ese tenant.
   *   - Si NODE_ENV != production y el host es localhost / IP / sin domain
   *     match, fallback a DEV_DEFAULT_TENANT_SLUG (default 'liga-demo')
   *     para no romper dev.
   *   - Si nada matchea, retorna null (caller decide si 404 o redirigir).
   *
   * El campo Host puede venir como "liganunoa.cl", "liganunoa.cl:8080",
   * "www.liganunoa.cl" — normalizamos quitando port y prefijo www.
   */
  async findByHost(rawHost: string): Promise<Tenant | null> {
    const host = this.normalizeHost(rawHost);

    // 1. Lookup exacto en custom_domain
    if (host) {
      const exact = await this.repo.findOne({ where: { customDomain: host } });
      if (exact) return exact;
    }

    // 2. Fallback configurable. Sirve dos casos:
    //    - Dev local sin dominio (NODE_ENV != production)
    //    - VPS de staging/preview servido por IP sin dominio configurado
    //
    //   Solo aplica si FALLBACK_TENANT_SLUG está explícitamente seteado
    //   en el entorno, o si estamos fuera de producción (default: liga-demo).
    const explicitFallback = process.env.FALLBACK_TENANT_SLUG;
    if (explicitFallback) {
      return this.repo.findOne({ where: { slug: explicitFallback } });
    }
    if (process.env.NODE_ENV !== 'production') {
      return this.repo.findOne({ where: { slug: 'liga-demo' } });
    }

    // 3. En prod sin fallback explícito, un host sin match es 404.
    return null;
  }

  private normalizeHost(rawHost: string): string {
    return rawHost
      .toLowerCase()
      .trim()
      .replace(/:\d+$/, '') // quitar :port
      .replace(/^www\./, ''); // quitar www.
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
