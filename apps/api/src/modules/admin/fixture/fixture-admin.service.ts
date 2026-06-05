import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type {
  FixtureAdvertencia,
  FixtureGenerationResult,
  FixturePrevalidacion,
  GenerarFixtureRequest,
} from '@fixtura/types';
import { aplicarConstraintsFixture, generarFixtureBerger } from '@fixtura/domain';

import { Cancha } from '../../competition/entities/cancha.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { HorarioTorneo } from '../../competition/entities/horario-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { DiasNoJugablesService } from '../dias-no-jugables/dias-no-jugables.service';

@Injectable()
export class FixtureAdminService {
  /**
   * Sprint 16 — RF-13: si una fecha calculada cae en un día no jugable,
   * intentamos correrla. Este es el máximo de saltos consecutivos antes
   * de rendirnos y dejar la fecha en su día original (con warning).
   * Cubre feriados que se concatenan (18-19 sept) sin entrar en loop.
   */
  private static readonly MAX_SALTOS_DIA_NO_JUGABLE = 14;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(HorarioTorneo)
    private readonly horarioRepo: Repository<HorarioTorneo>,
    @InjectRepository(Cancha)
    private readonly canchaRepo: Repository<Cancha>,
    private readonly diasNoJugables: DiasNoJugablesService,
  ) {}

  /**
   * Genera el fixture completo del torneo usando el motor Berger.
   *
   * Reglas:
   *   - Solo permitido si el torneo no tiene fechas ya creadas.
   *   - Requiere al menos 2 equipos.
   *   - Crea todas las fechas + partidos en una sola transacción.
   *   - Asigna canchas y horarios round-robin sobre la lista provista.
   *   - Los equipos que descansan (BYE) no generan partido pero se
   *     reportan en el resultado para que el frontend los marque.
   */
  @Transactional()
  async generar(
    torneoId: string,
    tenantId: string,
    inputRaw: GenerarFixtureRequest,
  ): Promise<FixtureGenerationResult> {
    // Sprint 44 — horariosPorFecha / canchas / diasEntreFechas son opcionales
    // en el tipo compartido. Aplicamos defaults acá para que el resto del
    // service (que asume valores presentes) siga funcionando. En modo
    // HORARIOS_TORNEO los horarios reales vienen del repo de horarios y
    // estos defaults solo se usan como fallback legacy.
    const input: Required<GenerarFixtureRequest> = {
      fechaInicio: inputRaw.fechaInicio,
      diasEntreFechas: inputRaw.diasEntreFechas ?? 7,
      horariosPorFecha:
        inputRaw.horariosPorFecha ?? ['10:00', '12:00', '14:00', '16:00'],
      canchas: inputRaw.canchas ?? ['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4'],
    };

    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);

    const existingFechas = await this.fechaRepo.count({ where: { torneoId } });
    if (existingFechas > 0) {
      throw new ConflictException(
        `El torneo ya tiene ${existingFechas} fechas. Borralas antes de regenerar el fixture.`,
      );
    }

    const equipos = await this.equipoRepo.find({
      where: { torneoId },
      order: { nombre: 'ASC' },
    });
    if (equipos.length < 2) {
      throw new BadRequestException(`Se requieren al menos 2 equipos. Hay ${equipos.length}.`);
    }

    // Generar con Berger
    const fixtureBruto = generarFixtureBerger(
      equipos.map((e) => ({ id: e.id, nombre: e.nombre })),
      { ruedas: torneo.ruedas },
    );

    // Sprint 15: aplicar constraints (no 3 locales seguidos +
    // canchas compartidas). canchaPorEquipo se omite aquí porque
    // todavía no hay relación equipo↔cancha persistida (el campo
    // sigue siendo asignación manual por partido).
    const ajustado = aplicarConstraintsFixture({
      fixture: fixtureBruto,
      equipos: equipos.map((e) => ({ id: e.id, nombre: e.nombre })),
      maxLocalesSeguidos: 2,
    });
    const fixture = ajustado.fixture;
    if (ajustado.warnings.length > 0) {
      // Loguear warnings — el caller los puede ver en logs.
      // Futuro: devolverlos en la respuesta para que el admin los vea
      // en la UI.
      console.warn(
        `[fixture-gen] tenant=${tenantId} torneo=${torneoId}: ${ajustado.warnings.length} advertencias`,
        ajustado.warnings,
      );
    }

    // Sprint 39 — cargar horarios del torneo ya acá (antes del loop de
    // fechas) para que podamos ajustar fechaInicioBase si el día de
    // semana elegido no tiene slots cargados (Sprint 44 fix).
    const horariosTorneoTmp = await this.horarioRepo.find({
      where: { torneoId, tenantId, activo: true },
      relations: { cancha: true },
      order: { diaSemana: 'ASC', hora: 'ASC', orden: 'ASC' },
    });
    const usarPlantilla = horariosTorneoTmp.length > 0;

    // Crear fechas
    let fechaInicioBase = new Date(input.fechaInicio);

    // Sprint 44 — Si hay plantilla de horarios y la fecha de inicio cae
    // en un día sin slots cargados, avanzar al próximo día (máx 7 días
    // = una semana completa). Sin esto los partidos quedaban con
    // fecha_hora=null porque slotsPorDiaSemana.get(isoDow) → vacío.
    let fechaInicioAjustada = false;
    let fechaInicioOriginalIso: string | null = null;
    if (usarPlantilla) {
      const diasConSlots = new Set(horariosTorneoTmp.map((h) => h.diaSemana));
      const isoDowDe = (d: Date): number => {
        const js = d.getDay();
        return js === 0 ? 7 : js;
      };
      if (!diasConSlots.has(isoDowDe(fechaInicioBase))) {
        fechaInicioOriginalIso = fechaInicioBase.toISOString().slice(0, 10);
        for (let i = 1; i <= 7; i++) {
          const probe = new Date(fechaInicioBase);
          probe.setDate(fechaInicioBase.getDate() + i);
          if (diasConSlots.has(isoDowDe(probe))) {
            fechaInicioBase = probe;
            fechaInicioAjustada = true;
            break;
          }
        }
      }
    }

    const fechaIdByNumero = new Map<number, string>();
    // Sprint 16 — RF-13: las fechas calculadas se pueden correr si caen
    // en día no jugable. Guardamos el corrimiento por fecha (numero →
    // díasOffset extra) para que los horarios de partidos también lo
    // tomen en cuenta.
    const offsetExtraPorFecha = new Map<number, number>();
    const diasNoJugablesAjustados: FixtureGenerationResult['diasNoJugablesAjustados'] = [];

    // Precalcular ventana de fechas bloqueadas en el rango que vamos a usar.
    // Pedimos +60d de margen sobre el cálculo natural para cubrir
    // corrimientos por feriados encadenados sin tener que reconsultar.
    const ultimaFechaNatural = new Date(fechaInicioBase);
    ultimaFechaNatural.setDate(
      fechaInicioBase.getDate() + (fixture.fechas - 1) * input.diasEntreFechas + 60,
    );
    const bloqueadas = await this.diasNoJugables.fechasBloqueadasEnRango(
      tenantId,
      torneoId,
      fechaInicioBase.toISOString().slice(0, 10),
      ultimaFechaNatural.toISOString().slice(0, 10),
    );

    for (let n = 1; n <= fixture.fechas; n++) {
      const fechaNatural = new Date(fechaInicioBase);
      fechaNatural.setDate(fechaInicioBase.getDate() + (n - 1) * input.diasEntreFechas);
      const fechaNaturalIso = fechaNatural.toISOString().slice(0, 10);

      // Buscar el próximo día válido dentro del límite máximo.
      let candidato = new Date(fechaNatural);
      let saltos = 0;
      while (
        bloqueadas.has(candidato.toISOString().slice(0, 10)) &&
        saltos < FixtureAdminService.MAX_SALTOS_DIA_NO_JUGABLE
      ) {
        candidato.setDate(candidato.getDate() + 1);
        saltos++;
      }
      // Si tras N saltos seguimos en día bloqueado, dejamos la natural.
      // El operador podrá moverla manualmente. Es defensa anti-loop.
      const sigueBloqueada = bloqueadas.has(candidato.toISOString().slice(0, 10));
      if (sigueBloqueada) {
        console.warn(
          `[fixture-gen] tenant=${tenantId} torneo=${torneoId} fecha=${n}: ` +
            `${FixtureAdminService.MAX_SALTOS_DIA_NO_JUGABLE} días consecutivos bloqueados ` +
            `desde ${fechaNaturalIso}. Dejando la fecha original — el admin la moverá a mano.`,
        );
      }
      const fechaInicio = sigueBloqueada ? fechaNatural : candidato;
      const fechaInicioIso = fechaInicio.toISOString().slice(0, 10);

      if (fechaInicioIso !== fechaNaturalIso) {
        const motivo = bloqueadas.get(fechaNaturalIso) ?? 'Día no jugable';
        diasNoJugablesAjustados.push({
          fechaNumero: n,
          fechaOriginal: fechaNaturalIso,
          fechaAjustada: fechaInicioIso,
          motivo,
        });
        const offsetDias = Math.round(
          (fechaInicio.getTime() - fechaNatural.getTime()) / (24 * 60 * 60 * 1000),
        );
        offsetExtraPorFecha.set(n, offsetDias);
      }

      const fechaFin = new Date(fechaInicio);
      fechaFin.setDate(fechaInicio.getDate() + 1);

      const etiqueta = `Fecha ${n} · ${fechaInicio.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'long',
      })}`;

      const saved = await this.fechaRepo.save(
        this.fechaRepo.create({
          tenantId,
          torneoId,
          numero: n,
          etiqueta,
          fechaInicio: fechaInicioIso,
          fechaFin: fechaFin.toISOString().slice(0, 10),
          estado: 'PROGRAMADA',
        }),
      );
      fechaIdByNumero.set(n, saved.id);
    }

    // Sprint 39 — Modo de generación: si el torneo tiene plantilla de
    // horarios cargada, ignoramos input.horariosPorFecha/canchas y
    // asignamos por día de semana. Si no, modo legacy (round-robin
    // sobre los arrays del input).
    // Sprint 44 — reusamos horariosTorneoTmp ya cargado arriba (para el
    // autoshift de fechaInicio). usarPlantilla también ya está calculado.
    const horariosTorneo = horariosTorneoTmp;
    const modoGeneracion: 'HORARIOS_TORNEO' | 'INPUT_LEGACY' = usarPlantilla
      ? 'HORARIOS_TORNEO'
      : 'INPUT_LEGACY';

    // Pre-agrupar slots por dia_semana (ISO 1-7) para acceso rápido.
    const slotsPorDiaSemana = new Map<number, HorarioTorneo[]>();
    if (usarPlantilla) {
      for (const slot of horariosTorneo) {
        const lista = slotsPorDiaSemana.get(slot.diaSemana) ?? [];
        lista.push(slot);
        slotsPorDiaSemana.set(slot.diaSemana, lista);
      }
    }

    // Crear partidos
    const horarios = input.horariosPorFecha;
    const canchas = input.canchas;

    let partidosCreados = 0;
    let partidosSinHorario = 0;
    let slotsUsados = 0;
    const partidosEnCanchaNoDisponible: Array<{
      fechaNumero: number;
      canchaNombre: string;
      motivo: string | null;
    }> = [];
    const partidosPorFecha = new Map<number, number>();
    for (const p of fixture.partidos) {
      const fechaId = fechaIdByNumero.get(p.fechaNumero)!;
      const idxEnFecha = partidosPorFecha.get(p.fechaNumero) ?? 0;
      partidosPorFecha.set(p.fechaNumero, idxEnFecha + 1);

      // Calcular el día calendario de esta fecha (heredando offset por
      // días no jugables) — se usa tanto para fechaHora como para
      // matchear el día de semana contra la plantilla.
      const baseFecha = new Date(fechaInicioBase);
      baseFecha.setDate(fechaInicioBase.getDate() + (p.fechaNumero - 1) * input.diasEntreFechas);
      const offsetExtra = offsetExtraPorFecha.get(p.fechaNumero) ?? 0;
      if (offsetExtra > 0) {
        baseFecha.setDate(baseFecha.getDate() + offsetExtra);
      }

      let canchaNombre: string | null = null;
      let canchaId: string | null = null;
      let fechaHora: Date | null = null;

      if (usarPlantilla) {
        // Día de semana ISO: getDay() devuelve 0 (dom) .. 6 (sáb). Lo
        // convertimos a ISO (1=lun .. 7=dom).
        const jsDow = baseFecha.getDay();
        const isoDow = jsDow === 0 ? 7 : jsDow;
        const slots = slotsPorDiaSemana.get(isoDow) ?? [];
        const slot = slots[idxEnFecha];
        if (slot) {
          const [h, m] = slot.hora.split(':').map(Number);
          baseFecha.setHours(h!, m!, 0, 0);
          fechaHora = new Date(baseFecha);
          canchaId = slot.canchaId;
          canchaNombre = slot.cancha?.nombre ?? null;
          slotsUsados++;
          // Sprint 40 — Detectar canchas marcadas como NO_DISPONIBLE.
          // Asignamos igual pero registramos el warning para que la UI
          // avise al admin (puede decidir re-programar manualmente).
          if (slot.cancha && slot.cancha.estado === 'NO_DISPONIBLE') {
            partidosEnCanchaNoDisponible.push({
              fechaNumero: p.fechaNumero,
              canchaNombre: slot.cancha.nombre,
              motivo: slot.cancha.motivoNoDisponible ?? null,
            });
          }
        } else {
          // Sin slot disponible para esta posición en esta fecha →
          // partido sin horario. El admin lo asignará a mano.
          partidosSinHorario++;
        }
      } else {
        // Modo legacy — round-robin sobre input.
        const cancha = canchas[idxEnFecha % canchas.length]!;
        const horario = horarios[idxEnFecha % horarios.length]!;
        const [h, m] = horario.split(':').map(Number);
        baseFecha.setHours(h!, m!, 0, 0);
        fechaHora = new Date(baseFecha);
        canchaNombre = cancha;
      }

      await this.partidoRepo.save(
        this.partidoRepo.create({
          tenantId,
          fechaId,
          equipoLocalId: p.equipoLocalId,
          equipoVisitaId: p.equipoVisitaId,
          canchaNombre,
          canchaId,
          fechaHora,
          estado: 'PROGRAMADO',
        }),
      );
      partidosCreados++;
    }

    const equiposLibres = Object.entries(fixture.libresPorFecha)
      .filter(([, eqId]) => eqId !== null)
      .map(([fechaNumero, equipoId]) => ({
        fechaNumero: Number.parseInt(fechaNumero, 10),
        equipoId: equipoId as string,
      }));

    return {
      fechasCreadas: fixture.fechas,
      partidosCreados,
      equiposLibres,
      diasNoJugablesAjustados,
      partidosSinHorario,
      slotsUsados,
      modoGeneracion,
      partidosEnCanchaNoDisponible,
      fechaInicioAjustada:
        fechaInicioAjustada && fechaInicioOriginalIso
          ? {
              fechaInicioOriginal: fechaInicioOriginalIso,
              fechaInicioReal: fechaInicioBase.toISOString().slice(0, 10),
            }
          : null,
    };
  }

  /**
   * Sprint 43 — Pre-validación del fixture. Evalúa las 4 variables
   * críticas SIN crear nada todavía: equipos, horarios, días bloqueados,
   * canchas. Devuelve una lista de advertencias para que la UI las
   * muestre antes de que el admin haga click en "Generar".
   *
   * - ERROR: bloquea la generación (faltan equipos)
   * - WARN: permite generar pero conviene corregir antes (sin horarios
   *   cargados, slots insuficientes, canchas no disponibles)
   * - INFO: simplemente informa (modo legacy, ajustes por feriados)
   */
  async prevalidar(
    torneoId: string,
    tenantId: string,
    params: {
      fechaInicio?: string;
      diasEntreFechas?: number;
    },
  ): Promise<FixturePrevalidacion> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);

    const advertencias: FixtureAdvertencia[] = [];

    // ── 1. EQUIPOS ────────────────────────────────────────────────
    const equiposCount = await this.equipoRepo.count({ where: { torneoId } });
    if (equiposCount < 2) {
      advertencias.push({
        codigo: 'SIN_EQUIPOS_SUFICIENTES',
        nivel: 'ERROR',
        mensaje: `Se requieren al menos 2 equipos para generar. Hay ${equiposCount}.`,
        detalle: { equiposCount },
      });
    }

    // ── 2. HORARIOS DEL TORNEO ───────────────────────────────────
    const horarios = await this.horarioRepo.find({
      where: { torneoId, tenantId, activo: true },
      relations: { cancha: true },
    });
    const horariosCount = horarios.length;
    const usarPlantilla = horariosCount > 0;
    const modoGeneracion: 'HORARIOS_TORNEO' | 'INPUT_LEGACY' = usarPlantilla
      ? 'HORARIOS_TORNEO'
      : 'INPUT_LEGACY';

    if (!usarPlantilla) {
      advertencias.push({
        codigo: 'SIN_HORARIOS_TORNEO',
        nivel: 'WARN',
        mensaje:
          'No hay horarios cargados para el torneo. Los partidos van a quedar ' +
          'con horarios y canchas del form (modo legacy). Cargá horarios desde ' +
          'la pestaña "Horarios" para asignación automática.',
      });
      advertencias.push({
        codigo: 'MODO_LEGACY',
        nivel: 'INFO',
        mensaje:
          'Se va a generar en modo LEGACY (round-robin sobre los horarios y ' +
          'canchas que escribas en el formulario).',
      });
    }

    // ── 3. CANCHAS DISPONIBLES ───────────────────────────────────
    const canchas = await this.canchaRepo.find({
      where: { tenantId },
    });
    const canchasDisponibles = canchas.filter(
      (c) => c.activa && c.estado === 'DISPONIBLE',
    );
    const canchasDisponiblesCount = canchasDisponibles.length;

    // 3.1 — Catálogo vacío (ninguna cancha cargada en /admin/canchas)
    if (canchas.length === 0) {
      advertencias.push({
        codigo: 'SIN_CANCHAS_CATALOGO',
        nivel: 'WARN',
        mensaje:
          'No hay canchas cargadas en el catálogo. Cargalas desde "Ocupación canchas" → ' +
          '/admin/canchas. Sin canchas en el catálogo, los partidos van a quedar ' +
          'con el nombre que escribas en el form (texto libre) y no podemos validar ' +
          'choques de horario entre partidos.',
      });
    } else if (canchasDisponiblesCount === 0) {
      // 3.2 — Hay canchas pero todas están NO_DISPONIBLE / inactivas
      advertencias.push({
        codigo: 'SIN_CANCHAS_DISPONIBLES',
        nivel: usarPlantilla ? 'ERROR' : 'WARN',
        mensaje:
          `Hay ${canchas.length} cancha(s) en el catálogo pero ninguna está DISPONIBLE. ` +
          (usarPlantilla
            ? 'Marcalas como DISPONIBLE desde /admin/canchas antes de generar el fixture.'
            : 'Marcá al menos una como DISPONIBLE para poder asignar partidos.'),
        detalle: { totalCanchas: canchas.length },
      });
    }

    if (usarPlantilla) {
      // 3.3 — Slots de horario sin cancha asignada (slot.canchaId = null)
      const slotsSinCancha = horarios.filter((h) => h.canchaId === null).length;
      if (slotsSinCancha > 0) {
        advertencias.push({
          codigo: 'SLOTS_SIN_CANCHA',
          nivel: 'WARN',
          mensaje:
            `${slotsSinCancha} slot(s) de horario no tienen cancha asignada. ` +
            'Los partidos en esos slots van a quedar con cancha vacía. ' +
            'Editá los horarios y asigná una cancha del catálogo a cada slot.',
          detalle: { slotsSinCancha },
        });
      }

      // 3.4 — Slots con cancha marcada NO_DISPONIBLE
      const canchasNoDispo = horarios
        .filter((h) => h.cancha && h.cancha.estado === 'NO_DISPONIBLE')
        .map((h) => h.cancha!.nombre);
      if (canchasNoDispo.length > 0) {
        const unicas = Array.from(new Set(canchasNoDispo));
        advertencias.push({
          codigo: 'CANCHAS_NO_DISPONIBLES',
          nivel: 'WARN',
          mensaje: `${unicas.length} cancha(s) usada(s) en horarios están NO DISPONIBLES: ${unicas.join(', ')}. Los partidos se asignarán igual pero recibirás un aviso.`,
          detalle: { canchas: unicas },
        });
      }
    }

    // ── 4. DÍAS BLOQUEADOS EN EL RANGO ───────────────────────────
    if (params.fechaInicio && params.diasEntreFechas) {
      const equipos = equiposCount;
      // Estimación rápida: fechas Berger = equipos - 1 (par) o equipos (impar).
      const fechasEstimadas = equipos % 2 === 0 ? equipos - 1 : equipos;
      const fechaInicio = new Date(params.fechaInicio);
      const fechaFin = new Date(fechaInicio);
      fechaFin.setDate(
        fechaInicio.getDate() + fechasEstimadas * params.diasEntreFechas + 30,
      );
      const bloqueadas = await this.diasNoJugables.fechasBloqueadasEnRango(
        tenantId,
        torneoId,
        fechaInicio.toISOString().slice(0, 10),
        fechaFin.toISOString().slice(0, 10),
      );
      if (bloqueadas.size > 0) {
        advertencias.push({
          codigo: 'DIAS_BLOQUEADOS_EN_RANGO',
          nivel: 'INFO',
          mensaje: `Hay ${bloqueadas.size} día(s) no jugable(s) entre ${fechaInicio.toISOString().slice(0, 10)} y ${fechaFin.toISOString().slice(0, 10)}. Las fechas se correrán automáticamente al próximo día válido.`,
          detalle: {
            cantidad: bloqueadas.size,
            primerDia: Array.from(bloqueadas.keys()).sort()[0] ?? null,
          },
        });
      }
    }

    // ── 4.5 FECHA DE INICIO VS DÍAS DE SLOTS ─────────────────────
    // Sprint 44 — Si la fecha de inicio cae en un día sin slots
    // cargados, el generador la va a correr al próximo día con slots.
    // Avisamos al admin para que sepa por qué la "Fecha 1" no es la
    // que escribió.
    if (usarPlantilla && params.fechaInicio) {
      const diasConSlots = new Set(horarios.map((h) => h.diaSemana));
      const fechaInicio = new Date(params.fechaInicio);
      const jsDow = fechaInicio.getDay();
      const isoDow = jsDow === 0 ? 7 : jsDow;
      if (!diasConSlots.has(isoDow)) {
        // Buscar el próximo día con slots.
        let proximaIso = '';
        for (let i = 1; i <= 7; i++) {
          const probe = new Date(fechaInicio);
          probe.setDate(fechaInicio.getDate() + i);
          const pjs = probe.getDay();
          const piso = pjs === 0 ? 7 : pjs;
          if (diasConSlots.has(piso)) {
            proximaIso = probe.toISOString().slice(0, 10);
            break;
          }
        }
        const NOMBRES_DIA: Record<number, string> = {
          1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves',
          5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
        };
        const diasConSlotsNombres = Array.from(diasConSlots)
          .sort()
          .map((d) => NOMBRES_DIA[d] ?? `Día ${d}`)
          .join(', ');
        advertencias.push({
          codigo: 'FECHA_INICIO_AJUSTADA_POR_HORARIOS',
          nivel: 'WARN',
          mensaje:
            `La fecha de inicio (${params.fechaInicio}) cae en ${NOMBRES_DIA[isoDow]}, ` +
            `pero los horarios cargados son solo para: ${diasConSlotsNombres}. ` +
            (proximaIso
              ? `La Fecha 1 se va a generar el ${proximaIso}.`
              : 'No se encontró ningún día con slots en los próximos 7 días.'),
          detalle: {
            diaSemanaElegido: isoDow,
            diasConSlots: Array.from(diasConSlots).sort(),
            proximaFecha: proximaIso || null,
          },
        });
      }
    }

    // ── 5. SLOTS INSUFICIENTES (solo si usa plantilla) ───────────
    if (usarPlantilla && equiposCount >= 2) {
      // Partidos por fecha ≈ floor(equipos / 2)
      const partidosPorFecha = Math.floor(equiposCount / 2);
      // Para cada día de semana en uso, max slots por fecha
      const slotsPorDia = new Map<number, number>();
      for (const h of horarios) {
        slotsPorDia.set(h.diaSemana, (slotsPorDia.get(h.diaSemana) ?? 0) + 1);
      }
      const maxSlots = Math.max(...Array.from(slotsPorDia.values()), 0);
      if (maxSlots < partidosPorFecha) {
        advertencias.push({
          codigo: 'SLOTS_INSUFICIENTES',
          nivel: 'WARN',
          mensaje:
            `Hay ${partidosPorFecha} partido(s) por fecha pero solo ${maxSlots} slot(s) ` +
            `máximo en un mismo día. ${partidosPorFecha - maxSlots} partido(s) van a quedar sin horario.`,
          detalle: { partidosPorFecha, maxSlots },
        });
      }
    }

    const ok = !advertencias.some((a) => a.nivel === 'ERROR');
    return {
      ok,
      equiposCount,
      horariosCount,
      canchasDisponiblesCount,
      modoGeneracion,
      advertencias,
    };
  }

  /**
   * Borra TODAS las fechas + partidos del torneo. Útil para regenerar.
   * Solo permitido si el torneo está en DRAFT.
   */
  @Transactional()
  async reset(torneoId: string, tenantId: string): Promise<{ deleted: number }> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    if (torneo.estado !== 'DRAFT') {
      throw new BadRequestException(
        `Solo se puede resetear fixture en estado DRAFT. Estado actual: ${torneo.estado}`,
      );
    }

    const fechas = await this.fechaRepo.find({ where: { torneoId } });
    if (fechas.length === 0) return { deleted: 0 };

    // ON DELETE CASCADE de partidos.fecha_id se encarga de los partidos
    await this.fechaRepo.delete({ torneoId });
    return { deleted: fechas.length };
  }
}
