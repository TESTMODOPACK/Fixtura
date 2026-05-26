import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { Torneo } from './torneo.entity';

@Entity({ name: 'series' })
@Index('idx_series_tenant', ['tenantId'])
@Index('idx_series_torneo', ['torneoId'])
export class Serie {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'torneo_id', type: 'uuid' })
  torneoId!: string;

  @ManyToOne(() => Torneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'torneo_id' })
  torneo?: Torneo;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'smallint', default: 0 })
  orden!: number;

  @Column({ name: 'edad_min', type: 'smallint', nullable: true })
  edadMin!: number | null;

  @Column({ name: 'edad_max', type: 'smallint', nullable: true })
  edadMax!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
