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
import { Personal } from './personal.entity';

/**
 * F48 — Ausencia del personal en un rango de fechas calendario.
 *
 * `desde`/`hasta` son fechas calendario inclusivas (no jornadas del torneo):
 * una persona está NO disponible para un partido si la fecha del partido
 * cae dentro de [desde, hasta]. Esto cubre todos los partidos de ese día,
 * incluso de torneos distintos. La auto-asignación y el análisis de
 * cobertura excluyen al personal con ausencia que cubra la fecha.
 */
@Entity({ name: 'ausencias_personal' })
@Index('idx_ausencias_personal_tenant', ['tenantId'])
@Index('idx_ausencias_personal_personal', ['personalId'])
export class AusenciaPersonal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'personal_id', type: 'uuid' })
  personalId!: string;

  @ManyToOne(() => Personal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'personal_id' })
  personal?: Personal;

  @Column({ type: 'date' })
  desde!: string;

  @Column({ type: 'date' })
  hasta!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
