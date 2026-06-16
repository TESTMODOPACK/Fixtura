import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';

export interface ColumnaPdf {
  label: string;
  /** Ancho en puntos. La suma debe caber en el ancho útil (~770 landscape). */
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface TablaPdfArgs {
  titulo: string;
  subtitulo?: string;
  columnas: ColumnaPdf[];
  filas: string[][];
}

/**
 * Render genérico de un informe tabular a PDF (pdfkit), con membrete de la
 * liga. Mismo enfoque que la plantilla física: se arma en memoria y se
 * devuelve un Buffer que el controller envía con Content-Type application/pdf.
 */
@Injectable()
export class InformesPdfService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  private async nombreLiga(tenantId: string): Promise<string> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const branding = (t?.brandingJson ?? {}) as { nombreComercial?: string };
    return branding.nombreComercial || t?.nombre || 'Liga';
  }

  async tabla(tenantId: string, args: TablaPdfArgs): Promise<Buffer> {
    const liga = await this.nombreLiga(tenantId);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const generado = new Date().toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
    });

    // ── Membrete ──
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#0f3d2e')
      .text(liga.toUpperCase(), left, doc.page.margins.top);
    doc
      .fontSize(13)
      .fillColor('black')
      .text(args.titulo, { continued: false });
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666666')
      .text(
        `${args.subtitulo ? args.subtitulo + ' · ' : ''}Generado: ${generado}`,
      );
    doc.moveDown(0.6);

    const rowH = 18;
    const drawHeader = (): void => {
      const y = doc.y;
      doc.rect(left, y, right - left, rowH).fill('#0f3d2e');
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
      let x = left;
      for (const col of args.columnas) {
        doc.text(col.label, x + 4, y + 5, {
          width: col.width - 8,
          align: col.align ?? 'left',
          ellipsis: true,
        });
        x += col.width;
      }
      doc.y = y + rowH;
    };

    drawHeader();

    doc.font('Helvetica').fontSize(8);
    let zebra = false;
    for (const fila of args.filas) {
      if (doc.y + rowH > bottom) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(8);
      }
      const y = doc.y;
      if (zebra) {
        doc.rect(left, y, right - left, rowH).fill('#f4f1e8');
      }
      zebra = !zebra;
      doc.fillColor('black');
      let x = left;
      args.columnas.forEach((col, i) => {
        doc.text(fila[i] ?? '', x + 4, y + 5, {
          width: col.width - 8,
          align: col.align ?? 'left',
          ellipsis: true,
        });
        x += col.width;
      });
      // línea inferior
      doc
        .strokeColor('#d5cdb8')
        .lineWidth(0.5)
        .moveTo(left, y + rowH)
        .lineTo(right, y + rowH)
        .stroke();
      doc.y = y + rowH;
    }

    if (args.filas.length === 0) {
      doc
        .moveDown(1)
        .fillColor('#666666')
        .font('Helvetica-Oblique')
        .fontSize(10)
        .text('Sin datos para los filtros seleccionados.', left, doc.y);
    }

    doc.end();
    return done;
  }
}
