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
  type EstadoMultaInforme,
  type ExpulsadoFecha,
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

  private parseFecha(v?: string): number | undefined {
    if (!v) return undefined;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
}
