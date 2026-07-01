import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { AuditLogService } from '../../audit';
import { Cobro } from '../../competition/entities/cobro.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
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
    @InjectRepository(Jugador)
    private readonly jugadorRepo: Repository<Jugador>,
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
  // DB-5 (auditoría) — al activar el torneo se generan matrículas + cuotas de
  // TODAS las inscripciones en lote. @Transactional: o se crean todos los
  // cobros o ninguno (evita cobros a medias si algo falla a mitad del loop).
  @Transactional()
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

    const inscripciones = await this.inscRepo.find({
      where: [
        { torneoId, tenantId, estado: 'INSCRITO' },
        { torneoId, tenantId, estado: 'ACTIVO' },
      ],
      relations: { club: true },
    });

    const tarifaMatricula = await this.buscarTarifa(torneoId, 'MATRICULA');
    const tarifaCuota = await this.buscarTarifaCuota(torneoId);
    const fechaBase = new Date();

    let matriculasCreadas = 0;
    let cuotasCreadas = 0;
    for (const insc of inscripciones) {
      const r = await this.generarCobrosParaInscripcion(
        insc,
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
        equiposProcesados: inscripciones.length,
        matriculasCreadas,
        cuotasCreadas,
      },
    });

    return {
      equiposProcesados: inscripciones.length,
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

    // C3 — datos para un concepto legible (jugador · fecha · rival) en vez
    // del fragmento de UUID del partido.
    const numeroFecha = partido.fecha?.numero ?? null;
    const equiposNombre = await this.cargarNombresEquipos(
      [partido.inscripcionLocalId, partido.inscripcionVisitaId],
      tenantId,
    );
    const jugadoresNombre = await this.cargarNombresJugadores(
      incidencias
        .filter(
          (i) => (i.tipo === 'AMARILLA' || i.tipo === 'ROJA') && i.jugadorId,
        )
        .map((i) => i.jugadorId as string),
      tenantId,
    );

    // Defensa anti-duplicado: una tarjeta = una multa. Si en la BD hay
    // incidencias duplicadas de la misma tarjeta (jugador+tipo+minuto)
    // —p. ej. el acta se cargó dos veces o se re-corrió el seed— NO
    // generamos N multas idénticas. Colapsamos solo duplicados exactos;
    // dos amarillas en minutos distintos siguen siendo dos multas.
    const vistas = new Set<string>();
    let creados = 0;
    for (const inc of incidencias) {
      if (inc.tipo !== 'AMARILLA' && inc.tipo !== 'ROJA') continue;
      const dedupKey = `${inc.jugadorId ?? `inc:${inc.id}`}|${inc.tipo}|${inc.minuto ?? ''}`;
      if (vistas.has(dedupKey)) continue;
      vistas.add(dedupKey);
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
      const saldoKey = `${tarifa.id}::${inc.inscripcionId ?? ''}`;
      const saldoRestante = saldadas.get(saldoKey) ?? 0;
      if (saldoRestante > 0) {
        saldadas.set(saldoKey, saldoRestante - 1);
        continue;
      }
      const inscripcionId = inc.inscripcionId;
      if (!inscripcionId) {
        // Defensa: si no podemos resolver el club, NO creamos un cobro
        // huerfano. Mejor un audit log y que el operador cargue la
        // multa manualmente.
        await this.audit.record({
          action: 'cobro.no_generado_sin_inscripcion',
          tenantId,
          entityType: 'IncidenciaPartido',
          entityId: inc.id,
          metadata: { partidoId: partido.id, tipoTarifa },
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
        concepto: this.conceptoMultaIncidencia(inc, tipoTarifa, {
          jugador: inc.jugadorId
            ? jugadoresNombre.get(inc.jugadorId) ?? null
            : null,
          rival: this.rivalNombre(partido, inc.inscripcionId, equiposNombre),
          numeroFecha,
        }),
        monto: tarifa.monto,
        vencimiento: this.calcularVencimientoMatricula(tarifa),
        periodoAnio: null,
        periodoMes: null,
        periodoSemana: null,
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

    // ADR-0005 — equipoPerdedorId YA es el inscripcionId. Validamos que sea
    // uno de los dos lados del partido.
    const inscripcionId =
      partido.inscripcionLocalId === equipoPerdedorId ||
      partido.inscripcionVisitaId === equipoPerdedorId
        ? equipoPerdedorId
        : null;
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

    // C3 — concepto legible (equipo · fecha · rival). equipoPerdedorId es
    // un inscripcionId (ADR-0005).
    const equiposNombre = await this.cargarNombresEquipos(
      [partido.inscripcionLocalId, partido.inscripcionVisitaId],
      tenantId,
    );
    return this.crearCobro({
      tenantId,
      torneoId,
      inscripcionId,
      partidoId: partido.id,
      sancionId: null,
      tarifa,
      concepto: this.conceptoWalkover(
        equiposNombre.get(equipoPerdedorId) ?? null,
        this.rivalNombre(partido, equipoPerdedorId, equiposNombre),
        partido.fecha?.numero ?? null,
      ),
      monto: tarifa.monto,
      vencimiento: this.calcularVencimientoMatricula(tarifa),
      periodoAnio: null,
      periodoMes: null,
      periodoSemana: null,
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
   * Agrupadas por (tarifa, inscripción). Se usa al regenerar multas para no
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
      .addSelect('c.inscripcion_id', 'inscripcionId')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.partido_id = :partidoId', { partidoId })
      .andWhere('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.generado_auto = TRUE')
      .andWhere('(c.pagado_at IS NOT NULL OR c.cancelado = TRUE)')
      .groupBy('c.tarifa_id')
      .addGroupBy('c.inscripcion_id')
      .getRawMany<{ tarifaId: string | null; inscripcionId: string | null; cnt: string }>();
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(`${r.tarifaId ?? ''}::${r.inscripcionId ?? ''}`, Number(r.cnt));
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
        // El UNIQUE INDEX puede saltar aquí si hay una race con otro
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
   * Genera matrícula + cuotas de una inscripción, idempotente. Reutilizado
   * por el batch de inicio de torneo y por la inscripción tardía.
   */
  private async generarCobrosParaInscripcion(
    insc: InscripcionTorneo,
    torneo: Torneo,
    tarifaMatricula: TarifaTorneo | null,
    tarifaCuota: TarifaTorneo | null,
    fechaBase: Date,
  ): Promise<{ matriculasCreadas: number; cuotasCreadas: number }> {
    let matriculasCreadas = 0;
    let cuotasCreadas = 0;
    const nombreClub = insc.club?.nombre ?? 'club';

    // Matrícula — un único cobro por inscripción+tarifa. No filtramos por
    // cancelado/generadoAuto: si ya existe cualquier matrícula (manual,
    // auto o cancelada a mano) NO regeneramos. Así respetamos la decisión
    // del operador que la canceló y no la resucitamos al reactivar el
    // torneo — mismo criterio que las cuotas.
    if (tarifaMatricula) {
      const yaExiste = await this.cobroRepo.findOne({
        where: {
          tenantId: insc.tenantId,
          inscripcionId: insc.id,
          tarifaId: tarifaMatricula.id,
        },
      });
      if (!yaExiste) {
        await this.crearCobro({
          tenantId: insc.tenantId,
          torneoId: torneo.id,
          inscripcionId: insc.id,
          tarifa: tarifaMatricula,
          concepto: this.conceptoEquipo('Matrícula', nombreClub, torneo),
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
            tenantId: insc.tenantId,
            inscripcionId: insc.id,
            tarifaId: tarifaCuota.id,
            periodoAnio: v.anio,
            periodoMes: v.mes,
          },
        });
        if (yaExiste) continue;
        try {
          await this.crearCobro({
            tenantId: insc.tenantId,
            torneoId: torneo.id,
            inscripcionId: insc.id,
            tarifa: tarifaCuota,
            concepto: this.conceptoCuotaEquipo(
              nombreClub,
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
            `cuota inicio insc=${insc.id} tarifa=${tarifaCuota.id} periodo=${v.anio}-${v.mes} falló: ${msg}`,
          );
        }
      }
    }

    return { matriculasCreadas, cuotasCreadas };
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

  private conceptoEquipo(prefijo: string, nombreClub: string, torneo: Torneo): string {
    return `${prefijo} — ${torneo.nombre} (${nombreClub})`;
  }

  private conceptoCuotaEquipo(
    nombreClub: string,
    torneo: Torneo,
    indice: number,
    total: number,
  ): string {
    return `Cuota ${indice}/${total} — ${torneo.nombre} (${nombreClub})`;
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
  }): Promise<Cobro> {
    const categoria = this.categoriaCobroParaTipo(args.tarifa.tipo);
    const cobro = this.cobroRepo.create({
      tenantId: args.tenantId,
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

  /**
   * C3 — Concepto legible de una multa de tarjeta. Ej:
   *   "Tarjeta roja — Juan Pérez (45') · Fecha 3 vs Halcones FC"
   * Las partes que no se puedan resolver se omiten (jugador, fecha o rival).
   */
  private conceptoMultaIncidencia(
    inc: IncidenciaPartido,
    tipoTarifa: 'MULTA_AMARILLA' | 'MULTA_ROJA',
    ctx: { jugador: string | null; rival: string | null; numeroFecha: number | null },
  ): string {
    const tipo =
      tipoTarifa === 'MULTA_AMARILLA' ? 'Tarjeta amarilla' : 'Tarjeta roja';
    const min = inc.minuto != null ? ` (${inc.minuto}')` : '';
    let s = tipo;
    if (ctx.jugador) s += ` — ${ctx.jugador}${min}`;
    else s += min;
    const contexto: string[] = [];
    if (ctx.numeroFecha != null) contexto.push(`Fecha ${ctx.numeroFecha}`);
    if (ctx.rival) contexto.push(`vs ${ctx.rival}`);
    if (contexto.length > 0) s += ` · ${contexto.join(' ')}`;
    return s;
  }

  /**
   * C3 — Concepto legible de un walkover. Ej:
   *   "Walkover (no se presentó) — Tigres FC · Fecha 3 vs Halcones FC"
   */
  private conceptoWalkover(
    equipoPerdedor: string | null,
    rival: string | null,
    numeroFecha: number | null,
  ): string {
    let s = 'Walkover (no se presentó)';
    if (equipoPerdedor) s += ` — ${equipoPerdedor}`;
    const contexto: string[] = [];
    if (numeroFecha != null) contexto.push(`Fecha ${numeroFecha}`);
    if (rival) contexto.push(`vs ${rival}`);
    if (contexto.length > 0) s += ` · ${contexto.join(' ')}`;
    return s;
  }

  /**
   * Nombre del rival del equipo dado en el partido (el otro lado).
   * ADR-0005 — `inscripcionId` identifica al equipo; el mapa es por
   * inscripcionId → nombre de club.
   */
  private rivalNombre(
    partido: Partido,
    inscripcionId: string | null,
    equiposNombre: Map<string, string>,
  ): string | null {
    if (!inscripcionId) return null;
    const rivalId =
      partido.inscripcionLocalId === inscripcionId
        ? partido.inscripcionVisitaId
        : partido.inscripcionLocalId;
    return rivalId ? equiposNombre.get(rivalId) ?? null : null;
  }

  /**
   * Carga nombres de equipos por inscripcionId (dedupe, ignora nulls).
   * El nombre sale del club de la inscripción.
   */
  private async cargarNombresEquipos(
    ids: Array<string | null | undefined>,
    tenantId: string,
  ): Promise<Map<string, string>> {
    const unicos = Array.from(new Set(ids.filter((x): x is string => !!x)));
    if (unicos.length === 0) return new Map();
    const rows = await this.inscRepo.find({
      where: { id: In(unicos), tenantId },
      relations: { club: true },
    });
    return new Map(rows.map((i) => [i.id, i.club?.nombre ?? '']));
  }

  /** Carga "Nombre Apellido" de jugadores (modelo nuevo) por id (dedupe). */
  private async cargarNombresJugadores(
    ids: Array<string | null | undefined>,
    tenantId: string,
  ): Promise<Map<string, string>> {
    const unicos = Array.from(new Set(ids.filter((x): x is string => !!x)));
    if (unicos.length === 0) return new Map();
    const rows = await this.jugadorRepo.find({
      where: { id: In(unicos), tenantId },
      select: ['id', 'nombres', 'apellidos'],
    });
    return new Map(
      rows.map((j) => [j.id, `${j.nombres} ${j.apellidos}`.trim()]),
    );
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
