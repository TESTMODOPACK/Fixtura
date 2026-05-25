import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import type { Plan, TenantType } from '@fixtura/types';

@Entity({ name: 'tenants' })
@Index('idx_tenants_slug', ['slug'])
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TenantType;

  @Column({ type: 'varchar', length: 20, default: 'STARTER' })
  plan!: Plan;

  @Column({ name: 'branding_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  brandingJson!: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
