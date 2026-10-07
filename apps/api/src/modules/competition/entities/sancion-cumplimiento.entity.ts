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
import { Fecha } from './fecha.entity';
import { SancionActiva } from './sancion-activa.entity';

/**
 * Libro mayor de cumplimiento de sanciones (ADR-0015, T21 — A-4).
 *
 * Una fila = "la fecha X descontó 1 fecha a la sanción Y". El decremento
 * inserta acá con ON CONFLICT DO NOTHING (idempotente por fecha), y la
 * reversión al reabrir una fecha devuelve EXACTAMENTE lo que esa fecha
 * descontó. Antes, la reversión sumaba +1 a TODAS las sanciones del torneo
 * con desde <= N — revivía cumplidas de otras fechas y hasta revocadas.
 *
 * ON DELETE CASCADE en sancion_id: reabrir un acta borra las sanciones
 * automáticas de ese partido, y el ledger de esas sanciones cae con ellas.
 */
@Entity({ name: 'sancion_cumplimientos' })
@Unique('uq_sancion_cumplimiento', ['sancionId', 'fechaId'])
@Index('idx_sancion_cumplimientos_tenant', ['tenantId'])
@Index('idx_sancion_cumplimientos_fecha', ['fechaId'])
export class SancionCumplimiento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'sancion_id', type: 'uuid' })
  sancionId!: string;

  @ManyToOne(() => SancionActiva, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sancion_id' })
  sancion?: SancionActiva;

  @Column({ name: 'fecha_id', type: 'uuid' })
  fechaId!: string;

  @ManyToOne(() => Fecha, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fecha_id' })
  fecha?: Fecha;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
