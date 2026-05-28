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
