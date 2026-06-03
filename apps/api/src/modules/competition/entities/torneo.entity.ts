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
import { Temporada } from './temporada.entity';

export type TipoFormato = 'ROUND_ROBIN' | 'PLAYOFFS' | 'GROUPS' | 'MIXTO';
export type EstadoTorneo = 'DRAFT' | 'ACTIVO' | 'CERRADO';

@Entity({ name: 'torneos' })
@Index('idx_torneos_tenant', ['tenantId'])
@Index('idx_torneos_temporada', ['temporadaId'])
@Index('idx_torneos_estado', ['estado'])
@Unique(['tenantId', 'slug'])
export class Torneo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'temporada_id', type: 'uuid' })
  temporadaId!: string;

  @ManyToOne(() => Temporada, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'temporada_id' })
  temporada?: Temporada;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({ name: 'tipo_formato', type: 'varchar', length: 20, default: 'ROUND_ROBIN' })
  tipoFormato!: TipoFormato;

  @Column({ type: 'smallint', default: 1 })
  ruedas!: 1 | 2;

  @Column({ name: 'puntos_victoria', type: 'smallint', default: 3 })
  puntosVictoria!: number;

  @Column({ name: 'puntos_empate', type: 'smallint', default: 1 })
  puntosEmpate!: number;

  @Column({ name: 'puntos_derrota', type: 'smallint', default: 0 })
  puntosDerrota!: number;

  // Sprint 12 — orden de tiebreakers configurable por torneo.
  // Default: ["pts","dg","gf","nombre"]. Otras keys: gc, pg, ed.
  @Column({ name: 'tabla_tiebreakers', type: 'jsonb', default: () => `'["pts","dg","gf","nombre"]'::jsonb` })
  tablaTiebreakers!: string[];

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  estado!: EstadoTorneo;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio!: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin!: string | null;

  @Column({ name: 'reglamento_url', type: 'varchar', length: 500, nullable: true })
  reglamentoUrl!: string | null;

  // Sprint 25 paso 3 — categoría de jugadores asociada (nullable: torneos
  // viejos sin categoría siguen funcionando). DEPRECADO en favor de
  // categoriasSeries (Sprint 26D, ADR-0004). Se mantiene por back-compat
  // hasta sprint 26G/26F que hacen la migración cascada.
  @Column({ name: 'categoria_id', type: 'uuid', nullable: true })
  categoriaId!: string | null;

  @ManyToOne(() => CategoriaJugadores, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoria_id' })
  categoria?: CategoriaJugadores | null;

  // Sprint 26D (ADR-0004) — multi-categoría + serie + cupo en el torneo.
  // Ej. [{categoriaId, serieSlug:'primera', cupoEquipos:10},
  //      {categoriaId, serieSlug:'segunda', cupoEquipos:8}].
  // Si está vacío, el torneo no tiene división por categorías (back-compat
  // con torneos viejos del modelo previo).
  @Column({
    name: 'categorias_series',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  categoriasSeries!: Array<{
    categoriaId: string;
    serieSlug: string | null;
    cupoEquipos: number;
  }>;

  // Tope de jugadores fichados en la planilla del torneo (ADR-0004).
  // No es el mismo que el cupo de cancha — esto es la "lista grande"
  // del equipo durante la temporada.
  @Column({ name: 'tope_jugadores_por_equipo', type: 'smallint', default: 25 })
  topeJugadoresPorEquipo!: number;

  // Refuerzos: si está habilitado, los equipos pueden sumar jugadores
  // a la planilla durante el torneo hasta la fecha límite.
  @Column({ name: 'refuerzos_habilitados', type: 'boolean', default: true })
  refuerzosHabilitados!: boolean;

  // Número de fecha del torneo hasta la cual se permiten refuerzos.
  // null = sin límite (mientras haya cupo). Se mide por número de fecha
  // (no fecha calendario) para ser robusto contra reprogramaciones.
  @Column({
    name: 'fecha_limite_refuerzos_numero',
    type: 'smallint',
    nullable: true,
  })
  fechaLimiteRefuerzosNumero!: number | null;

  // Sprint 29A — duración del partido configurable por torneo.
  // El match-center lo hereda al arrancar el cronómetro de cada partido.
  // Default 40 min: típico amateur de fútbol 11 con 2 tiempos = 80 min.
  @Column({ name: 'duracion_periodo_minutos', type: 'smallint', default: 40 })
  duracionPeriodoMinutos!: number;

  @Column({ name: 'duracion_entretiempo_minutos', type: 'smallint', default: 10 })
  duracionEntretiempoMinutos!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
