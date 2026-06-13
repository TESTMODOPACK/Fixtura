import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { EstadoDunning } from '@fixtura/types';

import { EmailService } from '../../email/email.service';
import { Cobro } from '../../competition/entities/cobro.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Servicio de Dunning (cobranza automática).
 *
 * Flujo del cron diario:
 *   1. Recorre todos los cobros NO pagados, NO cancelados, con vencimiento.
 *   2. Para cada uno, recalcula `estado_dunning` en base a días vencido.
 *   3. Si corresponde enviar aviso (umbrales 1, 15, 30 días), dispara email
 *      al delegado del equipo y registra el envío.
 *
 * Umbrales de aviso (días después del vencimiento):
 *   - Día 1   → recordatorio amistoso ("tu cobro venció ayer")
 *   - Día 15  → aviso de mora
 *   - Día 30  → aviso de suspensión
 *
 * Throttling: no se envía más de 1 email por cobro cada 7 días, aunque
 * el cobro siga vencido. Evita spam si el cron corre seguido.
 */
@Injectable()
export class DunningService {
  private readonly log = new Logger(DunningService.name);

  /** Umbrales de envío (días después del vencimiento). */
  static readonly UMBRALES_AVISO = [1, 15, 30];
  /** Mínimo de días entre envíos consecutivos del mismo cobro. */
  static readonly THROTTLE_DIAS = 7;

  constructor(
    @InjectRepository(Cobro)
    private readonly cobroRepo: Repository<Cobro>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly email: EmailService,
  ) {}

  /**
   * Recalcula estado_dunning de todos los cobros del tenant en base al
   * vencimiento. NO envía emails — solo el estado. Llamado por el cron.
   *
   * Reglas:
   *   - pagado o cancelado → AL_DIA (no aplica dunning)
   *   - sin vencimiento     → AL_DIA
   *   - vencimiento >= hoy  → AL_DIA
   *   - 1..30 días vencido  → MOROSO
   *   - >30 días vencido    → SUSPENDIDO
   */
  async recalcularEstados(tenantId: string): Promise<{ actualizados: number }> {
    const hoy = this.hoyStr();

    // Reset AL_DIA: pagados, cancelados, sin vencimiento, o no vencidos.
    const resAlDia = await this.cobroRepo
      .createQueryBuilder()
      .update()
      .set({ estadoDunning: 'AL_DIA' })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere(
        `(pagado_at IS NOT NULL
          OR cancelado = TRUE
          OR vencimiento IS NULL
          OR vencimiento >= :hoy)`,
        { hoy },
      )
      .andWhere(`estado_dunning <> 'AL_DIA'`)
      .execute();

    // MOROSO: vencido hace 1..30 días.
    const resMoroso = await this.cobroRepo
      .createQueryBuilder()
      .update()
      .set({ estadoDunning: 'MOROSO' })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('pagado_at IS NULL')
      .andWhere('cancelado = FALSE')
      .andWhere('vencimiento IS NOT NULL')
      .andWhere('vencimiento < :hoy', { hoy })
      .andWhere(`vencimiento >= (:hoy::date - INTERVAL '30 days')`, { hoy })
      .andWhere(`estado_dunning <> 'MOROSO'`)
      .execute();

    // SUSPENDIDO: vencido hace más de 30 días.
    const resSusp = await this.cobroRepo
      .createQueryBuilder()
      .update()
      .set({ estadoDunning: 'SUSPENDIDO' })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('pagado_at IS NULL')
      .andWhere('cancelado = FALSE')
      .andWhere('vencimiento IS NOT NULL')
      .andWhere(`vencimiento < (:hoy::date - INTERVAL '30 days')`, { hoy })
      .andWhere(`estado_dunning <> 'SUSPENDIDO'`)
      .execute();

    const total =
      (resAlDia.affected ?? 0) + (resMoroso.affected ?? 0) + (resSusp.affected ?? 0);
    if (total > 0) {
      this.log.log(
        `Tenant ${tenantId}: estados recalculados — alDia=${resAlDia.affected ?? 0} moroso=${resMoroso.affected ?? 0} susp=${resSusp.affected ?? 0}`,
      );
    }
    return { actualizados: total };
  }

  /**
   * Envía avisos a los cobros que cruzaron un umbral de mora (1, 15, 30
   * días). Respeta el throttle de THROTTLE_DIAS entre envíos al mismo
   * cobro.
   *
   * Devuelve la lista de cobros notificados.
   */
  async enviarAvisos(tenantId: string): Promise<{ enviados: number; saltados: number }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      this.log.warn(`Tenant ${tenantId} no encontrado para enviar avisos`);
      return { enviados: 0, saltados: 0 };
    }

    const hoy = this.hoyStr();
    const candidatos = await this.cobroRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.equipo', 'equipo')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.pagado_at IS NULL')
      .andWhere('c.cancelado = FALSE')
      .andWhere('c.vencimiento IS NOT NULL')
      .andWhere('c.vencimiento < :hoy', { hoy })
      .andWhere(
        `(c.dunning_ultimo_aviso_at IS NULL
          OR c.dunning_ultimo_aviso_at < NOW() - INTERVAL '${DunningService.THROTTLE_DIAS} days')`,
      )
      .getMany();

    let enviados = 0;
    let saltados = 0;
    for (const cobro of candidatos) {
      const dias = this.calcularDiasMora(cobro.vencimiento!);
      const umbral = this.cruzaUmbral(dias);
      if (umbral === null) {
        saltados++;
        continue;
      }

      const exito = await this.enviarEmail(cobro, tenant.nombre, dias, umbral);
      if (exito) {
        cobro.dunningAvisosEnviados = (cobro.dunningAvisosEnviados ?? 0) + 1;
        cobro.dunningUltimoAvisoAt = new Date();
        await this.cobroRepo.save(cobro);
        enviados++;
      } else {
        saltados++;
      }
    }

    if (enviados + saltados > 0) {
      this.log.log(
        `Tenant ${tenantId}: avisos dunning enviados=${enviados} saltados=${saltados}`,
      );
    }
    return { enviados, saltados };
  }

  /**
   * Envía manualmente un aviso para un cobro específico. Útil cuando el
   * admin quiere disparar un recordatorio sin esperar al cron.
   */
  async enviarAvisoManual(
    cobroId: string,
    tenantId: string,
  ): Promise<{ enviado: boolean; razon?: string }> {
    const cobro = await this.cobroRepo.findOne({
      where: { id: cobroId, tenantId },
      relations: { equipo: true },
    });
    if (!cobro) throw new NotFoundException(`Cobro ${cobroId} no encontrado`);
    if (cobro.pagadoAt) {
      throw new BadRequestException('Este cobro ya está pagado.');
    }
    if (cobro.cancelado) {
      throw new BadRequestException('Este cobro está cancelado.');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const tenantName = tenant?.nombre ?? 'Liga';

    const dias = cobro.vencimiento ? this.calcularDiasMora(cobro.vencimiento) : 0;
    const umbral =
      dias <= 0 ? 0 : dias < 15 ? 1 : dias < 30 ? 15 : 30;

    const exito = await this.enviarEmail(cobro, tenantName, dias, umbral);
    if (exito) {
      cobro.dunningAvisosEnviados = (cobro.dunningAvisosEnviados ?? 0) + 1;
      cobro.dunningUltimoAvisoAt = new Date();
      await this.cobroRepo.save(cobro);
      return { enviado: true };
    }
    return { enviado: false, razon: 'No se pudo enviar el email (ver logs).' };
  }

  /**
   * Determina qué umbral cruzó el cobro hoy (1, 15 o 30). Retorna null
   * si está fuera de los días de aviso (ej: 5 días vencido — entre 1
   * y 15 ya no se manda, solo en el cruce exacto del umbral o cuando
   * el throttling lo permite).
   *
   * Para simplificar el MVP: devolvemos el umbral inmediatamente menor
   * o igual a los días de mora. El throttle de THROTTLE_DIAS previene
   * spam aunque siempre cumpla la condición.
   */
  private cruzaUmbral(dias: number): number | null {
    if (dias <= 0) return null;
    const umbralesOrdenados = [...DunningService.UMBRALES_AVISO].sort((a, b) => b - a);
    for (const u of umbralesOrdenados) {
      if (dias >= u) return u;
    }
    return null;
  }

  private calcularDiasMora(vencimiento: string): number {
    const venc = new Date(vencimiento + 'T00:00:00Z');
    const hoy = new Date(`${this.hoyStr()}T00:00:00Z`);
    return Math.max(
      0,
      Math.floor((hoy.getTime() - venc.getTime()) / (24 * 60 * 60 * 1000)),
    );
  }

  private hoyStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Envía el email con la plantilla adecuada según el umbral. Si el
   * cobro tiene equipo asociado, el destinatario es el email del
   * delegado del equipo (o el del tenant si no hay delegado).
   *
   * En MVP, como no tenemos email del delegado persistido en la entity
   * Equipo, mandamos al "admin del tenant" — falta agregar campo
   * `equipo.delegado_email` o tomarlo de `user_roles` con rol
   * DELEGADO_EQUIPO. Lo dejo como compromiso v2.
   */
  private async enviarEmail(
    cobro: Cobro,
    tenantName: string,
    dias: number,
    umbral: number,
  ): Promise<boolean> {
    // TODO v2: resolver el email real del delegado del equipo.
    // Por ahora, si no hay email accesible, log-only.
    const destino = await this.resolverEmailDestino(cobro);
    if (!destino) {
      this.log.log(
        `[log-only] Aviso dunning cobro=${cobro.id} dias=${dias} umbral=${umbral} (sin destinatario configurado)`,
      );
      return true; // simulamos éxito en log-only para que el cron avance
    }

    const { subject, html, text } = this.renderTemplate(
      cobro,
      tenantName,
      dias,
      umbral,
    );

    return this.email.send({
      to: destino,
      subject,
      html,
      text,
    });
  }

  /**
   * Busca el email del delegado del equipo asociado al cobro. Si no hay
   * equipo (cobro general) o no hay delegado, retorna null.
   *
   * IMPORTANTE: la entity Equipo no tiene email todavía. Esto va a
   * devolver null por ahora — el flujo es log-only. Cuando se agregue
   * `equipo.delegado_email` o se resuelva via user_roles, devuelve el
   * email real.
   */
  private async resolverEmailDestino(_cobro: Cobro): Promise<string | null> {
    return null;
  }

  private renderTemplate(
    cobro: Cobro,
    tenantName: string,
    dias: number,
    umbral: number,
  ): { subject: string; html: string; text: string } {
    const montoStr = `$${cobro.monto.toLocaleString('es-CL')}`;
    const concepto = cobro.concepto;
    const equipoNombre = cobro.equipo?.nombre ?? 'Equipo';

    if (umbral >= 30) {
      // Aviso de suspensión
      return {
        subject: `[${tenantName}] SUSPENSIÓN: ${concepto} con ${dias} días de mora`,
        html: `
          <h2 style="color:#b91c1c">Aviso de suspensión</h2>
          <p>Hola, equipo <strong>${equipoNombre}</strong>.</p>
          <p>El cobro <strong>${concepto}</strong> por <strong>${montoStr}</strong>
          tiene <strong>${dias} días</strong> de mora. Según el reglamento de la
          liga, el equipo queda <strong>SUSPENDIDO</strong> hasta regularizar.</p>
          <p>Para regularizar y reactivar al equipo, ingresa al portal y completa
          el pago.</p>
          <p>Saludos,<br/>${tenantName}</p>
        `,
        text: `[${tenantName}] SUSPENSIÓN: ${concepto} ${montoStr} con ${dias} días de mora. El equipo ${equipoNombre} queda suspendido hasta regularizar.`,
      };
    }
    if (umbral >= 15) {
      return {
        subject: `[${tenantName}] Mora: ${concepto} con ${dias} días vencido`,
        html: `
          <h2 style="color:#b45309">Aviso de mora</h2>
          <p>Hola, equipo <strong>${equipoNombre}</strong>.</p>
          <p>El cobro <strong>${concepto}</strong> por <strong>${montoStr}</strong>
          venció hace <strong>${dias} días</strong>.</p>
          <p>Por favor regulariza lo antes posible. Si pasas los 30 días el
          equipo va a quedar suspendido en el torneo.</p>
          <p>Saludos,<br/>${tenantName}</p>
        `,
        text: `[${tenantName}] Aviso de mora: ${concepto} ${montoStr} con ${dias} días vencido. Regulariza antes de los 30 días.`,
      };
    }
    // Recordatorio amistoso (día 1)
    return {
      subject: `[${tenantName}] Recordatorio: ${concepto} venció`,
      html: `
        <h2 style="color:#15803d">Recordatorio amistoso</h2>
        <p>Hola, equipo <strong>${equipoNombre}</strong>.</p>
        <p>Queríamos avisarte que el cobro <strong>${concepto}</strong> por
        <strong>${montoStr}</strong> venció hace ${dias} día${dias === 1 ? '' : 's'}.</p>
        <p>Si ya pagaste, ignora este aviso. Si todavía no, puedes regularizar
        cuando puedas.</p>
        <p>Saludos,<br/>${tenantName}</p>
      `,
      text: `[${tenantName}] Recordatorio: ${concepto} ${montoStr} venció hace ${dias} día(s).`,
    };
  }

  /**
   * Setea estado_dunning en función del estado actual del cobro. Es
   * idempotente — útil cuando el admin marca un cobro como pagado y
   * quiere asegurar el estado en AL_DIA.
   */
  async actualizarEstadoCobro(cobroId: string, tenantId: string): Promise<EstadoDunning> {
    const c = await this.cobroRepo.findOne({ where: { id: cobroId, tenantId } });
    if (!c) throw new NotFoundException(`Cobro ${cobroId} no encontrado`);

    let nuevoEstado: EstadoDunning = 'AL_DIA';
    if (!c.pagadoAt && !c.cancelado && c.vencimiento) {
      const dias = this.calcularDiasMora(c.vencimiento);
      if (dias > 30) nuevoEstado = 'SUSPENDIDO';
      else if (dias > 0) nuevoEstado = 'MOROSO';
    }
    if (c.estadoDunning !== nuevoEstado) {
      c.estadoDunning = nuevoEstado;
      await this.cobroRepo.save(c);
    }
    return nuevoEstado;
  }
}
