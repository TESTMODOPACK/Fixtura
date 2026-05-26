import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema completo del core deportivo.
 *
 * Todas las tablas son tenant-scoped: tienen tenant_id NOT NULL, índice
 * en tenant_id, RLS habilitado con FORCE y policy estándar.
 *
 * El patrón de policy es siempre el mismo:
 *   USING (
 *     tenant_id::text = current_setting('app.current_tenant_id', true)
 *     OR current_setting('app.current_tenant_id', true) = ''
 *   )
 *
 * Sin `app.current_tenant_id` seteado (caso de cron jobs sin tenant
 * context o queries crudas), las queries retornan 0 filas — falla
 * silenciosa segura. El TenantContextInterceptor lo setea en cada
 * request autenticado.
 */
export class CompetitionSchema1748245000000 implements MigrationInterface {
  name = 'CompetitionSchema1748245000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── temporadas ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE temporadas (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        nombre      VARCHAR(100) NOT NULL,
        anio        SMALLINT NOT NULL,
        fecha_inicio DATE,
        fecha_fin    DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'temporadas');
    await queryRunner.query(
      `CREATE TRIGGER trg_temporadas_updated_at BEFORE UPDATE ON temporadas FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );

    // ─── torneos ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE torneos (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        temporada_id    UUID NOT NULL REFERENCES temporadas(id) ON DELETE CASCADE,
        nombre          VARCHAR(200) NOT NULL,
        slug            VARCHAR(100) NOT NULL,
        tipo_formato    VARCHAR(20) NOT NULL DEFAULT 'ROUND_ROBIN'
                          CHECK (tipo_formato IN ('ROUND_ROBIN','PLAYOFFS','GROUPS','MIXTO')),
        ruedas          SMALLINT NOT NULL DEFAULT 1 CHECK (ruedas IN (1,2)),
        puntos_victoria SMALLINT NOT NULL DEFAULT 3,
        puntos_empate   SMALLINT NOT NULL DEFAULT 1,
        puntos_derrota  SMALLINT NOT NULL DEFAULT 0,
        estado          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                          CHECK (estado IN ('DRAFT','ACTIVO','CERRADO')),
        fecha_inicio    DATE,
        fecha_fin       DATE,
        reglamento_url  VARCHAR(500),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, slug)
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'torneos');
    await queryRunner.query(`CREATE INDEX idx_torneos_temporada ON torneos(temporada_id)`);
    await queryRunner.query(`CREATE INDEX idx_torneos_estado ON torneos(estado)`);
    await queryRunner.query(
      `CREATE TRIGGER trg_torneos_updated_at BEFORE UPDATE ON torneos FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );

    // ─── series (categorías) ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE series (
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
    await this.applyRlsAndIndex(queryRunner, 'series');
    await queryRunner.query(`CREATE INDEX idx_series_torneo ON series(torneo_id)`);

    // ─── equipos ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE equipos (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id         UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        serie_id          UUID REFERENCES series(id) ON DELETE SET NULL,
        nombre            VARCHAR(150) NOT NULL,
        slug              VARCHAR(100) NOT NULL,
        escudo_url        VARCHAR(500),
        color_primario    VARCHAR(7),
        color_secundario  VARCHAR(7),
        delegado_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
        estado            VARCHAR(20) NOT NULL DEFAULT 'INSCRITO'
                            CHECK (estado IN ('INSCRITO','ACTIVO','RETIRADO','SUSPENDIDO')),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (torneo_id, slug)
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'equipos');
    await queryRunner.query(`CREATE INDEX idx_equipos_torneo ON equipos(torneo_id)`);
    await queryRunner.query(
      `CREATE TRIGGER trg_equipos_updated_at BEFORE UPDATE ON equipos FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );

    // ─── jugadores_inscritos ─────────────────────────────────────────
    // Plantilla por equipo. user_id es nullable porque algunos jugadores
    // no tendrán cuenta en la plataforma (importados desde CSV).
    await queryRunner.query(`
      CREATE TABLE jugadores_inscritos (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        equipo_id       UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
        rut             VARCHAR(20),
        nombre          VARCHAR(100) NOT NULL,
        apellido        VARCHAR(100) NOT NULL,
        apodo           VARCHAR(50),
        numero_camiseta SMALLINT,
        posicion        VARCHAR(30),
        pie_habil       VARCHAR(10) CHECK (pie_habil IN ('IZQUIERDO','DERECHO','AMBIDIESTRO')),
        fecha_nac       DATE,
        capitan         BOOLEAN NOT NULL DEFAULT FALSE,
        activo          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'jugadores_inscritos');
    await queryRunner.query(`CREATE INDEX idx_jugadores_equipo ON jugadores_inscritos(equipo_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_jugadores_rut ON jugadores_inscritos(rut) WHERE rut IS NOT NULL`,
    );

    // ─── fechas ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE fechas (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id     UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        numero        SMALLINT NOT NULL,
        etiqueta      VARCHAR(200),
        fecha_inicio  DATE,
        fecha_fin     DATE,
        estado        VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADA'
                        CHECK (estado IN ('PROGRAMADA','EN_CURSO','FINALIZADA','SUSPENDIDA','REPROGRAMADA')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (torneo_id, numero)
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'fechas');
    await queryRunner.query(`CREATE INDEX idx_fechas_torneo ON fechas(torneo_id)`);

    // ─── partidos ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE partidos (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        fecha_id            UUID NOT NULL REFERENCES fechas(id) ON DELETE CASCADE,
        equipo_local_id     UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        equipo_visita_id    UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        cancha_nombre       VARCHAR(100),
        fecha_hora          TIMESTAMPTZ,
        estado              VARCHAR(30) NOT NULL DEFAULT 'PROGRAMADO'
                              CHECK (estado IN (
                                'PROGRAMADO','EN_CURSO','FINALIZADO',
                                'SUSPENDIDO_FUERZA_MAYOR','REPROGRAMADO','WALKOVER'
                              )),
        goles_local         SMALLINT,
        goles_visita        SMALLINT,
        acta_cerrada_at     TIMESTAMPTZ,
        acta_cerrada_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        observaciones       TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (equipo_local_id <> equipo_visita_id)
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'partidos');
    await queryRunner.query(`CREATE INDEX idx_partidos_fecha ON partidos(fecha_id)`);
    await queryRunner.query(`CREATE INDEX idx_partidos_local ON partidos(equipo_local_id)`);
    await queryRunner.query(`CREATE INDEX idx_partidos_visita ON partidos(equipo_visita_id)`);
    await queryRunner.query(`CREATE INDEX idx_partidos_estado ON partidos(estado)`);
    await queryRunner.query(
      `CREATE INDEX idx_partidos_fecha_hora ON partidos(fecha_hora) WHERE fecha_hora IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_partidos_updated_at BEFORE UPDATE ON partidos FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );

    // ─── incidencias_partido (goles, tarjetas, cambios, MVP) ────────
    await queryRunner.query(`
      CREATE TABLE incidencias_partido (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        partido_id          UUID NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
        equipo_id           UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        jugador_inscrito_id UUID REFERENCES jugadores_inscritos(id) ON DELETE SET NULL,
        tipo                VARCHAR(30) NOT NULL
                              CHECK (tipo IN ('GOL','AUTOGOL','AMARILLA','ROJA','AMARILLA_ROJA','CAMBIO','MVP','ASISTENCIA','LESION')),
        minuto              SMALLINT,
        detalle             JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'incidencias_partido');
    await queryRunner.query(`CREATE INDEX idx_incidencias_partido ON incidencias_partido(partido_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_incidencias_jugador ON incidencias_partido(jugador_inscrito_id) WHERE jugador_inscrito_id IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX idx_incidencias_tipo ON incidencias_partido(tipo)`);

    // ─── sanciones_activas (RUT × torneo según anexo correcciones) ──
    await queryRunner.query(`
      CREATE TABLE sanciones_activas (
        id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        torneo_id                     UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
        rut                           VARCHAR(20),
        jugador_inscrito_id           UUID REFERENCES jugadores_inscritos(id) ON DELETE SET NULL,
        motivo                        VARCHAR(50) NOT NULL
                                        CHECK (motivo IN ('ACUMULACION_AMARILLAS','ROJA_DIRECTA','DOBLE_AMARILLA','TRIBUNAL')),
        fechas_pendientes             SMALLINT NOT NULL DEFAULT 1 CHECK (fechas_pendientes >= 0),
        desde_fecha_numero            SMALLINT NOT NULL,
        origen_incidencia_partido_id  UUID REFERENCES partidos(id) ON DELETE SET NULL,
        descripcion                   TEXT,
        cumplida                      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.applyRlsAndIndex(queryRunner, 'sanciones_activas');
    await queryRunner.query(`CREATE INDEX idx_sanciones_torneo ON sanciones_activas(torneo_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_sanciones_rut ON sanciones_activas(rut) WHERE rut IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_sanciones_activas_pendientes ON sanciones_activas(torneo_id, rut) WHERE cumplida = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sanciones_activas`);
    await queryRunner.query(`DROP TABLE IF EXISTS incidencias_partido`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_partidos_updated_at ON partidos`);
    await queryRunner.query(`DROP TABLE IF EXISTS partidos`);
    await queryRunner.query(`DROP TABLE IF EXISTS fechas`);
    await queryRunner.query(`DROP TABLE IF EXISTS jugadores_inscritos`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_equipos_updated_at ON equipos`);
    await queryRunner.query(`DROP TABLE IF EXISTS equipos`);
    await queryRunner.query(`DROP TABLE IF EXISTS series`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_torneos_updated_at ON torneos`);
    await queryRunner.query(`DROP TABLE IF EXISTS torneos`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_temporadas_updated_at ON temporadas`);
    await queryRunner.query(`DROP TABLE IF EXISTS temporadas`);
  }

  /**
   * Helper que aplica el patrón estándar a cada tabla tenant-scoped:
   *   - índice en tenant_id
   *   - RLS habilitado con FORCE
   *   - policy tenant_isolation que respeta app.current_tenant_id
   */
  private async applyRlsAndIndex(queryRunner: QueryRunner, table: string): Promise<void> {
    await queryRunner.query(`CREATE INDEX idx_${table}_tenant ON ${table}(tenant_id)`);
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON ${table}
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
          tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
    `);
  }
}
