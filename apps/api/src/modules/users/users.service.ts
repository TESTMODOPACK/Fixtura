import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import type { Role, Scope } from '@fixtura/types';

import { UserRole } from './entities/user-role.entity';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole) private readonly roleRepo: Repository<UserRole>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} no existe`);
    return u;
  }

  async getActiveRoles(
    userId: string,
  ): Promise<Array<{ role: Role; scope: Scope; scopeId: string | null }>> {
    const rows = await this.roleRepo.find({
      where: { userId, revokedAt: IsNull() },
    });
    return rows.map((r) => ({ role: r.role, scope: r.scopeType, scopeId: r.scopeId }));
  }

  /**
   * Tenant "único" del usuario: el tenant_id distinto entre todos sus roles
   * activos, si hay exactamente uno. Sirve de fallback para usuarios cuyo
   * rol NO es de scope TENANT (ej. DELEGADO_EQUIPO con scope TEAM, o personal
   * con scope PERSONAL) — sin esto el login los dejaba con tenantId=null y
   * RLS quedaba en bypass. Devuelve null si hay 0 o >1 tenants.
   */
  async getSoleTenantId(userId: string): Promise<string | null> {
    const rows = await this.roleRepo.find({
      where: { userId, revokedAt: IsNull() },
    });
    const tenants = new Set(
      rows.map((r) => r.tenantId).filter((t): t is string => !!t),
    );
    return tenants.size === 1 ? [...tenants][0]! : null;
  }

  /**
   * Crea (o devuelve si ya existe) un usuario por email, sin contraseña.
   * Usado por flujos de invitación (el password se setea al activar).
   */
  async crearOObtenerPorEmail(args: {
    email: string;
    nombre: string;
    apellido: string;
  }): Promise<User> {
    const existente = await this.findByEmail(args.email);
    if (existente) return existente;
    const user = this.userRepo.create({
      email: args.email.toLowerCase(),
      nombre: args.nombre,
      apellido: args.apellido,
      passwordHash: null,
      isActive: true,
    });
    return this.userRepo.save(user);
  }

  /**
   * Asigna un rol al usuario (idempotente por el UNIQUE
   * user_id+role+scope_type+scope_id). Si ya existe pero estaba revocado,
   * lo reactiva.
   */
  async asignarRol(args: {
    userId: string;
    tenantId: string | null;
    role: Role;
    scopeType: Scope;
    scopeId: string | null;
    grantedBy?: string | null;
  }): Promise<void> {
    const existente = await this.roleRepo.findOne({
      where: {
        userId: args.userId,
        role: args.role,
        scopeType: args.scopeType,
        scopeId: args.scopeId ?? IsNull(),
      },
    });
    if (existente) {
      if (existente.revokedAt) {
        await this.roleRepo.update({ id: existente.id }, { revokedAt: null });
      }
      return;
    }
    const row = this.roleRepo.create({
      userId: args.userId,
      tenantId: args.tenantId,
      role: args.role,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
      grantedBy: args.grantedBy ?? null,
    });
    await this.roleRepo.save(row);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { lastLoginAt: new Date() });
  }

  /**
   * Setea el password hash. Usado por reset password y por flujos de
   * onboarding que requieran crear credenciales.
   */
  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { passwordHash });
  }
}
