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

/**
 * Sprint 26A (ADR-0004) — Jugador del plantel global del club.
 *
 * NO confundir con la entity vieja `JugadorInscrito` (tabla
 * `jugadores_inscritos`), que sigue existiendo para back-compat hasta
 * el sprint 26G/26F cuando se haga la migración + refactor cascada.
 *
 * Regla "un jugador = un solo equipo en toda la liga":
 *   UNIQUE (tenant_id, rut)
 *
 * Cada jugador pertenece a UN club + UNA categoría. Si la liga tiene
 * Halcones Senior y Halcones Super Senior y Pepe debe estar en ambos,
 * NO se permite (un solo registro con un RUT por tenant).
 */

export type PosicionJugador = 'ARQUERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO';
export type PieHabilJugador = 'IZQUIERDO' | 'DERECHO' | 'AMBIDIESTRO';
export type EstadoJugadorClub = 'ACTIVO' | 'INACTIVO';

@Entity({ name: 'jugadores' })
@Index('idx_jugadores_tenant', ['tenantId'])
@Index('idx_jugadores_club', ['clubId'])
@Index('idx_jugadores_categoria', ['categoriaId'])
@Index('idx_jugadores_rut', ['rut'])
@Unique('uq_jugador_rut', ['tenantId', 'rut'])
export class Jugador {
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

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoriaId!: string;

  @ManyToOne(() => CategoriaJugadores, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  categoria?: CategoriaJugadores;

  @Column({ type: 'varchar', length: 20 })
  rut!: string;

  @Column({ type: 'varchar', length: 100 })
  nombres!: string;

  @Column({ type: 'varchar', length: 100 })
  apellidos!: string;

  @Column({ name: 'fecha_nac', type: 'date', nullable: true })
  fechaNac!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono!: string | null;

  @Column({ name: 'numero_camiseta', type: 'smallint', nullable: true })
  numeroCamiseta!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  posicion!: PosicionJugador | null;

  @Column({ name: 'pie_habil', type: 'varchar', length: 20, nullable: true })
  pieHabil!: PieHabilJugador | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  apodo!: string | null;

  // Contacto de emergencia (sprint 33A). Ambos opcionales — se usan
  // para localizar a un familiar/responsable si el jugador sufre un
  // accidente durante un partido.
  @Column({ name: 'telefono_contacto', type: 'varchar', length: 50, nullable: true })
  telefonoContacto!: string | null;

  @Column({ name: 'nombre_contacto', type: 'varchar', length: 100, nullable: true })
  nombreContacto!: string | null;

  @Column({ type: 'boolean', default: false })
  capitan!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVO' })
  estado!: EstadoJugadorClub;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
