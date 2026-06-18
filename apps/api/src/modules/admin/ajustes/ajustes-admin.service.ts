import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { In, Not, Repository } from 'typeorm';

import {
  ROLE,
  ROLE_SCOPE,
  type Branding,
  type CategoriaUsuario,
  type MiembroAdmin,
  type PagosConfig,
  type ProveedorPasarela,
  type Role,
  type TenantSettings,
  type UsuarioSistema,
} from '@fixtura/types';

import { cifrarSecreto } from '../../../common/crypto/secret-box';
import { Club } from '../../competition/entities/club.entity';
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
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
  ) {}

  /**
   * Vista consolidada de TODAS las cuentas con acceso al sistema en el
   * tenant (admin + delegados + personal), con sus roles y contexto. Une
   * user_roles (no revocados) con users; para delegados resuelve el nombre
   * del club desde scope_id.
   */
  async listUsuariosSistema(tenantId: string): Promise<UsuarioSistema[]> {
    const roles = await this.userRoleRepo
      .createQueryBuilder('ur')
      .leftJoinAndSelect('ur.user', 'u')
      .where('ur.tenant_id = :tenantId', { tenantId })
      .andWhere('ur.revoked_at IS NULL')
      .getMany();

    // Nombres de club para los roles de delegado (scope TEAM).
    const clubIds = Array.from(
      new Set(
        roles
          .filter((r) => r.role === ROLE.DELEGADO_EQUIPO && r.scopeId)
          .map((r) => r.scopeId as string),
      ),
    );
    const clubNombre = new Map<string, string>();
    if (clubIds.length > 0) {
      const clubes = await this.clubRepo.find({
        where: { id: In(clubIds), tenantId },
      });
      for (const c of clubes) clubNombre.set(c.id, c.nombre);
    }

    const adminRoles = new Set<Role>([...ROLES_ADMIN, ROLE.SUPER_ADMIN]);
    const personalRoles = new Set<Role>([
      ROLE.ARBITRO,
      ROLE.PLANILLERO,
      ROLE.PARAMEDICO,
      ROLE.SEGURIDAD,
      ROLE.MANTENIMIENTO,
    ]);

    const porUsuario = new Map<string, UsuarioSistema>();
    for (const r of roles) {
      if (!r.user) continue;
      let u = porUsuario.get(r.userId);
      if (!u) {
        u = {
          userId: r.userId,
          email: r.user.email,
          nombre: r.user.nombre,
          apellido: r.user.apellido,
          activo: r.user.isActive,
          ultimoLoginAt: r.user.lastLoginAt
            ? r.user.lastLoginAt.toISOString()
            : null,
          categoria: 'OTRO',
          roles: [],
        };
        porUsuario.set(r.userId, u);
      }
      const contexto =
        r.role === ROLE.DELEGADO_EQUIPO && r.scopeId
          ? (clubNombre.get(r.scopeId) ?? null)
          : null;
      u.roles.push({ role: r.role, contexto });
    }

    // Categoría = la de mayor jerarquía entre los roles del usuario.
    for (const u of porUsuario.values()) {
      const set = new Set(u.roles.map((r) => r.role as Role));
      let categoria: CategoriaUsuario = 'OTRO';
      if ([...set].some((r) => adminRoles.has(r))) categoria = 'ADMIN';
      else if (set.has(ROLE.DELEGADO_EQUIPO)) categoria = 'DELEGADO';
      else if ([...set].some((r) => personalRoles.has(r))) categoria = 'PERSONAL';
      u.categoria = categoria;
    }

    return Array.from(porUsuario.values()).sort((a, b) =>
      `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'),
    );
  }

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

    if (input.requiereCarnetAnfa !== undefined) {
      t.requiereCarnetAnfa = input.requiereCarnetAnfa;
    }

    if (input.pagos !== undefined) {
      const actual = this.pagosConfigDe(t);
      const merged: PagosConfig = {
        transferencia: { ...actual.transferencia, ...input.pagos.transferencia },
        pasarela: {
          habilitada: input.pagos.pasarela?.habilitada ?? actual.pasarela.habilitada,
          proveedor:
            input.pagos.pasarela?.proveedor !== undefined
              ? ((input.pagos.pasarela.proveedor || null) as ProveedorPasarela | null)
              : actual.pasarela.proveedor,
        },
      };
      if (merged.pasarela.habilitada && !merged.pasarela.proveedor) {
        throw new BadRequestException(
          'Elige un proveedor de pasarela (Flow o Khipu) para activar el pago online.',
        );
      }
      t.pagosConfig = merged as unknown as Record<string, unknown>;
    }

    // Credenciales de pasarela — write-only. Se setean las dos juntas para no
    // dejar credenciales a medias; o se limpian con la flag.
    if (input.limpiarCredencialesPasarela) {
      t.pagosSecretosEnc = null;
    } else if (
      (input.flowApiKey && input.flowApiKey.trim()) ||
      (input.flowSecretKey && input.flowSecretKey.trim())
    ) {
      const apiKey = (input.flowApiKey ?? '').trim();
      const secretKey = (input.flowSecretKey ?? '').trim();
      if (!apiKey || !secretKey) {
        throw new BadRequestException(
          'Para guardar las credenciales de Flow necesito el API Key y el Secret Key juntos.',
        );
      }
      t.pagosSecretosEnc = cifrarSecreto(JSON.stringify({ flowApiKey: apiKey, flowSecretKey: secretKey }));
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
        'Ese email pertenece a un usuario desactivado. Reactiva antes de asignar rol.',
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
          'No se puede quitar al único LIGA_ADMIN del tenant. Asigna otro admin primero.',
        );
      }
    }

    // Si es el actor mismo, advertir
    if (role.userId === actorUserId) {
      throw new BadRequestException(
        'No puedes quitarte el rol a ti mismo. Pídele a otro admin que lo haga.',
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
      requiereCarnetAnfa: t.requiereCarnetAnfa ?? false,
      pagos: this.pagosConfigDe(t),
      // Nunca exponemos las llaves; solo si hay credenciales guardadas.
      pasarelaCredencialesCargadas: !!t.pagosSecretosEnc,
    };
  }

  /** pagos_config del tenant con defaults defensivos. */
  private pagosConfigDe(t: Tenant): PagosConfig {
    const raw = (t.pagosConfig ?? {}) as Partial<PagosConfig>;
    return {
      transferencia: {
        habilitada: raw.transferencia?.habilitada ?? false,
        banco: raw.transferencia?.banco,
        tipoCuenta: raw.transferencia?.tipoCuenta,
        numeroCuenta: raw.transferencia?.numeroCuenta,
        titular: raw.transferencia?.titular,
        rut: raw.transferencia?.rut,
        email: raw.transferencia?.email,
        instrucciones: raw.transferencia?.instrucciones,
      },
      pasarela: {
        habilitada: raw.pasarela?.habilitada ?? false,
        proveedor: raw.pasarela?.proveedor ?? null,
      },
    };
  }
}
