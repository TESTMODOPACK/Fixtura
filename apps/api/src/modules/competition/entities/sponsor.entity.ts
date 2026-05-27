import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';

export type PosicionSponsor = 'HOME_HERO' | 'HEADER' | 'SIDEBAR' | 'FOOTER';

@Entity({ name: 'sponsors' })
@Index('idx_sponsors_tenant', ['tenantId'])
@Index('idx_sponsors_posicion', ['posicion'])
export class Sponsor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ name: 'imagen_url', type: 'varchar', length: 500 })
  imagenUrl!: string;

  @Column({ name: 'link_url', type: 'varchar', length: 500, nullable: true })
  linkUrl!: string | null;

  @Column({ type: 'varchar', length: 20 })
  posicion!: PosicionSponsor;

  @Column({ type: 'smallint', default: 0 })
  prioridad!: number;

  @Column({ name: 'vigente_desde', type: 'date', nullable: true })
  vigenteDesde!: string | null;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ name: 'impresiones_count', type: 'int', default: 0 })
  impresionesCount!: number;

  @Column({ name: 'clicks_count', type: 'int', default: 0 })
  clicksCount!: number;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
