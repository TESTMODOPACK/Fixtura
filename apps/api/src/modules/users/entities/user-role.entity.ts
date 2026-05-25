import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import type { Role, Scope } from '@fixtura/types';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from './user.entity';

@Entity({ name: 'user_roles' })
@Index('idx_user_roles_user', ['userId'])
@Unique(['userId', 'role', 'scopeType', 'scopeId'])
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  tenant?: Tenant | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user?: User;

  @Column({ type: 'varchar', length: 50 })
  role!: Role;

  @Column({ name: 'scope_type', type: 'varchar', length: 20 })
  scopeType!: Scope;

  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId!: string | null;

  @CreateDateColumn({ name: 'granted_at', type: 'timestamptz' })
  grantedAt!: Date;

  @Column({ name: 'granted_by', type: 'uuid', nullable: true })
  grantedBy!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
