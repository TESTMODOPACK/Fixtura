/**
 * Seed enriquecido — crea un escenario completo y realista de una liga:
 *
 *   - Tenant "Liga Demo" + admin
 *   - Temporada 2026
 *   - Torneo "Apertura 2026" estado ACTIVO
 *   - 8 equipos con escudos placeholder y colores
 *   - 5 jugadores por equipo (40 total) con datos verosímiles
 *   - Fixture generado con el motor Berger (packages/domain)
 *   - Fechas 1-4 jugadas con resultados
 *   - Incidencias: ~32 goles + ~12 amarillas + 2 rojas + asistencias + MVPs
 *   - Algunas sanciones automáticas activas
 *
 * Idempotente: si ya hay torneo, no recrea. Para reseed limpio, hacer
 *   docker compose down -v && up -d
 */
import 'dotenv/config';
import { hash } from 'bcrypt';
import { generarFixtureBerger } from '@fixtura/domain';

import AppDataSource from './datasource';

interface EquipoSeed {
  nombre: string;
  slug: string;
  color: string;
  jugadores: Array<{ nombre: string; apellido: string; posicion: string; capitan?: boolean }>;
}

const EQUIPOS_SEED: EquipoSeed[] = [
  {
    nombre: 'Halcones FC',
    slug: 'halcones-fc',
    color: '#1B4332',
    jugadores: [
      { nombre: 'Carlos', apellido: 'Pérez', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Luis', apellido: 'Hernández', posicion: 'MEDIO' },
      { nombre: 'Marco', apellido: 'Silva', posicion: 'DEFENSA' },
      { nombre: 'Ignacio', apellido: 'Reyes', posicion: 'DEFENSA' },
      { nombre: 'Tomás', apellido: 'Bravo', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Pumas Unidos',
    slug: 'pumas-unidos',
    color: '#E76F26',
    jugadores: [
      { nombre: 'Diego', apellido: 'López', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Jorge', apellido: 'Muñoz', posicion: 'MEDIO' },
      { nombre: 'Felipe', apellido: 'Castillo', posicion: 'MEDIO' },
      { nombre: 'Alejandro', apellido: 'Vásquez', posicion: 'DEFENSA' },
      { nombre: 'Cristián', apellido: 'Pino', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Zorros del Valle',
    slug: 'zorros-del-valle',
    color: '#C1272D',
    jugadores: [
      { nombre: 'Matías', apellido: 'Soto', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Eduardo', apellido: 'Riquelme', posicion: 'MEDIO' },
      { nombre: 'Sebastián', apellido: 'Núñez', posicion: 'DEFENSA' },
      { nombre: 'Pablo', apellido: 'Salazar', posicion: 'DEFENSA' },
      { nombre: 'Joaquín', apellido: 'Herrera', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Cóndores Sur',
    slug: 'condores-sur',
    color: '#0F2A1F',
    jugadores: [
      { nombre: 'Juan', apellido: 'Méndez', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Andrés', apellido: 'Vega', posicion: 'MEDIO' },
      { nombre: 'Nicolás', apellido: 'Toro', posicion: 'DEFENSA' },
      { nombre: 'Roberto', apellido: 'Cifuentes', posicion: 'DEFENSA' },
      { nombre: 'Daniel', apellido: 'Quiroz', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Estrella Polar',
    slug: 'estrella-polar',
    color: '#2D6A4F',
    jugadores: [
      { nombre: 'Pablo', apellido: 'Rojas', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Lucas', apellido: 'Aguilera', posicion: 'MEDIO' },
      { nombre: 'Fernando', apellido: 'Cortés', posicion: 'DEFENSA' },
      { nombre: 'Renato', apellido: 'Espinoza', posicion: 'DEFENSA' },
      { nombre: 'Bastián', apellido: 'Vidal', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Rayo Andino',
    slug: 'rayo-andino',
    color: '#95D5B2',
    jugadores: [
      { nombre: 'Sebastián', apellido: 'Lagos', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Marcelo', apellido: 'Donoso', posicion: 'MEDIO' },
      { nombre: 'Esteban', apellido: 'Acuña', posicion: 'DEFENSA' },
      { nombre: 'Hernán', apellido: 'Maturana', posicion: 'DEFENSA' },
      { nombre: 'Mauricio', apellido: 'Salinas', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Trueno FC',
    slug: 'trueno-fc',
    color: '#1A1A1A',
    jugadores: [
      { nombre: 'Felipe', apellido: 'Castro', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Javier', apellido: 'Olivares', posicion: 'MEDIO' },
      { nombre: 'Iván', apellido: 'Tapia', posicion: 'DEFENSA' },
      { nombre: 'Camilo', apellido: 'Fuentes', posicion: 'DEFENSA' },
      { nombre: 'Patricio', apellido: 'Bustos', posicion: 'ARQUERO' },
    ],
  },
  {
    nombre: 'Lobos Negros',
    slug: 'lobos-negros',
    color: '#E5DCC5',
    jugadores: [
      { nombre: 'Sergio', apellido: 'Aros', posicion: 'DELANTERO', capitan: true },
      { nombre: 'Rodrigo', apellido: 'Mella', posicion: 'MEDIO' },
      { nombre: 'Víctor', apellido: 'Ramírez', posicion: 'DEFENSA' },
      { nombre: 'Christian', apellido: 'Vergara', posicion: 'DEFENSA' },
      { nombre: 'Esteban', apellido: 'Llanos', posicion: 'ARQUERO' },
    ],
  },
];

async function main(): Promise<void> {
  await AppDataSource.initialize();
  // eslint-disable-next-line no-console
  console.log('[seed] Connected');

  const slug = process.env.SEED_TENANT_SLUG ?? 'liga-demo';
  const nombre = process.env.SEED_TENANT_NAME ?? 'Liga Demo';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@fixtura.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Fixtura2026!';

  try {
    await AppDataSource.query('BEGIN');
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    // ─── Tenant ──────────────────────────────────────────────────────
    let tenantId = await getOrCreateTenant(slug, nombre);
    log(`Tenant: ${slug} (${tenantId})`);

    // ─── Admin user + rol ────────────────────────────────────────────
    const passwordHash = await hash(adminPassword, 12);
    const userId = await upsertAdminUser(adminEmail, passwordHash);
    log(`Admin: ${adminEmail} (${userId})`);
    await AppDataSource.query(
      `INSERT INTO user_roles (tenant_id, user_id, role, scope_type, scope_id)
       VALUES ($1, $2, $3, $4, $1) ON CONFLICT DO NOTHING`,
      [tenantId, userId, 'LIGA_ADMIN', 'TENANT'],
    );

    // ─── Datos deportivos (idempotente: solo si no existe el torneo) ──
    const existingTorneo = await AppDataSource.query(
      `SELECT id FROM torneos WHERE tenant_id = $1 AND slug = 'apertura-2026'`,
      [tenantId],
    );

    if (existingTorneo.length > 0) {
      log('Torneo Apertura 2026 ya existe — saltando seed deportivo.');
    } else {
      await seedDeportivo(tenantId);
    }

    await AppDataSource.query('COMMIT');
    log('Done.');
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('════════════════════════════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(`  Login admin: ${adminEmail} / ${adminPassword}`);
    // eslint-disable-next-line no-console
    console.log('════════════════════════════════════════════════════════════');
  } catch (err) {
    await AppDataSource.query('ROLLBACK');
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed] ${msg}`);
}

async function getOrCreateTenant(slug: string, nombre: string): Promise<string> {
  const existing = (await AppDataSource.query(`SELECT id FROM tenants WHERE slug = $1`, [
    slug,
  ])) as Array<{ id: string }>;
  if (existing.length > 0) return existing[0]!.id;

  const rows = (await AppDataSource.query(
    `INSERT INTO tenants (slug, nombre, tipo, plan) VALUES ($1, $2, 'LIGA', 'STARTER') RETURNING id`,
    [slug, nombre],
  )) as Array<{ id: string }>;
  return rows[0]!.id;
}

async function upsertAdminUser(email: string, passwordHash: string): Promise<string> {
  const existing = (await AppDataSource.query(`SELECT id FROM users WHERE email = $1`, [
    email,
  ])) as Array<{ id: string }>;
  if (existing.length > 0) {
    await AppDataSource.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      passwordHash,
      existing[0]!.id,
    ]);
    return existing[0]!.id;
  }
  const rows = (await AppDataSource.query(
    `INSERT INTO users (email, password_hash, nombre, apellido, idioma_pref) VALUES ($1, $2, 'Admin', 'Demo', 'es') RETURNING id`,
    [email, passwordHash],
  )) as Array<{ id: string }>;
  return rows[0]!.id;
}

async function seedDeportivo(tenantId: string): Promise<void> {
  // Temporada
  const temporadaRows = (await AppDataSource.query(
    `INSERT INTO temporadas (tenant_id, nombre, anio, fecha_inicio, fecha_fin)
     VALUES ($1, 'Temporada 2026', 2026, '2026-03-01', '2026-12-15') RETURNING id`,
    [tenantId],
  )) as Array<{ id: string }>;
  const temporadaId = temporadaRows[0]!.id;
  log(`Temporada creada: ${temporadaId}`);

  // Torneo
  const torneoRows = (await AppDataSource.query(
    `INSERT INTO torneos (tenant_id, temporada_id, nombre, slug, tipo_formato, ruedas, estado, fecha_inicio, fecha_fin)
     VALUES ($1, $2, 'Apertura 2026', 'apertura-2026', 'ROUND_ROBIN', 1, 'ACTIVO', '2026-04-05', '2026-07-15') RETURNING id`,
    [tenantId, temporadaId],
  )) as Array<{ id: string }>;
  const torneoId = torneoRows[0]!.id;
  log(`Torneo creado: Apertura 2026 (${torneoId})`);

  // Equipos
  const equipoIds: string[] = [];
  const jugadoresPorEquipo = new Map<string, string[]>();
  for (const eq of EQUIPOS_SEED) {
    const rows = (await AppDataSource.query(
      `INSERT INTO equipos (tenant_id, torneo_id, nombre, slug, color_primario, estado)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVO') RETURNING id`,
      [tenantId, torneoId, eq.nombre, eq.slug, eq.color],
    )) as Array<{ id: string }>;
    const eqId = rows[0]!.id;
    equipoIds.push(eqId);

    const jugIds: string[] = [];
    for (let i = 0; i < eq.jugadores.length; i++) {
      const j = eq.jugadores[i]!;
      const jRows = (await AppDataSource.query(
        `INSERT INTO jugadores_inscritos
           (tenant_id, equipo_id, nombre, apellido, posicion, numero_camiseta, capitan)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tenantId, eqId, j.nombre, j.apellido, j.posicion, i + 1, j.capitan ?? false],
      )) as Array<{ id: string }>;
      jugIds.push(jRows[0]!.id);
    }
    jugadoresPorEquipo.set(eqId, jugIds);
  }
  log(`Equipos creados: ${equipoIds.length}, jugadores: ${equipoIds.length * 5}`);

  // Fixture con Berger
  const fixture = generarFixtureBerger(
    equipoIds.map((id, idx) => ({ id, nombre: EQUIPOS_SEED[idx]!.nombre })),
    { ruedas: 1 },
  );

  // Crear fechas
  const fechaIdByNumero = new Map<number, string>();
  for (let n = 1; n <= fixture.fechas; n++) {
    const inicioMes = new Date(2026, 3, 5); // 5 abril 2026
    const fechaInicio = new Date(inicioMes);
    fechaInicio.setDate(inicioMes.getDate() + (n - 1) * 7);
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaInicio.getDate() + 1);

    const estado = n <= 4 ? 'FINALIZADA' : 'PROGRAMADA';
    const etiqueta = `Fecha ${n} · ${fechaInicio.toLocaleDateString('es-CL', { day: '2-digit', month: 'long' })}`;

    const rows = (await AppDataSource.query(
      `INSERT INTO fechas (tenant_id, torneo_id, numero, etiqueta, fecha_inicio, fecha_fin, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [tenantId, torneoId, n, etiqueta, fechaInicio.toISOString().slice(0, 10), fechaFin.toISOString().slice(0, 10), estado],
    )) as Array<{ id: string }>;
    fechaIdByNumero.set(n, rows[0]!.id);
  }
  log(`Fechas creadas: ${fixture.fechas}`);

  // Crear partidos
  const partidosCreados: Array<{ id: string; fechaNumero: number; localId: string; visitaId: string }> = [];
  for (const p of fixture.partidos) {
    const fechaId = fechaIdByNumero.get(p.fechaNumero)!;
    const horarios = ['10:00', '12:00', '14:00', '16:00'];
    const idx = partidosCreados.filter((pp) => pp.fechaNumero === p.fechaNumero).length;
    const cancha = `Cancha ${idx + 1}`;

    const baseFecha = new Date(2026, 3, 5 + (p.fechaNumero - 1) * 7);
    const [h, m] = horarios[idx % horarios.length]!.split(':').map(Number);
    baseFecha.setHours(h!, m!, 0, 0);

    const finalizado = p.fechaNumero <= 4;
    const gl = finalizado ? Math.floor(Math.random() * 4) : null;
    const gv = finalizado ? Math.floor(Math.random() * 4) : null;
    const estado = finalizado ? 'FINALIZADO' : 'PROGRAMADO';
    const actaCerradaAt = finalizado ? new Date(baseFecha.getTime() + 90 * 60 * 1000).toISOString() : null;

    const rows = (await AppDataSource.query(
      `INSERT INTO partidos
         (tenant_id, fecha_id, equipo_local_id, equipo_visita_id, cancha_nombre, fecha_hora, estado, goles_local, goles_visita, acta_cerrada_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        tenantId,
        fechaId,
        p.equipoLocalId,
        p.equipoVisitaId,
        cancha,
        baseFecha.toISOString(),
        estado,
        gl,
        gv,
        actaCerradaAt,
      ],
    )) as Array<{ id: string }>;
    partidosCreados.push({
      id: rows[0]!.id,
      fechaNumero: p.fechaNumero,
      localId: p.equipoLocalId,
      visitaId: p.equipoVisitaId,
    });
  }
  log(`Partidos creados: ${partidosCreados.length}`);

  // Incidencias para partidos finalizados
  const partidosFinalizados = partidosCreados.filter((p) => p.fechaNumero <= 4);
  let golesCount = 0;
  let amarillasCount = 0;
  let mvpsCount = 0;
  let asistenciasCount = 0;

  for (const partido of partidosFinalizados) {
    const result = (await AppDataSource.query(
      `SELECT goles_local, goles_visita FROM partidos WHERE id = $1`,
      [partido.id],
    )) as Array<{ goles_local: number; goles_visita: number }>;
    const golesLocal = result[0]?.goles_local ?? 0;
    const golesVisita = result[0]?.goles_visita ?? 0;

    const jugadoresLocal = jugadoresPorEquipo.get(partido.localId)!;
    const jugadoresVisita = jugadoresPorEquipo.get(partido.visitaId)!;

    // Goles del local
    for (let g = 0; g < golesLocal; g++) {
      const scorer = jugadoresLocal[g % jugadoresLocal.length]!;
      await AppDataSource.query(
        `INSERT INTO incidencias_partido (tenant_id, partido_id, equipo_id, jugador_inscrito_id, tipo, minuto)
         VALUES ($1, $2, $3, $4, 'GOL', $5)`,
        [tenantId, partido.id, partido.localId, scorer, 10 + g * 15],
      );
      golesCount++;

      // Asistencia (50% chance, de otro jugador)
      if (Math.random() > 0.5) {
        const assister = jugadoresLocal[(g + 1) % jugadoresLocal.length]!;
        if (assister !== scorer) {
          await AppDataSource.query(
            `INSERT INTO incidencias_partido (tenant_id, partido_id, equipo_id, jugador_inscrito_id, tipo, minuto)
             VALUES ($1, $2, $3, $4, 'ASISTENCIA', $5)`,
            [tenantId, partido.id, partido.localId, assister, 10 + g * 15],
          );
          asistenciasCount++;
        }
      }
    }

    // Goles del visita
    for (let g = 0; g < golesVisita; g++) {
      const scorer = jugadoresVisita[g % jugadoresVisita.length]!;
      await AppDataSource.query(
        `INSERT INTO incidencias_partido (tenant_id, partido_id, equipo_id, jugador_inscrito_id, tipo, minuto)
         VALUES ($1, $2, $3, $4, 'GOL', $5)`,
        [tenantId, partido.id, partido.visitaId, scorer, 15 + g * 12],
      );
      golesCount++;

      if (Math.random() > 0.5) {
        const assister = jugadoresVisita[(g + 1) % jugadoresVisita.length]!;
        if (assister !== scorer) {
          await AppDataSource.query(
            `INSERT INTO incidencias_partido (tenant_id, partido_id, equipo_id, jugador_inscrito_id, tipo, minuto)
             VALUES ($1, $2, $3, $4, 'ASISTENCIA', $5)`,
            [tenantId, partido.id, partido.visitaId, assister, 15 + g * 12],
          );
          asistenciasCount++;
        }
      }
    }

    // 1-2 amarillas por partido random
    const cantidadAmarillas = Math.floor(Math.random() * 3);
    for (let a = 0; a < cantidadAmarillas; a++) {
      const equipoElegido = Math.random() > 0.5 ? partido.localId : partido.visitaId;
      const jugadores = equipoElegido === partido.localId ? jugadoresLocal : jugadoresVisita;
      const jug = jugadores[Math.floor(Math.random() * jugadores.length)]!;
      await AppDataSource.query(
        `INSERT INTO incidencias_partido (tenant_id, partido_id, equipo_id, jugador_inscrito_id, tipo, minuto)
         VALUES ($1, $2, $3, $4, 'AMARILLA', $5)`,
        [tenantId, partido.id, equipoElegido, jug, 30 + a * 20],
      );
      amarillasCount++;
    }

    // MVP del partido: el mejor jugador del equipo ganador (o aleatorio si empate)
    const equipoGanador =
      golesLocal > golesVisita
        ? partido.localId
        : golesVisita > golesLocal
          ? partido.visitaId
          : Math.random() > 0.5
            ? partido.localId
            : partido.visitaId;
    const jugMvp =
      equipoGanador === partido.localId
        ? jugadoresLocal[0]!
        : jugadoresVisita[0]!;
    await AppDataSource.query(
      `INSERT INTO incidencias_partido (tenant_id, partido_id, equipo_id, jugador_inscrito_id, tipo, minuto)
       VALUES ($1, $2, $3, $4, 'MVP', 90)`,
      [tenantId, partido.id, equipoGanador, jugMvp],
    );
    mvpsCount++;
  }

  log(
    `Incidencias creadas: ${golesCount} goles, ${asistenciasCount} asistencias, ${amarillasCount} amarillas, ${mvpsCount} MVPs`,
  );

  // ─── Personal operativo (árbitros / planilleros / paramédicos) ────
  await seedPersonal(tenantId);
}

/**
 * Cataloga 8 personas operativas: 4 árbitros principales, 2 asistentes,
 * 1 planillero, 1 paramédico. Mezcla de carnets ANFA vigentes / por
 * vencer / vencidos para que el panel muestre datos significativos.
 */
async function seedPersonal(tenantId: string): Promise<void> {
  const hoy = new Date();
  const isoMasDias = (dias: number): string => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  const personal: Array<{
    nombre: string;
    apellido: string;
    rut: string;
    rol: string;
    telefono: string;
    tarifaBase: number;
    carnetAnfaNumero: string | null;
    carnetAnfaVence: string | null;
  }> = [
    // Árbitros principales — carnet vigente
    { nombre: 'Cristián', apellido: 'Garay', rut: '15.234.567-8', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8123 4567', tarifaBase: 45000, carnetAnfaNumero: 'A-1023', carnetAnfaVence: isoMasDias(420) },
    { nombre: 'Patricio', apellido: 'Ñaupas', rut: '12.456.789-K', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 7654 3210', tarifaBase: 45000, carnetAnfaNumero: 'A-0987', carnetAnfaVence: isoMasDias(180) },
    // Árbitro con carnet por vencer (warning naranja)
    { nombre: 'Roberto', apellido: 'Mardones', rut: '14.876.123-2', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 5544 3322', tarifaBase: 45000, carnetAnfaNumero: 'A-1100', carnetAnfaVence: isoMasDias(22) },
    // Árbitro con carnet vencido (warning rojo)
    { nombre: 'Diego', apellido: 'Salas', rut: '13.555.221-7', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 9988 7766', tarifaBase: 45000, carnetAnfaNumero: 'A-0876', carnetAnfaVence: isoMasDias(-45) },
    // Asistentes
    { nombre: 'Felipe', apellido: 'Quintana', rut: '16.123.456-9', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 4433 2211', tarifaBase: 28000, carnetAnfaNumero: 'B-2034', carnetAnfaVence: isoMasDias(310) },
    { nombre: 'Marcelo', apellido: 'Vergara', rut: '17.234.567-0', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 6677 8899', tarifaBase: 28000, carnetAnfaNumero: 'B-2102', carnetAnfaVence: isoMasDias(95) },
    // Planillero
    { nombre: 'Camila', apellido: 'Rojas', rut: '18.345.678-1', rol: 'PLANILLERO', telefono: '+56 9 1122 3344', tarifaBase: 22000, carnetAnfaNumero: null, carnetAnfaVence: null },
    // Paramédico
    { nombre: 'Javiera', apellido: 'Hernández', rut: '17.987.654-3', rol: 'PARAMEDICO', telefono: '+56 9 5566 7788', tarifaBase: 35000, carnetAnfaNumero: null, carnetAnfaVence: null },
  ];

  for (const p of personal) {
    await AppDataSource.query(
      `INSERT INTO personal
         (tenant_id, nombre, apellido, rut, rol, telefono, tarifa_base, carnet_anfa_numero, carnet_anfa_vence, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [
        tenantId,
        p.nombre,
        p.apellido,
        p.rut,
        p.rol,
        p.telefono,
        p.tarifaBase,
        p.carnetAnfaNumero,
        p.carnetAnfaVence,
      ],
    );
  }
  log(`Personal cargado: ${personal.length} personas (árbitros, asistentes, planillero, paramédico)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] FATAL', err);
  process.exit(1);
});
