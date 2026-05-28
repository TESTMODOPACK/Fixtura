import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type { ConfirmarPagoResponse, IniciarPagoResponse } from '@fixtura/types';

import { Cobro } from '../../competition/entities/cobro.entity';
import { Transaccion } from '../../competition/entities/transaccion.entity';
import { SIIService } from '../sii/sii.service';
import { WEBPAY_PROVIDER, WebpayProvider } from './webpay-provider';

/**
 * Servicio de pagos: orquesta el flujo Cobro → Transaccion → pasarela.
 *
 * Flujo end-to-end (Webpay):
 *  1. iniciarPago(cobroId)
 *     - Valida cobro no pagado / no cancelado
 *     - Crea transaccion PENDIENTE con idempotency_key
 *     - Llama webpayProvider.iniciarPago() → token + url
 *     - Actualiza transaccion: estado=PAGO_EN_TRANSITO, token, url
 *     - Devuelve { transaccionId, urlRedireccion, token, modoMock }
 *
 *  2. El user va a la URL, completa el pago en Webpay (o lo simulamos
 *     en MOCK), Webpay lo redirige a `urlRetorno` con el token.
 *
 *  3. confirmarPago(token)
 *     - Busca transaccion por token
 *     - Llama webpayProvider.confirmarPago() → aprobado/rechazado
 *     - Si APROBADO: marca transaccion APROBADO + actualiza Cobro
 *       (pagado_at, pagado_metodo='WEBPAY', referencia=transaccion.id)
 *     - Si RECHAZADO: marca transaccion RECHAZADO
 *     - Devuelve estado final al frontend
 *
 * Idempotencia: si `confirmarPago` se llama dos veces con el mismo token,
 * la segunda devuelve el estado ya guardado sin volver a tocar el Cobro.
 */
@Injectable()
export class PagosService {
  private readonly log = new Logger(PagosService.name);

  /** Cuánto tiempo tiene el user para completar el pago. */
  private static readonly TTL_TRANSACCION_MIN = 30;

  constructor(
    @InjectRepository(Transaccion)
    private readonly txRepo: Repository<Transaccion>,
    @InjectRepository(Cobro)
    private readonly cobroRepo: Repository<Cobro>,
    @Inject(WEBPAY_PROVIDER)
    private readonly webpay: WebpayProvider,
    private readonly sii: SIIService,
  ) {}

  @Transactional()
  async iniciarPago(
    cobroId: string,
    tenantId: string,
    actorUserId: string | null,
    urlRetornoBase: string,
  ): Promise<IniciarPagoResponse> {
    const cobro = await this.cobroRepo.findOne({
      where: { id: cobroId, tenantId },
    });
    if (!cobro) throw new NotFoundException(`Cobro ${cobroId} no encontrado`);
    if (cobro.pagadoAt) {
      throw new BadRequestException('Este cobro ya está pagado.');
    }
    if (cobro.cancelado) {
      throw new BadRequestException('Este cobro está cancelado.');
    }
    if (cobro.monto <= 0) {
      throw new BadRequestException(
        'El cobro tiene monto cero — no se puede iniciar pago online.',
      );
    }

    // Si ya hay una transaccion PAGO_EN_TRANSITO vigente para este cobro,
    // devolvemos esa misma URL en vez de crear una nueva. Evita que el
    // user genere múltiples órdenes paralelas si dobleclick o vuelve atrás.
    const txVigente = await this.txRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.cobro_id = :cobroId', { cobroId })
      .andWhere(`t.estado IN ('PENDIENTE','PAGO_EN_TRANSITO')`)
      .andWhere('t.expira_at > NOW()')
      .orderBy('t.created_at', 'DESC')
      .getOne();

    if (txVigente && txVigente.urlRedireccion && txVigente.tokenPasarela) {
      this.log.log(
        `Reutilizando transaccion vigente ${txVigente.id} para cobro ${cobroId}`,
      );
      return {
        transaccionId: txVigente.id,
        urlRedireccion: txVigente.urlRedireccion,
        token: txVigente.tokenPasarela,
        modoMock: this.webpay.nombre === 'MOCK',
      };
    }

    const idempotencyKey = `cobro-${cobroId}-${randomUUID()}`;
    const ordenCompra = `FIX-${cobroId.slice(0, 8)}-${Date.now()}`;
    const expiraAt = new Date(
      Date.now() + PagosService.TTL_TRANSACCION_MIN * 60 * 1000,
    );

    // Crear transaccion PENDIENTE primero — si la pasarela falla, queda
    // el registro del intento para auditoría.
    let tx = this.txRepo.create({
      tenantId,
      cobroId: cobro.id,
      monto: cobro.monto,
      pasarela: this.webpay.nombre,
      estado: 'PENDIENTE',
      idempotencyKey,
      userPagadorId: actorUserId,
      expiraAt,
    });
    tx = await this.txRepo.save(tx);

    try {
      const sessionId = `tx-${tx.id}`;
      const urlRetorno = `${urlRetornoBase.replace(/\/$/, '')}/${tx.id}`;
      const result = await this.webpay.iniciarPago({
        monto: cobro.monto,
        ordenCompra,
        sessionId,
        urlRetorno,
      });

      tx.estado = 'PAGO_EN_TRANSITO';
      tx.tokenPasarela = result.token;
      tx.urlRedireccion = result.url;
      tx.respuestaPasarela = result.raw;
      await this.txRepo.save(tx);

      return {
        transaccionId: tx.id,
        urlRedireccion: tx.urlRedireccion!,
        token: tx.tokenPasarela!,
        modoMock: this.webpay.nombre === 'MOCK',
      };
    } catch (err) {
      // El provider falló (red, credenciales, etc). Dejamos la
      // transaccion en RECHAZADO con la nota para que el admin vea.
      tx.estado = 'RECHAZADO';
      tx.notas = `Error al iniciar pago: ${(err as Error).message}`;
      await this.txRepo.save(tx);
      throw new BadRequestException(
        `No pudimos iniciar el pago: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Confirma una transaccion contra la pasarela. Idempotente — si ya
   * está en estado final (APROBADO/RECHAZADO/EXPIRADO/REVERSADO),
   * devuelve el estado guardado sin volver a llamar al provider.
   */
  @Transactional()
  async confirmarPago(transaccionId: string): Promise<ConfirmarPagoResponse> {
    const tx = await this.txRepo.findOne({
      where: { id: transaccionId },
      relations: { cobro: true },
    });
    if (!tx) throw new NotFoundException(`Transacción ${transaccionId} no encontrada`);

    // Idempotencia: si ya está en estado final, no volver a procesar.
    const estadosFinales = ['APROBADO', 'RECHAZADO', 'EXPIRADO', 'REVERSADO'];
    if (estadosFinales.includes(tx.estado)) {
      return this.toConfirmResponse(tx);
    }

    // Verificar expiración antes de consultar al provider — ahorra una
    // llamada externa si ya pasó el TTL.
    if (tx.expiraAt.getTime() < Date.now()) {
      tx.estado = 'EXPIRADO';
      tx.notas = (tx.notas ?? '') + '\nExpiró antes de confirmación.';
      await this.txRepo.save(tx);
      return this.toConfirmResponse(tx);
    }

    if (!tx.tokenPasarela) {
      throw new ConflictException(
        'La transacción no tiene token de pasarela — no se puede confirmar.',
      );
    }

    try {
      const result = await this.webpay.confirmarPago(tx.tokenPasarela);

      tx.respuestaPasarela = {
        ...(tx.respuestaPasarela ?? {}),
        confirmacion: result.raw,
      };

      if (result.aprobado) {
        tx.estado = 'APROBADO';
        tx.pagadoAt = new Date();
        await this.txRepo.save(tx);

        // Sincronizar el Cobro asociado: marcarlo como pagado con la
        // pasarela correspondiente. La referencia apunta a la transaccion
        // para trazabilidad.
        if (tx.cobroId) {
          const cobro = await this.cobroRepo.findOne({
            where: { id: tx.cobroId, tenantId: tx.tenantId },
          });
          if (cobro && !cobro.pagadoAt) {
            cobro.pagadoAt = tx.pagadoAt;
            cobro.pagadoMetodo =
              tx.pasarela === 'MOCK' ? 'OTRO' : (tx.pasarela as 'WEBPAY' | 'MERCADOPAGO');
            cobro.pagadoReferencia = `tx:${tx.id}${
              result.authorizationCode ? ` auth:${result.authorizationCode}` : ''
            }`;
            await this.cobroRepo.save(cobro);
            this.log.log(
              `Pago aprobado: tx=${tx.id} cobro=${cobro.id} monto=${tx.monto}`,
            );
          }
        }

        // Disparar emisión SII en background. NO await — si Open Factura
        // está caído, el cron lo va a reintentar más tarde. El user no
        // espera por esto.
        void this.sii
          .crearYEmitirAsync(tx.id)
          .catch((err) =>
            this.log.warn(
              `Emisión SII inicial falló para tx=${tx.id}: ${(err as Error).message}`,
            ),
          );
      } else {
        tx.estado = 'RECHAZADO';
        await this.txRepo.save(tx);
        this.log.warn(`Pago rechazado: tx=${tx.id}`);
      }

      return this.toConfirmResponse(tx);
    } catch (err) {
      tx.notas = (tx.notas ?? '') + `\nError confirmación: ${(err as Error).message}`;
      await this.txRepo.save(tx);
      throw new BadRequestException(
        `Error confirmando el pago: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Versión admin (autenticada) — filtra por tenantId del JWT.
   */
  async findOneAdmin(transaccionId: string, tenantId: string): Promise<Transaccion> {
    const tx = await this.txRepo.findOne({
      where: { id: transaccionId, tenantId },
      relations: { cobro: true },
    });
    if (!tx) throw new NotFoundException(`Transacción ${transaccionId} no encontrada`);
    return tx;
  }

  /**
   * Versión pública — el endpoint corre con RLS en bypass (tenant_id='').
   * El "auth" es el UUID no enumerable de la transacción. No filtramos
   * por tenantId porque el usuario que vuelve de Webpay no lo tiene en
   * contexto.
   */
  async findOnePublic(transaccionId: string): Promise<Transaccion> {
    const tx = await this.txRepo.findOne({
      where: { id: transaccionId },
      relations: { cobro: true },
    });
    if (!tx) throw new NotFoundException(`Transacción ${transaccionId} no encontrada`);
    return tx;
  }

  private toConfirmResponse(tx: Transaccion): ConfirmarPagoResponse {
    const msg: Record<string, string> = {
      APROBADO: '¡Pago aprobado! Recibirás un comprobante por email.',
      RECHAZADO: 'El pago fue rechazado por la pasarela.',
      EXPIRADO: 'La transacción expiró. Iniciá un nuevo pago.',
      REVERSADO: 'El pago fue revertido por la pasarela.',
      PENDIENTE: 'La transacción aún está pendiente.',
      PAGO_EN_TRANSITO: 'El pago está en proceso, esperá un momento.',
    };
    return {
      transaccionId: tx.id,
      cobroId: tx.cobroId,
      estado: tx.estado,
      monto: tx.monto,
      mensaje: msg[tx.estado] ?? 'Estado desconocido.',
    };
  }
}
