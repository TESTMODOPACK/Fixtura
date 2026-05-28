import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { PersonalAdmin } from '@fixtura/types';

import { MagicLinksService } from '../../auth/magic-links.service';
import { EmailService } from '../../email/email.service';
import { Personal } from '../../competition/entities/personal.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import type { CreatePersonalDto, UpdatePersonalDto } from './dto';

@Injectable()
export class PersonalAdminService {
  /** TTL del magic link de onboarding (72h por estándar de seguridad). */
  static readonly TTL_INVITACION_MIN = 72 * 60;

  constructor(
    @InjectRepository(Personal) private readonly repo: Repository<Personal>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly magicLinks: MagicLinksService,
    private readonly email: EmailService,
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
  ): Promise<{ enviado: boolean; expira: string; emailDestino: string }> {
    const personal = await this.repo.findOne({ where: { id: personalId, tenantId } });
    if (!personal) throw new NotFoundException(`Personal ${personalId} no encontrado`);
    if (!personal.email) {
      throw new BadRequestException(
        'Este personal no tiene email registrado. Editá el perfil primero.',
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
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/personal/activar?token=${encodeURIComponent(token)}`;

    await this.email.send({
      to: personal.email,
      subject: `[${tenantName}] Activación de cuenta — Fixtura`,
      html: `
        <h2 style="color:#15803d">¡Hola, ${personal.nombre}!</h2>
        <p><strong>${tenantName}</strong> te dio de alta como
        <strong>${personal.rol.replace('_', ' ').toLowerCase()}</strong> en Fixtura.</p>
        <p>Para activar tu cuenta y poder ver tus designaciones, hacé click en este
        botón:</p>
        <p style="margin: 20px 0">
          <a href="${link}"
             style="background:#15803d;color:#fff;padding:12px 24px;
                    border-radius:6px;text-decoration:none;font-weight:bold">
            Activar mi cuenta
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Este link expira en 72 horas. Si no fuiste vos, ignorá este email.
        </p>
        <p>Saludos,<br/>${tenantName}</p>
      `,
      text: `Hola ${personal.nombre}, ${tenantName} te invitó a Fixtura. Activá tu cuenta en: ${link} (expira en 72h).`,
    });

    return {
      enviado: true,
      expira: new Date(
        Date.now() + PersonalAdminService.TTL_INVITACION_MIN * 60 * 1000,
      ).toISOString(),
      emailDestino: personal.email,
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
  async activarPorToken(token: string): Promise<{
    personalId: string;
    tenantId: string | null;
    nombre: string;
    rol: string;
  }> {
    const link = await this.magicLinks.resolver(token, 'PERSONAL_ONBOARDING');
    if (!link.personalId) {
      throw new BadRequestException('El link no apunta a un personal válido.');
    }

    // Cargar personal con bypass de RLS — endpoint público.
    const personal = await this.repo
      .createQueryBuilder('p')
      .where('p.id = :id', { id: link.personalId })
      .getOne();
    if (!personal) {
      throw new NotFoundException('No encontramos el personal asociado al link.');
    }

    // AUDIT-6: defensa en profundidad. El link tiene tenantId firmado;
    // el personal tiene su propio tenant_id en la tabla. Si no coinciden
    // (admin malicioso emitió link a personalId de otro tenant), abortar.
    if (link.tenantId && personal.tenantId !== link.tenantId) {
      throw new BadRequestException(
        'El link no es válido para este personal (mismatch de tenant).',
      );
    }

    await this.magicLinks.marcarUsado(link.id);

    return {
      personalId: personal.id,
      tenantId: link.tenantId,
      nombre: `${personal.nombre} ${personal.apellido}`,
      rol: personal.rol,
    };
  }

  async list(tenantId: string, soloActivos = false): Promise<PersonalAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.apellido', 'ASC')
      .addOrderBy('p.nombre', 'ASC');
    if (soloActivos) qb.andWhere('p.activo = true');
    const rows = await qb.getMany();
    return rows.map(this.toDto);
  }

  async findOne(id: string, tenantId: string): Promise<PersonalAdmin> {
    const p = await this.repo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException(`Personal ${id} no encontrado`);
    return this.toDto(p);
  }

  async create(tenantId: string, input: CreatePersonalDto): Promise<PersonalAdmin> {
    const entity = this.repo.create({
      tenantId,
      nombre: input.nombre,
      apellido: input.apellido,
      rol: input.rol,
      rut: input.rut ?? null,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      tarifaBase: input.tarifaBase ?? null,
      carnetAnfaNumero: input.carnetAnfaNumero ?? null,
      carnetAnfaVence: input.carnetAnfaVence ?? null,
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
    Object.assign(p, {
      nombre: input.nombre ?? p.nombre,
      apellido: input.apellido ?? p.apellido,
      rol: input.rol ?? p.rol,
      rut: input.rut === undefined ? p.rut : input.rut,
      telefono: input.telefono === undefined ? p.telefono : input.telefono,
      email: input.email === undefined ? p.email : input.email,
      tarifaBase:
        input.tarifaBase === undefined ? p.tarifaBase : input.tarifaBase,
      carnetAnfaNumero:
        input.carnetAnfaNumero === undefined
          ? p.carnetAnfaNumero
          : input.carnetAnfaNumero,
      carnetAnfaVence:
        input.carnetAnfaVence === undefined
          ? p.carnetAnfaVence
          : input.carnetAnfaVence,
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

  private toDto(p: Personal): PersonalAdmin {
    return {
      id: p.id,
      userId: p.userId,
      nombre: p.nombre,
      apellido: p.apellido,
      rut: p.rut,
      rol: p.rol,
      telefono: p.telefono,
      email: p.email,
      tarifaBase: p.tarifaBase,
      carnetAnfaNumero: p.carnetAnfaNumero,
      carnetAnfaVence: p.carnetAnfaVence,
      activo: p.activo,
      notas: p.notas,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
