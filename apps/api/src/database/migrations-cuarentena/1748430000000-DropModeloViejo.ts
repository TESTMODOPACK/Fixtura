import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-0005 Fase 2 — Drop destructivo del modelo viejo (shim "equipo sombra").
 *
 * El modelo nuevo (Club → InscripcionTorneo → PlanillaTorneo → Jugador) es la
 * única fuente de verdad desde la Fase 1. Esta migración elimina las tablas y
 * columnas FK del modelo viejo que ya nadie lee ni escribe.
 *
 * IRREVERSIBLE EN DATOS: el down() recrea la estructura (tablas/columnas
 * vacías) para revertir el schema, pero los datos del modelo viejo NO se
 * recuperan. Antes de aplicar en prod: pg_dump + verificar que el backfill de
 * Fase 1 mapeó el 100% de las filas (ver scripts/drop-modelo-viejo.sql, que
 * aborta si quedan huérfanos).
 *
 * up() es idempotente (IF EXISTS): seguro de re-correr.
 */
export class DropModeloViejo1748430000000 implements MigrationInterface {
  name = 'DropModeloViejo1748430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Columnas FK al modelo viejo. Al dropear las columnas, Postgres dropea
    // también sus índices y el CHECK ("equipo_local_id" <> "equipo_visita_id").
    await queryRunner.query(`
      ALTER TABLE partidos
        DROP COLUMN IF EXISTS equipo_local_id,
        DROP COLUMN IF EXISTS equipo_visita_id
    `);
    await queryRunner.query(`
      ALTER TABLE incidencias_partido
        DROP COLUMN IF EXISTS equipo_id,
        DROP COLUMN IF EXISTS jugador_inscrito_id
    `);
    await queryRunner.query(`
      ALTER TABLE sanciones_activas
        DROP COLUMN IF EXISTS jugador_inscrito_id
    `);
    await queryRunner.query(`
      ALTER TABLE cobros
        DROP COLUMN IF EXISTS equipo_id
    `);
    await queryRunner.query(`
      ALTER TABLE inscripciones_torneo
        DROP COLUMN IF EXISTS equipo_sombra_id
    `);

    // Tablas del modelo viejo. Orden: primero las que dependen (FK), luego
    // las referenciadas. CASCADE por defensa ante FKs olvidadas.
    await queryRunner.query(`DROP TABLE IF EXISTS jugadores_inscritos CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS equipos CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS series CASCADE`);
  }

  /**
   * Reversión de SCHEMA solamente (no recupera datos). Recrea las tablas y
   * columnas con su estructura original para que un rollback deje el schema
   * en el estado pre-drop. Orden inverso de FKs: series → equipos →
   * jugadores_inscritos → columnas que referencian equipos.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS series (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id   UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        nombre      VARCHAR(100) NOT NULL,
        orden       SMALLINT NOT NULL DEFAULT 0,
        edad_min    SMALLINT,
        edad_max    SMALLINT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_series_tenant ON series(tenant_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS equipos (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id                UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        serie_id                 UUID REFERENCES series(id) ON DELETE SET NULL,
        serie_slug               VARCHAR(50),
        nombre                   VARCHAR(150) NOT NULL,
        slug                     VARCHAR(100) NOT NULL,
        escudo_url               VARCHAR(500),
        color_primario           VARCHAR(7),
        color_secundario         VARCHAR(7),
        delegado_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
        estado                   VARCHAR(20) NOT NULL DEFAULT 'INSCRITO',
        motivo_suspension        VARCHAR(20),
        observaciones_suspension TEXT,
        suspendido_en            TIMESTAMPTZ,
        suspendido_por           UUID,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (torneo_id, slug)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_equipos_tenant ON equipos(tenant_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS jugadores_inscritos (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        equipo_id        UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        torneo_id        UUID NOT NULL,
        user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
        rut              VARCHAR(20),
        nombre           VARCHAR(100) NOT NULL,
        apellido         VARCHAR(100) NOT NULL,
        apodo            VARCHAR(50),
        numero_camiseta  SMALLINT,
        posicion         VARCHAR(30),
        pie_habil        VARCHAR(10),
        fecha_nac        DATE,
        capitan          BOOLEAN NOT NULL DEFAULT FALSE,
        activo           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_jugadores_inscritos_tenant ON jugadores_inscritos(tenant_id)`,
    );

    // Columnas FK al modelo viejo (nullable, sin reponer datos).
    await queryRunner.query(`
      ALTER TABLE partidos
        ADD COLUMN IF NOT EXISTS equipo_local_id UUID REFERENCES equipos(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS equipo_visita_id UUID REFERENCES equipos(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE incidencias_partido
        ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES equipos(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS jugador_inscrito_id UUID REFERENCES jugadores_inscritos(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE sanciones_activas
        ADD COLUMN IF NOT EXISTS jugador_inscrito_id UUID REFERENCES jugadores_inscritos(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE cobros
        ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES equipos(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE inscripciones_torneo
        ADD COLUMN IF NOT EXISTS equipo_sombra_id UUID REFERENCES equipos(id) ON DELETE SET NULL
    `);
  }
}
