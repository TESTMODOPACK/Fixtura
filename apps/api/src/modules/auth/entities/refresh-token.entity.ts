import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'refresh_tokens' })
@Index('idx_refresh_tokens_user_active', ['userId'], { where: 'revoked_at IS NULL' })
// T23 — el lookup de refresh/reuso busca por hash SOLO (incluye filas ya
// revocadas); el UNIQUE (user_id, token_hash) no cubre esa búsqueda.
@Index('idx_refresh_tokens_hash', ['tokenHash'])
@Unique(['userId', 'tokenHash'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /**
   * H1 (revisión F3) — POR QUÉ se revocó: 'ROTADO' (reemplazado por un
   * refresh nuevo), 'LOGOUT' o 'SEGURIDAD' (revocación masiva: reset,
   * offboarding, reuso). La detección de reuso escala SOLO ante 'ROTADO';
   * sin esto, un dispositivo viejo reintentando tras un reset mataba las
   * sesiones nuevas del dueño en loop.
   */
  @Column({ name: 'revoked_reason', type: 'varchar', length: 20, nullable: true })
  revokedReason!: string | null;

  /**
   * H2 (revisión F3) — tenant elegido al emitir el par (login single-tenant
   * o switch-tenant). El refresh lo reusa si la membresía sigue vigente;
   * sin esto, el usuario multi-liga perdía la liga elegida a los 15 min.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
