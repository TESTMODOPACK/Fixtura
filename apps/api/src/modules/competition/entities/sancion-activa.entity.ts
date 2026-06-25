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
import { Jugador } from './jugador.entity';
import { Partido } from './partido.entity';
import { Torneo } from './torneo.entity';

export type MotivoSancion =
  | 'ACUMULACION_AMARILLAS'
  | 'ROJA_DIRECTA'
  | 'DOBLE_AMARILLA'
  | 'TRIBUNAL';

/**
 * Sanción aplicada sobre RUT × torneo según anexo de correcciones:
 * un jugador que cambia de club dentro del mismo torneo NO evade la
 * sanción porque el lookup es por RUT, no por equipo.
 */
@Entity({ name: 'sanciones_activas' })
@Index('idx_sanciones_activas_tenant', ['tenantId'])
@Index('idx_sanciones_torneo', ['torneoId'])
export class SancionActiva {
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

  @Column({ type: 'varchar', length: 20, nullable: true })
  rut!: string | null;

  // ADR-0005 — jugador del modelo nuevo (solo para mostrar nombre/club).
  // El RUT sigue siendo la clave que impide evadir la sanción cambiando
  // de club.
  @Column({ name: 'jugador_id', type: 'uuid', nullable: true })
  jugadorId!: string | null;

  @ManyToOne(() => Jugador, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'jugador_id' })
  jugador?: Jugador | null;

  @Column({ type: 'varchar', length: 50 })
  motivo!: MotivoSancion;

  @Column({ name: 'fechas_pendientes', type: 'smallint', default: 1 })
  fechasPendientes!: number;

  // Total de fechas de la sanción al momento de crearse. fechasPendientes
  // se decrementa al cumplir; (totales - pendientes) = fechas ya cumplidas.
  @Column({ name: 'fechas_totales', type: 'smallint', nullable: true })
  fechasTotales!: number | null;

  @Column({ name: 'desde_fecha_numero', type: 'smallint' })
  desdeFechaNumero!: number;

  @Column({ name: 'origen_incidencia_partido_id', type: 'uuid', nullable: true })
  origenIncidenciaPartidoId!: string | null;

  @ManyToOne(() => Partido, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'origen_incidencia_partido_id' })
  origenPartido?: Partido | null;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'boolean', default: false })
  cumplida!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
