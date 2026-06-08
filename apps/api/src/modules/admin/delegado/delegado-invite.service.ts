import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';

import type {
  ActivarDelegadoInfo,
  DelegadoCuenta,
  InvitarDelegadoResponse,
} from '@fixtura/types';

import { MagicLink } from '../../auth/entities/magic-link.entity';
import { MagicLinksService } from '../../auth/magic-links.service';
import { Club } from '../../competition/entities/club.entity';
import { EmailService } from '../../email/email.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UserRole } from '../../users/entities/user-role.entity';
import { UsersService } from '../../users/users.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import type { InvitarDelegadoDto } from './dto';

const BCRYPT_COST = 12;
/** TTL del magic link de invitación (72h, igual que personal). */
const TTL_INVITACION_MIN = 72 * 60;

/**
 * Invitación y activación del DELEGADO de club (F55). El delegado es un
 * usuario real con rol DELEGADO_EQUIPO (scope TEAM, scopeId = clubId).
 *
 * Flujo:
 *  1. Admin invita → se crea un magic link (purpose INVITE_USER) con el
 *     clubId/role en metadata. NO se crea el usuario todavía.
 *  2. El delegado abre /club/activar?token=... y fija su contraseña →
 *     recién ahí se crea el User y se le asigna el rol.
 *
 * El email es el identificador de login, así que es obligatorio aunque el
 * link se entregue por WhatsApp.
 */
@Injectable()
export class DelegadoInviteService {
  constructor(
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(UserRole) private readonly roleRepo: Repository<UserRole>,
    @InjectRepository(MagicLink) private readonly magicLinkRepo: Repository<MagicLink>,
    private readonly magicLinks: MagicLinksService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async invitar(
    clubId: string,
    tenantId: string,
    actorUserId: string | null,
    input: InvitarDelegadoDto,
  ): Promise<InvitarDelegadoResponse> {
    const club = await this.clubRepo.findOne({ where: { id: clubId, tenantId } });
    if (!club) throw new NotFoundException(`Club ${clubId} no encontrado`);

    const email = input.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'El email es obligatorio: es el identificador con el que el delegado inicia sesión.',
      );
    }
    const canal = input.canal ?? 'EMAIL';
    if ((canal === 'WHATSAPP' || canal === 'AMBOS') && !input.telefono) {
      throw new BadRequestException(
        'Para enviar por WhatsApp se necesita el teléfono del delegado.',
      );
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const ligaNombre = tenant?.nombre ?? 'tu liga';

    const { token } = await this.magicLinks.crear({
      purpose: 'INVITE_USER',
      tenantId,
      email,
      metadata: {
        role: 'DELEGADO_EQUIPO',
        clubId,
        clubNombre: club.nombre,
        nombre: input.nombre,
      },
      ttlMinutos: TTL_INVITACION_MIN,
      createdByUserId: actorUserId,
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/club/activar?token=${encodeURIComponent(token)}`;

    let emailEnviado = false;
    let whatsappEnviado = false;

    // El email siempre se envía (es el identificador de login).
    emailEnviado = await this.email.send({
      to: email,
      subject: `Acceso de delegado — ${club.nombre} (${ligaNombre})`,
      html: this.htmlInvitacion(input.nombre, club.nombre, ligaNombre, link),
    });

    if ((canal === 'WHATSAPP' || canal === 'AMBOS') && input.telefono) {
      const r = await this.whatsapp.enviarInvitacionPersonal({
        telefono: input.telefono,
        nombre: input.nombre,
        tenantName: ligaNombre,
        rol: `Delegado de ${club.nombre}`,
        link,
      });
      whatsappEnviado = r.enviado;
    }

    return {
      ok: true,
      emailEnviado,
      whatsappEnviado,
      mensaje: `Invitación generada para ${input.nombre}. Válida por 72 horas.`,
    };
  }

  /** Estado de la cuenta del delegado de un club (para la ficha admin). */
  async estadoCuenta(clubId: string, tenantId: string): Promise<DelegadoCuenta> {
    await this.clubRepo.findOneOrFail({ where: { id: clubId, tenantId } });

    const rolActivo = await this.roleRepo.findOne({
      where: {
        role: 'DELEGADO_EQUIPO',
        scopeType: 'TEAM',
        scopeId: clubId,
        revokedAt: IsNull(),
      },
      relations: { user: true },
    });
    if (rolActivo?.user) {
      return {
        userId: rolActivo.user.id,
        nombre: `${rolActivo.user.nombre} ${rolActivo.user.apellido}`.trim(),
        email: rolActivo.user.email,
        estado: 'ACTIVA',
        invitadoAt: null,
        activadoAt: rolActivo.grantedAt ? rolActivo.grantedAt.toISOString() : null,
      };
    }

    const pendiente = await this.magicLinkRepo
      .createQueryBuilder('m')
      .where('m.purpose = :p', { p: 'INVITE_USER' })
      .andWhere('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.used_at IS NULL')
      .andWhere('m.expires_at > NOW()')
      .andWhere(`m.metadata ->> 'clubId' = :clubId`, { clubId })
      .orderBy('m.created_at', 'DESC')
      .getOne();
    if (pendiente) {
      return {
        userId: null,
        nombre: (pendiente.metadata as { nombre?: string } | null)?.nombre ?? null,
        email: pendiente.email,
        estado: 'PENDIENTE',
        invitadoAt: pendiente.createdAt ? pendiente.createdAt.toISOString() : null,
        activadoAt: null,
      };
    }

    return {
      userId: null,
      nombre: null,
      email: null,
      estado: 'SIN_INVITAR',
      invitadoAt: null,
      activadoAt: null,
    };
  }

  /** Info para la pantalla de activación (no marca el token usado). */
  async infoActivacion(token: string): Promise<ActivarDelegadoInfo> {
    const link = await this.magicLinks.resolver(token, 'INVITE_USER');
    const meta = (link.metadata ?? {}) as {
      role?: string;
      clubNombre?: string;
      nombre?: string;
    };
    if (meta.role !== 'DELEGADO_EQUIPO') {
      throw new BadRequestException('Este link no corresponde a un delegado.');
    }
    const tenant = link.tenantId
      ? await this.tenantRepo.findOne({ where: { id: link.tenantId } })
      : null;
    return {
      nombre: meta.nombre ?? '',
      email: link.email,
      clubNombre: meta.clubNombre ?? '',
      ligaNombre: tenant?.nombre ?? '',
    };
  }

  /** Activa la cuenta: crea el user, fija la clave y asigna el rol. */
  async activar(token: string, password: string): Promise<{ ok: boolean }> {
    const link = await this.magicLinks.resolver(token, 'INVITE_USER');
    const meta = (link.metadata ?? {}) as {
      role?: string;
      clubId?: string;
      nombre?: string;
    };
    if (meta.role !== 'DELEGADO_EQUIPO' || !meta.clubId) {
      throw new BadRequestException('Link de delegado inválido.');
    }
    if (!link.tenantId) {
      throw new BadRequestException('El link no tiene liga asociada.');
    }
    if (!link.email) {
      throw new BadRequestException('La invitación no tiene email.');
    }

    // Defensa: el club del metadata debe pertenecer al tenant del link.
    const club = await this.clubRepo.findOne({
      where: { id: meta.clubId, tenantId: link.tenantId },
    });
    if (!club) {
      throw new ForbiddenException('El club de la invitación no es válido.');
    }

    const partes = (meta.nombre ?? 'Delegado').trim().split(/\s+/);
    const nombre = partes[0] ?? 'Delegado';
    const apellido = partes.slice(1).join(' ');

    const user = await this.users.crearOObtenerPorEmail({
      email: link.email,
      nombre,
      apellido,
    });
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await this.users.setPasswordHash(user.id, hash);
    await this.users.asignarRol({
      userId: user.id,
      tenantId: link.tenantId,
      role: 'DELEGADO_EQUIPO',
      scopeType: 'TEAM',
      scopeId: meta.clubId,
      grantedBy: link.createdByUserId,
    });
    await this.magicLinks.marcarUsado(link.id);
    return { ok: true };
  }

  private htmlInvitacion(
    nombre: string,
    clubNombre: string,
    ligaNombre: string,
    link: string,
  ): string {
    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2>Hola ${nombre},</h2>
        <p>Te invitaron como <strong>delegado de ${clubNombre}</strong> en
        <strong>${ligaNombre}</strong> a través de Fixtura.</p>
        <p>Vas a poder ver la información de tu club: plantel, resultados,
        tarjetas, sanciones y tus deudas — y pagar en línea.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#c2410c;color:#fff;padding:12px 20px;
          border-radius:8px;text-decoration:none;font-weight:600">
            Activar mi cuenta
          </a>
        </p>
        <p style="color:#666;font-size:13px">El enlace vence en 72 horas. Si no
        esperabas esta invitación, ignorá este correo.</p>
      </div>
    `;
  }
}
