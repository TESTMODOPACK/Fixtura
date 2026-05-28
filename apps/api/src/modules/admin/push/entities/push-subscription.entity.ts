import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Tenant } from '../../../tenants/entities/tenant.entity';
import { User } from '../../../users/entities/user.entity';

export type PushScopeType = 'PARTIDO' | 'EQUIPO' | 'TORNEO' | 'GLOBAL';
export type PushProviderType = 'MOCK' | 'FCM' | 'WEBPUSH';

@Entity({ name: 'push_subscriptions' })
@Index('idx_push_tenant', ['tenantId'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'scope_type', type: 'varchar', length: 20 })
  scopeType!: PushScopeType;

  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'MOCK' })
  provider!: PushProviderType;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'text', nullable: true })
  p256dh!: string | null;

  @Column({ type: 'text', nullable: true })
  auth!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
