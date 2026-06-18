import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';

import { limpiarRut } from '@fixtura/types';

import { Fecha } from '../../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { PartidoJugador } from '../../competition/entities/partido-jugador.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

interface FilaJugador {
  jugadorId: string;
  numero: number | null;
  rut: string | null;
  nombre: string;
  capitan: boolean;
  // Solo cuando el acta está cerrada (se completa desde el acta).
  presente?: boolean;
  goles?: number;
  amarillas?: number;
  rojas?: number;
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
    @InjectRepository(PartidoJugador)
    private readonly partidoJugadorRepo: Repository<PartidoJugador>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
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

    // Acta cerrada: la plantilla deja de ser una hoja en blanco y se completa
    // con lo registrado en el acta — presencia certificada (✓) y goles /
    // amarillas / rojas por jugador (desde las incidencias).
    const cerrada = !!partido.actaCerradaAt;
    if (cerrada) {
      await this.completarConActa(partidoId, tenantId, [
        ...local.jugadores,
        ...visita.jugadores,
      ]);
    }

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
      cerrada,
      golesLocal: partido.golesLocal,
      golesVisita: partido.golesVisita,
      local,
      visita,
    });
  }

  /**
   * Enriquece las filas con la info del acta: presencia certificada y conteo
   * de goles / amarillas / rojas por jugador. Muta las filas recibidas.
   */
  private async completarConActa(
    partidoId: string,
    tenantId: string,
    filas: FilaJugador[],
  ): Promise<void> {
    const presentes = await this.partidoJugadorRepo.find({
      where: { partidoId, tenantId },
    });
    const presenteMap = new Map(presentes.map((p) => [p.jugadorId, p.presente]));

    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId, tenantId },
    });
    const statsMap = new Map<string, { goles: number; amarillas: number; rojas: number }>();
    for (const inc of incidencias) {
      if (!inc.jugadorId) continue;
      const s = statsMap.get(inc.jugadorId) ?? { goles: 0, amarillas: 0, rojas: 0 };
      if (inc.tipo === 'GOL') s.goles += 1;
      else if (inc.tipo === 'AMARILLA') s.amarillas += 1;
      else if (inc.tipo === 'ROJA' || inc.tipo === 'AMARILLA_ROJA') s.rojas += 1;
      statsMap.set(inc.jugadorId, s);
    }

    for (const f of filas) {
      f.presente = presenteMap.get(f.jugadorId) ?? false;
      const s = statsMap.get(f.jugadorId);
      f.goles = s?.goles ?? 0;
      f.amarillas = s?.amarillas ?? 0;
      f.rojas = s?.rojas ?? 0;
    }
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
        jugadorId: p.jugador!.id,
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
    cerrada: boolean;
    golesLocal: number | null;
    golesVisita: number | null;
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
    this.dibujarEquipo(doc, data.local.nombre, data.local.jugadores, data.cerrada);
    this.dibujarFirmas(doc, 'Capitán local', data.cerrada);

    // Hoja 2 — equipo visita (hoja independiente).
    doc.addPage();
    this.dibujarEncabezado(doc, data, 'VISITA');
    this.dibujarEquipo(doc, data.visita.nombre, data.visita.jugadores, data.cerrada);
    this.dibujarFirmas(doc, 'Capitán visita', data.cerrada);

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
      cerrada: boolean;
      golesLocal: number | null;
      golesVisita: number | null;
      local: { nombre: string };
      visita: { nombre: string };
    },
    lado: 'LOCAL' | 'VISITA',
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('black')
      .text(data.cerrada ? 'Acta del partido' : 'Plantilla física del partido', {
        align: 'center',
      });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `${data.torneoNombre} · Fecha ${data.fechaNumero}${data.fechaEtiqueta ? ` — ${data.fechaEtiqueta}` : ''}`,
        { align: 'center' },
      );
    // Acta cerrada: mostramos el marcador final entre los nombres.
    const marcador =
      data.cerrada && data.golesLocal != null && data.golesVisita != null
        ? `  ${data.golesLocal} : ${data.golesVisita}  `
        : '  vs  ';
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(`${data.local.nombre}${marcador}${data.visita.nombre}`, { align: 'center' });
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

  private dibujarFirmas(
    doc: PDFKit.PDFDocument,
    capitanLabel: string,
    cerrada: boolean,
  ): void {
    doc.moveDown(2);
    const y = doc.y > 720 ? 720 : doc.y;
    doc.fontSize(9).font('Helvetica').fillColor('black');
    if (cerrada) {
      // Acta cerrada: ya está certificada en el sistema; no se firma a mano.
      doc
        .fontSize(8)
        .font('Helvetica-Oblique')
        .fillColor('#555')
        .text(
          'Acta cerrada — registro oficial generado desde el sistema. Marcador y novedades reflejan lo cargado en el acta.',
          36,
          y,
          { width: 523 },
        );
      doc.fillColor('black');
      return;
    }
    doc.text('______________________', 70, y);
    doc.text('Árbitro', 70, y + 14);
    doc.text('______________________', 330, y);
    doc.text(capitanLabel, 330, y + 14);
  }

  private dibujarEquipo(
    doc: PDFKit.PDFDocument,
    nombre: string,
    jugadores: FilaJugador[],
    cerrada: boolean,
  ): void {
    const left = 36;
    const right = 559; // A4 width 595 - margin 36
    // Abierta: hoja en blanco para llenar a mano (incluye columna Firma).
    // Cerrada: se completa con el acta — columna Pres. (✓) y conteos.
    const cols = cerrada
      ? [
          { label: 'N°', w: 26 },
          { label: 'RUT', w: 78 },
          { label: 'Nombre', w: 185 },
          { label: 'Pres.', w: 42 },
          { label: 'Goles', w: 64 },
          { label: 'Amar.', w: 64 },
          { label: 'Rojas', w: 64 },
        ]
      : [
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

    // Filas. Si está abierta y no hay jugadores, 16 filas vacías para llenar.
    const filas: FilaJugador[] =
      jugadores.length > 0
        ? jugadores
        : cerrada
          ? []
          : Array.from({ length: 16 }, () => ({
              jugadorId: '',
              numero: null,
              rut: null,
              nombre: '',
              capitan: false,
            }));

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
      const num = (n: number | undefined): string => (n && n > 0 ? String(n) : '');
      const valores = cerrada
        ? [
            j.numero != null ? String(j.numero) : '',
            j.rut ?? '',
            j.nombre + (j.capitan ? '  (C)' : ''),
            j.presente ? 'Sí' : '—',
            num(j.goles),
            num(j.amarillas),
            num(j.rojas),
          ]
        : [
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
