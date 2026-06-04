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
import { Cancha } from './cancha.entity';
import { Torneo } from './torneo.entity';

/**
 * Sprint 39 — Plantilla de horarios de un torneo, por día de semana.
 *
 * Cada slot es una tripleta (dia_semana, hora, cancha). Al generar el
 * fixture, los partidos se asignan a slots cuyo dia_semana matchee con
 * la fecha calculada de cada jornada. Si sobran partidos, quedan sin
 * horario (fecha_hora null) y el admin los asigna manualmente.
 *
 * dia_semana sigue ISO-8601: 1=Lunes, 7=Domingo.
 */
@Entity({ name: 'horarios_torneo' })
@Index('idx_horarios_torneo', ['torneoId'])
@Index('idx_horarios_tenant', ['tenantId'])
@Unique('uq_horario_slot', ['torneoId', 'diaSemana', 'hora', 'canchaId'])
export class HorarioTorneo {
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

  @Column({ name: 'dia_semana', type: 'smallint' })
  diaSemana!: number;

  /** Formato HH:MM:SS — Postgres TIME. */
  @Column({ type: 'time' })
  hora!: string;

  @Column({ name: 'cancha_id', type: 'uuid', nullable: true })
  canchaId!: string | null;

  @ManyToOne(() => Cancha, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cancha_id' })
  cancha?: Cancha | null;

  @Column({ type: 'smallint', default: 0 })
  orden!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
