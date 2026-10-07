/**
 * One-shot (decisión de producto 2026-10-07, hallazgo H3 de la revisión):
 * las fechas que ya estaban COMPLETAS antes del deploy de T16 (un
 * NO_JUGADO/SUSPENDIDO entre finalizados) no se cierran solas — nadie
 * vuelve a tocar sus partidos. Este script las reevalúa con la MISMA
 * lógica de producción (PartidosAdminService.evaluarCierreDeFecha: lock,
 * ledger y regla "solo descuenta si el equipo del sancionado jugó").
 *
 * USO (en el contenedor api, después del deploy):
 *   # 1) Dry-run (default): lista qué haría, no toca nada.
 *   docker compose exec api node dist/database/reevaluar-fechas-completas.js
 *
 *   # 2) Aplicar de verdad (deja audit por fecha):
 *   docker compose exec -e APLICAR=true api node dist/database/reevaluar-fechas-completas.js
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { DataSource } from 'typeorm';

import { AppModule } from '../app.module';
import { runComoSistema } from '../common/rls/rls-context';
import { PartidosAdminService } from '../modules/admin/partidos/partidos-admin.service';
import { AuditLogService } from '../modules/audit';

interface FechaCandidata {
  fecha_id: string;
  tenant_id: string;
  tenant_slug: string;
  torneo_nombre: string;
  numero: number;
  estado: string;
  resueltos: number;
  total: number;
  sanciones_potenciales: number;
}

async function main(): Promise<void> {
  const aplicar = process.env.APLICAR === 'true';
  initializeTransactionalContext();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const ds = app.get(DataSource);
    const partidosSvc = app.get(PartidosAdminService);
    const audit = app.get(AuditLogService);

    const candidatas = await runComoSistema(ds, async () => {
      return (await ds.query(`
        SELECT f.id AS fecha_id, f.tenant_id, t.slug AS tenant_slug,
               tor.nombre AS torneo_nombre, f.numero, f.estado,
               COUNT(*) FILTER (WHERE p.estado IN
                 ('FINALIZADO','WALKOVER','NO_JUGADO','SUSPENDIDO_FUERZA_MAYOR','REPROGRAMADO')
               )::int AS resueltos,
               COUNT(p.id)::int AS total,
               (SELECT COUNT(*)::int FROM sanciones_activas s
                 WHERE s.torneo_id = f.torneo_id
                   AND s.cumplida = false AND s.revocada = false
                   AND s.fechas_pendientes > 0
                   AND s.desde_fecha_numero <= f.numero) AS sanciones_potenciales
          FROM fechas f
          JOIN torneos tor ON tor.id = f.torneo_id
          JOIN tenants t ON t.id = f.tenant_id
          JOIN partidos p ON p.fecha_id = f.id
         WHERE f.estado IN ('PROGRAMADA','EN_CURSO')
         GROUP BY f.id, f.tenant_id, t.slug, tor.nombre, f.numero, f.estado
        HAVING COUNT(*) = COUNT(*) FILTER (WHERE p.estado IN
          ('FINALIZADO','WALKOVER','NO_JUGADO','SUSPENDIDO_FUERZA_MAYOR','REPROGRAMADO'))
         ORDER BY t.slug, tor.nombre, f.numero
      `)) as FechaCandidata[];
    });

    if (candidatas.length === 0) {
      console.log('✅ No hay fechas completas sin cerrar. Nada que hacer.');
      return;
    }

    console.log(
      `${aplicar ? 'APLICANDO' : 'DRY-RUN (APLICAR=true para ejecutar)'} — ${candidatas.length} fecha(s) completas sin cerrar:\n`,
    );
    for (const c of candidatas) {
      console.log(
        `  [${c.tenant_slug}] ${c.torneo_nombre} · Fecha ${c.numero} (${c.estado}) — ` +
          `${c.resueltos}/${c.total} partidos resueltos, ` +
          `${c.sanciones_potenciales} sanción(es) candidatas a descuento ` +
          `(descuentan solo si el equipo del sancionado jugó).`,
      );
    }

    if (!aplicar) return;

    let cerradas = 0;
    for (const c of candidatas) {
      await runComoSistema(ds, async () => {
        await partidosSvc.evaluarCierreDeFecha(c.fecha_id, c.tenant_id);
        await audit.record({
          action: 'disciplina.fecha_reevaluada_oneshot',
          tenantId: c.tenant_id,
          entityType: 'Fecha',
          entityId: c.fecha_id,
          metadata: { numero: c.numero, torneo: c.torneo_nombre, estadoPrevio: c.estado },
        });
      });
      cerradas++;
      console.log(`  ✔ cerrada: [${c.tenant_slug}] Fecha ${c.numero} de ${c.torneo_nombre}`);
    }
    console.log(`\n✅ ${cerradas} fecha(s) reevaluadas y cerradas (audit por fecha).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[reevaluar-fechas] FATAL:', err);
  process.exit(1);
});
