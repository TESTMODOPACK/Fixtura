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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
