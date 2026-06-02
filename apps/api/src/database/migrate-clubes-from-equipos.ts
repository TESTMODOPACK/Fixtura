/**
 * Sprint 26F (ADR-0004) — Migración del modelo viejo (equipos por torneo)
 * al modelo nuevo (clubes globales + inscripciones).
 *
 * Por cada `equipo` viejo:
 *   1. Identifica la categoría desde el torneo (legacy torneo.categoria_id).
 *      Si el torneo no tiene categoría, el equipo no se puede migrar
 *      (loggea warning y sigue).
 *   2. Upsert de `clubes` por (tenant_id, slug). Si ya existe, reutiliza.
 *      Esto significa que "Halcones FC" del Apertura y del Clausura
 *      apuntan al MISMO club después de la migración.
 *   3. Asegura `club_categorias` (club_id, categoria_id) si no existe.
 *   4. Upsert de `inscripciones_torneo` por (torneo_id, club_id, categoria_id).
 *   5. Por cada `jugador_inscrito` del equipo:
 *        - Si no tiene RUT válido → salta + log (UNIQUE rut por tenant
 *          es non-negotiable en el modelo nuevo).
 *        - Upsert `jugadores` por (tenant_id, rut). Si ya existe en otro
 *          club o categoría, salta + log con detalle.
 *        - Insert en `planilla_torneo` si no estaba ya.
 *
 * IDEMPOTENTE: correr 2 veces no duplica. Usa ON CONFLICT DO NOTHING
 * para las inserciones cuyo UNIQUE puede chocar.
 *
 * Uso:
 *   node dist/database/migrate-clubes-from-equipos.js
 *
 * Para correr en prod (Hostinger /opt/fixtura):
 *   docker compose exec api node dist/database/migrate-clubes-from-equipos.js
 *
 * Output: resumen por tenant con counts + lista de jugadores saltados.
 */
import 'dotenv/config';
import { Client } from 'pg';

interface ResumenTenant {
  tenantId: string;
  clubesCreados: number;
  clubesReutilizados: number;
  inscripcionesCreadas: number;
  inscripcionesYaExistian: number;
  jugadoresCreados: number;
  jugadoresEnPlanilla: number;
  jugadoresSaltadosSinRut: number;
  jugadoresSaltadosEnOtroClub: Array<{ rut: string; clubExistente: string }>;
  jugadoresSaltadosEnOtraCategoria: Array<{ rut: string }>;
  equiposSaltadosSinCategoria: Array<{ equipoNombre: string; torneoNombre: string }>;
  // Sprint 26G.1 — backfill de columnas paralelas
  partidosBackfilleados: number;
  incidenciasBackfilleadas: number;
  cobrosBackfilleados: number;
}

function limpiarRut(rut: string): string {
  return rut.replace(/[^\dkK]/g, '').toUpperCase();
}

function validarRutMinimo(rut: string): boolean {
  // Solo formato: 7-8 dígitos + DV. NO chequea dígito verificador acá —
  // confiamos en lo que ya quedó en la base. Si está claramente corrupto
  // (vacío, formato inválido), lo saltamos.
  if (!rut) return false;
  const limpio = limpiarRut(rut);
  if (limpio.length < 7 || limpio.length > 9) return false;
  const numero = limpio.slice(0, -1);
  return /^\d+$/.test(numero);
}

async function main(): Promise<void> {
  const log = (msg: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[migrate-clubes] ${msg}`);
  };

  const dbUser = process.env.DB_USER ?? 'fixtura';
  const dbPassword = process.env.DB_PASSWORD ?? 'fixtura';
  const dbHost = process.env.DB_HOST ?? 'localhost';
  const dbPort = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? 'fixtura';
  const url =
    process.env.DATABASE_URL_SUPERUSER ??
    `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  const client = new Client({ connectionString: url });
  await client.connect();
  log('Conectado a Postgres');

  try {
    // Iteramos por tenant. Conectamos como superuser → seteamos
    // app.current_tenant_id explícitamente por tenant (no usamos el
    // bypass vacío porque queremos que RLS valide cada operación).
    const tenants = await client.query<{ id: string; nombre: string }>(
      `SELECT id, nombre FROM tenants ORDER BY created_at ASC`,
    );
    log(`Encontrados ${tenants.rowCount ?? 0} tenants. Migrando…`);

    const resumenes: ResumenTenant[] = [];

    for (const t of tenants.rows) {
      log(`\n=== Tenant ${t.nombre} (${t.id}) ===`);
      await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [
        t.id,
      ]);

      const resumen = await migrarTenant(client, t.id, log);
      resumenes.push(resumen);
    }

    // Resumen global al final
    log('\n=== RESUMEN GLOBAL ===');
    for (const r of resumenes) {
      log(
        `Tenant ${r.tenantId}: ${r.clubesCreados} clubes creados, ` +
          `${r.clubesReutilizados} reutilizados, ` +
          `${r.inscripcionesCreadas} inscripciones nuevas, ` +
          `${r.jugadoresCreados} jugadores creados, ` +
          `${r.jugadoresEnPlanilla} en planilla.`,
      );
      if (r.equiposSaltadosSinCategoria.length > 0) {
        log(
          `  ⚠ ${r.equiposSaltadosSinCategoria.length} equipo(s) saltados sin categoría ` +
            `(torneos sin Sprint 25 paso 3):`,
        );
        for (const e of r.equiposSaltadosSinCategoria) {
          log(`    · "${e.equipoNombre}" en torneo "${e.torneoNombre}"`);
        }
      }
      if (r.jugadoresSaltadosSinRut > 0) {
        log(
          `  ⚠ ${r.jugadoresSaltadosSinRut} jugador(es) saltados sin RUT válido. ` +
            `Cargá el RUT en el modelo viejo o asígnalo manualmente al club nuevo.`,
        );
      }
      if (r.jugadoresSaltadosEnOtroClub.length > 0) {
        log(`  ⚠ ${r.jugadoresSaltadosEnOtroClub.length} jugador(es) ya estaban en otro club:`);
        for (const j of r.jugadoresSaltadosEnOtroClub) {
          log(`    · RUT ${j.rut} ya en "${j.clubExistente}"`);
        }
      }
      if (r.jugadoresSaltadosEnOtraCategoria.length > 0) {
        log(
          `  ⚠ ${r.jugadoresSaltadosEnOtraCategoria.length} jugador(es) ya estaban en otra categoría del MISMO club:`,
        );
        for (const j of r.jugadoresSaltadosEnOtraCategoria) {
          log(`    · RUT ${j.rut}`);
        }
      }
    }
    log('\nMigración terminada.');
  } finally {
    await client.end();
  }
}

async function migrarTenant(
  client: Client,
  tenantId: string,
  log: (msg: string) => void,
): Promise<ResumenTenant> {
  const resumen: ResumenTenant = {
    tenantId,
    clubesCreados: 0,
    clubesReutilizados: 0,
    inscripcionesCreadas: 0,
    inscripcionesYaExistian: 0,
    jugadoresCreados: 0,
    jugadoresEnPlanilla: 0,
    jugadoresSaltadosSinRut: 0,
    jugadoresSaltadosEnOtroClub: [],
    jugadoresSaltadosEnOtraCategoria: [],
    equiposSaltadosSinCategoria: [],
    partidosBackfilleados: 0,
    incidenciasBackfilleadas: 0,
    cobrosBackfilleados: 0,
  };

  // Mapa equipo_id (viejo) → inscripcion_id (nueva), poblado a medida
  // que se procesa cada equipo. Lo usamos al final para backfillear
  // partidos, incidencias y cobros (Sprint 26G.1).
  const equipoToInscripcion = new Map<string, string>();

  // Traer equipos del tenant con torneo y categoría (puede ser null)
  const equipos = await client.query<{
    equipo_id: string;
    equipo_nombre: string;
    equipo_slug: string;
    equipo_escudo_url: string | null;
    equipo_color_primario: string | null;
    equipo_color_secundario: string | null;
    equipo_serie_slug: string | null;
    torneo_id: string;
    torneo_nombre: string;
    torneo_categoria_id: string | null;
  }>(`
    SELECT
      e.id                   AS equipo_id,
      e.nombre                AS equipo_nombre,
      e.slug                  AS equipo_slug,
      e.escudo_url            AS equipo_escudo_url,
      e.color_primario        AS equipo_color_primario,
      e.color_secundario      AS equipo_color_secundario,
      e.serie_slug            AS equipo_serie_slug,
      t.id                    AS torneo_id,
      t.nombre                AS torneo_nombre,
      t.categoria_id          AS torneo_categoria_id
    FROM equipos e
    JOIN torneos t ON t.id = e.torneo_id
    WHERE e.tenant_id = $1
    ORDER BY e.created_at ASC
  `, [tenantId]);

  log(`  ${equipos.rowCount ?? 0} equipo(s) viejos en el tenant.`);

  // Mapa local de slug → club_id (para no consultar la misma cosa N veces)
  const clubBySlug = new Map<string, string>();

  for (const e of equipos.rows) {
    if (!e.torneo_categoria_id) {
      resumen.equiposSaltadosSinCategoria.push({
        equipoNombre: e.equipo_nombre,
        torneoNombre: e.torneo_nombre,
      });
      continue;
    }
    const categoriaId = e.torneo_categoria_id;

    // 1. Upsert club por (tenant_id, slug)
    let clubId = clubBySlug.get(e.equipo_slug);
    if (!clubId) {
      const exist = await client.query<{ id: string }>(
        `SELECT id FROM clubes WHERE tenant_id = $1 AND slug = $2`,
        [tenantId, e.equipo_slug],
      );
      if (exist.rowCount && exist.rowCount > 0) {
        clubId = exist.rows[0]!.id;
        resumen.clubesReutilizados++;
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO clubes (
              tenant_id, slug, nombre, escudo_url,
              color_primario, color_secundario, estado
           ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO')
           RETURNING id`,
          [
            tenantId,
            e.equipo_slug,
            e.equipo_nombre,
            e.equipo_escudo_url,
            e.equipo_color_primario,
            e.equipo_color_secundario,
          ],
        );
        clubId = inserted.rows[0]!.id;
        resumen.clubesCreados++;
      }
      clubBySlug.set(e.equipo_slug, clubId);
    }

    // 2. Asegurar club_categoria (club_id, categoria_id) idempotente
    await client.query(
      `INSERT INTO club_categorias (tenant_id, club_id, categoria_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (club_id, categoria_id) DO NOTHING`,
      [tenantId, clubId, categoriaId],
    );

    // 3. Upsert inscripcion (torneo_id, club_id, categoria_id)
    let inscripcionId: string;
    const inscExist = await client.query<{ id: string }>(
      `SELECT id FROM inscripciones_torneo
       WHERE torneo_id = $1 AND club_id = $2 AND categoria_id = $3`,
      [e.torneo_id, clubId, categoriaId],
    );
    if (inscExist.rowCount && inscExist.rowCount > 0) {
      inscripcionId = inscExist.rows[0]!.id;
      resumen.inscripcionesYaExistian++;
    } else {
      const inscCreated = await client.query<{ id: string }>(
        `INSERT INTO inscripciones_torneo (
            tenant_id, club_id, torneo_id, categoria_id, serie_slug, estado
         ) VALUES ($1, $2, $3, $4, $5, 'INSCRITO')
         RETURNING id`,
        [tenantId, clubId, e.torneo_id, categoriaId, e.equipo_serie_slug],
      );
      inscripcionId = inscCreated.rows[0]!.id;
      resumen.inscripcionesCreadas++;
    }
    // Anotar mapeo equipo viejo → inscripción nueva (Sprint 26G.1 backfill)
    equipoToInscripcion.set(e.equipo_id, inscripcionId);

    // 4. Migrar jugadores del equipo viejo → jugador global + planilla
    const jugadoresInscritos = await client.query<{
      id: string;
      rut: string | null;
      nombres: string | null;
      apellidos: string | null;
      fecha_nac: string | null;
      numero_camiseta: number | null;
      posicion: string | null;
      pie_habil: string | null;
      apodo: string | null;
      capitan: boolean;
    }>(
      `SELECT id, rut, nombre AS nombres, apellido AS apellidos,
              fecha_nac, numero_camiseta, posicion, pie_habil, apodo, capitan
       FROM jugadores_inscritos
       WHERE equipo_id = $1 AND tenant_id = $2`,
      [e.equipo_id, tenantId],
    );

    for (const j of jugadoresInscritos.rows) {
      if (!j.rut || !validarRutMinimo(j.rut)) {
        resumen.jugadoresSaltadosSinRut++;
        continue;
      }
      const rutLimpio = limpiarRut(j.rut);

      // ¿Existe jugador con ese RUT ya en el tenant nuevo?
      const existente = await client.query<{
        id: string;
        club_id: string;
        categoria_id: string;
        club_nombre: string;
      }>(
        `SELECT j.id, j.club_id, j.categoria_id, c.nombre AS club_nombre
         FROM jugadores j
         JOIN clubes c ON c.id = j.club_id
         WHERE j.tenant_id = $1 AND j.rut = $2`,
        [tenantId, rutLimpio],
      );

      let jugadorId: string;
      if (existente.rowCount && existente.rowCount > 0) {
        const ex = existente.rows[0]!;
        if (ex.club_id !== clubId) {
          resumen.jugadoresSaltadosEnOtroClub.push({
            rut: rutLimpio,
            clubExistente: ex.club_nombre,
          });
          continue;
        }
        if (ex.categoria_id !== categoriaId) {
          resumen.jugadoresSaltadosEnOtraCategoria.push({ rut: rutLimpio });
          continue;
        }
        jugadorId = ex.id;
      } else {
        const created = await client.query<{ id: string }>(
          `INSERT INTO jugadores (
              tenant_id, club_id, categoria_id, rut,
              nombres, apellidos, fecha_nac,
              numero_camiseta, posicion, pie_habil, apodo, capitan,
              estado
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVO')
           RETURNING id`,
          [
            tenantId,
            clubId,
            categoriaId,
            rutLimpio,
            j.nombres ?? 'SIN_NOMBRE',
            j.apellidos ?? 'SIN_APELLIDO',
            j.fecha_nac,
            j.numero_camiseta,
            j.posicion,
            j.pie_habil,
            j.apodo,
            j.capitan,
          ],
        );
        jugadorId = created.rows[0]!.id;
        resumen.jugadoresCreados++;
      }

      // 5. Agregar a la planilla del torneo (idempotente con UNIQUE)
      const planillaRes = await client.query(
        `INSERT INTO planilla_torneo (tenant_id, inscripcion_id, jugador_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (inscripcion_id, jugador_id) DO NOTHING`,
        [tenantId, inscripcionId, jugadorId],
      );
      if ((planillaRes.rowCount ?? 0) > 0) {
        resumen.jugadoresEnPlanilla++;
      }
    }
  }

  // Sprint 26G.1 — backfill de columnas paralelas en partidos,
  // incidencias_partido y cobros. Usamos el mapa equipoToInscripcion
  // armado arriba. Solo actualizamos filas donde inscripcion_*_id es
  // NULL (idempotente: re-ejecutar no toca filas ya backfilleadas).
  if (equipoToInscripcion.size > 0) {
    const equipoIds = Array.from(equipoToInscripcion.keys());

    // Construir CASE WHEN para mapear en una sola UPDATE por columna.
    // Postgres no tiene VALUES tan natural en UPDATE — usamos
    // FROM (VALUES ...) en una subconsulta.
    const valuesSql = equipoIds
      .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::uuid)`)
      .join(', ');
    const params: string[] = [];
    for (const id of equipoIds) {
      params.push(id, equipoToInscripcion.get(id)!);
    }

    // Partidos: backfill inscripcion_local_id e inscripcion_visita_id
    const partidosLocal = await client.query(
      `UPDATE partidos p SET inscripcion_local_id = m.insc_id
       FROM (VALUES ${valuesSql}) AS m(eq_id, insc_id)
       WHERE p.equipo_local_id = m.eq_id
         AND p.tenant_id = $${params.length + 1}
         AND p.inscripcion_local_id IS NULL`,
      [...params, tenantId],
    );
    resumen.partidosBackfilleados += partidosLocal.rowCount ?? 0;

    const partidosVisita = await client.query(
      `UPDATE partidos p SET inscripcion_visita_id = m.insc_id
       FROM (VALUES ${valuesSql}) AS m(eq_id, insc_id)
       WHERE p.equipo_visita_id = m.eq_id
         AND p.tenant_id = $${params.length + 1}
         AND p.inscripcion_visita_id IS NULL`,
      [...params, tenantId],
    );
    resumen.partidosBackfilleados += partidosVisita.rowCount ?? 0;

    // Incidencias
    const incidencias = await client.query(
      `UPDATE incidencias_partido i SET inscripcion_id = m.insc_id
       FROM (VALUES ${valuesSql}) AS m(eq_id, insc_id)
       WHERE i.equipo_id = m.eq_id
         AND i.tenant_id = $${params.length + 1}
         AND i.inscripcion_id IS NULL`,
      [...params, tenantId],
    );
    resumen.incidenciasBackfilleadas = incidencias.rowCount ?? 0;

    // Cobros (equipo_id puede ser NULL — solo updateamos los que tienen)
    const cobros = await client.query(
      `UPDATE cobros c SET inscripcion_id = m.insc_id
       FROM (VALUES ${valuesSql}) AS m(eq_id, insc_id)
       WHERE c.equipo_id = m.eq_id
         AND c.tenant_id = $${params.length + 1}
         AND c.inscripcion_id IS NULL`,
      [...params, tenantId],
    );
    resumen.cobrosBackfilleados = cobros.rowCount ?? 0;
  }

  log(
    `  ✓ ${resumen.clubesCreados} clubes nuevos, ` +
      `${resumen.clubesReutilizados} reutilizados; ` +
      `${resumen.inscripcionesCreadas} inscripciones; ` +
      `${resumen.jugadoresCreados} jugadores; ` +
      `${resumen.jugadoresEnPlanilla} en planilla; ` +
      `${resumen.partidosBackfilleados} partidos backfilleados; ` +
      `${resumen.incidenciasBackfilleadas} incidencias backfilleadas; ` +
      `${resumen.cobrosBackfilleados} cobros backfilleados.`,
  );

  return resumen;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-clubes] FATAL', err);
  process.exit(1);
});
