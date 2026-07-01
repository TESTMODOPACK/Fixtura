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
  ActivarJugadorInfo,
  InvitarJugadorResponse,
  JugadorCuenta,
} from '@fixtura/types';
import { validarPasswordSegura } from '@fixtura/domain';

import { MagicLink } from '../../auth/entities/magic-link.entity';
import { MagicLinksService } from '../../auth/magic-links.service';
import { Jugador } from '../../competition/entities/jugador.entity';
import { EmailService } from '../../email/email.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UserRole } from '../../users/entities/user-role.entity';
import { UsersService } from '../../users/users.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import type { InvitarJugadorDto } from './dto';

const BCRYPT_COST = 12;
/** TTL del magic link de invitación (72h, igual que delegado/personal). */
const TTL_INVITACION_MIN = 72 * 60;

/**
 * Invitación y activación del JUGADOR (MOV-2). El jugador es un usuario real
 * con rol JUGADOR (scope PERSONAL, scopeId = jugadorId), igual que el árbitro.
 *
 * Flujo:
 *  1. Admin invita desde la ficha del plantel → magic link (purpose
 *     INVITE_USER) con jugadorId/role en metadata. NO se crea el user aún.
 *  2. El jugador abre /jugador/activar?token=... y fija su contraseña →
 *     recién ahí se crea el User y se le asigna el rol.
 *
 * El nombre sale de la ficha; el email también (o el que provea el admin) y
 * es el identificador de login, así que tiene que existir uno.
 */
@Injectable()
export class JugadorInviteService {
  constructor(
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(UserRole) private readonly roleRepo: Repository<UserRole>,
    @InjectRepository(MagicLink) private readonly magicLinkRepo: Repository<MagicLink>,
    private readonly magicLinks: MagicLinksService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async invitar(
    jugadorId: string,
    tenantId: string,
    actorUserId: string | null,
    input: InvitarJugadorDto,
  ): Promise<InvitarJugadorResponse> {
    const jugador = await this.jugadorRepo.findOne({
      where: { id: jugadorId, tenantId },
      relations: { club: true },
    });
    if (!jugador) throw new NotFoundException(`Jugador ${jugadorId} no encontrado`);

    // El email de la invitación: el que provee el admin o, si no, el de la
    // ficha del jugador. Es el identificador de login → obligatorio.
    const email = (input.email ?? jugador.email)?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'El jugador no tiene email en su ficha. Indica uno: es el identificador con el que inicia sesión.',
      );
    }
    const telefono = input.telefono ?? jugador.telefono;
    const canal = input.canal ?? 'EMAIL';
    if ((canal === 'WHATSAPP' || canal === 'AMBOS') && !telefono) {
      throw new BadRequestException(
        'Para enviar por WhatsApp se necesita el teléfono del jugador.',
      );
    }

    const nombre = `${jugador.nombres} ${jugador.apellidos}`.trim();
    const clubNombre = jugador.club?.nombre ?? 'tu club';
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const ligaNombre = tenant?.nombre ?? 'tu liga';

    const { token } = await this.magicLinks.crear({
      purpose: 'INVITE_USER',
      tenantId,
      email,
      metadata: {
        role: 'JUGADOR',
        jugadorId,
        clubNombre,
        nombre,
      },
      ttlMinutos: TTL_INVITACION_MIN,
      createdByUserId: actorUserId,
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/jugador/activar?token=${encodeURIComponent(token)}`;

    // El email siempre se envía (es el identificador de login).
    const emailEnviado = await this.email.send({
      to: email,
      subject: `Tu acceso de jugador — ${clubNombre} (${ligaNombre})`,
      html: this.htmlInvitacion(nombre, clubNombre, ligaNombre, link),
    });

    let whatsappEnviado = false;
    if ((canal === 'WHATSAPP' || canal === 'AMBOS') && telefono) {
      const r = await this.whatsapp.enviarInvitacionPersonal({
        tenantId,
        telefono,
        nombre,
        tenantName: ligaNombre,
        rol: `Jugador de ${clubNombre}`,
        link,
      });
      whatsappEnviado = r.enviado;
    }

    return {
      ok: true,
      emailEnviado,
      whatsappEnviado,
      mensaje: `Invitación generada para ${nombre}. Válida por 72 horas.`,
    };
  }

  /** Estado de la cuenta del jugador (para la ficha del plantel). */
  async estadoCuenta(jugadorId: string, tenantId: string): Promise<JugadorCuenta> {
    await this.jugadorRepo.findOneOrFail({ where: { id: jugadorId, tenantId } });

    const rolActivo = await this.roleRepo.findOne({
      where: {
        role: 'JUGADOR',
        scopeType: 'PERSONAL',
        scopeId: jugadorId,
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
      .andWhere(`m.metadata ->> 'jugadorId' = :jugadorId`, { jugadorId })
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
  async infoActivacion(token: string): Promise<ActivarJugadorInfo> {
    const link = await this.magicLinks.resolver(token, 'INVITE_USER');
    const meta = (link.metadata ?? {}) as {
      role?: string;
      clubNombre?: string;
      nombre?: string;
    };
    if (meta.role !== 'JUGADOR') {
      throw new BadRequestException('Este link no corresponde a un jugador.');
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

  /** Activa la cuenta: crea el user, fija la clave y asigna el rol JUGADOR. */
  async activar(token: string, password: string): Promise<{ ok: boolean }> {
    const link = await this.magicLinks.resolver(token, 'INVITE_USER');
    const meta = (link.metadata ?? {}) as {
      role?: string;
      jugadorId?: string;
      nombre?: string;
    };
    if (meta.role !== 'JUGADOR' || !meta.jugadorId) {
      throw new BadRequestException('Link de jugador inválido.');
    }
    if (!link.tenantId) {
      throw new BadRequestException('El link no tiene liga asociada.');
    }
    if (!link.email) {
      throw new BadRequestException('La invitación no tiene email.');
    }

    // Defensa: el jugador del metadata debe pertenecer al tenant del link.
    const jugador = await this.jugadorRepo.findOne({
      where: { id: meta.jugadorId, tenantId: link.tenantId },
    });
    if (!jugador) {
      throw new ForbiddenException('El jugador de la invitación no es válido.');
    }

    const partes = (meta.nombre ?? 'Jugador').trim().split(/\s+/);
    const nombre = partes[0] ?? 'Jugador';
    const apellido = partes.slice(1).join(' ');

    const errorPwd = validarPasswordSegura(password, {
      email: link.email,
      nombre,
      apellido,
    });
    if (errorPwd) {
      throw new BadRequestException(errorPwd);
    }

    // crearOObtenerPorEmail dedupe por email: si el jugador ya es usuario
    // (ej. también es delegado), reusa esa cuenta y solo le suma el rol
    // JUGADOR. Así no se crean cuentas duplicadas.
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
      role: 'JUGADOR',
      scopeType: 'PERSONAL',
      scopeId: meta.jugadorId,
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
        <p>Te invitaron a tu perfil de <strong>jugador de ${clubNombre}</strong> en
        <strong>${ligaNombre}</strong> a través de LigaPlus.</p>
        <p>Vas a poder ver tus estadísticas (goles, tarjetas, MVP), tus próximos
        partidos y el estado de tus sanciones.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#0F2A1F;color:#fff;padding:12px 20px;
          border-radius:8px;text-decoration:none;font-weight:600">
            Activar mi cuenta
          </a>
        </p>
        <p style="color:#666;font-size:13px">El enlace vence en 72 horas. Si no
        esperabas esta invitación, ignora este correo.</p>
      </div>
    `;
  }
}
