import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { CategoriaJugadores } from './categoria-jugadores.entity';
import { Club } from './club.entity';

/**
 * Sprint 26A — Pivote N:N entre Club y CategoriaJugadores.
 *
 * Un club puede competir en varias categorías (Senior, Super Senior...).
 * Se modela como tabla pivote con PK compuesta (club_id, categoria_id)
 * para permitir FK reales y queries JOIN limpias.
 *
 * tenant_id se duplica explícitamente para que la policy RLS sea
 * idéntica al resto (filtrar por current_setting('app.current_tenant_id')).
 */
@Entity({ name: 'club_categorias' })
@Index('idx_club_categorias_tenant', ['tenantId'])
@Index('idx_club_categorias_categoria', ['categoriaId'])
export class ClubCategoria {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @PrimaryColumn({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club?: Club;

  @PrimaryColumn({ name: 'categoria_id', type: 'uuid' })
  categoriaId!: string;

  @ManyToOne(() => CategoriaJugadores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoria_id' })
  categoria?: CategoriaJugadores;
}
