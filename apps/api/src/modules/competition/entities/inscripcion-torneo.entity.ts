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
import { CategoriaJugadores } from './categoria-jugadores.entity';
import { Club } from './club.entity';
import { Equipo } from './equipo.entity';
import { Torneo } from './torneo.entity';

/**
 * Sprint 26A (ADR-0004) — Inscripción de un club a un torneo.
 *
 * Pivote entre Club y Torneo. Un club puede inscribirse en distintas
 * (categoría, serie) del mismo torneo, pero no dos veces en la misma
 * combinación (UNIQUE torneo_id + club_id + categoria_id).
 *
 * Esta entidad reemplaza progresivamente a `Equipo` como referencia
 * en actas, sanciones, fixture, designaciones. La migración la hace
 * el sprint 26G.
 */
export type EstadoInscripcion =
  | 'INSCRITO'
  | 'ACTIVO'
  | 'RETIRADO'
  | 'SUSPENDIDO';

@Entity({ name: 'inscripciones_torneo' })
@Index('idx_inscripciones_tenant', ['tenantId'])
@Index('idx_inscripciones_torneo', ['torneoId'])
@Index('idx_inscripciones_club', ['clubId'])
@Unique('uq_inscripcion', ['torneoId', 'clubId', 'categoriaId'])
export class InscripcionTorneo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club?: Club;

  @Column({ name: 'torneo_id', type: 'uuid' })
  torneoId!: string;

  @ManyToOne(() => Torneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'torneo_id' })
  torneo?: Torneo;

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoriaId!: string;

  @ManyToOne(() => CategoriaJugadores, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  categoria?: CategoriaJugadores;

  @Column({ name: 'serie_slug', type: 'varchar', length: 50, nullable: true })
  serieSlug!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'INSCRITO' })
  estado!: EstadoInscripcion;

  // Sprint 26G.2 (ADR-0004 shim) — Referencia al "equipo sombra" del
  // modelo viejo que se mantiene sincronizado para que fixture, actas
  // y sanciones sigan funcionando sin refactor. NO se expone al cliente.
  @Column({ name: 'equipo_sombra_id', type: 'uuid', nullable: true })
  equipoSombraId!: string | null;

  @ManyToOne(() => Equipo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'equipo_sombra_id' })
  equipoSombra?: Equipo | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
