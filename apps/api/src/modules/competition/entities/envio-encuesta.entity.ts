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

import { Club } from './club.entity';
import { PlantillaEncuesta } from './plantilla-encuesta.entity';
import { Torneo } from './torneo.entity';

export type EstadoEnvioEncuesta = 'PENDIENTE' | 'RESPONDIDA';

/**
 * Instancia de envío de una plantilla a un (torneo, club) (ADR-0011). El
 * delegado responde desde un link con token firmado, sin login. Una por
 * (plantilla, torneo, club). Reemplaza la parte "instancia" de encuestas_nps.
 */
@Entity({ name: 'envios_encuesta' })
@Index('idx_envios_encuesta_tenant', ['tenantId'])
@Index('idx_envios_encuesta_plantilla', ['plantillaId'])
@Unique('uq_envio_encuesta', ['tenantId', 'plantillaId', 'torneoId', 'clubId'])
export class EnvioEncuesta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'plantilla_id', type: 'uuid' })
  plantillaId!: string;

  @ManyToOne(() => PlantillaEncuesta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla?: PlantillaEncuesta;

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
  estado!: EstadoEnvioEncuesta;

  @Column({ name: 'enviada_at', type: 'timestamptz', nullable: true })
  enviadaAt!: Date | null;

  @Column({ name: 'respondida_at', type: 'timestamptz', nullable: true })
  respondidaAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
