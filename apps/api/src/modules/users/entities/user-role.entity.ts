import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
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

  // @JoinColumn explícito → TypeORM usa la columna existente 'tenant_id'
  // en vez de crear una FK implícita 'tenantId' (camelCase) que no existe.
  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
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
