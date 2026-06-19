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

import type {
  ConfirmarPagoResponse,
  IniciarPagoResponse,
  MetodoPago,
  PagosConfig,
} from '@fixtura/types';

import { descifrarSecreto } from '../../../common/crypto/secret-box';
import { Cobro } from '../../competition/entities/cobro.entity';
import {
  PasarelaPago,
  Transaccion,
} from '../../competition/entities/transaccion.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { SIIService } from '../sii/sii.service';
import { FlowCredenciales, FlowProvider } from './flow-provider';
import { WEBPAY_PROVIDER, WebpayProvider } from './webpay-provider';

/** Resultado normalizado de consultar una pasarela por el estado de un pago. */
interface ResultadoConfirmacion {
  estado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE';
  authorizationCode: string | null;
  /** SEC-4 — monto reportado por la pasarela (Flow); validado contra tx.monto. */
  monto?: number | null;
  /** SEC-4 — commerceOrder de la pasarela (Flow); debe coincidir con tx.id. */
  commerceOrder?: string | null;
  raw: Record<string, unknown>;
}

/**
 * Servicio de pagos: orquesta el flujo Cobro → Transaccion → pasarela.
 *
 * La pasarela se resuelve POR LIGA (Etapa 2): cada tenant configura en
 * Ajustes → Pagos si cobra con Flow (credenciales propias cifradas) o no.
 * Si no hay pasarela configurada, cae al provider mock (modo prueba), que
 * preserva el flujo histórico sin cobrar de verdad.
 *
 * Flujo end-to-end (Flow):
 *  1. iniciarPago(cobroId) → crea transaccion, llama flow.crearPago()
 *     con urlConfirmation (webhook server-to-server) + urlReturn (navegador),
 *     guarda token + url, devuelve la URL a la que redirigir al pagador.
 *  2. El pagador paga en Flow. Flow:
 *       - POSTea `token` a urlConfirmation (webhook) → confirmarPorToken().
 *       - redirige el navegador a urlReturn/{txId} → la página llama a
 *         /public/pagos/{txId}/confirmar (confirmarPago()).
 *     Ambos caminos consultan getStatus y convergen en confirmarTx() —
 *     idempotente, el que llegue primero marca el cobro pagado.
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
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(WEBPAY_PROVIDER)
    private readonly webpay: WebpayProvider,
    private readonly flow: FlowProvider,
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
        modoMock: txVigente.pasarela === 'MOCK',
      };
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const pasarela = this.resolverPasarela(tenant);

    const idempotencyKey = `cobro-${cobroId}-${randomUUID()}`;
    const expiraAt = new Date(
      Date.now() + PagosService.TTL_TRANSACCION_MIN * 60 * 1000,
    );

    // Crear transaccion PENDIENTE primero — si la pasarela falla, queda
    // el registro del intento para auditoría.
    let tx = this.txRepo.create({
      tenantId,
      cobroId: cobro.id,
      monto: cobro.monto,
      pasarela:
        pasarela.tipo === 'FLOW'
          ? 'FLOW'
          : pasarela.tipo === 'KHIPU'
            ? 'KHIPU'
            : this.webpay.nombre,
      estado: 'PENDIENTE',
      idempotencyKey,
      userPagadorId: actorUserId,
      expiraAt,
    });
    tx = await this.txRepo.save(tx);

    try {
      const urlRetorno = `${urlRetornoBase.replace(/\/$/, '')}/${tx.id}`;

      if (pasarela.tipo === 'KHIPU') {
        throw new Error(
          'Khipu todavía no está integrado. Usa Flow o transferencia por ahora.',
        );
      }

      if (pasarela.tipo === 'FLOW') {
        const email = await this.emailPagador(actorUserId, tenant);
        const result = await this.flow.crearPago(pasarela.creds, {
          monto: cobro.monto,
          comercioOrden: tx.id,
          asunto: cobro.concepto,
          email,
          urlConfirmation: `${this.apiPublicBase()}/public/pagos/flow/confirmacion`,
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
          modoMock: false,
        };
      }

      // MOCK / WEBPAY (provider global seleccionado por WEBPAY_MODE).
      const result = await this.webpay.iniciarPago({
        monto: cobro.monto,
        ordenCompra: tx.id,
        sessionId: `tx-${tx.id}`,
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
   * Confirma una transaccion contra la pasarela (camino del retorno del
   * navegador). Idempotente.
   */
  @Transactional()
  async confirmarPago(transaccionId: string): Promise<ConfirmarPagoResponse> {
    const tx = await this.txRepo.findOne({
      where: { id: transaccionId },
      relations: { cobro: true },
    });
    if (!tx) throw new NotFoundException(`Transacción ${transaccionId} no encontrada`);
    return this.confirmarTx(tx);
  }

  /**
   * Confirma por token de pasarela — usado por el webhook de Flow
   * (urlConfirmation). Flow nos manda el token; buscamos la transacción y
   * consultamos getStatus. No lanza si no encuentra la transacción (un
   * webhook que falla con 4xx/5xx hace que Flow reintente en loop).
   */
  @Transactional()
  async confirmarPorToken(token: string): Promise<void> {
    const tx = await this.txRepo.findOne({
      where: { tokenPasarela: token },
      relations: { cobro: true },
      order: { createdAt: 'DESC' },
    });
    if (!tx) {
      this.log.warn(
        `Webhook con token desconocido ${token.slice(0, 12)}… — ignorado.`,
      );
      return;
    }
    await this.confirmarTx(tx);
  }

  /**
   * Lógica compartida de confirmación. Idempotente: si la transacción ya
   * está en estado final, devuelve el estado guardado sin volver a llamar
   * a la pasarela.
   */
  private async confirmarTx(tx: Transaccion): Promise<ConfirmarPagoResponse> {
    const estadosFinales = ['APROBADO', 'RECHAZADO', 'EXPIRADO', 'REVERSADO'];
    if (estadosFinales.includes(tx.estado)) {
      return this.toConfirmResponse(tx);
    }

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
      const result = await this.consultarPasarela(tx);

      tx.respuestaPasarela = {
        ...(tx.respuestaPasarela ?? {}),
        confirmacion: result.raw,
      };

      if (result.estado === 'PENDIENTE') {
        // Flow todavía no resolvió. No tocamos el cobro; el otro camino
        // (webhook o retorno) o un reintento lo confirmará.
        await this.txRepo.save(tx);
        return this.toConfirmResponse(tx);
      }

      if (result.estado === 'APROBADO') {
        // SEC-4 — Defensa antes de acreditar: si la pasarela informó monto u
        // orden (Flow), deben coincidir con la transacción local. Evita
        // acreditar un pago por un monto distinto o asociado a otra orden.
        const discrepancia = this.discrepanciaPago(tx, result);
        if (discrepancia) {
          tx.estado = 'RECHAZADO';
          tx.notas = (tx.notas ?? '') + `\nNo acreditado: ${discrepancia}`;
          await this.txRepo.save(tx);
          this.log.warn(`Pago no acreditado por discrepancia: tx=${tx.id} — ${discrepancia}`);
          return this.toConfirmResponse(tx);
        }

        tx.estado = 'APROBADO';
        tx.pagadoAt = new Date();
        await this.txRepo.save(tx);

        if (tx.cobroId) {
          const cobro = await this.cobroRepo.findOne({
            where: { id: tx.cobroId, tenantId: tx.tenantId },
          });
          if (cobro && !cobro.pagadoAt) {
            cobro.pagadoAt = tx.pagadoAt;
            cobro.pagadoMetodo = this.metodoDePasarela(tx.pasarela);
            cobro.pagadoReferencia = `tx:${tx.id}${
              result.authorizationCode ? ` auth:${result.authorizationCode}` : ''
            }`;
            await this.cobroRepo.save(cobro);
            this.log.log(
              `Pago aprobado: tx=${tx.id} cobro=${cobro.id} monto=${tx.monto} via=${tx.pasarela}`,
            );
          }
        }

        // Disparar emisión SII en background. NO await — si el proveedor
        // está caído, el cron lo reintenta. El user no espera por esto.
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
        this.log.warn(`Pago rechazado: tx=${tx.id} via=${tx.pasarela}`);
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
   * SEC-4 — Devuelve un mensaje si el monto o la orden reportados por la
   * pasarela no coinciden con la transacción local (solo cuando la pasarela
   * los informa, p. ej. Flow). null = todo coincide o no se informó (MOCK).
   */
  private discrepanciaPago(tx: Transaccion, result: ResultadoConfirmacion): string | null {
    if (result.monto != null && result.monto !== tx.monto) {
      return `monto de la pasarela ${result.monto} ≠ esperado ${tx.monto}`;
    }
    if (result.commerceOrder != null && result.commerceOrder !== tx.id) {
      return `commerceOrder de la pasarela ${result.commerceOrder} ≠ transacción ${tx.id}`;
    }
    return null;
  }

  /** Consulta a la pasarela según el tipo de la transacción. */
  private async consultarPasarela(
    tx: Transaccion,
  ): Promise<ResultadoConfirmacion> {
    const token = tx.tokenPasarela!;

    if (tx.pasarela === 'FLOW') {
      const tenant = await this.tenantRepo.findOne({
        where: { id: tx.tenantId },
      });
      const creds = this.leerCredsFlow(tenant);
      if (!creds) {
        throw new Error(
          'No se encontraron las credenciales de Flow de la liga para confirmar el pago.',
        );
      }
      const r = await this.flow.obtenerEstado(creds, token);
      return {
        estado: r.estado,
        authorizationCode: null,
        monto: r.monto,
        commerceOrder: r.commerceOrder,
        raw: r.raw,
      };
    }

    if (tx.pasarela === 'KHIPU') {
      throw new Error('Khipu todavía no está integrado.');
    }

    // MOCK / WEBPAY
    const r = await this.webpay.confirmarPago(token);
    return {
      estado: r.aprobado ? 'APROBADO' : 'RECHAZADO',
      authorizationCode: r.authorizationCode,
      raw: r.raw,
    };
  }

  // ─── Resolución de pasarela por liga ─────────────────────────────────
  private resolverPasarela(
    tenant: Tenant | null,
  ): { tipo: 'FLOW'; creds: FlowCredenciales } | { tipo: 'KHIPU' } | { tipo: 'MOCK' } {
    const cfg = (tenant?.pagosConfig ?? {}) as Partial<PagosConfig>;
    const pasarela = cfg.pasarela;
    if (pasarela?.habilitada && pasarela.proveedor === 'FLOW') {
      const creds = this.leerCredsFlow(tenant);
      if (!creds) {
        throw new BadRequestException(
          'La pasarela Flow está activa pero faltan las credenciales. Cárgalas en Ajustes → Pagos.',
        );
      }
      return { tipo: 'FLOW', creds };
    }
    if (pasarela?.habilitada && pasarela.proveedor === 'KHIPU') {
      return { tipo: 'KHIPU' };
    }
    return { tipo: 'MOCK' };
  }

  private leerCredsFlow(tenant: Tenant | null): FlowCredenciales | null {
    if (!tenant?.pagosSecretosEnc) return null;
    const json = descifrarSecreto(tenant.pagosSecretosEnc);
    if (!json) return null;
    try {
      const parsed = JSON.parse(json) as {
        flowApiKey?: string;
        flowSecretKey?: string;
      };
      if (parsed.flowApiKey && parsed.flowSecretKey) {
        return { apiKey: parsed.flowApiKey, secretKey: parsed.flowSecretKey };
      }
    } catch {
      /* blob corrupto o de otro proveedor */
    }
    return null;
  }

  /** El cobro tiene un CHECK que solo admite estos métodos. */
  private metodoDePasarela(pasarela: PasarelaPago): MetodoPago {
    if (pasarela === 'WEBPAY') return 'WEBPAY';
    if (pasarela === 'MERCADOPAGO') return 'MERCADOPAGO';
    return 'OTRO';
  }

  private async emailPagador(
    actorUserId: string | null,
    tenant: Tenant | null,
  ): Promise<string> {
    if (actorUserId) {
      const u = await this.userRepo.findOne({ where: { id: actorUserId } });
      if (u?.email) return u.email;
    }
    const branding = (tenant?.brandingJson ?? {}) as { emailContacto?: string };
    if (branding.emailContacto && branding.emailContacto.includes('@')) {
      return branding.emailContacto;
    }
    return 'no-reply@ligaplus.cl';
  }

  /** Base pública del API (https://dominio/api/v1) para armar el webhook. */
  private apiPublicBase(): string {
    // OJO: usar `||` y no `??`. docker-compose pasa API_URL=${API_URL:-},
    // así que en el contenedor llega como string vacío (no undefined) cuando
    // no está en el .env; con `??` el fallback a FRONTEND_URL nunca correría.
    const raw =
      process.env.API_URL ||
      process.env.APP_URL ||
      (process.env.FRONTEND_URL ?? '').split(',')[0] ||
      '';
    const stripped = raw
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/api\/v1$/, '')
      .replace(/\/api$/, '');
    return `${stripped}/api/v1`;
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
   * El "auth" es el UUID no enumerable de la transacción.
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
      EXPIRADO: 'La transacción expiró. Inicia un nuevo pago.',
      REVERSADO: 'El pago fue revertido por la pasarela.',
      PENDIENTE: 'La transacción aún está pendiente.',
      PAGO_EN_TRANSITO: 'El pago está en proceso, espera un momento.',
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
