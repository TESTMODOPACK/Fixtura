/**
 * Reset completo del fixture de una liga (default: Liga Demo / Apertura 2026).
 *
 * Borra TODO el historial deportivo del torneo y regenera un fixture limpio
 * con el algoritmo Berger, una fecha por semana arrancando el próximo
 * domingo desde la fecha de hoy.
 *
 * Lo que conserva:
 *   - tenant, torneo, temporada (metadatos)
 *   - equipos y su plantel (jugadores inscritos)
 *   - canchas, personal (árbitros), sponsors, ajustes, días no jugables
 *   - sesiones de usuarios y roles
 *
 * Lo que borra (en orden de FK):
 *   - sanciones_jugador del torneo
 *   - incidencias_partido del torneo
 *   - designaciones (de partidos + de recintos)
 *   - cobros y sus transacciones / documentos tributarios asociados
 *   - audit_log (entradas relacionadas — opcional, por defecto se preserva)
 *   - partidos del torneo
 *   - fechas del torneo
 *
 * Variables de entorno:
 *   RESET_TENANT_SLUG       (default 'liga-demo')
 *   RESET_TORNEO_SLUG       (default 'apertura-2026')
 *   RESET_FECHA_INICIO      (default próximo domingo en formato YYYY-MM-DD)
 *   RESET_HORA_PRIMER_PART  (default '10:00')
 *   RESET_MINUTOS_ENTRE_PART (default 120)
 *   RESET_CONFIRMAR=YES     (obligatoria — protección contra ejecución accidental)
 *
 * Uso en prod:
 *   docker compose exec -e RESET_CONFIRMAR=YES api node dist/database/reset-fixture.js
 */
import 'dotenv/config';
import { generarFixtureBerger } from '@fixtura/domain';

import AppDataSource from './datasource';

interface Args {
  tenantSlug: string;
  torneoSlug: string;
  fechaInicio: string;
  horaPrimero: string;
  minutosEntre: number;
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[reset-fixture] ${msg}`);
}

function proximoDomingo(): string {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0=domingo, 1=lunes, ...
  const diasHasta = (7 - diaSemana) % 7 || 7; // si hoy es domingo, próximo
  const d = new Date(hoy);
  d.setDate(hoy.getDate() + diasHasta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseArgs(): Args {
  return {
    tenantSlug: (process.env.RESET_TENANT_SLUG ?? 'liga-demo').toLowerCase(),
    torneoSlug: (process.env.RESET_TORNEO_SLUG ?? 'apertura-2026').toLowerCase(),
    fechaInicio: process.env.RESET_FECHA_INICIO ?? proximoDomingo(),
    horaPrimero: process.env.RESET_HORA_PRIMER_PART ?? '10:00',
    minutosEntre: parseInt(process.env.RESET_MINUTOS_ENTRE_PART ?? '120', 10),
  };
}

async function main(): Promise<void> {
  if (process.env.RESET_CONFIRMAR !== 'YES') {
    // eslint-disable-next-line no-console
    console.error(
      '[reset-fixture] ABORTADO: RESET_CONFIRMAR=YES es obligatorio para evitar ejecuciones accidentales.',
    );
    process.exit(1);
  }

  const args = parseArgs();
  log(`Tenant=${args.tenantSlug} Torneo=${args.torneoSlug}`);
  log(`Nuevo fixture: primera fecha ${args.fechaInicio} ${args.horaPrimero}, ${args.minutosEntre}min entre partidos`);

  await AppDataSource.initialize();
  log('Conectado.');

  try {
    await AppDataSource.query('BEGIN');
    // Bypass RLS (script de mantenimiento).
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    // ─── Buscar tenant + torneo ────────────────────────────────────────
    const tenantRows = (await AppDataSource.query(
      `SELECT id, nombre FROM tenants WHERE slug = $1`,
      [args.tenantSlug],
    )) as Array<{ id: string; nombre: string }>;
    if (tenantRows.length === 0) {
      throw new Error(`Tenant con slug '${args.tenantSlug}' no encontrado.`);
    }
    const tenantId = tenantRows[0]!.id;
    log(`Tenant: ${tenantRows[0]!.nombre} (${tenantId})`);

    const torneoRows = (await AppDataSource.query(
      `SELECT id, nombre FROM torneos WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, args.torneoSlug],
    )) as Array<{ id: string; nombre: string }>;
    if (torneoRows.length === 0) {
      throw new Error(
        `Torneo con slug '${args.torneoSlug}' no encontrado en tenant '${args.tenantSlug}'.`,
      );
    }
    const torneoId = torneoRows[0]!.id;
    log(`Torneo: ${torneoRows[0]!.nombre} (${torneoId})`);

    // ─── Listar equipos (preservar plantel) ────────────────────────────
    const equipos = (await AppDataSource.query(
      `SELECT id, nombre FROM equipos
       WHERE tenant_id = $1 AND torneo_id = $2 AND estado = 'ACTIVO'
       ORDER BY nombre`,
      [tenantId, torneoId],
    )) as Array<{ id: string; nombre: string }>;
    if (equipos.length < 2) {
      throw new Error(
        `Torneo tiene solo ${equipos.length} equipos. Necesitás al menos 2 para generar fixture.`,
      );
    }
    log(`Equipos activos: ${equipos.length}`);

    // ─── Listar fechas y partidos a borrar (para reporte) ───────────────
    const fechas = (await AppDataSource.query(
      `SELECT id FROM fechas WHERE tenant_id = $1 AND torneo_id = $2`,
      [tenantId, torneoId],
    )) as Array<{ id: string }>;
    const fechaIds = fechas.map((f) => f.id);

    const partidos: Array<{ id: string }> =
      fechaIds.length > 0
        ? ((await AppDataSource.query(
            `SELECT id FROM partidos WHERE tenant_id = $1 AND fecha_id = ANY($2::uuid[])`,
            [tenantId, fechaIds],
          )) as Array<{ id: string }>)
        : [];
    const partidoIds = partidos.map((p) => p.id);

    log(`Por borrar: ${fechas.length} fechas, ${partidos.length} partidos.`);

    // ─── BORRAR EN ORDEN DE FK ──────────────────────────────────────────
    // Sanciones activas del torneo — borrar SIEMPRE (sin importar si hubo partidos),
    // porque pueden venir del tribunal sin partido origen.
    const sancRes = await AppDataSource.query(
      `DELETE FROM sanciones_activas WHERE tenant_id = $1 AND torneo_id = $2`,
      [tenantId, torneoId],
    );
    log(`Sanciones activas borradas: ${sancRes[1] ?? 0}`);

    if (partidoIds.length > 0) {
      // Incidencias del partido
      const incRes = await AppDataSource.query(
        `DELETE FROM incidencias_partido
         WHERE tenant_id = $1 AND partido_id = ANY($2::uuid[])`,
        [tenantId, partidoIds],
      );
      log(`Incidencias borradas: ${incRes[1] ?? 0}`);

      // Designaciones de partido
      const desRes = await AppDataSource.query(
        `DELETE FROM designaciones
         WHERE tenant_id = $1 AND partido_id = ANY($2::uuid[])`,
        [tenantId, partidoIds],
      );
      log(`Designaciones partido borradas: ${desRes[1] ?? 0}`);
    }

    // Designaciones de recinto (asociadas a fechas)
    if (fechaIds.length > 0) {
      const desRecRes = await AppDataSource.query(
        `DELETE FROM designaciones_recinto
         WHERE tenant_id = $1 AND fecha_id = ANY($2::uuid[])`,
        [tenantId, fechaIds],
      );
      log(`Designaciones recinto borradas: ${desRecRes[1] ?? 0}`);
    }

    // Cobros derivados de los equipos del torneo. Cobros no tiene torneo_id
    // directo — el vínculo es vía equipo_id. Si un equipo participa en
    // múltiples torneos del mismo tenant, sus cobros también se borran.
    // El uso típico es 1 torneo por temporada, así que el riesgo es bajo.
    const equipoIds = equipos.map((e) => e.id);
    const cobros = (await AppDataSource.query(
      `SELECT id FROM cobros WHERE tenant_id = $1 AND equipo_id = ANY($2::uuid[])`,
      [tenantId, equipoIds],
    )) as Array<{ id: string }>;
    const cobroIds = cobros.map((c) => c.id);

    if (cobroIds.length > 0) {
      // Documentos tributarios referenciando esos cobros
      await AppDataSource.query(
        `DELETE FROM documentos_tributarios
         WHERE tenant_id = $1 AND cobro_id = ANY($2::uuid[])`,
        [tenantId, cobroIds],
      );
      // Transacciones referenciando esos cobros (FK SET NULL — se desreferencia o se borra)
      await AppDataSource.query(
        `DELETE FROM transacciones
         WHERE tenant_id = $1 AND cobro_id = ANY($2::uuid[])`,
        [tenantId, cobroIds],
      );
      const cobRes = await AppDataSource.query(
        `DELETE FROM cobros WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, cobroIds],
      );
      log(`Cobros borrados: ${cobRes[1] ?? 0} (más sus docs y transacciones)`);
    }

    // Partidos
    if (partidoIds.length > 0) {
      const pRes = await AppDataSource.query(
        `DELETE FROM partidos WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, partidoIds],
      );
      log(`Partidos borrados: ${pRes[1] ?? 0}`);
    }

    // Fechas
    if (fechaIds.length > 0) {
      const fRes = await AppDataSource.query(
        `DELETE FROM fechas WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, fechaIds],
      );
      log(`Fechas borradas: ${fRes[1] ?? 0}`);
    }

    // ─── GENERAR NUEVO FIXTURE ──────────────────────────────────────────
    const fixture = generarFixtureBerger(equipos, { ruedas: 1 });
    log(`Berger: ${fixture.fechas} fechas, ${fixture.partidos.length} partidos a crear.`);

    // Crear fechas (semanal, arrancando RESET_FECHA_INICIO)
    const base = new Date(args.fechaInicio + 'T00:00:00Z');
    if (Number.isNaN(base.getTime())) {
      throw new Error(`Fecha inválida: '${args.fechaInicio}'. Formato esperado: YYYY-MM-DD.`);
    }
    const fechaIdByNumero = new Map<number, string>();
    for (let n = 1; n <= fixture.fechas; n++) {
      const inicio = new Date(base);
      inicio.setUTCDate(base.getUTCDate() + (n - 1) * 7);
      const fin = new Date(inicio);
      fin.setUTCDate(inicio.getUTCDate() + 1);

      const isoDia = `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}-${String(inicio.getUTCDate()).padStart(2, '0')}`;
      const isoFin = `${fin.getUTCFullYear()}-${String(fin.getUTCMonth() + 1).padStart(2, '0')}-${String(fin.getUTCDate()).padStart(2, '0')}`;

      const etiqueta = `Fecha ${n}`;
      const rows = (await AppDataSource.query(
        `INSERT INTO fechas
           (tenant_id, torneo_id, numero, etiqueta, fecha_inicio, fecha_fin, estado, tipo_reprogramacion)
         VALUES ($1, $2, $3, $4, $5, $6, 'PROGRAMADA', 'ORIGINAL')
         RETURNING id`,
        [tenantId, torneoId, n, etiqueta, isoDia, isoFin],
      )) as Array<{ id: string }>;
      fechaIdByNumero.set(n, rows[0]!.id);
    }
    log(`${fechaIdByNumero.size} fechas creadas.`);

    // Crear partidos (horario escalonado por fecha)
    const [hStr, mStr] = args.horaPrimero.split(':');
    const horaInicialH = parseInt(hStr ?? '10', 10);
    const horaInicialM = parseInt(mStr ?? '0', 10);

    const partidosPorFecha = new Map<number, number>();
    let partidosCreados = 0;
    for (const p of fixture.partidos) {
      // Berger inserta partidos con esLibre=true cuando N de equipos es
      // impar. Esos no se persisten — son el "BYE" (equipo que descansa).
      if (p.esLibre) continue;
      const fechaId = fechaIdByNumero.get(p.fechaNumero)!;
      const orden = partidosPorFecha.get(p.fechaNumero) ?? 0;
      partidosPorFecha.set(p.fechaNumero, orden + 1);

      // TZ fix — el día calendario se calcula en UTC (consistente con la
      // creación de Fechas arriba), pero la HORA del partido debe ser la
      // hora LOCAL pedida (ej. 10:00 CLT). Antes setUTCHours(10) guardaba
      // 10:00 UTC = 06:00 CLT y todos los partidos quedaban corridos -4h.
      const diaUtc = new Date(base);
      diaUtc.setUTCDate(base.getUTCDate() + (p.fechaNumero - 1) * 7);
      const inicio = new Date(
        diaUtc.getUTCFullYear(),
        diaUtc.getUTCMonth(),
        diaUtc.getUTCDate(),
        horaInicialH,
        horaInicialM,
        0,
        0,
      );
      inicio.setMinutes(inicio.getMinutes() + orden * args.minutosEntre);

      await AppDataSource.query(
        `INSERT INTO partidos
           (tenant_id, fecha_id, equipo_local_id, equipo_visita_id, cancha_nombre, fecha_hora, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'PROGRAMADO')`,
        [
          tenantId,
          fechaId,
          p.equipoLocalId,
          p.equipoVisitaId,
          `Cancha ${orden + 1}`,
          inicio.toISOString(),
        ],
      );
      partidosCreados++;
    }
    log(`${partidosCreados} partidos creados.`);

    // Asegurar torneo en estado ACTIVO (por si estaba FINALIZADO).
    await AppDataSource.query(
      `UPDATE torneos SET estado = 'ACTIVO' WHERE id = $1 AND tenant_id = $2`,
      [torneoId, tenantId],
    );

    await AppDataSource.query('COMMIT');
    log('COMMIT — Reset completado.');

    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('═══════════════════════════════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(`  ✓ Fixture regenerado para ${tenantRows[0]!.nombre} / ${torneoRows[0]!.nombre}`);
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${fixture.fechas} fechas, ${partidosCreados} partidos`);
    // eslint-disable-next-line no-console
    console.log(`  ✓ Primera fecha: ${args.fechaInicio} a las ${args.horaPrimero}`);
    // eslint-disable-next-line no-console
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    await AppDataSource.query('ROLLBACK');
    log(`ROLLBACK por error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
