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
import { Club } from './club.entity';
import { Torneo } from './torneo.entity';

export type EstadoEncuestaNps = 'PENDIENTE' | 'RESPONDIDA';

/**
 * Etapa 2 (módulo M5) — encuesta de satisfacción (NPS) que el admin envía
 * al delegado de cada club tras un torneo. Una por (torneo, club).
 *
 * La respuesta llega por un link con token firmado (sin login), igual que
 * la respuesta de designaciones. Por eso el endpoint público re-setea el
 * contexto RLS desde el tenantId del token antes de leer/escribir.
 */
@Entity({ name: 'encuestas_nps' })
@Index('idx_encuestas_nps_tenant', ['tenantId'])
@Index('idx_encuestas_nps_torneo', ['torneoId'])
@Unique('uq_encuesta_nps', ['tenantId', 'torneoId', 'clubId'])
export class EncuestaNps {
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

  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club?: Club;

  @Column({ name: 'email_destino', type: 'varchar', length: 150 })
  emailDestino!: string;

  @Column({ type: 'text' })
  token!: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado!: EstadoEncuestaNps;

  @Column({ type: 'smallint', nullable: true })
  nps!: number | null;

  @Column({ name: 'eval_arbitraje', type: 'smallint', nullable: true })
  evalArbitraje!: number | null;

  @Column({ name: 'eval_recinto', type: 'smallint', nullable: true })
  evalRecinto!: number | null;

  @Column({ name: 'eval_organizacion', type: 'smallint', nullable: true })
  evalOrganizacion!: number | null;

  @Column({ type: 'text', nullable: true })
  comentario!: string | null;

  @Column({ name: 'enviada_at', type: 'timestamptz', nullable: true })
  enviadaAt!: Date | null;

  @Column({ name: 'respondida_at', type: 'timestamptz', nullable: true })
  respondidaAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
