import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

import {
  PLANTEL_COLUMNAS_OBLIGATORIAS,
  PLANTEL_COLUMNAS_OPCIONALES,
  ROLE,
  type BulkImportPreview,
  type BulkImportResult,
  type BulkImportRow,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { PlantelImportService } from './plantel-import.service';
import {
  BulkImportConfirmDto,
  BulkImportPreviewDto,
} from './dto-import';

@Controller('admin/clubes')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class PlantelImportController {
  constructor(private readonly svc: PlantelImportService) {}

  /**
   * Evalúa el archivo sin commitear. Devuelve estadísticas + detalle
   * por fila para que el frontend muestre la tabla de revisión.
   */
  @Post(':id/plantel/import/preview')
  preview(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BulkImportPreviewDto,
  ): Promise<BulkImportPreview> {
    return this.svc.previsualizar(
      id,
      ensureTenant(user),
      dto.categoriaId,
      dto.rows as unknown as BulkImportRow[],
    );
  }

  /**
   * Aplica los cambios. Re-evalúa todo antes para garantizar
   * idempotencia ante cambios entre preview y confirm.
   */
  @Post(':id/plantel/import/confirm')
  @Audited({
    action: 'club.plantel.importado',
    entityType: 'Club',
    entityIdFrom: 'params.id',
  })
  confirm(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BulkImportConfirmDto,
  ): Promise<BulkImportResult> {
    return this.svc.confirmar(id, ensureTenant(user), {
      categoriaId: dto.categoriaId,
      rows: dto.rows as unknown as BulkImportRow[],
      inactivarFaltantes: dto.inactivarFaltantes ?? true,
    });
  }

  /**
   * Genera un Excel con encabezados + hoja de instrucciones. Esto evita
   * el caso "el admin arma su Excel a mano y nos pone columnas en otro
   * orden o con otros nombres". Se ofrece como descarga directa.
   */
  @Get('plantel/template.xlsx')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="plantilla-jugadores-fixtura.xlsx"',
  )
  template(@Res() res: Response): void {
    const buffer = buildTemplate();
    res.send(buffer);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

function buildTemplate(): Buffer {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Jugadores (encabezados + 1 fila de ejemplo)
  const headers = [
    ...PLANTEL_COLUMNAS_OBLIGATORIAS,
    ...PLANTEL_COLUMNAS_OPCIONALES,
  ];
  const ejemplo: Record<string, string | number | boolean> = {
    rut: '12.345.678-5',
    nombres: 'Juan Pablo',
    apellidos: 'González Pérez',
    fechaNac: '1990-05-15',
    email: 'jp.gonzalez@correo.cl',
    telefono: '+56 9 1234 5678',
    numeroCamiseta: 10,
    posicion: 'MEDIO',
    capitan: false,
    telefonoContacto: '+56 9 9876 5432',
    nombreContacto: 'María González (esposa)',
  };
  const ws1 = XLSX.utils.json_to_sheet([ejemplo], { header: headers });
  // Anchos cómodos
  ws1['!cols'] = headers.map((h) => ({
    wch: h === 'email' ? 30 : h === 'nombres' || h === 'apellidos' ? 22 : 14,
  }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Jugadores');

  // Hoja 2: Instrucciones
  const instrucciones: Array<[string, string]> = [
    ['Columna', 'Descripción / formato'],
    ['rut', 'Obligatorio. Formato chileno con dígito verificador (12.345.678-5 o 12345678-5).'],
    ['nombres', 'Obligatorio. Mínimo 2 caracteres.'],
    ['apellidos', 'Obligatorio. Mínimo 2 caracteres.'],
    ['fechaNac', 'Opcional. ISO YYYY-MM-DD (ej. 1990-05-15). Necesario para validar edad de categoría.'],
    ['email', 'Opcional. Formato válido (con @ y dominio).'],
    ['telefono', 'Opcional. Texto libre.'],
    ['numeroCamiseta', 'Opcional. Número entero entre 0 y 99.'],
    ['posicion', 'Opcional. Uno de: ARQUERO, DEFENSA, MEDIO, DELANTERO.'],
    ['capitan', 'Opcional. Sí/No, true/false, 1/0.'],
    ['telefonoContacto', 'Opcional. Teléfono de un familiar/responsable para avisar en caso de accidente durante un partido.'],
    ['nombreContacto', 'Opcional. Nombre + parentesco de esa persona. Ej: "María González (esposa)".'],
    ['', ''],
    ['Reglas de match', ''],
    ['1', 'Se identifica al jugador por RUT a nivel de la liga.'],
    ['2', 'Si el RUT ya existe en este club + categoría → se ACTUALIZA (email, teléfono, camiseta, posición, capitán).'],
    ['3', 'Si el RUT está en OTRO club de la misma liga → se RECHAZA. Un jugador solo puede estar en un club por liga.'],
    ['4', 'Si el RUT está en la lista de vetados → se RECHAZA.'],
    ['5', 'Jugadores actuales del plantel que NO vienen en este archivo se proponen marcar como INACTIVOS (reversible).'],
    ['6', 'La edad calendario se valida contra el rango de la categoría. Si entra en excepción y hay cupo disponible, se marca EN_EXCEPCION.'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(instrucciones);
  ws2['!cols'] = [{ wch: 20 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
