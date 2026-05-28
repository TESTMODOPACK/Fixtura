import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Equipo } from './equipo.entity';

export type PieHabil = 'IZQUIERDO' | 'DERECHO' | 'AMBIDIESTRO';

@Entity({ name: 'jugadores_inscritos' })
@Index('idx_jugadores_inscritos_tenant', ['tenantId'])
@Index('idx_jugadores_equipo', ['equipoId'])
export class JugadorInscrito {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'equipo_id', type: 'uuid' })
  equipoId!: string;

  @ManyToOne(() => Equipo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_id' })
  equipo?: Equipo;

  // AUDIT-3: denormalizado desde equipo.torneoId para soportar UNIQUE
  // (tenant, torneo, rut) a nivel DB. Se sincroniza en create/bulkCreate.
  @Column({ name: 'torneo_id', type: 'uuid' })
  torneoId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rut!: string | null;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  apellido!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  apodo!: string | null;

  @Column({ name: 'numero_camiseta', type: 'smallint', nullable: true })
  numeroCamiseta!: number | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  posicion!: string | null;

  @Column({ name: 'pie_habil', type: 'varchar', length: 10, nullable: true })
  pieHabil!: PieHabil | null;

  @Column({ name: 'fecha_nac', type: 'date', nullable: true })
  fechaNac!: string | null;

  @Column({ type: 'boolean', default: false })
  capitan!: boolean;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
