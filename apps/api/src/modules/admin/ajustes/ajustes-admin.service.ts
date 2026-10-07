import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { In, IsNull, Not, Repository } from 'typeorm';

import {
  ROLE,
  ROLE_SCOPE,
  type Branding,
  type CategoriaUsuario,
  type InvitarMiembroResultado,
  type MiembroAdmin,
  type PagosConfig,
  type ProveedorPasarela,
  type Role,
  type RolAdminInvitable,
  type SiiTenantConfig,
  type SiiVerificacionResult,
  type TenantSettings,
  type UsuarioSistema,
  type WhatsAppConfig,
} from '@fixtura/types';
import { validarPasswordSegura } from '@fixtura/domain';

import { cifrarSecreto, descifrarSecreto } from '../../../common/crypto/secret-box';
import { esc } from '../../../common/utils/esc';
import { linkConToken } from '../../../common/utils/frontend-url';
import { AuditLogService } from '../../audit';
import { OpenFacturaProvider } from '../sii/sii-provider';
import { AuthService } from '../../auth/auth.service';
import { MagicLinksService } from '../../auth/magic-links.service';
import { Club } from '../../competition/entities/club.entity';
import { EmailService } from '../../email/email.service';
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
    private readonly magicLinks: MagicLinksService,
    private readonly email: EmailService,
    private readonly openFactura: OpenFacturaProvider,
    private readonly audit: AuditLogService,
    private readonly auth: AuthService,
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
      // T28 — el dominio entra a la whitelist de CORS y a la resolución de
      // tenant por host: lo gestiona SOLO el super admin (con verificación
      // DNS). Un PATCH que lo repite sin cambiarlo sigue siendo válido.
      const nuevoDominio = input.customDomain.trim().toLowerCase() || null;
      if (nuevoDominio !== t.customDomain) {
        throw new BadRequestException(
          'El dominio personalizado lo configura el equipo LigaPlus. Escríbenos para activarlo.',
        );
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

    if (input.flyerSemanalDelegados !== undefined) {
      t.flyerSemanalDelegados = input.flyerSemanalDelegados;
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

    // WhatsApp BYO — config no-secreta + token write-only (cifrado).
    if (input.whatsapp !== undefined) {
      const actual = this.whatsappConfigDe(t);
      const merged: WhatsAppConfig = {
        activo: input.whatsapp.activo ?? actual.activo,
        phoneNumberId:
          input.whatsapp.phoneNumberId !== undefined
            ? input.whatsapp.phoneNumberId || null
            : actual.phoneNumberId,
        apiVersion: input.whatsapp.apiVersion ?? actual.apiVersion,
      };
      // Para activar necesitamos phoneNumberId + un token (ya guardado o uno
      // nuevo en este mismo request).
      const tokenDisponible =
        !!t.whatsappTokenEnc || !!(input.whatsappToken && input.whatsappToken.trim());
      if (merged.activo && (!merged.phoneNumberId || !tokenDisponible)) {
        throw new BadRequestException(
          'Para activar WhatsApp necesitas el Phone Number ID y el token de Meta cargados.',
        );
      }
      t.whatsappConfig = merged as unknown as Record<string, unknown>;
    }

    if (input.limpiarWhatsappToken) {
      t.whatsappTokenEnc = null;
    } else if (input.whatsappToken && input.whatsappToken.trim()) {
      t.whatsappTokenEnc = cifrarSecreto(input.whatsappToken.trim());
    }

    // Boletas SII BYO — API key write-only (cifrada) + activo/ambiente. El
    // snapshot del emisor NO se edita acá: lo escribe verificarSii().
    if (input.limpiarSiiApiKey) {
      t.siiApiKeyEnc = null;
      const actual = this.siiConfigDe(t);
      t.siiConfig = {
        ...actual,
        activo: false,
        rutEmisor: null,
        razonSocial: null,
        giro: null,
        direccion: null,
        comuna: null,
        acteco: null,
        verificadoAt: null,
      } as unknown as Record<string, unknown>;
    } else if (input.siiApiKey && input.siiApiKey.trim()) {
      t.siiApiKeyEnc = cifrarSecreto(input.siiApiKey.trim());
    }

    if (input.sii !== undefined) {
      const actual = this.siiConfigDe(t);
      const merged: SiiTenantConfig = {
        ...actual,
        activo: input.sii.activo ?? actual.activo,
        ambiente: input.sii.ambiente ?? actual.ambiente,
      };
      // Para activar necesitamos key cargada (guardada o en este request) y
      // el emisor verificado contra OpenFactura.
      const keyDisponible = !!t.siiApiKeyEnc;
      if (merged.activo && (!keyDisponible || !merged.rutEmisor)) {
        throw new BadRequestException(
          'Para activar la emisión SII carga la API key de OpenFactura y usa "Probar conexión" primero.',
        );
      }
      t.siiConfig = merged as unknown as Record<string, unknown>;
    }

    const saved = await this.tenantRepo.save(t);
    return this.toSettings(saved);
  }

  /**
   * "Probar conexión" SII: valida la API key contra OpenFactura
   * (GET /v2/dte/organization) y persiste el snapshot del emisor en
   * sii_config. Si viene apiKey nueva, se guarda cifrada al éxito.
   */
  async verificarSii(
    tenantId: string,
    input: { apiKey?: string; ambiente?: 'CERTIFICACION' | 'PRODUCCION' },
  ): Promise<SiiVerificacionResult> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t) throw new NotFoundException(`Tenant ${tenantId} no encontrado`);

    const actual = this.siiConfigDe(t);
    const ambiente = input.ambiente ?? actual.ambiente;
    const apiKey =
      input.apiKey?.trim() ||
      (t.siiApiKeyEnc ? descifrarSecreto(t.siiApiKeyEnc) : null);
    if (!apiKey) {
      throw new BadRequestException(
        'Ingresa la API key de OpenFactura para probar la conexión.',
      );
    }

    try {
      const org = await this.openFactura.obtenerOrganizacion({ apiKey, ambiente });
      // Éxito: persistimos key (si vino nueva) + snapshot del emisor.
      if (input.apiKey?.trim()) {
        t.siiApiKeyEnc = cifrarSecreto(input.apiKey.trim());
      }
      t.siiConfig = {
        ...actual,
        ambiente,
        rutEmisor: org.rut,
        razonSocial: org.razonSocial,
        giro: org.giro,
        direccion: org.direccion,
        comuna: org.comuna,
        acteco: org.acteco,
        verificadoAt: new Date().toISOString(),
      } as unknown as Record<string, unknown>;
      await this.tenantRepo.save(t);
      return {
        ok: true,
        rutEmisor: org.rut,
        razonSocial: org.razonSocial,
        giro: org.giro,
        direccion: org.direccion,
        comuna: org.comuna,
        acteco: org.acteco,
        mensaje: `Conexión OK: ${org.razonSocial} (${org.rut}).`,
      };
    } catch (err) {
      return {
        ok: false,
        rutEmisor: null,
        razonSocial: null,
        giro: null,
        direccion: null,
        comuna: null,
        acteco: null,
        mensaje: `No se pudo verificar con OpenFactura: ${(err as Error).message}`,
      };
    }
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
  ): Promise<InvitarMiembroResultado> {
    const emailNorm = input.email.toLowerCase().trim();
    if (ROLE_SCOPE[input.rol] !== 'TENANT') {
      throw new BadRequestException(
        `El rol ${input.rol} no es asignable como miembro admin del tenant`,
      );
    }

    const existente = await this.userRepo.findOne({ where: { email: emailNorm } });

    if (existente) {
      // T25 (M-9) — la cuenta YA existe y es de otra persona: el rol no se
      // asigna directo (cualquier admin podía colgarle roles a un email
      // conocido) ni se devuelven datos de esa cuenta. El dueño recibe un
      // link de aceptación — o lo ignora y nada cambia.
      if (!existente.isActive) {
        throw new ConflictException(
          'Ese email pertenece a un usuario desactivado. Reactiva antes de asignar rol.',
        );
      }
      const rolActual = await this.userRoleRepo.findOne({
        where: {
          tenantId,
          userId: existente.id,
          role: input.rol,
          scopeType: 'TENANT',
        },
      });
      if (rolActual && !rolActual.revokedAt) {
        throw new ConflictException(
          `Ese usuario ya tiene el rol ${input.rol} en esta liga`,
        );
      }
      await this.enviarInvitacionAceptacion(existente, tenantId, input.rol, grantedBy);
      return { tipo: 'INVITACION_ENVIADA', email: emailNorm, rol: input.rol };
    }

    // Cuenta NUEVA: se crea acá y el rol se asigna directo (no hay dueño
    // previo a quien pedirle consentimiento). Por defecto define su
    // contraseña vía magic link; passwordTemporal es el fallback manual.
    let passwordHash: string;
    if (input.passwordTemporal) {
      const errorPwd = validarPasswordSegura(input.passwordTemporal, {
        email: emailNorm,
        nombre: input.nombre,
        apellido: input.apellido,
      });
      if (errorPwd) {
        throw new BadRequestException(errorPwd);
      }
      passwordHash = await hash(input.passwordTemporal, 12);
    } else {
      // Password aleatoria no comunicada: el miembro la define vía el link.
      passwordHash = await hash(randomBytes(24).toString('base64url'), 12);
    }
    const user = await this.userRepo.save(
      this.userRepo.create({
        email: emailNorm,
        passwordHash,
        nombre: input.nombre,
        apellido: input.apellido,
        idiomaPref: 'es',
        isActive: true,
      }),
    );

    const role = await this.userRoleRepo.save(
      this.userRoleRepo.create({
        tenantId,
        userId: user.id,
        role: input.rol,
        scopeType: 'TENANT',
        scopeId: tenantId,
        grantedBy,
      }),
    );

    if (!input.passwordTemporal) {
      await this.enviarInvitacionMagicLink(user);
    }

    return {
      tipo: 'ASIGNADO',
      miembro: {
        userRoleId: role.id,
        userId: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: input.rol as MiembroAdmin['rol'],
        ultimoLoginAt: null,
        grantedAt: role.grantedAt.toISOString(),
      },
    };
  }

  /**
   * T25 (M-9) — invitación con aceptación: el rol se otorga recién cuando
   * el dueño de la cuenta consume el link (purpose INVITE_USER con
   * metadata.tipo = MIEMBRO_ADMIN).
   */
  private async enviarInvitacionAceptacion(
    user: User,
    tenantId: string,
    rol: RolAdminInvitable,
    grantedBy: string,
  ): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const liga = tenant?.nombre ?? 'una liga';
    const { token } = await this.magicLinks.crear({
      purpose: 'INVITE_USER',
      tenantId,
      email: user.email,
      userId: user.id,
      metadata: { tipo: 'MIEMBRO_ADMIN', rol },
      ttlMinutos: 72 * 60,
      createdByUserId: grantedBy,
    });
    const link = linkConToken('/invitacion', token);
    await this.email.send({
      to: user.email,
      subject: `Te invitaron a administrar ${liga} en LigaPlus`,
      html: `
        <h2 style="color:#15803d">Invitación a ${esc(liga)}</h2>
        <p>Hola,</p>
        <p>Te invitaron como <strong>${esc(rol)}</strong> de
        <strong>${esc(liga)}</strong> en LigaPlus. Tu cuenta y tu contraseña
        no cambian: el acceso se agrega solo si aceptas.</p>
        <p style="margin:20px 0">
          <a href="${link}"
             style="background:#15803d;color:#fff;padding:12px 24px;
                    border-radius:6px;text-decoration:none;font-weight:bold">
            Aceptar invitación
          </a>
        </p>
        <p style="color:#666;font-size:13px">El link expira en 72 horas. Si
        no esperabas esta invitación, ignora este correo — no se agregará
        ningún acceso a tu cuenta.</p>
        <p>Saludos,<br/>LigaPlus</p>
      `,
      text: `Te invitaron como ${rol} de ${liga} en LigaPlus. Acepta (expira en 72h): ${link}`,
    });
  }

  /** Datos para la página pública de aceptación (sin consumir el link). */
  async infoInvitacionMiembro(
    token: string,
  ): Promise<{ liga: string; rol: string; email: string }> {
    const link = await this.magicLinks.resolver(token, 'INVITE_USER');
    const meta = (link.metadata ?? {}) as { tipo?: string; rol?: string };
    if (meta.tipo !== 'MIEMBRO_ADMIN' || !link.userId || !link.tenantId || !meta.rol) {
      throw new BadRequestException('El link no corresponde a una invitación de miembro.');
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: link.tenantId } });
    return { liga: tenant?.nombre ?? 'LigaPlus', rol: meta.rol, email: link.email ?? '' };
  }

  /** T25 (M-9) — el dueño de la cuenta acepta: recién acá se otorga el rol. */
  async aceptarInvitacionMiembro(token: string): Promise<{ ok: boolean; liga: string }> {
    const link = await this.magicLinks.resolver(token, 'INVITE_USER');
    const meta = (link.metadata ?? {}) as { tipo?: string; rol?: string };
    if (meta.tipo !== 'MIEMBRO_ADMIN' || !link.userId || !link.tenantId || !meta.rol) {
      throw new BadRequestException('El link no corresponde a una invitación de miembro.');
    }
    // Consumo atómico ANTES de otorgar — dos clicks simultáneos no asignan dos veces.
    await this.magicLinks.consumir(token, 'INVITE_USER');

    const rol = meta.rol as UserRole['role'];
    const existente = await this.userRoleRepo.findOne({
      where: { tenantId: link.tenantId, userId: link.userId, role: rol, scopeType: 'TENANT' },
    });
    if (existente) {
      if (existente.revokedAt) {
        existente.revokedAt = null;
        existente.grantedBy = link.createdByUserId;
        await this.userRoleRepo.save(existente);
      }
    } else {
      await this.userRoleRepo.save(
        this.userRoleRepo.create({
          tenantId: link.tenantId,
          userId: link.userId,
          role: rol,
          scopeType: 'TENANT',
          scopeId: link.tenantId,
          grantedBy: link.createdByUserId,
        }),
      );
    }

    await this.audit.record({
      action: 'ajustes.miembro_invitacion_aceptada',
      tenantId: link.tenantId,
      userId: link.userId,
      entityType: 'UserRole',
      metadata: { rol: meta.rol, linkId: link.id },
    });
    const tenant = await this.tenantRepo.findOne({ where: { id: link.tenantId } });
    return { ok: true, liga: tenant?.nombre ?? 'LigaPlus' };
  }

  /**
   * Sprint TRI — email de invitación con magic link para que el miembro nuevo
   * cree su propia contraseña (reusa el flujo RESET_PASSWORD, 72h). Best-effort:
   * si el email falla, la cuenta + rol ya quedaron creados y el miembro puede
   * usar "olvidé mi contraseña".
   */
  private async enviarInvitacionMagicLink(user: User): Promise<void> {
    try {
      const { token } = await this.magicLinks.crear({
        purpose: 'RESET_PASSWORD',
        tenantId: null,
        email: user.email,
        userId: user.id,
        ttlMinutos: 72 * 60,
      });
      const link = linkConToken('/reset-password', token);
      await this.email.send({
        to: user.email,
        subject: 'Te invitaron a administrar una liga en LigaPlus',
        html: `
          <h2 style="color:#15803d">Bienvenido a LigaPlus</h2>
          <p>Hola ${esc(user.nombre)},</p>
          <p>Te invitaron a administrar una liga en LigaPlus. Crea tu contraseña
          para entrar:</p>
          <p style="margin:20px 0">
            <a href="${link}"
               style="background:#15803d;color:#fff;padding:12px 24px;
                      border-radius:6px;text-decoration:none;font-weight:bold">
              Crear mi contraseña
            </a>
          </p>
          <p style="color:#666;font-size:13px">Este link expira en 72 horas. Si
          no esperabas esta invitación, ignora este correo.</p>
          <p>Saludos,<br/>LigaPlus</p>
        `,
        text: `Te invitaron a administrar una liga en LigaPlus. Crea tu contraseña (expira en 72h): ${link}`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Ajustes] Falló el envío del email de invitación:', err);
    }
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
    if (role.revokedAt) return;

    // Evitar lock-out: no permitir borrar el último LIGA_ADMIN VIGENTE del
    // tenant (un rol revocado no cuenta como admin).
    if (role.role === ROLE.LIGA_ADMIN) {
      const otrosAdmins = await this.userRoleRepo.count({
        where: {
          tenantId,
          role: ROLE.LIGA_ADMIN,
          scopeType: 'TENANT',
          id: Not(userRoleId),
          revokedAt: IsNull(),
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
    // T24 — mismo offboarding que delegado/jugador/personal: se matan las
    // sesiones y el próximo login emite tokens ya sin el rol revocado.
    await this.auth.revocarRefreshTokens(role.userId);
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
      flyerSemanalDelegados: t.flyerSemanalDelegados ?? false,
      pagos: this.pagosConfigDe(t),
      // Nunca exponemos las llaves; solo si hay credenciales guardadas.
      pasarelaCredencialesCargadas: !!t.pagosSecretosEnc,
      whatsapp: this.whatsappConfigDe(t),
      // Nunca exponemos el token; solo si hay uno guardado.
      whatsappTokenCargado: !!t.whatsappTokenEnc,
      sii: this.siiConfigDe(t),
      // Nunca exponemos la API key; solo si hay una guardada.
      siiApiKeyCargada: !!t.siiApiKeyEnc,
    };
  }

  /** whatsapp_config del tenant con defaults defensivos. */
  private whatsappConfigDe(t: Tenant): WhatsAppConfig {
    const raw = (t.whatsappConfig ?? {}) as Partial<WhatsAppConfig>;
    return {
      activo: raw.activo ?? false,
      phoneNumberId: raw.phoneNumberId ?? null,
      apiVersion: raw.apiVersion ?? 'v21.0',
    };
  }

  /** sii_config del tenant con defaults defensivos. */
  private siiConfigDe(t: Tenant): SiiTenantConfig {
    const raw = (t.siiConfig ?? {}) as Partial<SiiTenantConfig>;
    return {
      activo: raw.activo ?? false,
      ambiente: raw.ambiente ?? 'PRODUCCION',
      rutEmisor: raw.rutEmisor ?? null,
      razonSocial: raw.razonSocial ?? null,
      giro: raw.giro ?? null,
      direccion: raw.direccion ?? null,
      comuna: raw.comuna ?? null,
      acteco: raw.acteco ?? null,
      verificadoAt: raw.verificadoAt ?? null,
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
