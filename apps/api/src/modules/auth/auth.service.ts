import { randomBytes, createHash } from 'node:crypto';

import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, MoreThan, Repository } from 'typeorm';

import type { AuthTokens, UserContext } from '@fixtura/types';

import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { MagicLinksService } from './magic-links.service';
import { RefreshToken } from './entities/refresh-token.entity';

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  /** TTL del link de reset (corto por seguridad). */
  static readonly TTL_RESET_PASSWORD_MIN = 30;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    private readonly magicLinks: MagicLinksService,
    private readonly email: EmailService,
  ) {}

  /**
   * Sprint 11: solicita un reset de password. Por seguridad, SIEMPRE
   * devuelve OK (no revela si el email existe). Si existe el user,
   * genera magic link 30min y envía email. Si no existe, simulamos
   * el delay y log-only.
   */
  async solicitarResetPassword(email: string): Promise<{ ok: boolean }> {
    const normalizado = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizado);

    if (!user) {
      this.log.log(`Reset solicitado para email inexistente: ${normalizado} (log-only)`);
      return { ok: true };
    }

    const { token } = await this.magicLinks.crear({
      purpose: 'RESET_PASSWORD',
      tenantId: null,
      email: normalizado,
      userId: user.id,
      ttlMinutos: AuthService.TTL_RESET_PASSWORD_MIN,
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.email.send({
      to: normalizado,
      subject: 'Recuperación de contraseña — LigaPlus',
      html: `
        <h2 style="color:#15803d">Recuperación de contraseña</h2>
        <p>Hola,</p>
        <p>Recibimos una solicitud para recuperar tu contraseña en LigaPlus.
        Si fuiste vos, hacé click en este botón para crear una nueva:</p>
        <p style="margin: 20px 0">
          <a href="${link}"
             style="background:#15803d;color:#fff;padding:12px 24px;
                    border-radius:6px;text-decoration:none;font-weight:bold">
            Recuperar contraseña
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Este link expira en 30 minutos. Si no fuiste vos, ignorá este email —
          tu contraseña actual sigue siendo válida.
        </p>
        <p>Saludos,<br/>LigaPlus</p>
      `,
      text: `Recuperación de contraseña LigaPlus. Link (expira en 30min): ${link}`,
    });

    return { ok: true };
  }

  /**
   * Aplica el reset: valida token, hashea password nuevo, invalida
   * refresh tokens previos del usuario (forzar re-login en otros
   * dispositivos por seguridad).
   */
  async aplicarResetPassword(token: string, nuevaPassword: string): Promise<{ ok: boolean }> {
    if (nuevaPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    if (nuevaPassword.length > 200) {
      throw new BadRequestException('La contraseña es demasiado larga.');
    }

    const link = await this.magicLinks.resolver(token, 'RESET_PASSWORD');
    if (!link.userId) {
      throw new BadRequestException('El link no apunta a un usuario válido.');
    }

    const hash = await bcrypt.hash(nuevaPassword, BCRYPT_COST);
    await this.users.setPasswordHash(link.userId, hash);

    // Invalidar TODOS los refresh tokens vigentes del usuario por
    // seguridad — si alguien tenía sesión activa en otro dispositivo,
    // queda forzado a re-login.
    await this.refreshRepo.update(
      { userId: link.userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    await this.magicLinks.marcarUsado(link.id);
    this.log.log(`Reset de password aplicado para user=${link.userId}`);
    return { ok: true };
  }

  async login(
    email: string,
    password: string,
    meta: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    await this.users.updateLastLogin(user.id);

    const roles = await this.users.getActiveRoles(user.id);
    // Tenant default: si tiene un único rol TENANT, se elige ese.
    // Caso multi-tenant: el frontend hará un switch explícito de tenant.
    const tenantRoles = roles.filter((r) => r.scope === 'TENANT');
    // Fallback: roles que NO son scope TENANT (DELEGADO_EQUIPO scope TEAM,
    // personal scope PERSONAL) no aportan tenant por scopeId. Sin esto el
    // usuario quedaba con tenantId=null → RLS en bypass (leak). Usamos el
    // tenant único de sus user_roles.
    const defaultTenantId =
      tenantRoles.length === 1
        ? (tenantRoles[0]!.scopeId ?? null)
        : await this.users.getSoleTenantId(user.id);

    return this.issueTokens(
      {
        userId: user.id,
        email: user.email,
        tenantId: defaultTenantId,
        roles,
        impersonatorId: null,
      },
      meta,
    );
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = sha256(refreshToken);
    const row = await this.refreshRepo.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!row) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    // Rotación: revocamos el viejo y emitimos uno nuevo.
    await this.refreshRepo.update({ id: row.id }, { revokedAt: new Date() });
    const user = await this.users.findByIdOrFail(row.userId);
    const roles = await this.users.getActiveRoles(user.id);
    // Re-resolver tenantId default igual que al login. Sin esto, el
    // refresh perdía el tenantId y dejaba al usuario sin contexto —
    // los endpoints admin devolvían "No hay tenant en el contexto".
    const tenantRoles = roles.filter((r) => r.scope === 'TENANT');
    // Fallback: roles que NO son scope TENANT (DELEGADO_EQUIPO scope TEAM,
    // personal scope PERSONAL) no aportan tenant por scopeId. Sin esto el
    // usuario quedaba con tenantId=null → RLS en bypass (leak). Usamos el
    // tenant único de sus user_roles.
    const defaultTenantId =
      tenantRoles.length === 1
        ? (tenantRoles[0]!.scopeId ?? null)
        : await this.users.getSoleTenantId(user.id);
    return this.issueTokens({
      userId: user.id,
      email: user.email,
      tenantId: defaultTenantId,
      roles,
      impersonatorId: null,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = sha256(refreshToken);
    await this.refreshRepo.update({ tokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /**
   * Genera access + refresh para un UserContext arbitrario.
   * Público porque ImpersonationService lo invoca para emitir tokens
   * con `impersonatorId` distinto a null.
   */
  async issueTokens(
    ctx: UserContext,
    meta: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<AuthTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtlDays = parseDaysFromTtl(this.config.get<string>('JWT_REFRESH_TTL', '7d'));

    // expiresIn es `StringValue` template literal de `ms` — viene de env
    // como string crudo, cast pragmático (validación de formato en .env).
    const accessToken = await this.jwt.signAsync(ctx, {
      expiresIn: accessTtl as `${number}m`,
    });

    const refreshTokenPlain = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
    await this.refreshRepo.insert({
      userId: ctx.userId,
      tokenHash: sha256(refreshTokenPlain),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt,
      revokedAt: null,
    });

    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      accessTokenExpiresIn: ttlToSeconds(accessTtl),
    };
  }

  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function parseDaysFromTtl(ttl: string): number {
  const m = /^(\d+)d$/.exec(ttl);
  return m ? Number(m[1]) : 7;
}

function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return 900;
  }
}
