import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import {
  CreatePlantillaSchema,
  DispararEncuestaSchema,
  ReordenarPreguntasSchema,
  ResponderEncuestaSchema,
  TIPOS_OPCION,
  UpdatePlantillaSchema,
  UpsertPreguntaSchema,
  type DispararEncuestaResultado,
  type EncuestaPublica,
  type PlantillaEncuesta as PlantillaDto,
  type PreguntaEncuesta as PreguntaDto,
  type ResumenEncuesta,
  type ResumenPregunta,
} from '@fixtura/types';

import { Club } from '../../competition/entities/club.entity';
import { EnvioEncuesta } from '../../competition/entities/envio-encuesta.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { PlantillaEncuesta } from '../../competition/entities/plantilla-encuesta.entity';
import { PreguntaEncuesta } from '../../competition/entities/pregunta-encuesta.entity';
import { RespuestaEncuesta } from '../../competition/entities/respuesta-encuesta.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { EmailService } from '../../email/email.service';

interface EncuestaTokenPayload {
  type: 'encuesta_response';
  envioId: string;
  tenantId: string;
}

/**
 * Encuestas configurables (ADR-0011). El admin arma plantillas con sus
 * preguntas y las dispara por torneo a los clubes; el delegado responde desde
 * un link con token firmado (sin login). Resumen dinámico por pregunta + score
 * NPS si hay una pregunta marcada esNps.
 */
@Injectable()
export class EncuestasService {
  private readonly log = new Logger(EncuestasService.name);

  constructor(
    @InjectRepository(PlantillaEncuesta)
    private readonly plantillaRepo: Repository<PlantillaEncuesta>,
    @InjectRepository(PreguntaEncuesta)
    private readonly preguntaRepo: Repository<PreguntaEncuesta>,
    @InjectRepository(EnvioEncuesta)
    private readonly envioRepo: Repository<EnvioEncuesta>,
    @InjectRepository(RespuestaEncuesta)
    private readonly respuestaRepo: Repository<RespuestaEncuesta>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscripcionRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ── Token + RLS ──────────────────────────────────────────────────────

  private signToken(payload: EncuestaTokenPayload): string {
    return this.jwt.sign(payload, { expiresIn: '30d' });
  }

  private verifyToken(token: string): EncuestaTokenPayload | null {
    try {
      const d = this.jwt.verify<EncuestaTokenPayload>(token);
      if (d.type !== 'encuesta_response' || !d.envioId || !d.tenantId) return null;
      return d;
    } catch {
      return null;
    }
  }

  private async setTenant(tenantId: string): Promise<void> {
    await this.dataSource.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
  }

  // ── Mapeo a DTO ──────────────────────────────────────────────────────

  private preguntaToDto(p: PreguntaEncuesta): PreguntaDto {
    return {
      id: p.id,
      orden: p.orden,
      texto: p.texto,
      tipo: p.tipo,
      opciones: Array.isArray(p.opciones) ? p.opciones : [],
      obligatoria: p.obligatoria,
      esNps: p.esNps,
    };
  }

  private async plantillaToDto(p: PlantillaEncuesta, tenantId: string): Promise<PlantillaDto> {
    const preguntas = await this.preguntaRepo.find({
      where: { plantillaId: p.id, tenantId },
      order: { orden: 'ASC' },
    });
    const [totalEnviadas, totalRespondidas] = await Promise.all([
      this.envioRepo.count({ where: { plantillaId: p.id, tenantId } }),
      this.envioRepo.count({ where: { plantillaId: p.id, tenantId, estado: 'RESPONDIDA' } }),
    ]);
    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      estado: p.estado,
      preguntas: preguntas.map((q) => this.preguntaToDto(q)),
      totalEnviadas,
      totalRespondidas,
      createdAt: p.createdAt.toISOString(),
    };
  }

  // ── CRUD plantillas (admin) ──────────────────────────────────────────

  async listar(tenantId: string): Promise<PlantillaDto[]> {
    const plantillas = await this.plantillaRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(plantillas.map((p) => this.plantillaToDto(p, tenantId)));
  }

  async crear(tenantId: string, body: unknown): Promise<PlantillaDto> {
    const input = CreatePlantillaSchema.parse(body);
    const plantilla = await this.plantillaRepo.save(
      this.plantillaRepo.create({
        tenantId,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        estado: 'BORRADOR',
      }),
    );
    return this.plantillaToDto(plantilla, tenantId);
  }

  /** Crea una plantilla de arranque equivalente al NPS clásico. */
  async crearEjemplo(tenantId: string): Promise<PlantillaDto> {
    const plantilla = await this.plantillaRepo.save(
      this.plantillaRepo.create({
        tenantId,
        nombre: 'Satisfacción del torneo',
        descripcion: 'Encuesta de satisfacción para los clubes al cierre del torneo.',
        estado: 'BORRADOR',
      }),
    );
    const preguntas: Array<{ texto: string; tipo: PreguntaEncuesta['tipo']; esNps: boolean }> = [
      { texto: '¿Qué tan probable es que recomiendes la liga a otro club?', tipo: 'NPS_0_10', esNps: true },
      { texto: '¿Cómo evalúas el arbitraje?', tipo: 'ESCALA_1_5', esNps: false },
      { texto: '¿Cómo evalúas los recintos?', tipo: 'ESCALA_1_5', esNps: false },
      { texto: '¿Cómo evalúas la organización?', tipo: 'ESCALA_1_5', esNps: false },
      { texto: 'Comentarios o sugerencias (opcional)', tipo: 'TEXTO', esNps: false },
    ];
    let orden = 0;
    for (const p of preguntas) {
      await this.preguntaRepo.save(
        this.preguntaRepo.create({
          tenantId,
          plantillaId: plantilla.id,
          orden: orden++,
          texto: p.texto,
          tipo: p.tipo,
          opciones: [],
          obligatoria: p.esNps,
          esNps: p.esNps,
        }),
      );
    }
    return this.plantillaToDto(plantilla, tenantId);
  }

  private async getPlantilla(tenantId: string, id: string): Promise<PlantillaEncuesta> {
    const p = await this.plantillaRepo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Encuesta no encontrada.');
    return p;
  }

  async actualizar(tenantId: string, id: string, body: unknown): Promise<PlantillaDto> {
    const input = UpdatePlantillaSchema.parse(body);
    const p = await this.getPlantilla(tenantId, id);
    if (input.nombre !== undefined) p.nombre = input.nombre;
    if (input.descripcion !== undefined) p.descripcion = input.descripcion;
    if (input.estado !== undefined) p.estado = input.estado;
    await this.plantillaRepo.save(p);
    return this.plantillaToDto(p, tenantId);
  }

  async eliminar(tenantId: string, id: string): Promise<{ ok: boolean }> {
    await this.getPlantilla(tenantId, id);
    // ON DELETE CASCADE arrastra preguntas, envíos y respuestas.
    await this.plantillaRepo.delete({ id, tenantId });
    return { ok: true };
  }

  // ── CRUD preguntas (admin) ───────────────────────────────────────────

  async agregarPregunta(tenantId: string, plantillaId: string, body: unknown): Promise<PlantillaDto> {
    await this.getPlantilla(tenantId, plantillaId);
    const input = UpsertPreguntaSchema.parse(body);
    await this.aplicarEsNps(tenantId, plantillaId, input.esNps, null);
    const max = await this.preguntaRepo.maximum('orden', { plantillaId, tenantId });
    await this.preguntaRepo.save(
      this.preguntaRepo.create({
        tenantId,
        plantillaId,
        orden: (max ?? -1) + 1,
        texto: input.texto,
        tipo: input.tipo,
        opciones: TIPOS_OPCION.includes(input.tipo) ? input.opciones : [],
        obligatoria: input.obligatoria,
        esNps: input.esNps && input.tipo === 'NPS_0_10',
      }),
    );
    return this.plantillaToDto(await this.getPlantilla(tenantId, plantillaId), tenantId);
  }

  async actualizarPregunta(tenantId: string, preguntaId: string, body: unknown): Promise<PlantillaDto> {
    const pregunta = await this.preguntaRepo.findOne({ where: { id: preguntaId, tenantId } });
    if (!pregunta) throw new NotFoundException('Pregunta no encontrada.');
    const input = UpsertPreguntaSchema.parse(body);
    await this.aplicarEsNps(tenantId, pregunta.plantillaId, input.esNps, preguntaId);
    pregunta.texto = input.texto;
    pregunta.tipo = input.tipo;
    pregunta.opciones = TIPOS_OPCION.includes(input.tipo) ? input.opciones : [];
    pregunta.obligatoria = input.obligatoria;
    pregunta.esNps = input.esNps && input.tipo === 'NPS_0_10';
    await this.preguntaRepo.save(pregunta);
    return this.plantillaToDto(await this.getPlantilla(tenantId, pregunta.plantillaId), tenantId);
  }

  async eliminarPregunta(tenantId: string, preguntaId: string): Promise<PlantillaDto> {
    const pregunta = await this.preguntaRepo.findOne({ where: { id: preguntaId, tenantId } });
    if (!pregunta) throw new NotFoundException('Pregunta no encontrada.');
    await this.preguntaRepo.delete({ id: preguntaId, tenantId });
    return this.plantillaToDto(await this.getPlantilla(tenantId, pregunta.plantillaId), tenantId);
  }

  async reordenar(tenantId: string, plantillaId: string, body: unknown): Promise<PlantillaDto> {
    await this.getPlantilla(tenantId, plantillaId);
    const input = ReordenarPreguntasSchema.parse(body);
    // Usamos el repo (no dataSource.transaction): los repos heredan la tx + el
    // contexto RLS del request. dataSource.transaction abre una conexión sin
    // app.current_tenant_id y, con RLS FORCE, el UPDATE no toca ninguna fila.
    let orden = 0;
    for (const preguntaId of input.preguntaIds) {
      await this.preguntaRepo.update({ id: preguntaId, tenantId, plantillaId }, { orden });
      orden += 1;
    }
    return this.plantillaToDto(await this.getPlantilla(tenantId, plantillaId), tenantId);
  }

  /** Solo una pregunta esNps por plantilla: desmarca las otras al marcar una. */
  private async aplicarEsNps(
    tenantId: string,
    plantillaId: string,
    esNps: boolean,
    exceptoId: string | null,
  ): Promise<void> {
    if (!esNps) return;
    const otras = await this.preguntaRepo.find({ where: { plantillaId, tenantId, esNps: true } });
    for (const o of otras) {
      if (o.id !== exceptoId) {
        o.esNps = false;
        await this.preguntaRepo.save(o);
      }
    }
  }

  // ── Disparo (admin) ──────────────────────────────────────────────────

  private emailDelClub(club: Club): string | null {
    if (club.presidenteEmail && club.presidenteEmail.trim()) return club.presidenteEmail.trim();
    const delegado = (club.delegados ?? []).find((d) => d.email && d.email.trim());
    return delegado?.email?.trim() ?? null;
  }

  async disparar(tenantId: string, body: unknown): Promise<DispararEncuestaResultado> {
    const input = DispararEncuestaSchema.parse(body);
    const plantilla = await this.getPlantilla(tenantId, input.plantillaId);
    if (plantilla.estado !== 'ACTIVA') {
      throw new BadRequestException('Activa la encuesta antes de dispararla.');
    }
    const preguntas = await this.preguntaRepo.count({
      where: { plantillaId: plantilla.id, tenantId },
    });
    if (preguntas === 0) {
      throw new BadRequestException('La encuesta no tiene preguntas. Agrega al menos una.');
    }

    const torneo = await this.torneoRepo.findOne({ where: { id: input.torneoId, tenantId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado.');
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const liga = tenant?.nombre ?? 'la liga';

    const inscripciones = await this.inscripcionRepo.find({
      where: { torneoId: input.torneoId, tenantId },
      relations: { club: true },
    });
    const clubesUnicos = new Map<string, Club>();
    for (const ins of inscripciones) {
      if (ins.club && !clubesUnicos.has(ins.clubId)) clubesUnicos.set(ins.clubId, ins.club);
    }

    let enviadas = 0;
    let sinEmail = 0;
    let yaEnviadas = 0;

    for (const [clubId, club] of clubesUnicos) {
      try {
        const existente = await this.envioRepo.findOne({
          where: { tenantId, plantillaId: plantilla.id, torneoId: input.torneoId, clubId },
        });
        if (existente) {
          yaEnviadas += 1;
          continue;
        }
        const email = this.emailDelClub(club);
        if (!email) {
          sinEmail += 1;
          continue;
        }
        let envio = await this.envioRepo.save(
          this.envioRepo.create({
            tenantId,
            plantillaId: plantilla.id,
            torneoId: input.torneoId,
            clubId,
            emailDestino: email,
            token: '',
            estado: 'PENDIENTE',
          }),
        );
        envio.token = this.signToken({ type: 'encuesta_response', envioId: envio.id, tenantId });
        envio.enviadaAt = new Date();
        envio = await this.envioRepo.save(envio);
        try {
          await this.enviarEmail(email, liga, club.nombre, torneo.nombre, plantilla.nombre, envio.token);
          enviadas += 1;
        } catch (errEmail) {
          // El email no salió: borramos el envío para que el próximo disparo lo
          // reintente, en vez de contarlo como "ya enviado" para siempre.
          await this.envioRepo.delete({ id: envio.id, tenantId });
          sinEmail += 1;
          this.log.warn(
            `Encuesta ${plantilla.id} club ${clubId}: email no salió — ${(errEmail as Error).message}`,
          );
        }
      } catch (err) {
        this.log.warn(`Encuesta ${plantilla.id} club ${clubId}: ${(err as Error).message}`);
      }
    }
    return { enviadas, sinEmail, yaEnviadas };
  }

  private async enviarEmail(
    to: string,
    liga: string,
    club: string,
    torneo: string,
    encuesta: string,
    token: string,
  ): Promise<void> {
    const frontUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const link = `${frontUrl}/nps/responder?token=${token}`;
    const esc = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safe = { liga: esc(liga), club: esc(club), torneo: esc(torneo), encuesta: esc(encuesta) };
    const subject = `${encuesta} — ${torneo}`;
    const html = `
      <!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1ece2;padding:24px;margin:0;">
        <div style="max-width:560px;margin:0 auto;background:white;border-radius:8px;padding:32px;border:1px solid #e5e0d3;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0F2A1F;font-weight:bold;margin-bottom:8px;">→ ${safe.torneo.toUpperCase()}</div>
          <h1 style="margin:0 0 16px 0;font-size:24px;color:#0F2A1F;line-height:1.2;">${safe.club},<br>${safe.encuesta}</h1>
          <p style="color:#1a1a1a;line-height:1.5;">En ${safe.liga} queremos tu opinión. Te tomará menos de un minuto.</p>
          <div style="margin:24px 0;padding:16px;background:#f1ece2;border-radius:6px;text-align:center;">
            <a href="${link}" style="display:inline-block;background:#E76F26;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;">Responder la encuesta</a>
          </div>
          <p style="font-size:12px;color:#777;line-height:1.4;">El enlace es personal y expira en 30 días.</p>
          <hr style="margin:24px 0;border:0;border-top:1px solid #e5e0d3;">
          <p style="font-size:11px;color:#777;margin:0;">Encuesta automática de LigaPlus. No respondas a esta dirección.</p>
        </div>
      </body></html>`;
    const text = `${club}, ${encuesta}\n\nEn ${liga} queremos tu opinión. Responder: ${link}\n\n(El enlace expira en 30 días.)`;
    await this.email.send({ to, subject, html, text });
  }

  // ── Público (token, sin login) ───────────────────────────────────────

  async infoPorToken(token: string): Promise<EncuestaPublica> {
    const payload = this.verifyToken(token);
    if (!payload) throw new BadRequestException('Enlace inválido o expirado.');
    await this.setTenant(payload.tenantId);

    const envio = await this.envioRepo.findOne({
      where: { id: payload.envioId, tenantId: payload.tenantId },
      relations: { club: true, torneo: true, plantilla: true },
    });
    if (!envio) throw new NotFoundException('Encuesta no encontrada.');
    const tenant = await this.tenantRepo.findOne({ where: { id: payload.tenantId } });
    const preguntas = await this.preguntaRepo.find({
      where: { plantillaId: envio.plantillaId, tenantId: payload.tenantId },
      order: { orden: 'ASC' },
    });

    return {
      liga: tenant?.nombre ?? 'la liga',
      club: envio.club?.nombre ?? '',
      torneo: envio.torneo?.nombre ?? '',
      yaRespondida: envio.estado === 'RESPONDIDA',
      nombre: envio.plantilla?.nombre ?? 'Encuesta',
      descripcion: envio.plantilla?.descripcion ?? null,
      preguntas: preguntas.map((p) => this.preguntaToDto(p)),
    };
  }

  async responderPorToken(
    token: string,
    body: unknown,
  ): Promise<{ ok: boolean; yaRespondida: boolean }> {
    const payload = this.verifyToken(token);
    if (!payload) throw new BadRequestException('Enlace inválido o expirado.');
    const parsed = ResponderEncuestaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Respuesta inválida.');

    await this.setTenant(payload.tenantId);
    const envio = await this.envioRepo.findOne({
      where: { id: payload.envioId, tenantId: payload.tenantId },
    });
    if (!envio) throw new NotFoundException('Encuesta no encontrada.');
    if (envio.estado === 'RESPONDIDA') return { ok: true, yaRespondida: true };

    const preguntas = await this.preguntaRepo.find({
      where: { plantillaId: envio.plantillaId, tenantId: payload.tenantId },
    });
    const respByPregunta = new Map(parsed.data.respuestas.map((r) => [r.preguntaId, r]));

    const filas: RespuestaEncuesta[] = [];
    for (const p of preguntas) {
      const r = respByPregunta.get(p.id);
      const opciones = r?.valorOpciones ?? [];
      const vacia =
        !r ||
        (r.valorNumero == null &&
          (!r.valorTexto || !r.valorTexto.trim()) &&
          opciones.length === 0);
      if (vacia) {
        if (p.obligatoria) throw new BadRequestException(`Falta responder: ${p.texto}`);
        continue;
      }
      const fila = this.respuestaRepo.create({
        tenantId: payload.tenantId,
        envioId: envio.id,
        preguntaId: p.id,
        valorNumero: null,
        valorTexto: null,
        valorOpciones: null,
      });
      if (p.tipo === 'NPS_0_10') {
        if (r!.valorNumero == null || r!.valorNumero < 0 || r!.valorNumero > 10) {
          throw new BadRequestException(`Respuesta fuera de rango (0-10): ${p.texto}`);
        }
        fila.valorNumero = r!.valorNumero;
      } else if (p.tipo === 'ESCALA_1_5') {
        if (r!.valorNumero == null || r!.valorNumero < 1 || r!.valorNumero > 5) {
          throw new BadRequestException(`Respuesta fuera de rango (1-5): ${p.texto}`);
        }
        fila.valorNumero = r!.valorNumero;
      } else if (p.tipo === 'SI_NO') {
        if (r!.valorNumero !== 0 && r!.valorNumero !== 1) {
          throw new BadRequestException(`Respuesta inválida (sí/no) en: ${p.texto}`);
        }
        fila.valorNumero = r!.valorNumero;
      } else if (p.tipo === 'OPCION_UNICA') {
        const op = opciones[0];
        if (opciones.length > 1 || !op || !p.opciones.includes(op)) {
          throw new BadRequestException(`Opción inválida en: ${p.texto}`);
        }
        fila.valorOpciones = [op];
      } else if (p.tipo === 'OPCION_MULTIPLE') {
        const ops = opciones.filter((o) => p.opciones.includes(o));
        if (ops.length === 0) {
          if (p.obligatoria) throw new BadRequestException(`Falta responder: ${p.texto}`);
          continue;
        }
        fila.valorOpciones = ops;
      } else {
        fila.valorTexto = (r!.valorTexto ?? '').trim().slice(0, 2000);
      }
      filas.push(fila);
    }

    if (filas.length > 0) await this.respuestaRepo.save(filas);
    envio.estado = 'RESPONDIDA';
    envio.respondidaAt = new Date();
    await this.envioRepo.save(envio);
    return { ok: true, yaRespondida: false };
  }

  // ── Resumen dinámico (admin) ─────────────────────────────────────────

  async resumen(tenantId: string, plantillaId: string): Promise<ResumenEncuesta> {
    const plantilla = await this.getPlantilla(tenantId, plantillaId);
    const preguntas = await this.preguntaRepo.find({
      where: { plantillaId, tenantId },
      order: { orden: 'ASC' },
    });

    const envios = await this.envioRepo.find({ where: { plantillaId, tenantId } });
    const totalEnviadas = envios.length;
    const respondidos = envios.filter((e) => e.estado === 'RESPONDIDA');
    const totalRespondidas = respondidos.length;
    const envioIds = respondidos.map((e) => e.id);

    const respuestas =
      envioIds.length > 0
        ? await this.respuestaRepo.find({ where: { tenantId, envioId: In(envioIds) } })
        : [];
    const porPregunta = new Map<string, RespuestaEncuesta[]>();
    for (const r of respuestas) {
      const arr = porPregunta.get(r.preguntaId) ?? [];
      arr.push(r);
      porPregunta.set(r.preguntaId, arr);
    }

    // Score NPS desde la pregunta marcada esNps.
    let scoreNps: number | null = null;
    let promotores = 0;
    let pasivos = 0;
    let detractores = 0;
    const preguntaNps = preguntas.find((p) => p.esNps && p.tipo === 'NPS_0_10');
    if (preguntaNps) {
      const nums = (porPregunta.get(preguntaNps.id) ?? [])
        .map((r) => r.valorNumero)
        .filter((v): v is number => v != null);
      for (const v of nums) {
        if (v >= 9) promotores += 1;
        else if (v >= 7) pasivos += 1;
        else detractores += 1;
      }
      scoreNps = nums.length > 0 ? Math.round(((promotores - detractores) / nums.length) * 100) : null;
    }

    const resumenPreguntas: ResumenPregunta[] = preguntas.map((p) => {
      const rs = porPregunta.get(p.id) ?? [];
      const base: ResumenPregunta = {
        preguntaId: p.id,
        texto: p.texto,
        tipo: p.tipo,
        respondidas: rs.length,
        promedio: null,
        distribucion: [],
        textos: [],
      };
      if (p.tipo === 'NPS_0_10' || p.tipo === 'ESCALA_1_5') {
        const nums = rs.map((r) => r.valorNumero).filter((v): v is number => v != null);
        base.promedio =
          nums.length > 0
            ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
            : null;
        const min = p.tipo === 'NPS_0_10' ? 0 : 1;
        const max = p.tipo === 'NPS_0_10' ? 10 : 5;
        for (let v = min; v <= max; v++) {
          base.distribucion.push({ etiqueta: String(v), cantidad: nums.filter((n) => n === v).length });
        }
      } else if (p.tipo === 'SI_NO') {
        base.distribucion = [
          { etiqueta: 'Sí', cantidad: rs.filter((r) => r.valorNumero === 1).length },
          { etiqueta: 'No', cantidad: rs.filter((r) => r.valorNumero === 0).length },
        ];
      } else if (TIPOS_OPCION.includes(p.tipo)) {
        base.distribucion = p.opciones.map((op) => ({
          etiqueta: op,
          cantidad: rs.filter((r) => (r.valorOpciones ?? []).includes(op)).length,
        }));
      } else {
        base.textos = rs
          .map((r) => r.valorTexto)
          .filter((t): t is string => !!t && t.trim().length > 0);
      }
      return base;
    });

    return {
      plantillaId,
      nombre: plantilla.nombre,
      totalEnviadas,
      totalRespondidas,
      scoreNps,
      promotores,
      pasivos,
      detractores,
      preguntas: resumenPreguntas,
    };
  }
}
