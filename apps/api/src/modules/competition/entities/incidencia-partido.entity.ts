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
import { InscripcionTorneo } from './inscripcion-torneo.entity';
import { Jugador } from './jugador.entity';
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

  // ADR-0005 — "equipo de la incidencia" = InscripcionTorneo. Fuente de verdad.
  @Column({ name: 'inscripcion_id', type: 'uuid', nullable: true })
  inscripcionId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inscripcion_id' })
  inscripcion?: InscripcionTorneo | null;

  // ADR-0005 — referencia al jugador del modelo nuevo (fuente de verdad).
  @Column({ name: 'jugador_id', type: 'uuid', nullable: true })
  jugadorId!: string | null;

  @ManyToOne(() => Jugador, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'jugador_id' })
  jugador?: Jugador | null;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoIncidencia;

  @Column({ type: 'smallint', nullable: true })
  minuto!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  detalle!: Record<string, unknown>;

  // MOV-1 (auditoría) — clave de idempotencia generada por el cliente
  // (uuid v4). Un replay del mismo evento (cola offline, doble-tap,
  // reconexión) reusa la misma clave y el UNIQUE parcial
  // (partido_id, client_key) evita duplicar la incidencia.
  @Column({ name: 'client_key', type: 'uuid', nullable: true })
  clientKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
