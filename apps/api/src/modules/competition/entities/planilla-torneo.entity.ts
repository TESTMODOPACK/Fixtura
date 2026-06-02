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

import { Tenant } from '../../tenants/entities/tenant.entity';
import { InscripcionTorneo } from './inscripcion-torneo.entity';
import { Jugador } from './jugador.entity';

/**
 * Sprint 26A (ADR-0004) — Planilla del club para un torneo específico.
 *
 * Subset del plantel del club (tabla `jugadores`) que efectivamente
 * juega ese torneo. fechaIncorporacion permite identificar refuerzos
 * que entraron después de iniciar el torneo.
 *
 * El tope de jugadores en la planilla lo define `torneos.tope_jugadores_por_equipo`.
 */
@Entity({ name: 'planilla_torneo' })
@Index('idx_planilla_tenant', ['tenantId'])
@Index('idx_planilla_inscripcion', ['inscripcionId'])
@Index('idx_planilla_jugador', ['jugadorId'])
@Unique('uq_planilla_jugador', ['inscripcionId', 'jugadorId'])
export class PlanillaTorneo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'inscripcion_id', type: 'uuid' })
  inscripcionId!: string;

  @ManyToOne(() => InscripcionTorneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inscripcion_id' })
  inscripcion?: InscripcionTorneo;

  @Column({ name: 'jugador_id', type: 'uuid' })
  jugadorId!: string;

  @ManyToOne(() => Jugador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jugador_id' })
  jugador?: Jugador;

  @Column({
    name: 'fecha_incorporacion',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  fechaIncorporacion!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
