import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/**
 * FLY — Renderiza el flyer semanal del delegado en PDF (pdfkit). UNA hoja
 * A4 por torneo (si el club juega en varios, cada torneo va en su página).
 * Cada torneo muestra la próxima fecha (fixture), los resultados de la
 * última jugada y la tabla de posiciones. El partido / la fila del propio
 * club se resaltan para que el delegado se ubique de un vistazo.
 *
 * Solo texto y formas simples: Helvetica, sin emojis ni degradados — es lo
 * que la fuente estándar de pdfkit puede imprimir de forma confiable.
 */

export interface FlyerMatch {
  local: string;
  visita: string;
  fechaHora: string | null;
  cancha: string | null;
  golesLocal: number | null;
  golesVisita: number | null;
  esDelClub: boolean;
}

export interface FlyerTablaRow {
  posicion: number;
  equipo: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
  esDelClub: boolean;
}

export interface FlyerTorneo {
  torneoNombre: string;
  subtitulo: string | null;
  proximaTitulo: string | null;
  proxima: FlyerMatch[];
  ultimaTitulo: string | null;
  ultima: FlyerMatch[];
  tabla: FlyerTablaRow[];
}

export interface FlyerData {
  ligaNombre: string;
  clubNombre: string | null;
  semanaLabel: string;
  torneos: FlyerTorneo[];
}

// Colores fijos de marca LigaPlus (es un documento impreso/adjunto, no
// una UI adaptable a tema — los colores son literales).
const VERDE = '#0F2A1F';
const MENTA = '#84CCA8';
const MENTA_LIGHT = '#EAF6F0';
const NARANJA = '#F06C24';
const CREMA = '#F0EFE6';
const GRIS = '#6b7280';
const GRIS_CLARO = '#9ca3af';
const INK = '#1f2937';
const LINEA = '#f0eee7';

const M = 40; // margen del contenido
const CONTENT_R = 555; // borde derecho del contenido (A4 595 - 40)
const CONTENT_W = CONTENT_R - M; // 515

type Doc = PDFKit.PDFDocument;

interface Col {
  key: keyof FlyerTablaRow | 'header';
  x: number;
  w: number;
  align: 'left' | 'right';
  header: string;
}

const COLS: Col[] = [
  { key: 'posicion', x: 44, w: 20, align: 'left', header: '#' },
  { key: 'equipo', x: 66, w: 180, align: 'left', header: 'Equipo' },
  { key: 'pj', x: 250, w: 26, align: 'right', header: 'PJ' },
  { key: 'pg', x: 280, w: 26, align: 'right', header: 'PG' },
  { key: 'pe', x: 310, w: 26, align: 'right', header: 'PE' },
  { key: 'pp', x: 340, w: 26, align: 'right', header: 'PP' },
  { key: 'gf', x: 380, w: 26, align: 'right', header: 'GF' },
  { key: 'gc', x: 410, w: 26, align: 'right', header: 'GC' },
  { key: 'dg', x: 440, w: 30, align: 'right', header: 'DG' },
  { key: 'pts', x: 485, w: 45, align: 'right', header: 'Pts' },
];

@Injectable()
export class FlyerPdfService {
  generar(data: FlyerData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: M });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const nuevaPagina = (): void => this.dibujarCabecera(doc, data);

    this.dibujarCabecera(doc, data);

    if (data.torneos.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(GRIS)
        .text(
          'El club no está inscrito en torneos activos esta semana.',
          M,
          doc.y + 10,
          { width: CONTENT_W },
        );
    }

    data.torneos.forEach((t, i) => {
      if (i > 0) {
        doc.addPage();
        this.dibujarCabecera(doc, data);
      }
      this.dibujarTorneo(doc, t, nuevaPagina);
    });

    this.dibujarPie(doc);

    doc.end();
    return done;
  }

  private dibujarCabecera(doc: Doc, data: FlyerData): void {
    doc.rect(0, 0, doc.page.width, 74).fill(VERDE);
    doc
      .font('Helvetica-Bold')
      .fontSize(19)
      .fillColor('#ffffff')
      .text('LigaPlus', M, 18);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MENTA)
      .text(data.ligaNombre, M, 43, { width: 260 });

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(MENTA)
      .text('FIXTURE SEMANAL', 320, 17, {
        width: 228,
        align: 'right',
        characterSpacing: 1,
      });
    if (data.clubNombre) {
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#ffffff')
        .text(data.clubNombre, 300, 31, { width: 248, align: 'right' });
    }
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#b8d8c8')
      .text(data.semanaLabel, 300, 49, { width: 248, align: 'right' });

    doc.fillColor(INK);
    doc.x = M;
    doc.y = 92;
  }

  private dibujarTorneo(doc: Doc, t: FlyerTorneo, nuevaPagina: () => void): void {
    this.ensureSpace(doc, 70, nuevaPagina);
    const y0 = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(VERDE)
      .text(t.torneoNombre, M, y0, { width: CONTENT_W });
    if (t.subtitulo) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(GRIS)
        .text(t.subtitulo, M, doc.y + 1, { width: CONTENT_W });
    }
    doc.rect(M, doc.y + 6, 46, 3).fill(NARANJA);
    doc.y = doc.y + 18;

    // Próxima fecha
    this.dibujarEyebrow(
      doc,
      `Próxima fecha${t.proximaTitulo ? ` · ${t.proximaTitulo}` : ''}`,
      nuevaPagina,
    );
    if (t.proxima.length === 0) {
      this.dibujarVacio(doc, 'No hay partidos programados.');
    } else {
      for (const m of t.proxima) this.dibujarPartido(doc, m, false, nuevaPagina);
    }

    // Resultados última fecha
    doc.y += 8;
    this.dibujarEyebrow(
      doc,
      `Resultados${t.ultimaTitulo ? ` · ${t.ultimaTitulo}` : ''}`,
      nuevaPagina,
    );
    if (t.ultima.length === 0) {
      this.dibujarVacio(doc, 'Sin resultados aún.');
    } else {
      for (const m of t.ultima) this.dibujarPartido(doc, m, true, nuevaPagina);
    }

    // Tabla de posiciones
    doc.y += 8;
    this.dibujarEyebrow(doc, 'Tabla de posiciones', nuevaPagina);
    this.dibujarTabla(doc, t.tabla, nuevaPagina);
  }

  private dibujarEyebrow(doc: Doc, texto: string, nuevaPagina: () => void): void {
    this.ensureSpace(doc, 34, nuevaPagina);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(NARANJA)
      .text(texto.toUpperCase(), M, doc.y, { characterSpacing: 1, width: CONTENT_W });
    doc.y += 4;
  }

  private dibujarVacio(doc: Doc, texto: string): void {
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor(GRIS)
      .text(texto, M + 8, doc.y + 2, { width: CONTENT_W - 8 });
    doc.y += 4;
  }

  private dibujarPartido(
    doc: Doc,
    m: FlyerMatch,
    conResultado: boolean,
    nuevaPagina: () => void,
  ): void {
    const rowH = 30;
    this.ensureSpace(doc, rowH + 2, nuevaPagina);
    const y = doc.y;

    if (m.esDelClub) {
      doc.roundedRect(M, y - 1, CONTENT_W, rowH, 4).fill(MENTA_LIGHT);
    }

    const color = m.esDelClub ? VERDE : INK;
    const nombreFont = m.esDelClub ? 'Helvetica-Bold' : 'Helvetica';

    doc
      .font(nombreFont)
      .fontSize(12)
      .fillColor(color)
      .text(m.local, M + 8, y + 3, { width: 197, align: 'right' });
    doc
      .font(nombreFont)
      .fontSize(12)
      .fillColor(color)
      .text(m.visita, 343, y + 3, { width: 197, align: 'left' });

    const mid =
      conResultado && m.golesLocal != null && m.golesVisita != null
        ? `${m.golesLocal} - ${m.golesVisita}`
        : 'vs';
    doc
      .font(conResultado ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(conResultado ? 13 : 11)
      .fillColor(conResultado ? VERDE : GRIS)
      .text(mid, 261, y + 3, { width: 74, align: 'center' });

    if (!conResultado) {
      const meta = this.horaCancha(m);
      if (m.esDelClub) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(GRIS)
          .text(meta, M + 8, y + 18, { width: 300, align: 'left' });
        const tag = 'TU EQUIPO';
        doc.font('Helvetica-Bold').fontSize(7);
        const tw = doc.widthOfString(tag) + 10;
        doc.roundedRect(CONTENT_R - 8 - tw, y + 16, tw, 12, 6).fill(MENTA);
        doc
          .fillColor(VERDE)
          .text(tag, CONTENT_R - 8 - tw, y + 18.5, { width: tw, align: 'center' });
      } else {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(GRIS_CLARO)
          .text(meta, M + 8, y + 18, { width: CONTENT_W - 16, align: 'center' });
      }
    }

    if (!m.esDelClub) {
      doc
        .moveTo(M + 8, y + rowH - 2)
        .lineTo(CONTENT_R - 8, y + rowH - 2)
        .lineWidth(0.5)
        .strokeColor(LINEA)
        .stroke();
    }
    doc.y = y + rowH;
  }

  private dibujarTabla(
    doc: Doc,
    filas: FlyerTablaRow[],
    nuevaPagina: () => void,
  ): void {
    if (filas.length === 0) {
      this.dibujarVacio(doc, 'Sin partidos jugados todavía.');
      return;
    }
    const rowH = 17;
    this.ensureSpace(doc, rowH * 2, nuevaPagina);

    // Encabezado de la tabla.
    let y = doc.y;
    doc.rect(M, y, CONTENT_W, rowH).fill(CREMA);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(VERDE);
    for (const c of COLS) {
      doc.text(c.header, c.x, y + 5, { width: c.w, align: c.align });
    }
    y += rowH;
    doc.y = y;

    for (const f of filas) {
      this.ensureSpace(doc, rowH + 2, nuevaPagina);
      y = doc.y;
      if (f.esDelClub) {
        doc.rect(M, y, CONTENT_W, rowH).fill(MENTA_LIGHT);
      }
      const color = f.esDelClub ? VERDE : INK;
      for (const c of COLS) {
        if (c.key === 'header') continue;
        const raw = f[c.key];
        const val =
          c.key === 'dg'
            ? f.dg > 0
              ? `+${f.dg}`
              : String(f.dg)
            : String(raw);
        const bold = f.esDelClub || c.key === 'pts';
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9.5)
          .fillColor(c.key === 'pts' ? VERDE : color)
          .text(val, c.x, y + 5, {
            width: c.w,
            align: c.align,
            ellipsis: c.key === 'equipo',
          });
      }
      doc
        .moveTo(M, y + rowH)
        .lineTo(CONTENT_R, y + rowH)
        .lineWidth(0.5)
        .strokeColor(LINEA)
        .stroke();
      doc.y = y + rowH;
    }
    doc.y += 4;
  }

  private dibujarPie(doc: Doc): void {
    const y = doc.page.height - 42;
    doc
      .moveTo(M, y)
      .lineTo(CONTENT_R, y)
      .lineWidth(0.5)
      .strokeColor('#ece9e0')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GRIS_CLARO)
      .text(
        'Generado automáticamente por LigaPlus · ligaplus.cl',
        M,
        y + 6,
        { width: CONTENT_W, align: 'center' },
      );
  }

  private horaCancha(m: FlyerMatch): string {
    const hora = m.fechaHora
      ? new Intl.DateTimeFormat('es-CL', {
          timeZone: 'America/Santiago',
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(m.fechaHora))
      : 'Horario por confirmar';
    return m.cancha ? `${hora} · ${m.cancha}` : hora;
  }

  private ensureSpace(doc: Doc, needed: number, nuevaPagina: () => void): void {
    if (doc.y + needed > doc.page.height - 50) {
      doc.addPage();
      nuevaPagina();
    }
  }
}
