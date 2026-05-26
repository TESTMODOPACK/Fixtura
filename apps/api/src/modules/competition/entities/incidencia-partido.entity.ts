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
import { Equipo } from './equipo.entity';
import { JugadorInscrito } from './jugador-inscrito.entity';
import { Partido } from './partido.entity';

export type TipoIncidencia =
  | 'GOL'
  | 'AUTOGOL'
  | 'AMARILLA'
  | 'ROJA'
  | 'AMARILLA_ROJA'
  | 'CAMBIO'
  | 'MVP'
  | 'ASISTENCIA'
  | 'LESION';

@Entity({ name: 'incidencias_partido' })
@Index('idx_incidencias_partido_tenant', ['tenantId'])
@Index('idx_incidencias_partido', ['partidoId'])
@Index('idx_incidencias_tipo', ['tipo'])
export class IncidenciaPartido {
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

  @Column({ name: 'equipo_id', type: 'uuid' })
  equipoId!: string;

  @ManyToOne(() => Equipo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_id' })
  equipo?: Equipo;

  @Column({ name: 'jugador_inscrito_id', type: 'uuid', nullable: true })
  jugadorInscritoId!: string | null;

  @ManyToOne(() => JugadorInscrito, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'jugador_inscrito_id' })
  jugadorInscrito?: JugadorInscrito | null;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoIncidencia;

  @Column({ type: 'smallint', nullable: true })
  minuto!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  detalle!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
