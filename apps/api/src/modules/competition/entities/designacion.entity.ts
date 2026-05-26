import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { Partido } from './partido.entity';
import { Personal, type RolPersonal } from './personal.entity';

export type EstadoDesignacion =
  | 'PROPUESTA'
  | 'CONFIRMADA'
  | 'RECHAZADA'
  | 'ASISTIO'
  | 'AUSENTE';

@Entity({ name: 'designaciones' })
@Unique(['partidoId', 'personalId', 'rolAsignado'])
@Index('idx_designaciones_tenant', ['tenantId'])
@Index('idx_designaciones_partido', ['partidoId'])
@Index('idx_designaciones_personal', ['personalId'])
export class Designacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'partido_id', type: 'uuid' })
  partidoId!: string;

  @ManyToOne(() => Partido, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partido_id' })
  partido?: Partido;

  @Column({ name: 'personal_id', type: 'uuid' })
  personalId!: string;

  @ManyToOne(() => Personal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'personal_id' })
  personal?: Personal;

  @Column({ name: 'rol_asignado', type: 'varchar', length: 30 })
  rolAsignado!: RolPersonal;

  @Column({ type: 'varchar', length: 20, default: 'PROPUESTA' })
  estado!: EstadoDesignacion;

  @Column({ name: 'monto_pago', type: 'int', nullable: true })
  montoPago!: number | null;

  @Column({ name: 'confirmado_at', type: 'timestamptz', nullable: true })
  confirmadoAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
