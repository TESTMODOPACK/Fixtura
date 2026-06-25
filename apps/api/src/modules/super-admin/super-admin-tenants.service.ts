import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import * as bcrypt from 'bcrypt';

import type {
  CreateTenantPlatformRequest,
  EstadoSuscripcion,
  TenantPlatform,
  UpdateTenantPlatformRequest,
} from '@fixtura/types';
import { validarPasswordSegura } from '@fixtura/domain';

import { PlanSuscripcion } from '../tenants/entities/plan-suscripcion.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';

const BCRYPT_COST = 12;

/**
 * Sprint 23 — SuperAdmin: gestión cross-tenant.
 *
 * Todas las queries hacen bypass de RLS via `SET LOCAL app.current_tenant_id = ''`.
 * El controller chequea @Roles(SUPER_ADMIN) para que nadie más entre aquí.
 */
@Injectable()
export class SuperAdminTenantsService {
  private readonly log = new Logger(SuperAdminTenantsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(PlanSuscripcion)
    private readonly planRepo: Repository<PlanSuscripcion>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoleRepo: Repository<UserRole>,
  ) {}

  @Transactional()
  async list(filter?: {
    estado?: EstadoSuscripcion;
    search?: string;
  }): Promise<TenantPlatform[]> {
    // Bypass RLS: setear contexto vacío para ver todos los tenants.
    // Debe correr dentro de una transacción para que set_config con LOCAL
    // (3er param=true) afecte la misma conexión que la query siguiente.
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const qb = this.tenantRepo
      .createQueryBuilder('t')
      .leftJoinAndMapOne(
        't.plan',
        PlanSuscripcion,
        'plan',
        'plan.id = t.plan_id',
      )
      .orderBy('t.created_at', 'DESC');

    if (filter?.estado) {
      qb.andWhere('t.estado_suscripcion = :estado', { estado: filter.estado });
    }
    if (filter?.search) {
      qb.andWhere('(t.slug ILIKE :s OR t.nombre ILIKE :s)', {
        s: `%${filter.search}%`,
      });
    }

    const tenants = (await qb.getMany()) as Array<
      Tenant & { plan?: PlanSuscripcion | null }
    >;
    if (tenants.length === 0) return [];

    // Conteos por tenant en queries agrupadas — más rápido que N+1.
    const countsRows: Array<{
      tenant_id: string;
      torneos: number;
      equipos: number;
      miembros: number;
    }> = await this.ds.query(
      `
      SELECT
        t.id AS tenant_id,
        (SELECT COUNT(*)::int FROM torneos WHERE tenant_id = t.id) AS torneos,
        (SELECT COUNT(*)::int FROM clubes WHERE tenant_id = t.id) AS equipos,
        (SELECT COUNT(DISTINCT user_id)::int FROM user_roles WHERE scope_id = t.id) AS miembros
      FROM tenants t
      WHERE t.id = ANY($1::uuid[])
      `,
      [tenants.map((t) => t.id)],
    );
    const countsMap = new Map(countsRows.map((c) => [c.tenant_id, c]));

    return tenants.map((t) => this.toDto(t, t.plan ?? null, countsMap.get(t.id)));
  }

  @Transactional()
  async findOne(id: string): Promise<TenantPlatform> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const t = (await this.tenantRepo
      .createQueryBuilder('t')
      .leftJoinAndMapOne('t.plan', PlanSuscripcion, 'plan', 'plan.id = t.plan_id')
      .where('t.id = :id', { id })
      .getOne()) as (Tenant & { plan?: PlanSuscripcion | null }) | null;
    if (!t) throw new NotFoundException(`Tenant ${id} no encontrado.`);

    const countsRows: Array<{ torneos: number; equipos: number; miembros: number }> =
      await this.ds.query(
        `
      SELECT
        (SELECT COUNT(*)::int FROM torneos WHERE tenant_id = $1) AS torneos,
        (SELECT COUNT(*)::int FROM clubes WHERE tenant_id = $1) AS equipos,
        (SELECT COUNT(DISTINCT user_id)::int FROM user_roles WHERE scope_id = $1) AS miembros
      `,
        [id],
      );
    return this.toDto(t, t.plan ?? null, countsRows[0]);
  }

  @Transactional()
  async create(
    actorUserId: string,
    input: CreateTenantPlatformRequest,
  ): Promise<TenantPlatform> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const slug = input.slug.toLowerCase().trim();
    const dup = await this.tenantRepo.findOne({ where: { slug } });
    if (dup) throw new ConflictException(`El slug "${slug}" ya está en uso.`);

    let plan: PlanSuscripcion | null = null;
    if (input.planSlug) {
      plan = await this.planRepo.findOne({ where: { slug: input.planSlug } });
      if (!plan)
        throw new BadRequestException(`Plan "${input.planSlug}" no existe.`);
    }

    const trialExpira =
      input.trialDias > 0
        ? new Date(Date.now() + input.trialDias * 24 * 60 * 60 * 1000)
        : null;

    const tenant = this.tenantRepo.create({
      slug,
      nombre: input.nombre,
      tipo: input.tipo,
      plan: 'STARTER', // legacy column
      planId: plan?.id ?? null,
      estadoSuscripcion: input.trialDias > 0 ? 'TRIAL' : 'ACTIVO',
      trialExpiraAt: trialExpira,
      isActive: true,
      brandingJson: {},
      featureFlags: {},
    });
    const savedTenant = await this.tenantRepo.save(tenant);

    // Si vino email + datos del admin inicial, crearlo + rol LIGA_ADMIN.
    if (input.adminEmail && input.adminPassword) {
      const emailNorm = input.adminEmail.toLowerCase().trim();
      let user = await this.userRepo.findOne({ where: { email: emailNorm } });
      if (!user) {
        const errorPwd = validarPasswordSegura(input.adminPassword, {
          email: emailNorm,
          nombre: input.adminNombre,
          apellido: input.adminApellido,
        });
        if (errorPwd) {
          throw new BadRequestException(errorPwd);
        }
        const passwordHash = await bcrypt.hash(input.adminPassword, BCRYPT_COST);
        user = this.userRepo.create({
          email: emailNorm,
          passwordHash,
          nombre: input.adminNombre ?? 'Admin',
          apellido: input.adminApellido ?? 'Liga',
        });
        user = await this.userRepo.save(user);
      }
      // Idempotente: si ya tenía el rol, no duplicar.
      const existing = await this.userRoleRepo.findOne({
        where: {
          userId: user.id,
          role: 'LIGA_ADMIN',
          scopeType: 'TENANT',
          scopeId: savedTenant.id,
        },
      });
      if (!existing) {
        await this.userRoleRepo.save(
          this.userRoleRepo.create({
            userId: user.id,
            role: 'LIGA_ADMIN',
            scopeType: 'TENANT',
            scopeId: savedTenant.id,
          }),
        );
      }
    }

    this.log.log(
      `[super-admin] tenant creado slug=${slug} por user=${actorUserId} ` +
        `plan=${plan?.slug ?? '—'} trial=${input.trialDias}d`,
    );

    return this.findOne(savedTenant.id);
  }

  @Transactional()
  async update(
    id: string,
    input: UpdateTenantPlatformRequest,
  ): Promise<TenantPlatform> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const t = await this.tenantRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant ${id} no encontrado.`);

    if (input.nombre !== undefined) t.nombre = input.nombre;
    if (input.customDomain !== undefined) t.customDomain = input.customDomain;
    if (input.planId !== undefined) {
      if (input.planId) {
        const plan = await this.planRepo.findOne({ where: { id: input.planId } });
        if (!plan) throw new BadRequestException(`Plan ${input.planId} no existe.`);
      }
      t.planId = input.planId;
    }
    if (input.estadoSuscripcion !== undefined) {
      t.estadoSuscripcion = input.estadoSuscripcion;
    }
    if (input.trialExpiraAt !== undefined) {
      t.trialExpiraAt = input.trialExpiraAt ? new Date(input.trialExpiraAt) : null;
    }
    if (input.featureFlags !== undefined) t.featureFlags = input.featureFlags;
    if (input.isActive !== undefined) t.isActive = input.isActive;

    await this.tenantRepo.save(t);
    return this.findOne(id);
  }

  @Transactional()
  async suspender(id: string, motivo: string): Promise<TenantPlatform> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const t = await this.tenantRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant ${id} no encontrado.`);
    if (t.estadoSuscripcion === 'SUSPENDIDO') {
      throw new ConflictException('El tenant ya está suspendido.');
    }
    t.estadoSuscripcion = 'SUSPENDIDO';
    t.suspendidoAt = new Date();
    t.suspendidoMotivo = motivo.trim();
    t.isActive = false;
    await this.tenantRepo.save(t);
    return this.findOne(id);
  }

  @Transactional()
  async reactivar(id: string): Promise<TenantPlatform> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const t = await this.tenantRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant ${id} no encontrado.`);
    if (t.estadoSuscripcion !== 'SUSPENDIDO') {
      throw new ConflictException('Solo se puede reactivar un tenant SUSPENDIDO.');
    }
    t.estadoSuscripcion = 'ACTIVO';
    t.suspendidoAt = null;
    t.suspendidoMotivo = null;
    t.isActive = true;
    await this.tenantRepo.save(t);
    return this.findOne(id);
  }

  private toDto(
    t: Tenant,
    plan: PlanSuscripcion | null,
    counts?: { torneos: number; equipos: number; miembros: number },
  ): TenantPlatform {
    return {
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      tipo: t.tipo,
      customDomain: t.customDomain,
      isActive: t.isActive,
      estadoSuscripcion: t.estadoSuscripcion,
      trialExpiraAt: t.trialExpiraAt?.toISOString() ?? null,
      suspendidoAt: t.suspendidoAt?.toISOString() ?? null,
      suspendidoMotivo: t.suspendidoMotivo,
      planId: t.planId,
      planNombre: plan?.nombre ?? null,
      featureFlags: (t.featureFlags as Record<string, boolean>) ?? {},
      torneos: counts?.torneos ?? 0,
      equipos: counts?.equipos ?? 0,
      miembros: counts?.miembros ?? 0,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
