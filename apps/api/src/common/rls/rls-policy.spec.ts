import { Client } from 'pg';

import { RLS_V2_USING, RLS_V2_USING_GLOBAL_NULL } from './rls-policy';

/**
 * T11 — Spec de conexión tibia. Prueba la POLICY, no la app: crea sus
 * propias tablas, su propio rol no-superusuario (los superusuarios ignoran
 * RLS, incluso con FORCE) y una ÚNICA conexión pg para reproducir el
 * residuo que deja el pool entre requests.
 *
 * La tabla "v1" instala la policy vieja y documenta el bypass que motivó
 * el cambio (C-2): si ese caso deja de reproducirse, el resto del spec ya
 * no prueba lo que dice probar.
 *
 * Corre solo con DATABASE_URL presente (CI la provee; local opcional).
 * Necesita un usuario con CREATEROLE (el de CI/dev es superusuario).
 */
const DATABASE_URL = process.env.DATABASE_URL;

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const TABLA = 'rls_spec_v2';
const TABLA_V1 = 'rls_spec_v1';
const TABLA_NULL = 'rls_spec_global_null';
const ROL = 'rls_spec_rol';

const d = DATABASE_URL ? describe : describe.skip;

d('Policy RLS v2 — conexión tibia (T11)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    await client.query(`DROP TABLE IF EXISTS ${TABLA}`);
    await client.query(`DROP TABLE IF EXISTS ${TABLA_V1}`);
    await client.query(`DROP TABLE IF EXISTS ${TABLA_NULL}`);
    await client.query(`DROP ROLE IF EXISTS ${ROL}`);
    await client.query(`CREATE ROLE ${ROL} NOLOGIN`);

    await client.query(
      `CREATE TABLE ${TABLA} (id serial PRIMARY KEY, tenant_id uuid NOT NULL, dato text)`,
    );
    await client.query(
      `INSERT INTO ${TABLA} (tenant_id, dato) VALUES ($1, 'de-a'), ($2, 'de-b')`,
      [TENANT_A, TENANT_B],
    );
    await client.query(`ALTER TABLE ${TABLA} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ${TABLA} FORCE ROW LEVEL SECURITY`);
    await client.query(`
      CREATE POLICY tenant_isolation ON ${TABLA}
        USING (${RLS_V2_USING})
        WITH CHECK (${RLS_V2_USING})
    `);
    await client.query(`GRANT SELECT, INSERT ON ${TABLA} TO ${ROL}`);
    await client.query(`GRANT USAGE, SELECT ON SEQUENCE ${TABLA}_id_seq TO ${ROL}`);

    // Gemela con la policy v1 (la vulnerable, tal como estaba en prod).
    await client.query(
      `CREATE TABLE ${TABLA_V1} (id serial PRIMARY KEY, tenant_id uuid NOT NULL)`,
    );
    await client.query(`INSERT INTO ${TABLA_V1} (tenant_id) VALUES ($1), ($2)`, [
      TENANT_A,
      TENANT_B,
    ]);
    await client.query(`ALTER TABLE ${TABLA_V1} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ${TABLA_V1} FORCE ROW LEVEL SECURITY`);
    await client.query(`
      CREATE POLICY tenant_isolation ON ${TABLA_V1}
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
          OR current_setting('app.current_tenant_id', true) = ''
        )
    `);
    await client.query(`GRANT SELECT ON ${TABLA_V1} TO ${ROL}`);

    // Variante global-null (user_roles / audit_logs / magic_links / push).
    await client.query(
      `CREATE TABLE ${TABLA_NULL} (id serial PRIMARY KEY, tenant_id uuid)`,
    );
    await client.query(`INSERT INTO ${TABLA_NULL} (tenant_id) VALUES ($1), (NULL)`, [
      TENANT_A,
    ]);
    await client.query(`ALTER TABLE ${TABLA_NULL} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ${TABLA_NULL} FORCE ROW LEVEL SECURITY`);
    await client.query(`
      CREATE POLICY tenant_isolation ON ${TABLA_NULL}
        USING (${RLS_V2_USING_GLOBAL_NULL})
        WITH CHECK (${RLS_V2_USING_GLOBAL_NULL})
    `);
    await client.query(`GRANT SELECT ON ${TABLA_NULL} TO ${ROL}`);

    // Desde acá, todas las queries corren como el rol SIN privilegios.
    await client.query(`SET ROLE ${ROL}`);
  });

  afterAll(async () => {
    if (!client) return;
    try {
      await client.query(`RESET ROLE`);
      await client.query(`DROP TABLE IF EXISTS ${TABLA}`);
      await client.query(`DROP TABLE IF EXISTS ${TABLA_V1}`);
      await client.query(`DROP TABLE IF EXISTS ${TABLA_NULL}`);
      await client.query(`DROP ROLE IF EXISTS ${ROL}`);
    } finally {
      await client.end();
    }
  });

  beforeEach(async () => {
    // Peor caso de conexión reciclada: ambos GUC con residuo '' a nivel
    // de SESIÓN (sobrevive a los commits, igual que en el pool real).
    await client.query(`SELECT set_config('app.current_tenant_id', '', false)`);
    await client.query(`SELECT set_config('app.rls_bypass', '', false)`);
  });

  it("v1 (la policy vieja) filtraba TODO con el residuo '' — el bypass C-2", async () => {
    const r = await client.query(`SELECT tenant_id FROM ${TABLA_V1}`);
    expect(r.rowCount).toBe(2);
  });

  it("v2: el residuo '' no muestra ninguna fila (fail-closed)", async () => {
    const r = await client.query(`SELECT tenant_id FROM ${TABLA}`);
    expect(r.rowCount).toBe(0);
  });

  it('v2: el contexto de tenant es local a la transacción y acota a sus filas', async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT_A]);
    const dentro = await client.query(`SELECT dato FROM ${TABLA}`);
    await client.query('COMMIT');

    expect(dentro.rowCount).toBe(1);
    expect(dentro.rows[0].dato).toBe('de-a');

    // Después del COMMIT, la MISMA conexión vuelve al residuo → 0 filas.
    const despues = await client.query(`SELECT dato FROM ${TABLA}`);
    expect(despues.rowCount).toBe(0);
  });

  it('v2: el bypass explícito ve todo y tampoco sobrevive al COMMIT', async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.rls_bypass', 'on', true)`);
    const dentro = await client.query(`SELECT tenant_id FROM ${TABLA}`);
    await client.query('COMMIT');

    expect(dentro.rowCount).toBe(2);

    const despues = await client.query(`SELECT tenant_id FROM ${TABLA}`);
    expect(despues.rowCount).toBe(0);
  });

  it('v2: WITH CHECK rechaza escribir con el tenant de otro', async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT_A]);
    await expect(
      client.query(`INSERT INTO ${TABLA} (tenant_id, dato) VALUES ($1, 'intruso')`, [
        TENANT_B,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await client.query('ROLLBACK');
  });

  it('v2: con contexto propio sí se puede escribir (prueba positiva del WITH CHECK)', async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT_A]);
    await client.query(`INSERT INTO ${TABLA} (tenant_id, dato) VALUES ($1, 'propio')`, [
      TENANT_A,
    ]);
    const r = await client.query(`SELECT count(*)::int AS n FROM ${TABLA}`);
    expect(r.rows[0].n).toBe(2);
    await client.query('ROLLBACK');
  });

  it("global-null: la fila global se ve bajo residuo '', la de tenant no", async () => {
    const r = await client.query(`SELECT tenant_id FROM ${TABLA_NULL}`);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].tenant_id).toBeNull();
  });

  it('global-null: con contexto de tenant se ven las propias MÁS las globales', async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT_A]);
    const r = await client.query(`SELECT tenant_id FROM ${TABLA_NULL}`);
    await client.query('COMMIT');
    expect(r.rowCount).toBe(2);
  });

  it("fijarTenantLocal apaga el bypass: tenant A sobre bypass 'on' ve SOLO A (fix F1)", async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.rls_bypass', 'on', true)`);
    // El statement exacto del helper tras el fix: tenant + bypass off juntos.
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1, true),
              set_config('app.rls_bypass', '', true)`,
      [TENANT_A],
    );
    const r = await client.query(`SELECT dato FROM ${TABLA}`);
    await client.query('COMMIT');
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].dato).toBe('de-a');
  });

  it('un GUC basura (no-uuid) revienta con 22P02 — por eso fijarTenantLocal valida', async () => {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', 'basura', true)`);
    await expect(client.query(`SELECT 1 FROM ${TABLA}`)).rejects.toMatchObject({
      code: '22P02',
    });
    await client.query('ROLLBACK');
  });
});
