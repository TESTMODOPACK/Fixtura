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

export type ScopeDiaNoJugable = 'GLOBAL' | 'TORNEO';
export type OrigenDiaNoJugable = 'MANUAL' | 'FERIADO_CHILE' | 'IMPORT';

/**
 * Sprint 16 — RF-13. Día en que la liga NO juega: feriado nacional,
 * elecciones, mantención de cancha, vacaciones, evento externo.
 *
 * Lo respeta el fixture generator (corre la fecha al próximo día
 * válido) y emite warning en update si admin agenda un partido ahí.
 */
@Entity({ name: 'dias_no_jugables' })
@Index('idx_dias_no_jugables_tenant_fecha', ['tenantId', 'fecha'])
export class DiaNoJugable {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'varchar', length: 10, default: 'GLOBAL' })
  scope!: ScopeDiaNoJugable;

  @Column({ name: 'torneo_id', type: 'uuid', nullable: true })
  torneoId!: string | null;

  @ManyToOne(() => Torneo, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'torneo_id' })
  torneo?: Torneo | null;

  @Column({ type: 'varchar', length: 150 })
  motivo!: string;

  @Column({ type: 'varchar', length: 20, default: 'MANUAL' })
  origen!: OrigenDiaNoJugable;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
