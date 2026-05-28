import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
@Index('idx_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rut!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  apellido!: string;

  @Column({ name: 'foto_url', type: 'varchar', length: 500, nullable: true })
  fotoUrl!: string | null;

  @Column({ name: 'idioma_pref', type: 'varchar', length: 5, default: 'es' })
  idiomaPref!: 'es' | 'en' | 'pt';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  // AUDIT-11: Ley 19.628 — derecho de cancelación. Si está seteado, un
  // cron borrará/anonimizará la cuenta en esa fecha. El user puede
  // cancelar el pedido durante la ventana de gracia (30 días).
  @Column({ name: 'scheduled_deletion_at', type: 'timestamptz', nullable: true })
  scheduledDeletionAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
