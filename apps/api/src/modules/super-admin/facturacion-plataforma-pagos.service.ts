import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import {
  SII_PROVIDER,
  SIIProvider,
} from '../admin/sii/sii-provider';
import {
  WEBPAY_PROVIDER,
  WebpayProvider,
} from '../admin/pagos/webpay-provider';
import { Transaccion } from '../competition/entities/transaccion.entity';
import { DocumentoTributario } from '../competition/entities/documento-tributario.entity';
import { EmailService } from '../email/email.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { FacturaPlataforma } from './entities/factura-plataforma.entity';
import { FacturacionPlataformaService } from './facturacion-plataforma.service';

/**
 * Sprint 24A — Orquestador de pagos de facturas plataforma.
 *
 * Flujo Webpay:
 *   1. iniciarPagoWebpay(facturaId) →
 *        - crea Transaccion(PENDIENTE) vinculada a la factura
 *        - llama WebpayProvider.iniciarPago()
 *        - retorna URL para redireccionar al pagador
 *   2. retornoWebpay(token) →
 *        - WebpayProvider.confirmarPago(token)
 *        - si aprobado: marca factura PAGADA + emite boleta SII + envía email
 *        - si rechazado: marca Transaccion RECHAZADA, factura sigue PENDIENTE
 *
 * Flujo manual (transferencia / OneClick):
 *   - registrarPagoManual(facturaId, dto) lo llama el super admin desde la UI
 *
 * SII boleta:
 *   - Se emite automáticamente al confirmar pago (asincrónico, idempotente).
 *   - Si falla, queda en `documentos_tributarios` con estado RECHAZADO y
 *     el cron de SII existente lo reintenta.
 */
@Injectable()
export class FacturacionPlataformaPagosService {
  private readonly log = new Logger(FacturacionPlataformaPagosService.name);

  /** Webpay: 30 min para completar el flujo desde que se inicia. */
  static readonly EXPIRACION_TRANSACCION_MIN = 30;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(FacturaPlataforma)
    private readonly facturaRepo: Repository<FacturaPlataforma>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Transaccion)
    private readonly transRepo: Repository<Transaccion>,
    @InjectRepository(DocumentoTributario)
    private readonly docTribRepo: Repository<DocumentoTributario>,
    @Inject(WEBPAY_PROVIDER)
    private readonly webpay: WebpayProvider,
    @Inject(SII_PROVIDER)
    private readonly sii: SIIProvider,
    private readonly facturacion: FacturacionPlataformaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Inicia un pago Webpay para una factura plataforma. Retorna URL de
   * redirección. El frontend del LIGA_ADMIN llama esto y hace
   * `window.location.href = url`.
   */
  @Transactional()
  async iniciarPagoWebpay(
    facturaId: string,
    userPagadorId: string,
    baseUrlFrontend: string,
  ): Promise<{ token: string; url: string; transaccionId: string }> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const factura = await this.facturaRepo.findOne({ where: { id: facturaId } });
    if (!factura) throw new NotFoundException('Factura no encontrada.');
    if (factura.estado !== 'PENDIENTE' && factura.estado !== 'VENCIDA') {
      throw new ConflictException(
        `No se puede pagar una factura en estado ${factura.estado}.`,
      );
    }
    if (factura.monto <= 0) {
      throw new BadRequestException('Monto inválido.');
    }

    // FIX idempotencia: si ya hay una transacción en tránsito y no vencida para
    // esta factura, reusamos su checkout en vez de crear otra. Evita el 500 por
    // "duplicate key" en el UNIQUE de idempotency_key ante doble click o
    // reintento (antes el idempotency_key era determinístico por factura).
    const enTransito = await this.transRepo.findOne({
      where: { facturaPlataformaId: factura.id, estado: 'PAGO_EN_TRANSITO' },
      order: { createdAt: 'DESC' },
    });
    if (
      enTransito?.tokenPasarela &&
      enTransito.urlRedireccion &&
      enTransito.expiraAt &&
      enTransito.expiraAt.getTime() > Date.now()
    ) {
      return {
        token: enTransito.tokenPasarela,
        url: enTransito.urlRedireccion,
        transaccionId: enTransito.id,
      };
    }

    // Orden de compra única por intento: Webpay exige buy_order único y el
    // UNIQUE de idempotency_key rechaza claves repetidas. El sufijo aleatorio
    // permite reintentar tras una transacción vencida/rechazada sin colisionar.
    const ordenCompra = `FACT-${factura.id.slice(0, 8).toUpperCase()}-${factura.periodoMes}${factura.periodoAnio}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const sessionId = randomUUID();
    const urlRetorno = `${baseUrlFrontend.replace(/\/$/, '')}/admin/mi-suscripcion/retorno`;

    const init = await this.webpay.iniciarPago({
      monto: factura.monto,
      ordenCompra,
      sessionId,
      urlRetorno,
    });

    const expiraAt = new Date();
    expiraAt.setMinutes(
      expiraAt.getMinutes() + FacturacionPlataformaPagosService.EXPIRACION_TRANSACCION_MIN,
    );

    const trans = this.transRepo.create({
      tenantId: factura.tenantId,
      cobroId: null,
      facturaPlataformaId: factura.id,
      monto: factura.monto,
      pasarela: this.webpay.nombre === 'WEBPAY' ? 'WEBPAY' : 'MOCK',
      estado: 'PAGO_EN_TRANSITO',
      idempotencyKey: ordenCompra,
      tokenPasarela: init.token,
      urlRedireccion: init.url,
      respuestaPasarela: init.raw,
      userPagadorId,
      expiraAt,
      notas: `Pago factura plataforma ${factura.periodoMes}/${factura.periodoAnio}`,
    });
    await this.transRepo.save(trans);

    this.log.log(
      `iniciarPagoWebpay factura=${factura.id} → token=${init.token.slice(0, 12)}…`,
    );
    return { token: init.token, url: init.url, transaccionId: trans.id };
  }

  /**
   * Procesa el retorno de Webpay. Idempotente: si la transacción ya está
   * APROBADO, retorna su estado actual sin re-emitir.
   */
  @Transactional()
  async retornoWebpay(token: string): Promise<{
    aprobado: boolean;
    facturaId: string | null;
    estadoFactura: string | null;
  }> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const trans = await this.transRepo.findOne({ where: { tokenPasarela: token } });
    if (!trans) throw new NotFoundException('Transacción no encontrada.');
    if (trans.estado === 'APROBADO') {
      const f = trans.facturaPlataformaId
        ? await this.facturaRepo.findOne({ where: { id: trans.facturaPlataformaId } })
        : null;
      return {
        aprobado: true,
        facturaId: f?.id ?? null,
        estadoFactura: f?.estado ?? null,
      };
    }
    if (!trans.facturaPlataformaId) {
      throw new BadRequestException('Transacción no vinculada a factura plataforma.');
    }

    const confirm = await this.webpay.confirmarPago(token);

    if (!confirm.aprobado) {
      trans.estado = 'RECHAZADO';
      trans.respuestaPasarela = confirm.raw;
      await this.transRepo.save(trans);
      this.log.warn(`retornoWebpay RECHAZADO token=${token.slice(0, 12)}…`);
      return { aprobado: false, facturaId: trans.facturaPlataformaId, estadoFactura: null };
    }

    trans.estado = 'APROBADO';
    trans.respuestaPasarela = confirm.raw;
    trans.pagadoAt = new Date();
    await this.transRepo.save(trans);

    // Marcar factura como pagada
    await this.facturacion.marcarPagada(trans.facturaPlataformaId, 'WEBPAY', {
      transaccionId: trans.id,
      fechaPago: trans.pagadoAt,
    });

    // Reactivar tenant si estaba SUSPENDIDO solo por mora
    await this.intentarReactivarTenant(trans.tenantId);

    // Emisión de boleta SII (best-effort, no bloquea respuesta al usuario)
    this.emitirBoletaPlataforma(trans.facturaPlataformaId, trans.id).catch((err) => {
      this.log.error(
        `Boleta SII falló factura=${trans.facturaPlataformaId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    this.log.log(
      `retornoWebpay APROBADO token=${token.slice(0, 12)}… factura=${trans.facturaPlataformaId}`,
    );
    return {
      aprobado: true,
      facturaId: trans.facturaPlataformaId,
      estadoFactura: 'PAGADA',
    };
  }

  /**
   * Emite boleta SII (tipo 39) para una factura plataforma ya pagada.
   * Crea fila en documentos_tributarios. Idempotente vía externalReference.
   */
  @Transactional()
  async emitirBoletaPlataforma(
    facturaId: string,
    transaccionId: string,
  ): Promise<DocumentoTributario | null> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const factura = await this.facturaRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.tenant', 't')
      .leftJoinAndSelect('f.plan', 'p')
      .where('f.id = :id', { id: facturaId })
      .getOne();
    if (!factura) return null;
    if (factura.docTributarioId) {
      this.log.log(`Boleta ya emitida para factura=${facturaId}, saltando.`);
      return await this.docTribRepo.findOne({ where: { id: factura.docTributarioId } });
    }

    const externalReference = `FACT-PLATAFORMA-${factura.id}`;
    const doc = this.docTribRepo.create({
      tenantId: factura.tenantId,
      transaccionId,
      cobroId: null,
      tipo: 'BOLETA',
      monto: factura.monto,
      estado: 'PENDIENTE_EMISION',
      rutReceptor: null, // hasta que tenants tenga campo rut
      razonSocial: factura.tenant?.nombre ?? null,
    });
    await this.docTribRepo.save(doc);

    try {
      const result = await this.sii.emitirBoleta({
        monto: factura.monto,
        rutReceptor: null,
        razonSocial: factura.tenant?.nombre ?? null,
        externalReference,
        conceptos: [
          {
            descripcion: `Suscripción LigaPlus ${factura.plan?.nombre ?? 'Plan'} — ${String(
              factura.periodoMes,
            ).padStart(2, '0')}/${factura.periodoAnio}`,
            monto: factura.monto,
            cantidad: 1,
          },
        ],
      });
      doc.folioSii = String(result.folio);
      doc.urlPdf = result.urlPdf;
      doc.urlXml = result.urlXml;
      doc.estado = 'EMITIDO';
      doc.respuestaSii = result.raw;
      doc.emitidoAt = new Date();
      doc.intentos = (doc.intentos ?? 0) + 1;
      doc.ultimoIntentoAt = new Date();
      await this.docTribRepo.save(doc);

      // FIX: update DIRIGIDO (solo doc_tributario_id), no save de la entidad
      // completa. Esta función corre fire-and-forget (retornoWebpay la dispara
      // sin await), y un facturaRepo.save(factura) pisaba el estado=PAGADA que
      // marcarPagada recién había seteado, con el PENDIENTE viejo cargado en la
      // línea 220 → la factura quedaba impaga (lost update). El update dirigido
      // no toca estado/metodo_pago/fecha_pago.
      factura.docTributarioId = doc.id;
      await this.facturaRepo.update({ id: factura.id }, { docTributarioId: doc.id });

      this.log.log(`Boleta SII emitida folio=${result.folio} factura=${facturaId}`);

      // Email con link al PDF (best-effort)
      await this.notificarFacturaPagada(factura, doc);
      return doc;
    } catch (err) {
      doc.estado = 'RECHAZADO_SII';
      doc.ultimoError = err instanceof Error ? err.message : String(err);
      doc.intentos = (doc.intentos ?? 0) + 1;
      doc.ultimoIntentoAt = new Date();
      await this.docTribRepo.save(doc);
      this.log.warn(
        `Boleta SII RECHAZADA factura=${facturaId}: ${doc.ultimoError}. Reintentará el cron.`,
      );
      return doc;
    }
  }

  /**
   * Si la suspensión del tenant fue por mora plataforma y ahora no quedan
   * facturas VENCIDAS, lo reactivamos. Si tiene VENCIDAS aún, queda suspendido.
   */
  private async intentarReactivarTenant(tenantId: string): Promise<void> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t || t.estadoSuscripcion !== 'SUSPENDIDO') return;
    if (!t.suspendidoMotivo?.includes('Mora')) return;
    const vencidas = await this.facturaRepo.count({
      where: { tenantId, estado: 'VENCIDA' },
    });
    if (vencidas === 0) {
      t.estadoSuscripcion = 'ACTIVO';
      t.suspendidoAt = null;
      t.suspendidoMotivo = null;
      t.isActive = true;
      await this.tenantRepo.save(t);
      this.log.log(`Tenant ${t.slug} REACTIVADO tras pago de facturas.`);
    }
  }

  /**
   * Email best-effort. Si falla, el log queda registrado pero no rompe el
   * flujo (el pago ya está confirmado y la boleta emitida).
   *
   * El destinatario es el primer LIGA_ADMIN del tenant — buscar email lo
   * delegamos a un consumer separado en una iteración futura. Por ahora
   * registramos un log con la info que mandaríamos.
   */
  private async notificarFacturaPagada(
    factura: FacturaPlataforma,
    doc: DocumentoTributario,
  ): Promise<void> {
    const periodo = `${String(factura.periodoMes).padStart(2, '0')}/${factura.periodoAnio}`;
    this.log.log(
      `[email] Pago confirmado factura=${factura.id} período=${periodo} folio=${doc.folioSii ?? '—'}`,
    );
    // El cron FacturacionPlataformaCron tiene el lookup de admins via UserRole.
    // En una iteración futura: extraer ese helper a un service compartido y
    // llamarlo desde aquí.
  }
}
