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
import type { EstadoDesignacion } from './designacion.entity';
import { Fecha } from './fecha.entity';
import { Personal } from './personal.entity';

export type RolRecinto = 'PARAMEDICO' | 'OTRO';

/**
 * Designación a un RECINTO (cancha durante una jornada completa), no
 * a un partido específico. Útil para paramédicos y personal de servicio
 * que cubren toda la fecha.
 */
@Entity({ name: 'designaciones_recinto' })
@Index('idx_designaciones_recinto_tenant', ['tenantId'])
@Index('idx_designaciones_recinto_fecha', ['fechaId'])
@Index('idx_designaciones_recinto_personal', ['personalId'])
export class DesignacionRecinto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'fecha_id', type: 'uuid' })
  fechaId!: string;

  @ManyToOne(() => Fecha, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fecha_id' })
  fecha?: Fecha;

  @Column({ name: 'personal_id', type: 'uuid' })
  personalId!: string;

  @ManyToOne(() => Personal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'personal_id' })
  personal?: Personal;

  @Column({ name: 'rol_asignado', type: 'varchar', length: 30 })
  rolAsignado!: RolRecinto;

  @Column({ name: 'cancha_nombre', type: 'varchar', length: 100, nullable: true })
  canchaNombre!: string | null;

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
