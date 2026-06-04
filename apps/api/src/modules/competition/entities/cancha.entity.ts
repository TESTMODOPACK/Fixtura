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

export type SuperficieCancha =
  | 'PASTO_NATURAL'
  | 'PASTO_SINTETICO'
  | 'CEMENTO'
  | 'TIERRA'
  | 'OTRA';

/**
 * Sprint 40 — Estado simple de la cancha. DISPONIBLE = se puede usar
 * para fixture. NO_DISPONIBLE = no se asigna desde el generador y la UI
 * la marca, pero el dato queda y se puede revertir.
 */
export type EstadoCancha = 'DISPONIBLE' | 'NO_DISPONIBLE';

@Entity({ name: 'canchas' })
@Index('idx_canchas_tenant', ['tenantId'])
export class Cancha {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  direccion!: string | null;

  // Numeric en PG → string en TypeORM por defecto. Lo casteamos en service.
  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lat!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lng!: string | null;

  @Column({ type: 'int', nullable: true })
  capacidad!: number | null;

  @Column({ type: 'varchar', length: 30, default: 'PASTO_NATURAL' })
  superficie!: SuperficieCancha;

  @Column({ type: 'boolean', default: false })
  iluminacion!: boolean;

  @Column({ name: 'tiene_camarines', type: 'boolean', default: false })
  tieneCamarines!: boolean;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'boolean', default: true })
  activa!: boolean;

  /**
   * Sprint 40 — Estado operativo. NO_DISPONIBLE bloquea la asignación
   * automática desde el generador del fixture (igual avisa con warning).
   */
  @Column({ type: 'varchar', length: 20, default: 'DISPONIBLE' })
  estado!: EstadoCancha;

  @Column({ name: 'motivo_no_disponible', type: 'text', nullable: true })
  motivoNoDisponible!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
