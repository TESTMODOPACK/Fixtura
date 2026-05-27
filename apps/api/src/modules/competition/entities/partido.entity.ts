import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Cancha } from './cancha.entity';
import { Equipo } from './equipo.entity';
import { Fecha } from './fecha.entity';

export type EstadoPartido =
  | 'PROGRAMADO'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'SUSPENDIDO_FUERZA_MAYOR'
  | 'REPROGRAMADO'
  | 'WALKOVER';

@Entity({ name: 'partidos' })
@Index('idx_partidos_tenant', ['tenantId'])
@Index('idx_partidos_fecha', ['fechaId'])
@Index('idx_partidos_estado', ['estado'])
@Check(`"equipo_local_id" <> "equipo_visita_id"`)
export class Partido {
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

  @Column({ name: 'equipo_local_id', type: 'uuid' })
  equipoLocalId!: string;

  @ManyToOne(() => Equipo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_local_id' })
  equipoLocal?: Equipo;

  @Column({ name: 'equipo_visita_id', type: 'uuid' })
  equipoVisitaId!: string;

  @ManyToOne(() => Equipo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_visita_id' })
  equipoVisita?: Equipo;

  @Column({ name: 'cancha_id', type: 'uuid', nullable: true })
  canchaId!: string | null;

  @ManyToOne(() => Cancha, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancha_id' })
  cancha?: Cancha | null;

  // Mantenido por backwards-compat. Cuando canchaId está poblado, este
  // campo se usa como cache para mostrar (admin pueden seguir editándolo
  // como texto libre si no hay cancha en el catálogo todavía).
  @Column({ name: 'cancha_nombre', type: 'varchar', length: 100, nullable: true })
  canchaNombre!: string | null;

  @Column({ name: 'fecha_hora', type: 'timestamptz', nullable: true })
  fechaHora!: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'PROGRAMADO' })
  estado!: EstadoPartido;

  @Column({ name: 'goles_local', type: 'smallint', nullable: true })
  golesLocal!: number | null;

  @Column({ name: 'goles_visita', type: 'smallint', nullable: true })
  golesVisita!: number | null;

  @Column({ name: 'acta_cerrada_at', type: 'timestamptz', nullable: true })
  actaCerradaAt!: Date | null;

  @Column({ name: 'acta_cerrada_by', type: 'uuid', nullable: true })
  actaCerradaBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acta_cerrada_by' })
  actaCerradaByUser?: User | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
