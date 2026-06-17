import {
  BadRequestException,
  Controller,
  Get,
  Header,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  ROLE,
  type EnRiesgoAmarilla,
  type EstadoCuentaClub,
  type EstadoMultaInforme,
  type ExpulsadoFecha,
  type FilaPosicionInforme,
  type GoleadorInforme,
  type Moroso,
  type MultaPendiente,
  type RecaudacionConcepto,
  type ResultadoPartidoInforme,
  type SancionVigente,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { InformesAdminService } from './informes-admin.service';
import { InformesPdfService } from './informes-pdf.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

const TIPO_LABEL: Record<ExpulsadoFecha['tipo'], string> = {
  ROJA: 'Roja directa',
  AMARILLA_ROJA: 'Doble amarilla',
};

function multaStr(monto: number | null, estado: EstadoMultaInforme | null): string {
  if (monto == null || estado == null) return '—';
  const e = estado === 'PAGADO' ? 'Pagada' : estado === 'VENCIDO' ? 'Vencida' : 'Pendiente';
  return `$${monto.toLocaleString('es-CL')} (${e})`;
}

function clp(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

const ESTADO_PARTIDO_LABEL: Record<string, string> = {
  PROGRAMADO: 'Programado',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  SUSPENDIDO_FUERZA_MAYOR: 'Suspendido',
  REPROGRAMADO: 'Reprogramado',
  WALKOVER: 'Walkover',
};

/** Marcador legible: "2 - 1" si jugado, "vs" si todavía no. */
function marcador(r: ResultadoPartidoInforme): string {
  if (r.golesLocal == null || r.golesVisita == null) return 'vs';
  return `${r.golesLocal} - ${r.golesVisita}`;
}

/**
 * Informes de administración (solo lectura). Fase 1: Disciplina.
 */
@Controller('admin/informes')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.TRIBUNAL_DISCIPLINA,
  ROLE.LIGA_CONTADOR,
  ROLE.SUPER_ADMIN,
)
export class InformesAdminController {
  constructor(
    private readonly svc: InformesAdminService,
    private readonly pdf: InformesPdfService,
  ) {}

  /** Expulsados (rojas / dobles amarillas) de un torneo, opcional por fecha. */
  @Get('disciplina/expulsados')
  expulsados(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaNumero') fechaNumero?: string,
  ): Promise<ExpulsadoFecha[]> {
    return this.svc.expulsados(ensureTenant(user), torneoId, this.parseFecha(fechaNumero));
  }

  @Get('disciplina/expulsados.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="expulsados.pdf"')
  async expulsadosPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaNumero') fechaNumero?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const fn = this.parseFecha(fechaNumero);
    const rows = await this.svc.expulsados(tenantId, torneoId, fn);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Expulsados',
      subtitulo: fn ? `Fecha ${fn}` : 'Todas las fechas',
      columnas: [
        { label: 'Fecha', width: 45, align: 'center' },
        { label: 'Jugador', width: 160 },
        { label: 'Club', width: 120 },
        { label: 'Tipo', width: 85 },
        { label: 'Partido', width: 150 },
        { label: 'Sanción', width: 60, align: 'center' },
        { label: 'Multa', width: 130 },
      ],
      filas: rows.map((e) => [
        String(e.fechaNumero),
        `${e.jugadorNombre}${e.rut ? ` (${e.rut})` : ''}`,
        e.clubNombre ?? '—',
        TIPO_LABEL[e.tipo],
        e.partidoLabel,
        e.fechasSancion != null ? `${e.fechasSancion}` : '—',
        multaStr(e.multaMonto, e.multaEstado),
      ]),
    });
    res.send(buffer);
  }

  /** Sancionados vigentes (o todos) con fechas cumplidas/pendientes + multa. */
  @Get('disciplina/sancionados')
  sancionados(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
    @Query('clubId') clubId?: string,
    @Query('incluirCumplidas') incluirCumplidas?: string,
  ): Promise<SancionVigente[]> {
    return this.svc.sancionadosVigentes(
      ensureTenant(user),
      torneoId || undefined,
      clubId || undefined,
      incluirCumplidas === 'true',
    );
  }

  @Get('disciplina/sancionados.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="sancionados.pdf"')
  async sancionadosPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId') torneoId?: string,
    @Query('clubId') clubId?: string,
    @Query('incluirCumplidas') incluirCumplidas?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.sancionadosVigentes(
      tenantId,
      torneoId || undefined,
      clubId || undefined,
      incluirCumplidas === 'true',
    );
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Sancionados',
      columnas: [
        { label: 'Jugador', width: 160 },
        { label: 'Club', width: 110 },
        { label: 'Motivo', width: 115 },
        { label: 'Total', width: 45, align: 'center' },
        { label: 'Cumpl.', width: 50, align: 'center' },
        { label: 'Pend.', width: 45, align: 'center' },
        { label: 'Vuelve', width: 60, align: 'center' },
        { label: 'Multa', width: 125 },
      ],
      filas: rows.map((s) => [
        `${s.jugadorNombre}${s.rut ? ` (${s.rut})` : ''}`,
        s.clubNombre ?? '—',
        s.motivo,
        String(s.fechasTotales),
        String(s.fechasCumplidas),
        String(s.fechasPendientes),
        s.cumplida ? '—' : `F${s.vuelveEnFecha}`,
        multaStr(s.multaMonto, s.multaEstado),
      ]),
    });
    res.send(buffer);
  }

  /** Jugadores a una amarilla de la suspensión por acumulación. */
  @Get('disciplina/en-riesgo')
  enRiesgo(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<EnRiesgoAmarilla[]> {
    return this.svc.enRiesgo(ensureTenant(user), torneoId);
  }

  @Get('disciplina/en-riesgo.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="en-riesgo.pdf"')
  async enRiesgoPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.enRiesgo(tenantId, torneoId);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'En riesgo de suspensión (acumulación de amarillas)',
      columnas: [
        { label: 'Jugador', width: 220 },
        { label: 'Club', width: 180 },
        { label: 'Amarillas', width: 80, align: 'center' },
        { label: 'Faltan', width: 80, align: 'center' },
      ],
      filas: rows.map((r) => [
        `${r.jugadorNombre}${r.rut ? ` (${r.rut})` : ''}`,
        r.clubNombre ?? '—',
        String(r.amarillas),
        String(r.faltanParaSuspension),
      ]),
    });
    res.send(buffer);
  }

  // ─── Fase 2: Finanzas ───────────────────────────────────────────────

  /** Estado de cuenta agregado por club. */
  @Get('finanzas/estado-cuenta')
  estadoCuenta(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
  ): Promise<EstadoCuentaClub[]> {
    return this.svc.estadoCuenta(ensureTenant(user), torneoId || undefined);
  }

  @Get('finanzas/estado-cuenta.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="estado-cuenta.pdf"')
  async estadoCuentaPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId') torneoId?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.estadoCuenta(tenantId, torneoId || undefined);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Estado de cuenta por club',
      columnas: [
        { label: 'Club', width: 220 },
        { label: 'Total', width: 110, align: 'right' },
        { label: 'Pagado', width: 110, align: 'right' },
        { label: 'Pendiente', width: 110, align: 'right' },
        { label: 'Vencido', width: 100, align: 'right' },
        { label: 'Saldo', width: 110, align: 'right' },
      ],
      filas: rows.map((r) => [
        r.clubNombre ?? '— sin club —',
        clp(r.total),
        clp(r.pagado),
        clp(r.pendiente),
        clp(r.vencido),
        clp(r.saldo),
      ]),
    });
    res.send(buffer);
  }

  /** Multas pendientes de pago. */
  @Get('finanzas/multas-pendientes')
  multasPendientes(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
    @Query('clubId') clubId?: string,
  ): Promise<MultaPendiente[]> {
    return this.svc.multasPendientes(
      ensureTenant(user),
      torneoId || undefined,
      clubId || undefined,
    );
  }

  @Get('finanzas/multas-pendientes.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="multas-pendientes.pdf"')
  async multasPendientesPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId') torneoId?: string,
    @Query('clubId') clubId?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.multasPendientes(
      tenantId,
      torneoId || undefined,
      clubId || undefined,
    );
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Multas pendientes de pago',
      columnas: [
        { label: 'Concepto', width: 320 },
        { label: 'Club', width: 150 },
        { label: 'Monto', width: 110, align: 'right' },
        { label: 'Estado', width: 90 },
      ],
      filas: rows.map((m) => [
        m.concepto,
        m.clubNombre ?? '—',
        clp(m.monto),
        m.estado === 'VENCIDO' ? 'Vencida' : 'Pendiente',
      ]),
    });
    res.send(buffer);
  }

  /** Cobros vencidos (morosos). */
  @Get('finanzas/morosos')
  morosos(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
  ): Promise<Moroso[]> {
    return this.svc.morosos(ensureTenant(user), torneoId || undefined);
  }

  @Get('finanzas/morosos.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="morosos.pdf"')
  async morososPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId') torneoId?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.morosos(tenantId, torneoId || undefined);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Morosos (cobros vencidos)',
      columnas: [
        { label: 'Club', width: 160 },
        { label: 'Concepto', width: 260 },
        { label: 'Monto', width: 100, align: 'right' },
        { label: 'Días mora', width: 80, align: 'center' },
        { label: 'Avisos', width: 70, align: 'center' },
      ],
      filas: rows.map((m) => [
        m.clubNombre ?? '—',
        m.concepto,
        clp(m.monto),
        String(m.diasMora),
        String(m.avisos),
      ]),
    });
    res.send(buffer);
  }

  /** Recaudación por concepto: cobrado vs por cobrar. */
  @Get('finanzas/recaudacion')
  recaudacion(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
  ): Promise<RecaudacionConcepto[]> {
    return this.svc.recaudacion(ensureTenant(user), torneoId || undefined);
  }

  @Get('finanzas/recaudacion.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="recaudacion.pdf"')
  async recaudacionPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId') torneoId?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.recaudacion(tenantId, torneoId || undefined);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Recaudación por concepto',
      columnas: [
        { label: 'Concepto', width: 220 },
        { label: 'Cobrado', width: 140, align: 'right' },
        { label: 'Por cobrar', width: 140, align: 'right' },
        { label: 'Total', width: 140, align: 'right' },
        { label: 'Cobros', width: 80, align: 'center' },
      ],
      filas: rows.map((r) => [
        r.categoria,
        clp(r.cobrado),
        clp(r.porCobrar),
        clp(r.total),
        String(r.cantidad),
      ]),
    });
    res.send(buffer);
  }

  // ─── Fase 3: Competición ────────────────────────────────────────────

  /** Tabla de posiciones del torneo. */
  @Get('competicion/posiciones')
  posiciones(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<FilaPosicionInforme[]> {
    return this.svc.posiciones(ensureTenant(user), torneoId);
  }

  @Get('competicion/posiciones.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="posiciones.pdf"')
  async posicionesPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.posiciones(tenantId, torneoId);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Tabla de posiciones',
      columnas: [
        { label: '#', width: 30, align: 'center' },
        { label: 'Club', width: 230 },
        { label: 'PJ', width: 45, align: 'center' },
        { label: 'PG', width: 45, align: 'center' },
        { label: 'PE', width: 45, align: 'center' },
        { label: 'PP', width: 45, align: 'center' },
        { label: 'GF', width: 45, align: 'center' },
        { label: 'GC', width: 45, align: 'center' },
        { label: 'DG', width: 45, align: 'center' },
        { label: 'Pts', width: 50, align: 'center' },
      ],
      filas: rows.map((r) => [
        String(r.posicion),
        r.clubNombre,
        String(r.pj),
        String(r.pg),
        String(r.pe),
        String(r.pp),
        String(r.gf),
        String(r.gc),
        r.dg > 0 ? `+${r.dg}` : String(r.dg),
        String(r.pts),
      ]),
    });
    res.send(buffer);
  }

  /** Goleadores acumulados del torneo. */
  @Get('competicion/goleadores')
  goleadores(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<GoleadorInforme[]> {
    return this.svc.goleadores(ensureTenant(user), torneoId);
  }

  @Get('competicion/goleadores.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="goleadores.pdf"')
  async goleadoresPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const rows = await this.svc.goleadores(tenantId, torneoId);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Tabla de goleadores',
      columnas: [
        { label: '#', width: 35, align: 'center' },
        { label: 'Jugador', width: 240 },
        { label: 'Club', width: 200 },
        { label: 'Goles', width: 70, align: 'center' },
      ],
      filas: rows.map((g) => [
        String(g.posicion),
        `${g.jugadorNombre}${g.rut ? ` (${g.rut})` : ''}`,
        g.clubNombre ?? '—',
        String(g.goles),
      ]),
    });
    res.send(buffer);
  }

  /** Resultados del torneo (opcional por fecha). */
  @Get('competicion/resultados')
  resultados(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaNumero') fechaNumero?: string,
  ): Promise<ResultadoPartidoInforme[]> {
    return this.svc.resultados(
      ensureTenant(user),
      torneoId,
      this.parseFecha(fechaNumero),
    );
  }

  @Get('competicion/resultados.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="resultados.pdf"')
  async resultadosPdf(
    @CurrentUser() user: UserContext,
    @Res() res: Response,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaNumero') fechaNumero?: string,
  ): Promise<void> {
    const tenantId = ensureTenant(user);
    const fn = this.parseFecha(fechaNumero);
    const rows = await this.svc.resultados(tenantId, torneoId, fn);
    const buffer = await this.pdf.tabla(tenantId, {
      titulo: 'Resultados',
      subtitulo: fn ? `Fecha ${fn}` : 'Todas las fechas',
      columnas: [
        { label: 'Fecha', width: 45, align: 'center' },
        { label: 'Local', width: 170, align: 'right' },
        { label: 'Marcador', width: 70, align: 'center' },
        { label: 'Visita', width: 170 },
        { label: 'Estado', width: 90 },
        { label: 'Cancha', width: 130 },
      ],
      filas: rows.map((r) => [
        String(r.fechaNumero),
        r.localNombre ?? '—',
        marcador(r),
        r.visitaNombre ?? '—',
        ESTADO_PARTIDO_LABEL[r.estado] ?? r.estado,
        r.canchaNombre ?? '—',
      ]),
    });
    res.send(buffer);
  }

  private parseFecha(v?: string): number | undefined {
    if (!v) return undefined;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
}
