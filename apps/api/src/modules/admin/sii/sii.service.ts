import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { DocumentoTributarioAdmin, SiiTenantConfig } from '@fixtura/types';

import { descifrarSecreto } from '../../../common/crypto/secret-box';
import { Cobro } from '../../competition/entities/cobro.entity';
import { DocumentoTributario } from '../../competition/entities/documento-tributario.entity';
import { Transaccion } from '../../competition/entities/transaccion.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import {
  OpenFacturaProvider,
  SII_PROVIDER,
  SIIProvider,
  type SiiCredenciales,
  type SiiEmisor,
} from './sii-provider';

/**
 * Servicio de documentos tributarios.
 *
 * Patrón "store first, emit later":
 *   1. Cuando una transaccion se APROBA, se crea inmediatamente un
 *      DocumentoTributario en estado PENDIENTE_EMISION (sin folio).
 *      Esto se llama desde PagosService.confirmarPago(). NO bloquea el
 *      response al user.
 *   2. emitir(documentoId) intenta emitir contra el provider. Si OK,
 *      marca EMITIDO. Si falla, incrementa intentos y deja PENDIENTE.
 *   3. Un cron separado (SiiCron) reintenta los PENDIENTE_EMISION cada
 *      30min con backoff. Después de 5 intentos fallidos marca FALLIDO.
 *
 * Beneficios:
 *   - El user recibe respuesta inmediata después de pagar.
 *   - Si Open Factura está caído, los documentos no se pierden.
 *   - Trazabilidad completa: cada intento queda registrado.
 */
@Injectable()
export class SIIService {
  private readonly log = new Logger(SIIService.name);

  /** Después de este número de intentos, marca FALLIDO. */
  static readonly MAX_INTENTOS = 5;

  constructor(
    @InjectRepository(DocumentoTributario)
    private readonly docRepo: Repository<DocumentoTributario>,
    @InjectRepository(Transaccion)
    private readonly txRepo: Repository<Transaccion>,
    @InjectRepository(Cobro)
    private readonly cobroRepo: Repository<Cobro>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @Inject(SII_PROVIDER)
    private readonly provider: SIIProvider,
    private readonly openFactura: OpenFacturaProvider,
  ) {}

  /**
   * BYO por liga: si el tenant tiene el SII activo y su API key de
   * OpenFactura cargada, devuelve credenciales + emisor para emitir con SU
   * cuenta. Si no (o si PAGOS_ENC_KEY falta y no se puede descifrar),
   * devuelve null y la emisión cae al provider global (mock/env).
   */
  private async byoDe(
    tenantId: string,
  ): Promise<{ credenciales: SiiCredenciales; emisor: SiiEmisor } | null> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t?.siiApiKeyEnc) return null;
    const cfg = (t.siiConfig ?? {}) as Partial<SiiTenantConfig>;
    if (!cfg.activo) return null;
    if (!cfg.rutEmisor || !cfg.razonSocial) {
      this.log.warn(
        `Tenant ${tenantId} tiene SII activo pero sin emisor verificado — usando provider global.`,
      );
      return null;
    }
    const apiKey = descifrarSecreto(t.siiApiKeyEnc);
    if (!apiKey) {
      this.log.warn(
        `Tenant ${tenantId}: no se pudo descifrar la API key SII (¿PAGOS_ENC_KEY?) — usando provider global.`,
      );
      return null;
    }
    return {
      credenciales: { apiKey, ambiente: cfg.ambiente ?? 'PRODUCCION' },
      emisor: {
        rut: cfg.rutEmisor,
        razonSocial: cfg.razonSocial,
        giro: cfg.giro ?? null,
        direccion: cfg.direccion ?? null,
        comuna: cfg.comuna ?? null,
        acteco: cfg.acteco ?? null,
      },
    };
  }

  /**
   * Crea el DocumentoTributario asociado a una transacción aprobada y
   * dispara la emisión asíncrona (sin await). Llamado desde
   * PagosService.confirmarPago.
   *
   * Si ya existe un documento EMITIDO o PENDIENTE para esta transacción,
   * no crea uno nuevo (idempotente).
   */
  async crearYEmitirAsync(transaccionId: string): Promise<DocumentoTributario | null> {
    const tx = await this.txRepo.findOne({
      where: { id: transaccionId },
      relations: { cobro: true },
    });
    if (!tx || tx.estado !== 'APROBADO') return null;

    // Idempotencia: no crear duplicado si ya hay uno para esta tx.
    const existente = await this.docRepo.findOne({
      where: { transaccionId: tx.id },
    });
    if (existente) {
      this.log.log(
        `Documento ya existe para tx=${tx.id} (estado=${existente.estado}); skip creación.`,
      );
      // Si está en PENDIENTE_EMISION, igual disparamos retry async.
      if (existente.estado === 'PENDIENTE_EMISION') {
        void this.emitir(existente.id).catch((err) =>
          this.log.warn(`Retry async falló: ${(err as Error).message}`),
        );
      }
      return existente;
    }

    const doc = this.docRepo.create({
      tenantId: tx.tenantId,
      transaccionId: tx.id,
      cobroId: tx.cobroId,
      tipo: 'BOLETA',
      monto: tx.monto,
      estado: 'PENDIENTE_EMISION',
      intentos: 0,
    });
    const saved = await this.docRepo.save(doc);
    this.log.log(`Documento creado PENDIENTE_EMISION: ${saved.id} (tx=${tx.id})`);

    // Disparar emisión sin await — no bloquea el flujo de pago.
    void this.emitir(saved.id).catch((err) =>
      this.log.warn(`Emisión inicial falló: ${(err as Error).message}`),
    );

    return saved;
  }

  /**
   * Intenta emitir el documento contra el provider. Llamado desde:
   *   - crearYEmitirAsync (primer intento, fire-and-forget)
   *   - SiiCron (reintentos posteriores)
   *   - Manualmente desde admin UI (botón "Reintentar")
   */
  async emitir(documentoId: string): Promise<DocumentoTributario> {
    const doc = await this.docRepo.findOne({
      where: { id: documentoId },
      relations: { cobro: true, transaccion: true },
    });
    if (!doc) throw new NotFoundException(`Documento ${documentoId} no encontrado`);

    if (doc.estado === 'EMITIDO') {
      this.log.log(`Documento ${doc.id} ya emitido, skip.`);
      return doc;
    }
    if (doc.estado === 'FALLIDO') {
      throw new Error(
        `Documento ${doc.id} marcado FALLIDO tras ${doc.intentos} intentos — revisión manual requerida.`,
      );
    }

    doc.intentos = (doc.intentos ?? 0) + 1;
    doc.ultimoIntentoAt = new Date();

    try {
      // BYO: con credenciales de la liga → OpenFactura con SU cuenta.
      // Sin ellas → provider global (mock en dev, o env de plataforma).
      const byo = await this.byoDe(doc.tenantId);
      const provider = byo ? this.openFactura : this.provider;
      const result = await provider.emitirBoleta({
        monto: doc.monto,
        rutReceptor: doc.rutReceptor,
        razonSocial: doc.razonSocial,
        conceptos: [
          {
            descripcion: doc.cobro?.concepto ?? 'Pago LigaPlus',
            monto: doc.monto,
            cantidad: 1,
          },
        ],
        externalReference: `doc-${doc.id}`,
        ...(byo ?? {}),
      });

      doc.estado = 'EMITIDO';
      doc.folioSii = String(result.folio);
      doc.urlPdf = result.urlPdf;
      doc.urlXml = result.urlXml;
      doc.respuestaSii = result.raw;
      doc.emitidoAt = new Date();
      doc.ultimoError = null;
      this.log.log(
        `Documento ${doc.id} EMITIDO: folio=${result.folio} provider=${provider.nombre}${byo ? ' (BYO liga)' : ''}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      doc.ultimoError = msg;
      if (doc.intentos >= SIIService.MAX_INTENTOS) {
        doc.estado = 'FALLIDO';
        this.log.error(
          `Documento ${doc.id} marcado FALLIDO tras ${doc.intentos} intentos: ${msg}`,
        );
      } else {
        doc.estado = 'PENDIENTE_EMISION';
        this.log.warn(
          `Documento ${doc.id} intento ${doc.intentos}/${SIIService.MAX_INTENTOS} falló: ${msg}`,
        );
      }
    }

    return this.docRepo.save(doc);
  }

  /**
   * Lista los documentos del tenant con filtros opcionales.
   */
  async list(
    tenantId: string,
    estado?: string,
  ): Promise<DocumentoTributarioAdmin[]> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.cobro', 'cobro')
      .where('d.tenant_id = :tenantId', { tenantId })
      .orderBy('d.created_at', 'DESC');
    if (estado) qb.andWhere('d.estado = :estado', { estado });
    const items = await qb.getMany();
    return items.map((d) => this.toDto(d));
  }

  async findOne(id: string, tenantId: string): Promise<DocumentoTributarioAdmin> {
    const d = await this.docRepo.findOne({
      where: { id, tenantId },
      relations: { cobro: true },
    });
    if (!d) throw new NotFoundException(`Documento ${id} no encontrado`);
    return this.toDto(d);
  }

  /**
   * Busca documentos PENDIENTE_EMISION o RECHAZADO_SII listos para
   * reintento. Usado por el cron.
   */
  async listarPendientesParaReintento(
    tenantId: string,
    limit = 50,
  ): Promise<DocumentoTributario[]> {
    return this.docRepo
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere(`d.estado IN ('PENDIENTE_EMISION','RECHAZADO_SII')`)
      .andWhere('d.intentos < :max', { max: SIIService.MAX_INTENTOS })
      // Solo reintentar si el último intento fue hace más de 5min
      // (evita bombardear al provider cuando está caído).
      .andWhere(
        `(d.ultimo_intento_at IS NULL OR d.ultimo_intento_at < NOW() - INTERVAL '5 minutes')`,
      )
      .orderBy('d.ultimo_intento_at', 'ASC', 'NULLS FIRST')
      .limit(limit)
      .getMany();
  }

  private toDto(d: DocumentoTributario): DocumentoTributarioAdmin {
    return {
      id: d.id,
      transaccionId: d.transaccionId,
      cobroId: d.cobroId,
      cobroConcepto: d.cobro?.concepto ?? null,
      tipo: d.tipo,
      monto: d.monto,
      rutReceptor: d.rutReceptor,
      razonSocial: d.razonSocial,
      folioSii: d.folioSii,
      urlPdf: d.urlPdf,
      urlXml: d.urlXml,
      estado: d.estado,
      intentos: d.intentos,
      emitidoAt: d.emitidoAt?.toISOString() ?? null,
      ultimoError: d.ultimoError,
      ultimoIntentoAt: d.ultimoIntentoAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
