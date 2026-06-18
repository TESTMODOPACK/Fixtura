import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, IsNull, MoreThan, Repository } from 'typeorm';

import type {
  ActivarPersonalInfo,
  CanalInvitacion,
  CuentaEstado,
  InvitarPersonalResponse,
  PersonalAdmin,
  Role,
  RolPersonal,
} from '@fixtura/types';
import { ROLE_SCOPE } from '@fixtura/types';
import { validarPasswordSegura } from '@fixtura/domain';

import { MagicLink } from '../../auth/entities/magic-link.entity';
import { MagicLinksService } from '../../auth/magic-links.service';
import { EmailService } from '../../email/email.service';
import { Personal } from '../../competition/entities/personal.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UsersService } from '../../users/users.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import type { CreatePersonalDto, UpdatePersonalDto } from './dto';

const BCRYPT_COST = 12;

/** Mapea el rol operativo del personal al rol de sistema (login). */
const ROL_PERSONAL_TO_SYSTEM: Record<RolPersonal, Role | null> = {
  ARBITRO_PRINCIPAL: 'ARBITRO',
  ARBITRO_ASISTENTE: 'ARBITRO',
  PLANILLERO: 'PLANILLERO',
  PARAMEDICO: 'PARAMEDICO',
  OTRO: null,
};

@Injectable()
export class PersonalAdminService {
  /** TTL del magic link de onboarding (72h por estándar de seguridad). */
  static readonly TTL_INVITACION_MIN = 72 * 60;

  constructor(
    @InjectRepository(Personal) private readonly repo: Repository<Personal>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(MagicLink) private readonly magicLinkRepo: Repository<MagicLink>,
    private readonly magicLinks: MagicLinksService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
    private readonly users: UsersService,
  ) {}

  /**
   * Sprint 10: invita al personal a registrarse vía email. Genera un
   * magic link con TTL 72h y lo envía al `email` del personal. Si no
   * tiene email registrado, falla con instrucciones.
   *
   * El link apunta a /personal/activar?token=... en el frontend, que
   * pide al user crear su contraseña y completar perfil.
   */
  async invitar(
    personalId: string,
    tenantId: string,
    actorUserId: string | null,
    canal: CanalInvitacion = 'EMAIL',
  ): Promise<InvitarPersonalResponse> {
    const personal = await this.repo.findOne({ where: { id: personalId, tenantId } });
    if (!personal) throw new NotFoundException(`Personal ${personalId} no encontrado`);

    // Validar pre-requisitos por canal antes de gastar token / enviar.
    const usaEmail = canal === 'EMAIL' || canal === 'AMBOS';
    const usaWhatsapp = canal === 'WHATSAPP' || canal === 'AMBOS';
    if (usaEmail && !personal.email) {
      throw new BadRequestException(
        'Este personal no tiene email registrado. Edita el perfil o cambia a canal WhatsApp.',
      );
    }
    if (usaWhatsapp && !personal.telefono) {
      throw new BadRequestException(
        'Este personal no tiene teléfono registrado. Edita el perfil o cambia a canal Email.',
      );
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const tenantName = tenant?.nombre ?? 'la liga';

    const { token } = await this.magicLinks.crear({
      purpose: 'PERSONAL_ONBOARDING',
      tenantId,
      email: personal.email,
      personalId: personal.id,
      ttlMinutos: PersonalAdminService.TTL_INVITACION_MIN,
      createdByUserId: actorUserId,
      metadata: {
        nombre: `${personal.nombre} ${personal.apellido}`,
        rol: personal.rol,
        canal,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/personal/activar?token=${encodeURIComponent(token)}`;
    const rolHumano = personal.rol.replace('_', ' ').toLowerCase();
    const errores: string[] = [];
    let algunEnviado = false;

    if (usaEmail && personal.email) {
      try {
        await this.email.send({
          to: personal.email,
          subject: `[${tenantName}] Activación de cuenta — LigaPlus`,
          html: `
            <h2 style="color:#15803d">¡Hola, ${personal.nombre}!</h2>
            <p><strong>${tenantName}</strong> te dio de alta como
            <strong>${rolHumano}</strong> en LigaPlus.</p>
            <p>Para activar tu cuenta y poder ver tus designaciones, haz click en este
            botón:</p>
            <p style="margin: 20px 0">
              <a href="${link}"
                 style="background:#15803d;color:#fff;padding:12px 24px;
                        border-radius:6px;text-decoration:none;font-weight:bold">
                Activar mi cuenta
              </a>
            </p>
            <p style="color:#666;font-size:13px">
              Este link expira en 72 horas. Si no fuiste tú, ignora este email.
            </p>
            <p>Saludos,<br/>${tenantName}</p>
          `,
          text: `Hola ${personal.nombre}, ${tenantName} te invitó a LigaPlus. Activa tu cuenta en: ${link} (expira en 72h).`,
        });
        algunEnviado = true;
      } catch (err) {
        errores.push(`Email: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (usaWhatsapp && personal.telefono) {
      const result = await this.whatsapp.enviarInvitacionPersonal({
        telefono: personal.telefono,
        nombre: personal.nombre,
        tenantName,
        rol: rolHumano,
        link,
      });
      if (result.enviado) {
        algunEnviado = true;
      } else {
        errores.push(`WhatsApp: ${result.error ?? 'falló sin error explícito'}`);
      }
    }

    // En modo AMBOS, basta con que UNO de los dos haya salido para no
    // bloquear el flujo. El admin ve los errores parciales en la respuesta.
    if (!algunEnviado) {
      throw new BadRequestException(
        `No se pudo enviar la invitación por ningún canal. Errores: ${errores.join(' | ')}`,
      );
    }

    return {
      enviado: true,
      canal,
      emailDestino: usaEmail ? personal.email : null,
      telefonoDestino: usaWhatsapp ? personal.telefono : null,
      expira: new Date(
        Date.now() + PersonalAdminService.TTL_INVITACION_MIN * 60 * 1000,
      ).toISOString(),
      errores,
    };
  }

  /**
   * Activa una cuenta desde el magic link. Marca el personal como
   * "activado" via metadata (no requiere user_id porque el modelo de
   * users separado vive en otra tabla — v2 vinculará user_id).
   *
   * Por ahora solo valida el token y devuelve el personal info para que
   * el frontend muestre confirmación. La creación del User asociado se
   * difiere a v2 (require flow de password setup).
   */
  /**
   * Carga el personal asociado a un token de onboarding, validando tenant.
   * NO consume el token (se usa para mostrar la pantalla de activación).
   */
  private async resolverPersonalDeToken(token: string): Promise<{
    link: MagicLink;
    personal: Personal;
  }> {
    const link = await this.magicLinks.resolver(token, 'PERSONAL_ONBOARDING');
    if (!link.personalId) {
      throw new BadRequestException('El link no apunta a un personal válido.');
    }
    // Bypass de RLS — endpoint público.
    const personal = await this.repo
      .createQueryBuilder('p')
      .where('p.id = :id', { id: link.personalId })
      .getOne();
    if (!personal) {
      throw new NotFoundException('No encontramos el personal asociado al link.');
    }
    // AUDIT-6: el link tiene tenantId firmado; debe coincidir con el del personal.
    if (link.tenantId && personal.tenantId !== link.tenantId) {
      throw new BadRequestException(
        'El link no es válido para este personal (mismatch de tenant).',
      );
    }
    return { link, personal };
  }

  /** Info para la pantalla de activación (no consume el token). */
  async infoActivacion(token: string): Promise<ActivarPersonalInfo> {
    const { link, personal } = await this.resolverPersonalDeToken(token);
    const tenant = link.tenantId
      ? await this.tenantRepo.findOne({ where: { id: link.tenantId } })
      : null;
    return {
      nombre: `${personal.nombre} ${personal.apellido}`,
      email: personal.email,
      rol: personal.rol,
      ligaNombre: tenant?.nombre ?? '',
    };
  }

  /**
   * Activa la cuenta del personal: crea (o reusa) el User por email, fija la
   * contraseña, le asigna los roles de sistema según sus roles operativos y
   * vincula user_id en el registro de personal. Consume el token.
   */
  async activarConPassword(
    token: string,
    password: string,
  ): Promise<{ ok: boolean }> {
    const { link, personal } = await this.resolverPersonalDeToken(token);
    if (!personal.email) {
      throw new BadRequestException(
        'Este personal no tiene email registrado; no se puede crear la cuenta.',
      );
    }
    if (!link.tenantId) {
      throw new BadRequestException('El link no tiene liga asociada.');
    }

    const errorPwd = validarPasswordSegura(password, {
      email: personal.email,
      nombre: personal.nombre,
      apellido: personal.apellido,
    });
    if (errorPwd) {
      throw new BadRequestException(errorPwd);
    }

    const user = await this.users.crearOObtenerPorEmail({
      email: personal.email,
      nombre: personal.nombre,
      apellido: personal.apellido,
    });
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await this.users.setPasswordHash(user.id, hash);

    // Mapear roles operativos → roles de sistema (scope PERSONAL, scopeId =
    // personalId). Dedup. OTRO no mapea a un rol de sistema.
    const rolesOperativos = personal.roles?.length ? personal.roles : [personal.rol];
    const sistemaRoles = new Set<Role>();
    for (const r of rolesOperativos) {
      const sys = ROL_PERSONAL_TO_SYSTEM[r];
      if (sys) sistemaRoles.add(sys);
    }
    for (const role of sistemaRoles) {
      await this.users.asignarRol({
        userId: user.id,
        tenantId: link.tenantId,
        role,
        scopeType: ROLE_SCOPE[role],
        scopeId: personal.id,
        grantedBy: link.createdByUserId,
      });
    }

    // Vincular el user al registro de personal.
    await this.repo.update({ id: personal.id }, { userId: user.id });

    await this.magicLinks.marcarUsado(link.id);
    return { ok: true };
  }

  async list(tenantId: string, soloActivos = false): Promise<PersonalAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.apellido', 'ASC')
      .addOrderBy('p.nombre', 'ASC');
    if (soloActivos) qb.andWhere('p.activo = true');
    const rows = await qb.getMany();

    // PENDIENTE = tiene una invitación de onboarding sin usar y no vencida,
    // y todavía no creó su cuenta (sin userId).
    const sinCuenta = rows.filter((r) => !r.userId).map((r) => r.id);
    const pendientes = new Set<string>();
    if (sinCuenta.length > 0) {
      const invites = await this.magicLinkRepo.find({
        where: {
          purpose: 'PERSONAL_ONBOARDING',
          personalId: In(sinCuenta),
          usedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        select: { personalId: true },
      });
      for (const i of invites) if (i.personalId) pendientes.add(i.personalId);
    }

    return rows.map((p) =>
      this.toDto(
        p,
        p.userId ? 'ACTIVA' : pendientes.has(p.id) ? 'PENDIENTE' : 'SIN_INVITAR',
      ),
    );
  }

  async findOne(id: string, tenantId: string): Promise<PersonalAdmin> {
    const p = await this.repo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException(`Personal ${id} no encontrado`);
    return this.toDto(p);
  }

  /**
   * El email del personal debe ser único por liga: se usa como usuario de
   * login (activación de cuenta). Comparación case-insensitive.
   */
  private async assertEmailUnico(
    tenantId: string,
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('LOWER(p.email) = LOWER(:email)', { email });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException(
        'Ya existe otra persona registrada con ese email en esta liga.',
      );
    }
  }

  async create(tenantId: string, input: CreatePersonalDto): Promise<PersonalAdmin> {
    // F53 — multi-rol. El rol primario se deriva del primero seleccionado.
    const roles = input.roles?.length ? input.roles : input.rol ? [input.rol] : [];
    const rolPrimario = roles[0];
    const emailNorm = input.email?.trim() || null;
    if (emailNorm) await this.assertEmailUnico(tenantId, emailNorm);
    const entity = this.repo.create({
      tenantId,
      nombre: input.nombre,
      apellido: input.apellido,
      rol: rolPrimario,
      roles,
      rut: input.rut ?? null,
      telefono: input.telefono ?? null,
      email: emailNorm,
      tarifaBase: input.tarifaBase ?? null,
      tarifaArbitroPrincipal: input.tarifaArbitroPrincipal ?? null,
      tarifaArbitroAsistente: input.tarifaArbitroAsistente ?? null,
      carnetAnfaNumero: input.carnetAnfaNumero ?? null,
      carnetAnfaVence: input.carnetAnfaVence ?? null,
      banco: input.banco?.trim() || null,
      tipoCuenta: input.tipoCuenta ?? null,
      numeroCuenta: input.numeroCuenta?.trim() || null,
      titularNombre: input.titularNombre?.trim() || null,
      titularRut: input.titularRut?.trim() || null,
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
    // F53 — si llegan roles, recalculamos roles + rol primario.
    const rolesNuevos =
      input.roles && input.roles.length ? input.roles : undefined;
    const emailNorm =
      input.email === undefined ? undefined : input.email?.trim() || null;
    if (emailNorm) await this.assertEmailUnico(tenantId, emailNorm, id);
    Object.assign(p, {
      nombre: input.nombre ?? p.nombre,
      apellido: input.apellido ?? p.apellido,
      roles: rolesNuevos ?? p.roles,
      rol: rolesNuevos ? rolesNuevos[0] : input.rol ?? p.rol,
      rut: input.rut === undefined ? p.rut : input.rut,
      telefono: input.telefono === undefined ? p.telefono : input.telefono,
      email: emailNorm === undefined ? p.email : emailNorm,
      tarifaBase:
        input.tarifaBase === undefined ? p.tarifaBase : input.tarifaBase,
      tarifaArbitroPrincipal:
        input.tarifaArbitroPrincipal === undefined
          ? p.tarifaArbitroPrincipal
          : input.tarifaArbitroPrincipal,
      tarifaArbitroAsistente:
        input.tarifaArbitroAsistente === undefined
          ? p.tarifaArbitroAsistente
          : input.tarifaArbitroAsistente,
      carnetAnfaNumero:
        input.carnetAnfaNumero === undefined
          ? p.carnetAnfaNumero
          : input.carnetAnfaNumero,
      carnetAnfaVence:
        input.carnetAnfaVence === undefined
          ? p.carnetAnfaVence
          : input.carnetAnfaVence,
      banco: input.banco === undefined ? p.banco : input.banco?.trim() || null,
      tipoCuenta:
        input.tipoCuenta === undefined ? p.tipoCuenta : input.tipoCuenta,
      numeroCuenta:
        input.numeroCuenta === undefined
          ? p.numeroCuenta
          : input.numeroCuenta?.trim() || null,
      titularNombre:
        input.titularNombre === undefined
          ? p.titularNombre
          : input.titularNombre?.trim() || null,
      titularRut:
        input.titularRut === undefined
          ? p.titularRut
          : input.titularRut?.trim() || null,
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

  private toDto(p: Personal, cuentaEstado?: CuentaEstado): PersonalAdmin {
    return {
      id: p.id,
      userId: p.userId,
      cuentaEstado: cuentaEstado ?? (p.userId ? 'ACTIVA' : 'SIN_INVITAR'),
      nombre: p.nombre,
      apellido: p.apellido,
      rut: p.rut,
      rol: p.rol,
      roles: p.roles && p.roles.length ? p.roles : [p.rol],
      telefono: p.telefono,
      email: p.email,
      tarifaBase: p.tarifaBase,
      tarifaArbitroPrincipal: p.tarifaArbitroPrincipal,
      tarifaArbitroAsistente: p.tarifaArbitroAsistente,
      carnetAnfaNumero: p.carnetAnfaNumero,
      carnetAnfaVence: p.carnetAnfaVence,
      activo: p.activo,
      banco: p.banco,
      tipoCuenta: p.tipoCuenta,
      numeroCuenta: p.numeroCuenta,
      titularNombre: p.titularNombre,
      titularRut: p.titularRut,
      notas: p.notas,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
