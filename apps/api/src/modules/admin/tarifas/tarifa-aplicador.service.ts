import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLogService } from '../../audit';
import { Cobro } from '../../competition/entities/cobro.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import {
  type FrecuenciaCuota,
  TarifaTorneo,
  type TipoTarifa,
} from '../../competition/entities/tarifa-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

/**
 * Sprint 34C — Helper compartido para aplicar tarifas y generar cobros.
 *
 * Usado por:
 *   - InscripcionesAdminService.inscribir() → aplica MATRICULA.
 *   - CuotasCron diario → genera cuotas CUOTA recurrentes faltantes.
 *   - (34D) acta y walkover → aplica MULTAs.
 *
 * Filosofía:
 *   - Si no hay tarifa configurada para el concepto, NO genera cobro
 *     (silencioso) y deja una entrada en audit_log para diagnóstico.
 *   - Idempotente para cuotas: usa el UNIQUE de
 *     (inscripcion_id, tarifa_id, periodo_anio, periodo_mes/semana) y
 *     pre-chequea antes para no inflar logs de PG con violaciones.
 *   - Nunca tira excepción al caller del flujo principal: encapsula
 *     errores en logs para que un fallo de cobro no rompa la
 *     inscripción ni el cierre del acta.
 */
@Injectable()
export class TarifaAplicadorService {
  private readonly log = new Logger(TarifaAplicadorService.name);

  constructor(
    @InjectRepository(TarifaTorneo)
    private readonly tarifaRepo: Repository<TarifaTorneo>,
    @InjectRepository(Cobro)
    private readonly cobroRepo: Repository<Cobro>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Torneo)
    private readonly torneoRepo: Repository<Torneo>,
    private readonly audit: AuditLogService,
  ) {}

  // ───────── API pública ─────────

  /**
   * Genera el cobro de MATRICULA para una inscripción recién creada.
   * Idempotente: si ya hay matrícula generada para esa inscripción, no
   * crea otro.
   */
  async aplicarMatricula(
    inscripcionId: string,
    tenantId: string,
  ): Promise<Cobro | null> {
    const insc = await this.cargarInscripcionFull(inscripcionId, tenantId);
    if (!insc) return null;

    const tarifa = await this.buscarTarifa(insc.torneoId, 'MATRICULA');
    if (!tarifa) {
      await this.auditFaltante(tenantId, insc, 'MATRICULA');
      return null;
    }

    // Idempotencia: si ya hay un cobro de matrícula auto para esta
    // inscripción, devolvemos el existente sin generar otro.
    const yaExiste = await this.cobroRepo.findOne({
      where: {
        tenantId,
        inscripcionId: insc.id,
        tarifaId: tarifa.id,
        generadoAuto: true,
        cancelado: false,
      },
    });
    if (yaExiste) return yaExiste;

    const vencimiento = this.calcularVencimientoMatricula(tarifa);
    return this.crearCobro({
      tenantId,
      torneoId: insc.torneoId,
      inscripcionId: insc.id,
      tarifa,
      concepto: this.conceptoMatricula(insc),
      monto: tarifa.monto,
      vencimiento,
      periodoAnio: null,
      periodoMes: null,
      periodoSemana: null,
    });
  }

  /**
   * Genera todas las cuotas recurrentes pendientes para todas las
   * inscripciones activas del tenant. Usado por el cron diario.
   *
   * Para cada (inscripcion, tarifa CUOTA activa), genera cuotas desde
   * el período de la inscripción hasta el período actual. El UNIQUE
   * INDEX evita duplicados ante re-ejecuciones.
   */
  async generarCuotasDelTenant(tenantId: string): Promise<{
    inscripcionesProcesadas: number;
    cuotasCreadas: number;
  }> {
    // Solo inscripciones activas (no retiradas/suspendidas) con torneo
    // que no esté CERRADO.
    const inscripciones = await this.inscRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.torneo', 'torneo')
      .leftJoinAndSelect('i.club', 'club')
      .leftJoinAndSelect('i.categoria', 'cat')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('i.estado IN (:...estados)', {
        estados: ['INSCRITO', 'ACTIVO'],
      })
      .andWhere(
        '(torneo.estado IS NULL OR torneo.estado != :cerrado)',
        { cerrado: 'CERRADO' },
      )
      .getMany();

    let cuotasCreadas = 0;
    for (const insc of inscripciones) {
      const tarifasCuota = await this.tarifaRepo.find({
        where: { torneoId: insc.torneoId, tipo: 'CUOTA', activo: true },
      });
      for (const tarifa of tarifasCuota) {
        if (tarifa.frecuencia === 'UNICO') continue;
        const creadas = await this.generarCuotasFaltantes(insc, tarifa);
        cuotasCreadas += creadas;
      }
    }
    return {
      inscripcionesProcesadas: inscripciones.length,
      cuotasCreadas,
    };
  }

  // ───────── Lógica de generación ─────────

  private async generarCuotasFaltantes(
    insc: InscripcionTorneo,
    tarifa: TarifaTorneo,
  ): Promise<number> {
    const periodos = this.calcularPeriodosFaltantes(insc, tarifa.frecuencia);
    let creadas = 0;
    for (const p of periodos) {
      // Anti-duplicado: si ya existe (auto o manual), no creamos.
      const yaExiste = await this.cobroRepo.findOne({
        where: {
          tenantId: insc.tenantId,
          inscripcionId: insc.id,
          tarifaId: tarifa.id,
          periodoAnio: p.anio,
          periodoMes: p.mes ?? undefined,
          periodoSemana: p.semana ?? undefined,
          cancelado: false,
        },
      });
      if (yaExiste) continue;

      try {
        await this.crearCobro({
          tenantId: insc.tenantId,
          torneoId: insc.torneoId,
          inscripcionId: insc.id,
          tarifa,
          concepto: this.conceptoCuota(insc, tarifa.frecuencia, p),
          monto: tarifa.monto,
          vencimiento: this.calcularVencimientoCuota(tarifa, p),
          periodoAnio: p.anio,
          periodoMes: p.mes,
          periodoSemana: p.semana,
        });
        creadas++;
      } catch (err) {
        // El UNIQUE INDEX puede saltar acá si hay una race con otro
        // cron en paralelo (poco probable, pero defensivo). No lo
        // tratamos como error fatal.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('uq_cobro_cuota_periodo') || msg.includes('duplicate key')) {
          continue;
        }
        this.log.warn(
          `cuota insc=${insc.id} tarifa=${tarifa.id} periodo=${JSON.stringify(p)} falló: ${msg}`,
        );
      }
    }
    return creadas;
  }

  /**
   * Devuelve los períodos faltantes a generar desde la inscripción
   * hasta el período actual, con cap de seguridad de 24 períodos para
   * no inflar la DB si una inscripción se quedó "activa" un año atrás.
   */
  private calcularPeriodosFaltantes(
    insc: InscripcionTorneo,
    frec: FrecuenciaCuota,
  ): Periodo[] {
    const desde = insc.createdAt;
    const hoy = new Date();
    const MAX_PERIODOS = 24;

    const periodos: Periodo[] = [];
    if (frec === 'MENSUAL') {
      let cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
      const tope = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      while (cursor <= tope && periodos.length < MAX_PERIODOS) {
        periodos.push({
          anio: cursor.getFullYear(),
          mes: cursor.getMonth() + 1,
          semana: null,
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else if (frec === 'ANUAL') {
      let anio = desde.getFullYear();
      while (anio <= hoy.getFullYear() && periodos.length < MAX_PERIODOS) {
        periodos.push({ anio, mes: null, semana: null });
        anio++;
      }
    } else if (frec === 'SEMANAL') {
      // ISO weeks. Avanzamos en saltos de 7 días desde el lunes de la
      // semana de la inscripción.
      const ini = lunesDeLaSemana(desde);
      const fin = lunesDeLaSemana(hoy);
      let cursor = new Date(ini);
      while (cursor <= fin && periodos.length < MAX_PERIODOS) {
        const { anio, semana } = isoWeek(cursor);
        periodos.push({ anio, mes: null, semana });
        cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }
    return periodos;
  }

  /**
   * Vencimiento de matrícula:
   *   - Si la tarifa tiene diaVencimiento, vence ese día del mes actual
   *     (o del siguiente si ya pasó).
   *   - Si no, default 7 días desde hoy.
   */
  private calcularVencimientoMatricula(tarifa: TarifaTorneo): string {
    if (tarifa.diaVencimiento == null) {
      const v = new Date();
      v.setDate(v.getDate() + 7);
      return iso(v);
    }
    return iso(diaDeMesProximo(new Date(), tarifa.diaVencimiento));
  }

  /** Vencimiento de una cuota recurrente para el período dado. */
  private calcularVencimientoCuota(
    tarifa: TarifaTorneo,
    p: Periodo,
  ): string | null {
    if (tarifa.diaVencimiento == null) return null;

    if (tarifa.frecuencia === 'MENSUAL' && p.mes != null) {
      const venc = new Date(p.anio, p.mes - 1, 1);
      venc.setDate(
        Math.min(tarifa.diaVencimiento, ultimoDiaDeMes(p.anio, p.mes)),
      );
      return iso(venc);
    }
    if (tarifa.frecuencia === 'ANUAL') {
      // ANUAL sin "mes" definido: usamos diciembre como mes de venc.
      const venc = new Date(p.anio, 11, 1);
      venc.setDate(
        Math.min(tarifa.diaVencimiento, ultimoDiaDeMes(p.anio, 12)),
      );
      return iso(venc);
    }
    if (tarifa.frecuencia === 'SEMANAL' && p.semana != null) {
      // diaVencimiento 1-7 = día de la semana. Buscamos ese día dentro
      // de la semana ISO indicada.
      const lunes = lunesDeIsoWeek(p.anio, p.semana);
      const venc = new Date(
        lunes.getTime() + (tarifa.diaVencimiento - 1) * 24 * 60 * 60 * 1000,
      );
      return iso(venc);
    }
    return null;
  }

  // ───────── Persistencia + audit ─────────

  private async crearCobro(args: {
    tenantId: string;
    torneoId: string;
    inscripcionId: string;
    tarifa: TarifaTorneo;
    concepto: string;
    monto: number;
    vencimiento: string | null;
    periodoAnio: number | null;
    periodoMes: number | null;
    periodoSemana: number | null;
    sancionId?: string | null;
    equipoId?: string | null;
  }): Promise<Cobro> {
    const categoria = this.categoriaCobroParaTipo(args.tarifa.tipo);
    const cobro = this.cobroRepo.create({
      tenantId: args.tenantId,
      equipoId: args.equipoId ?? null,
      torneoId: args.torneoId,
      inscripcionId: args.inscripcionId,
      sancionId: args.sancionId ?? null,
      tarifaId: args.tarifa.id,
      concepto: args.concepto,
      categoria,
      monto: args.monto,
      vencimiento: args.vencimiento,
      generadoAuto: true,
      periodoAnio: args.periodoAnio,
      periodoMes: args.periodoMes,
      periodoSemana: args.periodoSemana,
    });
    const saved = await this.cobroRepo.save(cobro);
    await this.audit.record({
      action: 'cobro.generado_auto',
      tenantId: args.tenantId,
      entityType: 'Cobro',
      entityId: saved.id,
      metadata: {
        tarifaTipo: args.tarifa.tipo,
        torneoId: args.torneoId,
        inscripcionId: args.inscripcionId,
        monto: args.monto,
        vencimiento: args.vencimiento,
      },
    });
    return saved;
  }

  private async auditFaltante(
    tenantId: string,
    insc: InscripcionTorneo,
    tipo: TipoTarifa,
  ): Promise<void> {
    await this.audit.record({
      action: 'cobro.no_generado_por_tarifa_faltante',
      tenantId,
      entityType: 'InscripcionTorneo',
      entityId: insc.id,
      metadata: { torneoId: insc.torneoId, tipoTarifa: tipo },
    });
  }

  // ───────── Helpers de lectura ─────────

  private async cargarInscripcionFull(
    id: string,
    tenantId: string,
  ): Promise<InscripcionTorneo | null> {
    return this.inscRepo.findOne({
      where: { id, tenantId },
      relations: { torneo: true, club: true, categoria: true },
    });
  }

  private async buscarTarifa(
    torneoId: string,
    tipo: TipoTarifa,
  ): Promise<TarifaTorneo | null> {
    return this.tarifaRepo.findOne({
      where: { torneoId, tipo, activo: true },
    });
  }

  // ───────── Helpers de etiquetado ─────────

  private categoriaCobroParaTipo(tipo: TipoTarifa): Cobro['categoria'] {
    switch (tipo) {
      case 'MATRICULA':
        return 'INSCRIPCION';
      case 'CUOTA':
        return 'CUOTA';
      case 'MULTA_AMARILLA':
      case 'MULTA_ROJA':
      case 'MULTA_WALKOVER':
        return 'MULTA';
      default:
        return 'OTRO';
    }
  }

  private conceptoMatricula(insc: InscripcionTorneo): string {
    const club = insc.club?.nombre ?? 'club';
    const cat = insc.categoria?.nombre ?? 'categoría';
    const torneo = insc.torneo?.nombre ?? 'torneo';
    return `Matrícula — ${torneo} (${club} / ${cat})`;
  }

  private conceptoCuota(
    insc: InscripcionTorneo,
    frec: FrecuenciaCuota,
    p: Periodo,
  ): string {
    const club = insc.club?.nombre ?? 'club';
    const cat = insc.categoria?.nombre ?? 'categoría';
    const torneo = insc.torneo?.nombre ?? 'torneo';
    const periodoLabel =
      frec === 'MENSUAL' && p.mes
        ? `${MESES[p.mes - 1]} ${p.anio}`
        : frec === 'SEMANAL' && p.semana
          ? `semana ${p.semana} de ${p.anio}`
          : `${p.anio}`;
    return `Cuota ${periodoLabel} — ${torneo} (${club} / ${cat})`;
  }
}

// ───────── Tipos y utilidades de fecha ─────────

interface Periodo {
  anio: number;
  mes: number | null;
  semana: number | null;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ultimoDiaDeMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

function diaDeMesProximo(desde: Date, dia: number): Date {
  const candidato = new Date(desde.getFullYear(), desde.getMonth(), 1);
  candidato.setDate(Math.min(dia, ultimoDiaDeMes(candidato.getFullYear(), candidato.getMonth() + 1)));
  if (candidato < desde) {
    candidato.setMonth(candidato.getMonth() + 1);
    candidato.setDate(Math.min(dia, ultimoDiaDeMes(candidato.getFullYear(), candidato.getMonth() + 1)));
  }
  return candidato;
}

function lunesDeLaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Dom .. 6=Sab
  const diffLunes = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diffLunes);
  return x;
}

/** ISO week + ISO weekYear de una fecha. */
function isoWeek(d: Date): { anio: number; semana: number } {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = (target.getTime() - firstThursday.getTime()) / (24 * 60 * 60 * 1000);
  const semana = 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return { anio: target.getFullYear(), semana };
}

/** Devuelve el lunes de la semana ISO dada. */
function lunesDeIsoWeek(anio: number, semana: number): Date {
  // Jueves de la semana 1 = primer jueves del año (siempre cae en semana 1).
  const ene4 = new Date(anio, 0, 4);
  const lunesSem1 = lunesDeLaSemana(ene4);
  return new Date(lunesSem1.getTime() + (semana - 1) * 7 * 24 * 60 * 60 * 1000);
}
