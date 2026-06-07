import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLogService } from '../../audit';
import { Cobro } from '../../competition/entities/cobro.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
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
    @InjectRepository(Equipo)
    private readonly equipoRepo: Repository<Equipo>,
    private readonly audit: AuditLogService,
  ) {}

  // ───────── API pública ─────────

  /**
   * @deprecated Sprint 45 — La matrícula ya no se genera al inscribir, sino
   * al iniciar el torneo (generarCobrosInicioTorneo), anclada a equipo. Este
   * método quedó sin caller automático: NO lo invoques en el flujo normal o
   * crearías una matrícula anclada a inscripción que el anti-duplicado por
   * equipo no detecta. Se conserva solo como utilidad puntual de soporte.
   *
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
        // Sprint 45 — si la tarifa define cantidad de cuotas, los cobros
        // se generan por adelantado al iniciar el torneo (anclados a
        // equipo). El cron retroactivo NO debe tocarlas o duplicaría.
        if (tarifa.cantidadCuotas != null) continue;
        const creadas = await this.generarCuotasFaltantes(insc, tarifa);
        cuotasCreadas += creadas;
      }
    }
    return {
      inscripcionesProcesadas: inscripciones.length,
      cuotasCreadas,
    };
  }

  /**
   * Sprint 45 — Genera los cobros del torneo al iniciarlo (DRAFT→ACTIVO).
   *
   * Para cada equipo participante (estado INSCRITO o ACTIVO) genera de una
   * sola vez:
   *   - 1 cobro de MATRICULA, con vencimiento = fechaBase + diasPlazoPago.
   *   - N cobros de CUOTA mensual, donde N = tarifa.cantidadCuotas, con
   *     vencimiento en el día del mes configurado (diaVencimiento).
   *
   * Idempotente a dos niveles:
   *   - Por equipo+tarifa para la matrícula.
   *   - Por equipo+tarifa+periodo para cada cuota (más el índice único
   *     uq_cobro_cuota_periodo_equipo como red de seguridad).
   * Esto permite reactivar el torneo (volver a DRAFT, sumar un equipo y
   * reactivar) sin duplicar cobros de los equipos ya cargados: solo el
   * equipo nuevo recibe cobros.
   *
   * Los cobros se anclan a `equipo_id` (no inscripción) porque la pestaña
   * Equipos crea equipos directos sin inscripción, y /admin/finanzas ya
   * filtra por equipo.
   */
  async generarCobrosInicioTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<{
    equiposProcesados: number;
    matriculasCreadas: number;
    cuotasCreadas: number;
  }> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!torneo) {
      return { equiposProcesados: 0, matriculasCreadas: 0, cuotasCreadas: 0 };
    }

    const equipos = await this.equipoRepo.find({
      where: [
        { torneoId, tenantId, estado: 'INSCRITO' },
        { torneoId, tenantId, estado: 'ACTIVO' },
      ],
    });

    const tarifaMatricula = await this.buscarTarifa(torneoId, 'MATRICULA');
    const tarifaCuota = await this.buscarTarifaCuota(torneoId);
    const fechaBase = new Date();

    let matriculasCreadas = 0;
    let cuotasCreadas = 0;
    for (const equipo of equipos) {
      const r = await this.generarCobrosParaEquipo(
        equipo,
        torneo,
        tarifaMatricula,
        tarifaCuota,
        fechaBase,
      );
      matriculasCreadas += r.matriculasCreadas;
      cuotasCreadas += r.cuotasCreadas;
    }

    await this.audit.record({
      action: 'cobros.generados_inicio_torneo',
      tenantId,
      entityType: 'Torneo',
      entityId: torneoId,
      metadata: {
        equiposProcesados: equipos.length,
        matriculasCreadas,
        cuotasCreadas,
      },
    });

    return {
      equiposProcesados: equipos.length,
      matriculasCreadas,
      cuotasCreadas,
    };
  }

  /**
   * Aplica las multas automáticas de un partido recién cerrado.
   * Borra cualquier cobro auto previo del partido (para soportar
   * re-cierre) y crea uno por cada incidencia de tarjeta amarilla o
   * roja según el tarifario del torneo.
   *
   * El cobro se vincula a (partido, inscripción del equipo del
   * jugador). Si el partido viene del modelo viejo y la incidencia
   * no tiene inscripcion_id, se hace fallback al equipo local/visita.
   */
  async aplicarMultasDePartido(
    partido: Partido,
    incidencias: IncidenciaPartido[],
    tenantId: string,
  ): Promise<{ creados: number }> {
    if (!partido.id) return { creados: 0 };
    const torneoId = partido.fecha?.torneoId ?? null;
    if (!torneoId) return { creados: 0 };

    // Limpieza de cobros auto previos del partido (idempotencia ante
    // re-cierre del acta). Esto borra los pendientes (no pagados, no
    // cancelados); los pagados y los cancelados a mano SOBREVIVEN.
    await this.borrarCobrosAutoDelPartido(partido.id, tenantId);

    // C1 — Anti doble-cobro al reabrir un acta: contamos las multas que
    // sobrevivieron (pagadas o canceladas a mano) por (tarifa, equipo). Al
    // regenerar, descontamos esas para NO duplicar una multa ya saldada ni
    // resucitar una que el operador canceló. Si en la reapertura se agregó
    // una tarjeta nueva, igual se cobra (la diferencia entre incidencias y
    // multas ya saldadas).
    const saldadas = await this.contarCobrosSaldadosDelPartido(
      partido.id,
      tenantId,
    );

    let creados = 0;
    for (const inc of incidencias) {
      if (inc.tipo !== 'AMARILLA' && inc.tipo !== 'ROJA') continue;
      const tipoTarifa: TipoTarifa =
        inc.tipo === 'AMARILLA' ? 'MULTA_AMARILLA' : 'MULTA_ROJA';
      const tarifa = await this.buscarTarifa(torneoId, tipoTarifa);
      if (!tarifa) {
        await this.audit.record({
          action: 'cobro.no_generado_por_tarifa_faltante',
          tenantId,
          entityType: 'IncidenciaPartido',
          entityId: inc.id,
          metadata: { partidoId: partido.id, tipoTarifa },
        });
        continue;
      }
      // ¿Ya hay una multa pagada/cancelada que cubre esta incidencia?
      const saldoKey = `${tarifa.id}::${inc.equipoId ?? ''}`;
      const saldoRestante = saldadas.get(saldoKey) ?? 0;
      if (saldoRestante > 0) {
        saldadas.set(saldoKey, saldoRestante - 1);
        continue;
      }
      const inscripcionId = inc.inscripcionId ?? this.inferirInscripcionPartido(
        partido,
        inc.equipoId,
      );
      if (!inscripcionId) {
        // Defensa: si no podemos resolver el club, NO creamos un cobro
        // huerfano. Mejor un audit log y que el operador cargue la
        // multa manualmente.
        await this.audit.record({
          action: 'cobro.no_generado_sin_inscripcion',
          tenantId,
          entityType: 'IncidenciaPartido',
          entityId: inc.id,
          metadata: { partidoId: partido.id, tipoTarifa, equipoId: inc.equipoId },
        });
        continue;
      }
      await this.crearCobro({
        tenantId,
        torneoId,
        inscripcionId,
        partidoId: partido.id,
        sancionId: null,
        tarifa,
        concepto: this.conceptoMultaIncidencia(inc, tipoTarifa),
        monto: tarifa.monto,
        vencimiento: this.calcularVencimientoMatricula(tarifa),
        periodoAnio: null,
        periodoMes: null,
        periodoSemana: null,
        equipoId: inc.equipoId ?? null,
      });
      creados++;
    }
    return { creados };
  }

  /**
   * Aplica MULTA_WALKOVER al club ausente. Limpia cobros auto del
   * partido antes (caso re-walkover sobre el mismo partido).
   */
  async aplicarMultaWalkover(
    partido: Partido,
    equipoPerdedorId: string,
    tenantId: string,
  ): Promise<Cobro | null> {
    if (!partido.id) return null;
    const torneoId = partido.fecha?.torneoId ?? null;
    if (!torneoId) return null;

    await this.borrarCobrosAutoDelPartido(partido.id, tenantId);

    const tarifa = await this.buscarTarifa(torneoId, 'MULTA_WALKOVER');
    if (!tarifa) {
      await this.audit.record({
        action: 'cobro.no_generado_por_tarifa_faltante',
        tenantId,
        entityType: 'Partido',
        entityId: partido.id,
        metadata: { tipoTarifa: 'MULTA_WALKOVER' },
      });
      return null;
    }

    // C1 — Anti doble-cobro: si ya hay un walkover pagado o cancelado a mano
    // para este equipo en este partido, no generamos otro (re-walkover tras
    // pago/cancelación).
    const saldadas = await this.contarCobrosSaldadosDelPartido(
      partido.id,
      tenantId,
    );
    if ((saldadas.get(`${tarifa.id}::${equipoPerdedorId}`) ?? 0) > 0) {
      return null;
    }

    const inscripcionId = this.inferirInscripcionPartido(partido, equipoPerdedorId);
    if (!inscripcionId) {
      await this.audit.record({
        action: 'cobro.no_generado_sin_inscripcion',
        tenantId,
        entityType: 'Partido',
        entityId: partido.id,
        metadata: {
          tipoTarifa: 'MULTA_WALKOVER',
          equipoPerdedorId,
        },
      });
      return null;
    }
    return this.crearCobro({
      tenantId,
      torneoId,
      inscripcionId,
      partidoId: partido.id,
      sancionId: null,
      tarifa,
      concepto: `Walkover — partido ${this.etiquetaPartido(partido)}`,
      monto: tarifa.monto,
      vencimiento: this.calcularVencimientoMatricula(tarifa),
      periodoAnio: null,
      periodoMes: null,
      periodoSemana: null,
      equipoId: equipoPerdedorId,
    });
  }

  /**
   * Borra los cobros auto de un partido (multas que aún no fueron
   * pagadas ni canceladas manualmente). Útil al reabrir el acta y
   * antes de aplicar nuevas multas para no duplicar.
   */
  async borrarCobrosAutoDelPartido(
    partidoId: string,
    tenantId: string,
  ): Promise<number> {
    const r = await this.cobroRepo
      .createQueryBuilder()
      .delete()
      .from(Cobro)
      .where('partido_id = :partidoId', { partidoId })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere('generado_auto = TRUE')
      .andWhere('pagado_at IS NULL')
      .andWhere('cancelado = FALSE')
      .execute();
    return r.affected ?? 0;
  }

  /**
   * C1 — Cuenta las multas auto de un partido que YA fueron saldadas:
   * pagadas o canceladas a mano (las que sobreviven a borrarCobrosAutoDelPartido).
   * Agrupadas por (tarifa, equipo). Se usa al regenerar multas para no
   * volver a cobrar una multa ya pagada ni resucitar una cancelada cuando
   * se reabre y recierra un acta.
   */
  private async contarCobrosSaldadosDelPartido(
    partidoId: string,
    tenantId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.cobroRepo
      .createQueryBuilder('c')
      .select('c.tarifa_id', 'tarifaId')
      .addSelect('c.equipo_id', 'equipoId')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.partido_id = :partidoId', { partidoId })
      .andWhere('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.generado_auto = TRUE')
      .andWhere('(c.pagado_at IS NOT NULL OR c.cancelado = TRUE)')
      .groupBy('c.tarifa_id')
      .addGroupBy('c.equipo_id')
      .getRawMany<{ tarifaId: string | null; equipoId: string | null; cnt: string }>();
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(`${r.tarifaId ?? ''}::${r.equipoId ?? ''}`, Number(r.cnt));
    }
    return map;
  }

  // ───────── Lógica de generación ─────────

  private async generarCuotasFaltantes(
    insc: InscripcionTorneo,
    tarifa: TarifaTorneo,
  ): Promise<number> {
    const periodos = this.calcularPeriodosFaltantes(insc, tarifa.frecuencia);
    let creadas = 0;
    for (const p of periodos) {
      // Anti-duplicado: si ya existe un cobro del periodo (auto o manual,
      // pagado, cancelado o pendiente), NO regeneramos. Esto evita que el
      // cron resucite cobros que el operador cancelo a mano — la
      // cancelacion es una decision explicita del admin que no queremos
      // pisar en el proximo ciclo del cron.
      const yaExiste = await this.cobroRepo.findOne({
        where: {
          tenantId: insc.tenantId,
          inscripcionId: insc.id,
          tarifaId: tarifa.id,
          periodoAnio: p.anio,
          periodoMes: p.mes ?? undefined,
          periodoSemana: p.semana ?? undefined,
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

  // ───────── Sprint 45: cobros al iniciar el torneo ─────────

  /**
   * Genera matrícula + cuotas de un equipo, idempotente. Reutilizado por
   * el batch de inicio de torneo y por la inscripción tardía.
   */
  private async generarCobrosParaEquipo(
    equipo: Equipo,
    torneo: Torneo,
    tarifaMatricula: TarifaTorneo | null,
    tarifaCuota: TarifaTorneo | null,
    fechaBase: Date,
  ): Promise<{ matriculasCreadas: number; cuotasCreadas: number }> {
    let matriculasCreadas = 0;
    let cuotasCreadas = 0;

    // Resolvemos la inscripción del equipo (si es equipo sombra de una
    // inscripción de club). La anclamos en el cobro además del equipo para
    // que /admin/finanzas pueda filtrar por club (el filtro usa
    // inscripcion.club_id) — igual que hacen las multas. Equipos directos
    // (pestaña Equipos, sin inscripción) quedan con inscripcion_id null.
    const inscripcionId = await this.resolverInscripcionDeEquipo(
      equipo.id,
      equipo.tenantId,
    );

    // Matrícula — un único cobro por equipo+tarifa. No filtramos por
    // cancelado/generadoAuto: si ya existe cualquier matrícula (manual,
    // auto o cancelada a mano) NO regeneramos. Así respetamos la decisión
    // del operador que la canceló y no la resucitamos al reactivar el
    // torneo — mismo criterio que las cuotas.
    if (tarifaMatricula) {
      const yaExiste = await this.cobroRepo.findOne({
        where: {
          tenantId: equipo.tenantId,
          equipoId: equipo.id,
          tarifaId: tarifaMatricula.id,
        },
      });
      if (!yaExiste) {
        await this.crearCobro({
          tenantId: equipo.tenantId,
          torneoId: torneo.id,
          equipoId: equipo.id,
          inscripcionId,
          tarifa: tarifaMatricula,
          concepto: this.conceptoEquipo('Matrícula', equipo, torneo),
          monto: tarifaMatricula.monto,
          vencimiento: this.calcularVencimientoMatriculaInicio(
            tarifaMatricula,
            fechaBase,
          ),
          periodoAnio: null,
          periodoMes: null,
          periodoSemana: null,
        });
        matriculasCreadas++;
      }
    }

    // Cuotas — N mensuales según cantidadCuotas.
    if (tarifaCuota && tarifaCuota.cantidadCuotas && tarifaCuota.cantidadCuotas > 0) {
      const vencimientos = this.vencimientosCuotasInicio(
        tarifaCuota,
        tarifaCuota.cantidadCuotas,
        fechaBase,
      );
      for (const v of vencimientos) {
        const yaExiste = await this.cobroRepo.findOne({
          where: {
            tenantId: equipo.tenantId,
            equipoId: equipo.id,
            tarifaId: tarifaCuota.id,
            periodoAnio: v.anio,
            periodoMes: v.mes,
          },
        });
        if (yaExiste) continue;
        try {
          await this.crearCobro({
            tenantId: equipo.tenantId,
            torneoId: torneo.id,
            equipoId: equipo.id,
            inscripcionId,
            tarifa: tarifaCuota,
            concepto: this.conceptoCuotaEquipo(
              equipo,
              torneo,
              v.indice,
              tarifaCuota.cantidadCuotas,
            ),
            monto: tarifaCuota.monto,
            vencimiento: v.vencimiento,
            periodoAnio: v.anio,
            periodoMes: v.mes,
            periodoSemana: null,
          });
          cuotasCreadas++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes('uq_cobro_cuota_periodo') ||
            msg.includes('duplicate key')
          ) {
            continue;
          }
          this.log.warn(
            `cuota inicio equipo=${equipo.id} tarifa=${tarifaCuota.id} periodo=${v.anio}-${v.mes} falló: ${msg}`,
          );
        }
      }
    }

    return { matriculasCreadas, cuotasCreadas };
  }

  /**
   * Si el equipo es el "equipo sombra" de una inscripción de club, devuelve
   * el id de esa inscripción; si no (equipo directo de la pestaña Equipos),
   * devuelve null. Sirve para anclar el cobro al club y que /admin/finanzas
   * lo pueda filtrar por club.
   */
  private async resolverInscripcionDeEquipo(
    equipoId: string,
    tenantId: string,
  ): Promise<string | null> {
    const insc = await this.inscRepo.findOne({
      where: { equipoSombraId: equipoId, tenantId },
      select: ['id'],
    });
    return insc?.id ?? null;
  }

  /** Busca la tarifa CUOTA activa del torneo (la del modelo nuevo upfront). */
  private async buscarTarifaCuota(
    torneoId: string,
  ): Promise<TarifaTorneo | null> {
    return this.tarifaRepo.findOne({
      where: { torneoId, tipo: 'CUOTA', activo: true },
    });
  }

  /**
   * Vencimiento de la matrícula generada al iniciar: fechaBase + plazo en
   * días. Default 7 días si la tarifa no define diasPlazoPago.
   */
  private calcularVencimientoMatriculaInicio(
    tarifa: TarifaTorneo,
    fechaBase: Date,
  ): string {
    const dias = tarifa.diasPlazoPago ?? 7;
    const v = new Date(
      fechaBase.getFullYear(),
      fechaBase.getMonth(),
      fechaBase.getDate(),
    );
    v.setDate(v.getDate() + dias);
    return iso(v);
  }

  /**
   * Calcula las N cuotas mensuales a generar al iniciar el torneo. La
   * primera vence en el próximo día de vencimiento (si el día del mes ya
   * pasó, salta al mes siguiente); cada cuota siguiente cae un mes después.
   */
  private vencimientosCuotasInicio(
    tarifa: TarifaTorneo,
    cantidad: number,
    fechaBase: Date,
  ): Array<{ vencimiento: string; anio: number; mes: number; indice: number }> {
    const dia = tarifa.diaVencimiento ?? 5;
    const primer = diaDeMesProximo(fechaBase, dia);
    const out: Array<{
      vencimiento: string;
      anio: number;
      mes: number;
      indice: number;
    }> = [];
    for (let i = 0; i < cantidad; i++) {
      // new Date(anio, mesIdx+i, 1) maneja overflow de mes (mes 13 → enero
      // del año siguiente) sin que tengamos que normalizar a mano.
      const venc = new Date(primer.getFullYear(), primer.getMonth() + i, 1);
      venc.setDate(
        Math.min(dia, ultimoDiaDeMes(venc.getFullYear(), venc.getMonth() + 1)),
      );
      out.push({
        vencimiento: iso(venc),
        anio: venc.getFullYear(),
        mes: venc.getMonth() + 1,
        indice: i + 1,
      });
    }
    return out;
  }

  private conceptoEquipo(prefijo: string, equipo: Equipo, torneo: Torneo): string {
    return `${prefijo} — ${torneo.nombre} (${equipo.nombre})`;
  }

  private conceptoCuotaEquipo(
    equipo: Equipo,
    torneo: Torneo,
    indice: number,
    total: number,
  ): string {
    return `Cuota ${indice}/${total} — ${torneo.nombre} (${equipo.nombre})`;
  }

  // ───────── Persistencia + audit ─────────

  private async crearCobro(args: {
    tenantId: string;
    torneoId: string;
    inscripcionId?: string | null;
    tarifa: TarifaTorneo;
    concepto: string;
    monto: number;
    vencimiento: string | null;
    periodoAnio: number | null;
    periodoMes: number | null;
    periodoSemana: number | null;
    sancionId?: string | null;
    partidoId?: string | null;
    equipoId?: string | null;
  }): Promise<Cobro> {
    const categoria = this.categoriaCobroParaTipo(args.tarifa.tipo);
    const cobro = this.cobroRepo.create({
      tenantId: args.tenantId,
      equipoId: args.equipoId ?? null,
      torneoId: args.torneoId,
      inscripcionId: args.inscripcionId || null,
      partidoId: args.partidoId ?? null,
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

  private conceptoMultaIncidencia(
    inc: IncidenciaPartido,
    tipoTarifa: 'MULTA_AMARILLA' | 'MULTA_ROJA',
  ): string {
    const tipo = tipoTarifa === 'MULTA_AMARILLA' ? 'Amarilla' : 'Roja';
    const min = inc.minuto != null ? `${inc.minuto}'` : '';
    return `Multa ${tipo}${min ? ` (${min})` : ''} — partido ${inc.partidoId.slice(0, 8)}`;
  }

  private etiquetaPartido(p: Partido): string {
    return p.id ? p.id.slice(0, 8) : '?';
  }

  /**
   * Si la incidencia no trae inscripcion_id (modelo viejo), inferimos
   * cuál inscripción corresponde según si el equipo es local o visita
   * en ese partido.
   */
  private inferirInscripcionPartido(
    partido: Partido,
    equipoId: string | null,
  ): string | null {
    if (!equipoId) return null;
    if (partido.equipoLocalId === equipoId) {
      return partido.inscripcionLocalId ?? null;
    }
    if (partido.equipoVisitaId === equipoId) {
      return partido.inscripcionVisitaId ?? null;
    }
    return null;
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
