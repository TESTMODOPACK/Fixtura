import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { LessThan, Repository } from 'typeorm';

import { MagicLink, MagicLinkPurpose } from './entities/magic-link.entity';

/**
 * Servicio centralizado de magic links. Usado por:
 *   - Sprint 10: invitar personal vía email (purpose='PERSONAL_ONBOARDING').
 *   - Sprint 11: reset de contraseña (purpose='RESET_PASSWORD').
 *   - Futuro: invitar usuarios admin/contador.
 *
 * Seguridad:
 *   - Solo guardamos `token_hash` (sha256), nunca el token plano.
 *   - El token plano se devuelve UNA sola vez al emisor (para mandarlo
 *     por email) y nunca queda en la DB.
 *   - `expires_at` con TTL configurable (72h para onboarding, 30min
 *     para reset password).
 *   - `used_at` previene reuso del mismo link.
 */
@Injectable()
export class MagicLinksService {
  private readonly log = new Logger(MagicLinksService.name);

  constructor(
    @InjectRepository(MagicLink)
    private readonly repo: Repository<MagicLink>,
  ) {}

  /**
   * Crea un magic link y devuelve el token PLANO. El caller debe enviarlo
   * por email/WhatsApp y descartarlo después — la DB solo guarda el hash.
   */
  async crear(args: {
    purpose: MagicLinkPurpose;
    tenantId: string | null;
    email?: string | null;
    personalId?: string | null;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    ttlMinutos: number;
    createdByUserId?: string | null;
  }): Promise<{ id: string; token: string }> {
    // Token: 32 bytes random URL-safe → 43 caracteres base64url.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(token);
    const expiresAt = new Date(Date.now() + args.ttlMinutos * 60 * 1000);

    const link = this.repo.create({
      tenantId: args.tenantId,
      purpose: args.purpose,
      tokenHash,
      email: args.email?.toLowerCase() ?? null,
      personalId: args.personalId ?? null,
      userId: args.userId ?? null,
      metadata: args.metadata ?? null,
      expiresAt,
      createdByUserId: args.createdByUserId ?? null,
    });
    const saved = await this.repo.save(link);
    this.log.log(
      `MagicLink creado purpose=${args.purpose} id=${saved.id} expires=${expiresAt.toISOString()}`,
    );
    return { id: saved.id, token };
  }

  /**
   * Resuelve un token plano a un MagicLink válido (no expirado, no usado).
   * Lanza error explícito según la causa para que la UI muestre el
   * mensaje correcto. NO marca el link como usado — eso es responsabilidad
   * del caller después de aplicar la acción.
   */
  async resolver(token: string, purpose: MagicLinkPurpose): Promise<MagicLink> {
    const tokenHash = this.hash(token);
    const link = await this.repo.findOne({
      where: { tokenHash, purpose },
      relations: { user: true },
    });
    if (!link) {
      throw new NotFoundException('Link inválido o ya usado.');
    }
    if (link.usedAt) {
      throw new BadRequestException('Este link ya fue usado.');
    }
    if (link.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'El link expiró. Pídele al admin que te envíe uno nuevo.',
      );
    }
    return link;
  }

  /**
   * Marca el link como usado. Idempotente — si ya estaba usado, no falla
   * (pero el caller debería resolver primero para detectar reuso).
   */
  async marcarUsado(linkId: string): Promise<void> {
    await this.repo.update({ id: linkId }, { usedAt: new Date() });
  }

  /**
   * Cleanup: borra links expirados hace más de 7 días. Llamable desde
   * un cron de housekeeping cuando se quiera evitar acumular registros.
   */
  async limpiarExpirados(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const r = await this.repo.delete({ expiresAt: LessThan(cutoff) });
    return { deleted: r.affected ?? 0 };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
