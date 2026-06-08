import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';

import { limpiarRut } from '@fixtura/types';

import { Fecha } from '../../competition/entities/fecha.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

interface FilaJugador {
  numero: number | null;
  rut: string | null;
  nombre: string;
  capitan: boolean;
}

/**
 * F46.5 / F52 — Genera la "plantilla física" del partido en PDF: UNA HOJA
 * INDEPENDIENTE por equipo, con RUT, N°, Nombre, columnas en blanco
 * (Goles / Amarillas / Rojas) y una columna de FIRMA para que cada jugador
 * firme su asistencia. El roster sale de la planilla del torneo de cada
 * inscripción; los jugadores VETADOS se excluyen (no pueden jugar).
 */
@Injectable()
export class PlantillaPdfService {
  constructor(
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(JugadorVetado)
    private readonly vetadoRepo: Repository<JugadorVetado>,
  ) {}

  async generar(partidoId: string, tenantId: string): Promise<Buffer> {
    const partido = await this.partidoRepo.findOne({
      where: { id: partidoId, tenantId },
      relations: { inscripcionLocal: { club: true }, inscripcionVisita: { club: true } },
    });
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado`);
    const fecha = await this.fechaRepo.findOne({ where: { id: partido.fechaId, tenantId } });
    const torneo = fecha
      ? await this.torneoRepo.findOne({ where: { id: fecha.torneoId, tenantId } })
      : null;

    // Vetados de la liga (lista negra por RUT). Se excluyen de la plantilla:
    // un jugador vetado no puede figurar en el roster del partido.
    const vetados = await this.vetadoRepo.find({ where: { tenantId } });
    const vetadosSet = new Set(
      vetados.map((v) => limpiarRut(v.rut)).filter((r) => !!r),
    );

    const local = {
      nombre: partido.inscripcionLocal?.club?.nombre ?? 'Local',
      jugadores: await this.cargarPlantilla(partido.inscripcionLocalId, tenantId, vetadosSet),
    };
    const visita = {
      nombre: partido.inscripcionVisita?.club?.nombre ?? 'Visita',
      jugadores: await this.cargarPlantilla(partido.inscripcionVisitaId, tenantId, vetadosSet),
    };

    const fechaHoraStr = partido.fechaHora
      ? new Intl.DateTimeFormat('es-CL', {
          timeZone: 'America/Santiago',
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(partido.fechaHora)
      : 'Sin fecha/hora';

    return this.construirPdf({
      torneoNombre: torneo?.nombre ?? 'Torneo',
      fechaNumero: fecha?.numero ?? 0,
      fechaEtiqueta: fecha?.etiqueta ?? null,
      fechaHoraStr,
      canchaNombre: partido.canchaNombre,
      local,
      visita,
    });
  }

  private async cargarPlantilla(
    inscripcionId: string | null,
    tenantId: string,
    vetadosSet: Set<string>,
  ): Promise<FilaJugador[]> {
    if (!inscripcionId) return [];
    const planilla = await this.planillaRepo.find({
      where: { inscripcionId, tenantId },
      relations: { jugador: true },
    });
    return planilla
      .filter((p) => p.jugador)
      // Excluir vetados (comparación por RUT normalizado).
      .filter((p) => {
        const rut = p.jugador!.rut ? limpiarRut(p.jugador!.rut) : null;
        return !rut || !vetadosSet.has(rut);
      })
      .map((p) => ({
        numero: p.jugador!.numeroCamiseta,
        rut: p.jugador!.rut,
        nombre: `${p.jugador!.apellidos}, ${p.jugador!.nombres}`,
        capitan: p.jugador!.capitan,
      }))
      .sort(
        (a, b) =>
          (a.numero ?? 999) - (b.numero ?? 999) || a.nombre.localeCompare(b.nombre, 'es'),
      );
  }

  private construirPdf(data: {
    torneoNombre: string;
    fechaNumero: number;
    fechaEtiqueta: string | null;
    fechaHoraStr: string;
    canchaNombre: string | null;
    local: { nombre: string; jugadores: FilaJugador[] };
    visita: { nombre: string; jugadores: FilaJugador[] };
  }): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    // Hoja 1 — equipo local.
    this.dibujarEncabezado(doc, data, 'LOCAL');
    this.dibujarEquipo(doc, data.local.nombre, data.local.jugadores);
    this.dibujarFirmas(doc, 'Capitán local');

    // Hoja 2 — equipo visita (hoja independiente).
    doc.addPage();
    this.dibujarEncabezado(doc, data, 'VISITA');
    this.dibujarEquipo(doc, data.visita.nombre, data.visita.jugadores);
    this.dibujarFirmas(doc, 'Capitán visita');

    doc.end();
    return done;
  }

  private dibujarEncabezado(
    doc: PDFKit.PDFDocument,
    data: {
      torneoNombre: string;
      fechaNumero: number;
      fechaEtiqueta: string | null;
      fechaHoraStr: string;
      canchaNombre: string | null;
      local: { nombre: string };
      visita: { nombre: string };
    },
    lado: 'LOCAL' | 'VISITA',
  ): void {
    doc.fontSize(16).font('Helvetica-Bold').fillColor('black').text('Plantilla física del partido', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `${data.torneoNombre} · Fecha ${data.fechaNumero}${data.fechaEtiqueta ? ` — ${data.fechaEtiqueta}` : ''}`,
        { align: 'center' },
      );
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(`${data.local.nombre}  vs  ${data.visita.nombre}`, { align: 'center' });
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        `${data.fechaHoraStr}${data.canchaNombre ? ` · Cancha: ${data.canchaNombre}` : ''}`,
        { align: 'center' },
      );
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#0f3d2e')
      .text(`Hoja ${lado === 'LOCAL' ? '1/2 · Equipo LOCAL' : '2/2 · Equipo VISITA'}`, {
        align: 'center',
      });
    doc.fillColor('black');
    doc.moveDown(0.8);
  }

  private dibujarFirmas(doc: PDFKit.PDFDocument, capitanLabel: string): void {
    doc.moveDown(2);
    const yFirmas = doc.y > 720 ? 720 : doc.y;
    doc.fontSize(9).font('Helvetica').fillColor('black');
    doc.text('______________________', 70, yFirmas);
    doc.text('Árbitro', 70, yFirmas + 14);
    doc.text('______________________', 330, yFirmas);
    doc.text(capitanLabel, 330, yFirmas + 14);
  }

  private dibujarEquipo(
    doc: PDFKit.PDFDocument,
    nombre: string,
    jugadores: FilaJugador[],
  ): void {
    const left = 36;
    const right = 559; // A4 width 595 - margin 36
    // Columnas: N° | RUT | Nombre | Goles | Amar. | Rojas | Firma
    const cols = [
      { label: 'N°', w: 26 },
      { label: 'RUT', w: 78 },
      { label: 'Nombre', w: 150 },
      { label: 'Goles', w: 38 },
      { label: 'Amar.', w: 34 },
      { label: 'Rojas', w: 34 },
      { label: 'Firma', w: 163 },
    ];
    const rowH = 22;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f3d2e').text(nombre, left, doc.y);
    doc.fillColor('black');
    doc.moveDown(0.3);

    let y = doc.y;
    // Header de tabla.
    let x = left;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.rect(left, y, right - left, rowH).fill('#eee').fillColor('black').stroke();
    x = left;
    for (const c of cols) {
      doc.fillColor('black').text(c.label, x + 3, y + 7, { width: c.w - 6 });
      x += c.w;
    }
    y += rowH;

    // Filas. Si no hay jugadores, dibujamos 16 filas vacías para escribir a mano.
    const filas: FilaJugador[] =
      jugadores.length > 0
        ? jugadores
        : Array.from({ length: 16 }, () => ({ numero: null, rut: null, nombre: '', capitan: false }));

    doc.font('Helvetica').fontSize(9);
    for (const j of filas) {
      if (y + rowH > 800) {
        doc.addPage();
        y = 36;
      }
      // Bordes de celda.
      let cx = left;
      for (const c of cols) {
        doc.rect(cx, y, c.w, rowH).stroke();
        cx += c.w;
      }
      // Contenido de las 3 primeras columnas (Goles/Amar./Rojas/Firma en blanco).
      const valores = [
        j.numero != null ? String(j.numero) : '',
        j.rut ?? '',
        j.nombre + (j.capitan ? '  (C)' : ''),
      ];
      x = left;
      valores.forEach((v, i) => {
        doc.text(v, x + 3, y + 7, { width: cols[i]!.w - 6, ellipsis: true });
        x += cols[i]!.w;
      });
      y += rowH;
    }
    doc.y = y;
  }
}
