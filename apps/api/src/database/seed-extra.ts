/**
 * Seed extra: pobla MÁS personal y equipos para probar la app con
 * dataset realista (auto-asignación, búsqueda, filtros).
 *
 * Idempotente: chequea si el correlativo + apellido ya existen antes
 * de insertar. Podés correrlo varias veces sin duplicar.
 *
 * Cómo usarlo:
 *   docker compose exec api pnpm db:seed:extra
 * o local:
 *   pnpm --filter @fixtura/api db:seed:extra
 */
import 'dotenv/config';

import { calcularDigitoVerificador } from '@fixtura/types';

import AppDataSource from './datasource';

interface PersonalSeed {
  nombre: string;
  apellido: string;
  rutNumero: string; // sin dv
  rol: 'ARBITRO_PRINCIPAL' | 'ARBITRO_ASISTENTE' | 'PLANILLERO' | 'PARAMEDICO' | 'OTRO';
  telefono: string;
  tarifaBase: number;
  carnetAnfaVenceDias: number | null; // días desde hoy (positivo = vigente; negativo = vencido)
}

/**
 * Los RUTs se construyen pegando el dígito verificador real calculado
 * con módulo 11 → todos pasan validación. Los números son inventados
 * pero verosímiles para el rango chileno.
 */
const PERSONAL_EXTRA: PersonalSeed[] = [
  // Árbitros principales — distribuidos en estados de carnet
  { nombre: 'Aníbal', apellido: 'Sanhueza', rutNumero: '11234567', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0001', tarifaBase: 50000, carnetAnfaVenceDias: 400 },
  { nombre: 'Boris', apellido: 'Cárdenas', rutNumero: '12345670', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0002', tarifaBase: 50000, carnetAnfaVenceDias: 200 },
  { nombre: 'César', apellido: 'Oyarzún', rutNumero: '13456789', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0003', tarifaBase: 45000, carnetAnfaVenceDias: 50 },
  { nombre: 'Damián', apellido: 'Pizarro', rutNumero: '14567890', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0004', tarifaBase: 48000, carnetAnfaVenceDias: 15 }, // POR VENCER
  { nombre: 'Eduardo', apellido: 'Vargas', rutNumero: '15678901', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0005', tarifaBase: 50000, carnetAnfaVenceDias: 7 }, // POR VENCER
  { nombre: 'Fabián', apellido: 'Estay', rutNumero: '16789012', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0006', tarifaBase: 45000, carnetAnfaVenceDias: -30 }, // VENCIDO
  { nombre: 'Gonzalo', apellido: 'Castro', rutNumero: '17890123', rol: 'ARBITRO_PRINCIPAL', telefono: '+56 9 8000 0007', tarifaBase: 50000, carnetAnfaVenceDias: 720 },

  // Árbitros asistentes
  { nombre: 'Hugo', apellido: 'Rivera', rutNumero: '11122233', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 8000 0010', tarifaBase: 30000, carnetAnfaVenceDias: 365 },
  { nombre: 'Iván', apellido: 'Salinas', rutNumero: '11223344', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 8000 0011', tarifaBase: 30000, carnetAnfaVenceDias: 180 },
  { nombre: 'Joaquín', apellido: 'Henríquez', rutNumero: '12233445', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 8000 0012', tarifaBase: 28000, carnetAnfaVenceDias: 90 },
  { nombre: 'Kevin', apellido: 'Núñez', rutNumero: '13344556', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 8000 0013', tarifaBase: 28000, carnetAnfaVenceDias: 250 },
  { nombre: 'Lautaro', apellido: 'Bravo', rutNumero: '14455667', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 8000 0014', tarifaBase: 32000, carnetAnfaVenceDias: 100 },
  { nombre: 'Maximiliano', apellido: 'Tapia', rutNumero: '15566778', rol: 'ARBITRO_ASISTENTE', telefono: '+56 9 8000 0015', tarifaBase: 28000, carnetAnfaVenceDias: 60 },

  // Planilleros
  { nombre: 'Natalia', apellido: 'Muñoz', rutNumero: '16677889', rol: 'PLANILLERO', telefono: '+56 9 8000 0020', tarifaBase: 22000, carnetAnfaVenceDias: null },
  { nombre: 'Olivia', apellido: 'Soto', rutNumero: '17788990', rol: 'PLANILLERO', telefono: '+56 9 8000 0021', tarifaBase: 22000, carnetAnfaVenceDias: null },
  { nombre: 'Paloma', apellido: 'Reyes', rutNumero: '18899001', rol: 'PLANILLERO', telefono: '+56 9 8000 0022', tarifaBase: 22000, carnetAnfaVenceDias: null },

  // Paramédicos (van por recinto, NO se asignan a partidos)
  { nombre: 'Rocío', apellido: 'Fuentes', rutNumero: '19900112', rol: 'PARAMEDICO', telefono: '+56 9 8000 0030', tarifaBase: 35000, carnetAnfaVenceDias: null },
  { nombre: 'Sofía', apellido: 'Vidal', rutNumero: '11000223', rol: 'PARAMEDICO', telefono: '+56 9 8000 0031', tarifaBase: 35000, carnetAnfaVenceDias: null },

  // Otros (utilería, comunicaciones — del recinto también)
  { nombre: 'Tomás', apellido: 'Aguilar', rutNumero: '12000334', rol: 'OTRO', telefono: '+56 9 8000 0040', tarifaBase: 18000, carnetAnfaVenceDias: null },
];

function rutCompleto(numero: string): string {
  const dv = calcularDigitoVerificador(numero);
  // Formato con puntos
  const conPuntos = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${conPuntos}-${dv}`;
}

function isoMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  // eslint-disable-next-line no-console
  console.log('[seed-extra] Connected');

  const slug = process.env.SEED_TENANT_SLUG ?? 'liga-demo';

  try {
    await AppDataSource.query('BEGIN');
    await AppDataSource.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const rows = (await AppDataSource.query(`SELECT id FROM tenants WHERE slug = $1`, [
      slug,
    ])) as Array<{ id: string }>;
    if (rows.length === 0) {
      throw new Error(`No existe tenant con slug "${slug}". Correr primero pnpm db:seed.`);
    }
    const tenantId = rows[0]!.id;
    log(`Tenant: ${slug} (${tenantId})`);

    let creados = 0;
    let saltados = 0;

    for (const p of PERSONAL_EXTRA) {
      const rut = rutCompleto(p.rutNumero);
      const existing = (await AppDataSource.query(
        `SELECT id FROM personal WHERE tenant_id = $1 AND rut = $2 LIMIT 1`,
        [tenantId, rut],
      )) as Array<{ id: string }>;
      if (existing.length > 0) {
        saltados++;
        continue;
      }
      const carnetNumero =
        p.rol === 'ARBITRO_PRINCIPAL' || p.rol === 'ARBITRO_ASISTENTE'
          ? `A-${1000 + creados}`
          : null;
      const carnetVence =
        p.carnetAnfaVenceDias !== null ? isoMasDias(p.carnetAnfaVenceDias) : null;
      await AppDataSource.query(
        `INSERT INTO personal
           (tenant_id, nombre, apellido, rut, rol, telefono, tarifa_base, carnet_anfa_numero, carnet_anfa_vence, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [
          tenantId,
          p.nombre,
          p.apellido,
          rut,
          p.rol,
          p.telefono,
          p.tarifaBase,
          carnetNumero,
          carnetVence,
        ],
      );
      creados++;
    }

    await AppDataSource.query('COMMIT');
    log(`Done. Creados: ${creados}, ya existían: ${saltados}.`);
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('════════════════════════════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(`  ${creados} personas nuevas, ${saltados} ya estaban cargadas.`);
    // eslint-disable-next-line no-console
    console.log('════════════════════════════════════════════════════════════');
  } catch (err) {
    await AppDataSource.query('ROLLBACK').catch(() => {
      /* swallow */
    });
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed-extra] ${msg}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-extra] FATAL', err);
  process.exit(1);
});
