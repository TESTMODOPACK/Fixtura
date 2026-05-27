import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { Not, Repository } from 'typeorm';

import {
  ROLE,
  ROLE_SCOPE,
  type Branding,
  type MiembroAdmin,
  type TenantSettings,
} from '@fixtura/types';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/entities/user-role.entity';
import type {
  BrandingDto,
  InvitarMiembroDto,
  UpdateTenantSettingsDto,
} from './dto';

const ROLES_ADMIN = [
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.LIGA_COORDINADOR_ARBITROS,
  ROLE.LIGA_CONTADOR,
  ROLE.LIGA_COMERCIAL,
  ROLE.TRIBUNAL_DISCIPLINA,
] as const;

@Injectable()
export class AjustesAdminService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
  ) {}

  // ─── Settings ───────────────────────────────────────────────────────
  async getSettings(tenantId: string): Promise<TenantSettings> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant no encontrado');
    return this.toSettings(t);
  }

  async updateSettings(
    tenantId: string,
    input: UpdateTenantSettingsDto,
  ): Promise<TenantSettings> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant no encontrado');

    if (input.nombre !== undefined) t.nombre = input.nombre;

    if (input.customDomain !== undefined) {
      const nuevoDominio = input.customDomain.trim().toLowerCase() || null;
      if (nuevoDominio !== t.customDomain) {
        // Verificar unicidad — un dominio no puede estar en 2 tenants
        if (nuevoDominio) {
          const conflict = await this.tenantRepo.findOne({
            where: { customDomain: nuevoDominio, id: Not(tenantId) },
          });
          if (conflict) {
            throw new ConflictException(
              `El dominio "${nuevoDominio}" ya está en uso por otra liga`,
            );
          }
        }
        t.customDomain = nuevoDominio;
      }
    }

    if (input.branding !== undefined) {
      // Merge defensivo: preservar keys existentes que no vinieron en el
      // PATCH (la UI puede enviar branding parcial).
      const branding = (t.brandingJson as Branding) ?? {};
      const updated: Branding = { ...branding };
      const incoming = input.branding as BrandingDto;
      const setOrDelete = (
        key: keyof Branding,
        value: string | undefined,
      ): void => {
        if (value === undefined) return;
        if (value.trim() === '') {
          delete updated[key];
        } else {
          (updated[key] as string) = value;
        }
      };
      setOrDelete('nombreComercial', incoming.nombreComercial);
      setOrDelete('lemaCorto', incoming.lemaCorto);
      setOrDelete('colorPrimario', incoming.colorPrimario);
      setOrDelete('colorSecundario', incoming.colorSecundario);
      setOrDelete('escudoUrl', incoming.escudoUrl);
      setOrDelete('emailContacto', incoming.emailContacto);
      setOrDelete('telefonoContacto', incoming.telefonoContacto);
      setOrDelete('footerTexto', incoming.footerTexto);
      t.brandingJson = updated as unknown as Record<string, unknown>;
    }

    const saved = await this.tenantRepo.save(t);
    return this.toSettings(saved);
  }

  // ─── Miembros ──────────────────────────────────────────────────────
  async listMiembros(tenantId: string): Promise<MiembroAdmin[]> {
    const roles = await this.userRoleRepo
      .createQueryBuilder('ur')
      .leftJoinAndSelect('ur.user', 'u')
      .where('ur.tenant_id = :tenantId', { tenantId })
      .andWhere('ur.role IN (:...adminRoles)', { adminRoles: [...ROLES_ADMIN] })
      .andWhere('ur.revoked_at IS NULL')
      .orderBy('ur.granted_at', 'ASC')
      .getMany();

    return roles
      .filter((r): r is UserRole & { user: User } => !!r.user)
      .map((r) => ({
        userRoleId: r.id,
        userId: r.userId,
        email: r.user.email,
        nombre: r.user.nombre,
        apellido: r.user.apellido,
        rol: r.role as MiembroAdmin['rol'],
        ultimoLoginAt: r.user.lastLoginAt ? r.user.lastLoginAt.toISOString() : null,
        grantedAt: r.grantedAt.toISOString(),
      }));
  }

  async invitarMiembro(
    tenantId: string,
    grantedBy: string,
    input: InvitarMiembroDto,
  ): Promise<MiembroAdmin> {
    const emailNorm = input.email.toLowerCase().trim();
    if (ROLE_SCOPE[input.rol] !== 'TENANT') {
      throw new BadRequestException(
        `El rol ${input.rol} no es asignable como miembro admin del tenant`,
      );
    }

    let user = await this.userRepo.findOne({ where: { email: emailNorm } });
    if (!user) {
      const passwordHash = await hash(input.passwordTemporal, 12);
      user = this.userRepo.create({
        email: emailNorm,
        passwordHash,
        nombre: input.nombre,
        apellido: input.apellido,
        idiomaPref: 'es',
        isActive: true,
      });
      user = await this.userRepo.save(user);
    } else if (!user.isActive) {
      throw new ConflictException(
        'Ese email pertenece a un usuario desactivado. Reactivá antes de asignar rol.',
      );
    }

    // Chequeo de duplicado de rol
    const existing = await this.userRoleRepo.findOne({
      where: {
        tenantId,
        userId: user.id,
        role: input.rol,
        scopeType: 'TENANT',
      },
    });
    if (existing && !existing.revokedAt) {
      throw new ConflictException(
        `Ese usuario ya tiene el rol ${input.rol} en esta liga`,
      );
    }

    let role: UserRole;
    if (existing && existing.revokedAt) {
      // Re-activar el rol previamente revocado
      existing.revokedAt = null;
      existing.grantedBy = grantedBy;
      role = await this.userRoleRepo.save(existing);
    } else {
      role = await this.userRoleRepo.save(
        this.userRoleRepo.create({
          tenantId,
          userId: user.id,
          role: input.rol,
          scopeType: 'TENANT',
          scopeId: tenantId,
          grantedBy,
        }),
      );
    }

    return {
      userRoleId: role.id,
      userId: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: input.rol as MiembroAdmin['rol'],
      ultimoLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      grantedAt: role.grantedAt.toISOString(),
    };
  }

  async removeMiembro(
    tenantId: string,
    userRoleId: string,
    actorUserId: string,
  ): Promise<void> {
    const role = await this.userRoleRepo.findOne({
      where: { id: userRoleId, tenantId },
    });
    if (!role) throw new NotFoundException(`Rol ${userRoleId} no encontrado`);

    // Evitar lock-out: no permitir borrar el último LIGA_ADMIN del tenant
    if (role.role === ROLE.LIGA_ADMIN) {
      const otrosAdmins = await this.userRoleRepo.count({
        where: {
          tenantId,
          role: ROLE.LIGA_ADMIN,
          scopeType: 'TENANT',
          id: Not(userRoleId),
        },
      });
      if (otrosAdmins === 0) {
        throw new BadRequestException(
          'No se puede quitar al único LIGA_ADMIN del tenant. Asigná otro admin primero.',
        );
      }
    }

    // Si es el actor mismo, advertir
    if (role.userId === actorUserId) {
      throw new BadRequestException(
        'No podés quitarte el rol a vos mismo. Pedile a otro admin que lo haga.',
      );
    }

    role.revokedAt = new Date();
    await this.userRoleRepo.save(role);
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  private toSettings(t: Tenant): TenantSettings {
    return {
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      customDomain: t.customDomain,
      branding: (t.brandingJson as Branding) ?? {},
      plan: t.plan,
      tipo: t.tipo,
      isActive: t.isActive,
    };
  }
}
