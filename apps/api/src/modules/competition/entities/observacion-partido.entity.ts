import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { LadoObservacion, RolAutorObservacion } from '@fixtura/types';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { Partido } from './partido.entity';

/**
 * Informe del partido — observaciones que el árbitro, el planillero o el admin
 * cargan como antecedente disciplinario (conducta de la barra, del DT,
 * incidentes fuera del marcador). Cada entrada se asocia a un lado
 * (local/visita/general) para que el tribunal sepa contra qué club aplica.
 */
@Entity({ name: 'observaciones_partido' })
@Index('idx_obs_partido_tenant', ['tenantId'])
@Index('idx_obs_partido_partido', ['partidoId'])
export class ObservacionPartido {
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

  @Column({ type: 'varchar', length: 10, default: 'GENERAL' })
  lado!: LadoObservacion;

  @Column({ type: 'text' })
  texto!: string;

  // Autor: personal designado (árbitro/planillero) o usuario admin. Guardamos
  // los ids opcionales + un snapshot del nombre y rol para mostrar sin joins y
  // que el dato sobreviva si el personal/usuario se elimina.
  @Column({ name: 'autor_personal_id', type: 'uuid', nullable: true })
  autorPersonalId!: string | null;

  @Column({ name: 'autor_user_id', type: 'uuid', nullable: true })
  autorUserId!: string | null;

  @Column({ name: 'autor_nombre', type: 'varchar', length: 150 })
  autorNombre!: string;

  @Column({ name: 'autor_rol', type: 'varchar', length: 30 })
  autorRol!: RolAutorObservacion;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
