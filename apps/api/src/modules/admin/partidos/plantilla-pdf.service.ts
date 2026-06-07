import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';

import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

/**
 * F46.5 — Genera la "plantilla física" del partido en PDF: una hoja por
 * equipo con RUT, N°, Nombre y columnas en blanco (Goles / Amarillas /
 * Rojas) para llevar a la cancha y completar a mano. El roster sale de la
 * planilla del torneo de cada inscripción.
 */
@Injectable()
export class PlantillaPdfService {
  constructor(
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
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

    const local = {
      nombre: partido.inscripcionLocal?.club?.nombre ?? 'Local',
      jugadores: await this.cargarPlantilla(partido.inscripcionLocalId, tenantId),
    };
    const visita = {
      nombre: partido.inscripcionVisita?.club?.nombre ?? 'Visita',
      jugadores: await this.cargarPlantilla(partido.inscripcionVisitaId, tenantId),
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
  ): Promise<Array<{ numero: number | null; rut: string | null; nombre: string; capitan: boolean }>> {
    if (!inscripcionId) return [];
    const planilla = await this.planillaRepo.find({
      where: { inscripcionId, tenantId },
      relations: { jugador: true },
    });
    return planilla
      .filter((p) => p.jugador)
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
    local: { nombre: string; jugadores: Array<{ numero: number | null; rut: string | null; nombre: string; capitan: boolean }> };
    visita: { nombre: string; jugadores: Array<{ numero: number | null; rut: string | null; nombre: string; capitan: boolean }> };
  }): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    // Encabezado del partido.
    doc.fontSize(16).font('Helvetica-Bold').text('Plantilla física del partido', { align: 'center' });
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
    doc.moveDown(0.8);

    this.dibujarEquipo(doc, data.local.nombre, data.local.jugadores);
    doc.moveDown(1);
    // Salto de página si no queda espacio razonable para el 2do equipo.
    if (doc.y > 560) doc.addPage();
    this.dibujarEquipo(doc, data.visita.nombre, data.visita.jugadores);

    // Pie de firmas.
    doc.moveDown(2);
    const yFirmas = doc.y;
    doc.fontSize(9).font('Helvetica');
    doc.text('______________________', 60, yFirmas);
    doc.text('Árbitro', 60, yFirmas + 14);
    doc.text('______________________', 240, yFirmas);
    doc.text('Capitán local', 240, yFirmas + 14);
    doc.text('______________________', 410, yFirmas);
    doc.text('Capitán visita', 410, yFirmas + 14);

    doc.end();
    return done;
  }

  private dibujarEquipo(
    doc: PDFKit.PDFDocument,
    nombre: string,
    jugadores: Array<{ numero: number | null; rut: string | null; nombre: string; capitan: boolean }>,
  ): void {
    const left = 36;
    const right = 559; // A4 width 595 - margin 36
    // Columnas: N° | RUT | Nombre | Goles | Amarillas | Rojas
    const cols = [
      { label: 'N°', w: 30 },
      { label: 'RUT', w: 90 },
      { label: 'Nombre', w: 213 },
      { label: 'Goles', w: 60 },
      { label: 'Amar.', w: 50 },
      { label: 'Rojas', w: 44 },
    ];
    const rowH = 20;

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
      doc.fillColor('black').text(c.label, x + 3, y + 6, { width: c.w - 6 });
      x += c.w;
    }
    y += rowH;

    // Filas. Si no hay jugadores, dibujamos 14 filas vacías para escribir a mano.
    const filas =
      jugadores.length > 0
        ? jugadores
        : Array.from({ length: 14 }, () => ({ numero: null, rut: null, nombre: '', capitan: false }));

    doc.font('Helvetica').fontSize(9);
    for (const j of filas) {
      if (y + rowH > 800) {
        doc.addPage();
        y = 36;
      }
      x = left;
      // Bordes de celda.
      let cx = left;
      for (const c of cols) {
        doc.rect(cx, y, c.w, rowH).stroke();
        cx += c.w;
      }
      // Contenido de las 3 primeras columnas.
      const valores = [
        j.numero != null ? String(j.numero) : '',
        j.rut ?? '',
        j.nombre + (j.capitan ? '  (C)' : ''),
      ];
      x = left;
      valores.forEach((v, i) => {
        doc.text(v, x + 3, y + 6, { width: cols[i]!.w - 6, ellipsis: true });
        x += cols[i]!.w;
      });
      y += rowH;
    }
    doc.y = y;
  }
}
