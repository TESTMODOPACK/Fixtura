import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';

/**
 * Provider abstracto para emisión de documentos tributarios electrónicos
 * ante el SII chileno.
 *
 * Dos implementaciones:
 *  - SIIMockProvider: genera folio fake + URL local — para dev/tests.
 *  - OpenFacturaProvider: stub contra Open Factura (https://openfactura.cl).
 *    Falta implementar las llamadas HTTP cuando lleguen credenciales.
 *
 * Selección via env `SII_MODE`:
 *  - mock (default)      → SIIMockProvider
 *  - sandbox|production  → OpenFacturaProvider
 */

export interface EmitirBoletaArgs {
  monto: number;
  rutReceptor?: string | null;
  razonSocial?: string | null;
  conceptos: Array<{ descripcion: string; monto: number; cantidad?: number }>;
  /** Para idempotencia: si Open Factura recibe la misma key, no re-emite. */
  externalReference: string;
}

export interface EmitirBoletaResult {
  /** Folio asignado por SII (entero grande). */
  folio: number;
  urlPdf: string;
  urlXml: string;
  /** Payload crudo del provider para auditoría. */
  raw: Record<string, unknown>;
}

export abstract class SIIProvider {
  abstract get nombre(): 'MOCK' | 'OPENFACTURA' | 'LIBREDTE';
  abstract emitirBoleta(args: EmitirBoletaArgs): Promise<EmitirBoletaResult>;
}

/**
 * Provider MOCK: simula emisión exitosa devolviendo un folio aleatorio
 * y URLs locales. Útil para dev y para que el flujo UI se vea completo
 * sin esperar credenciales del SII.
 *
 * Convención: si `externalReference` contiene "-FAIL", lanza error como
 * si el SII hubiera rechazado el DTE (útil para tests de reintento).
 */
@Injectable()
export class SIIMockProvider extends SIIProvider {
  private readonly log = new Logger(SIIMockProvider.name);

  get nombre(): 'MOCK' {
    return 'MOCK';
  }

  async emitirBoleta(args: EmitirBoletaArgs): Promise<EmitirBoletaResult> {
    if (args.externalReference.includes('-FAIL')) {
      this.log.warn(
        `[MOCK] emisión SIMULA fallo para ref=${args.externalReference}`,
      );
      throw new Error('SII rechazó el documento (simulado por -FAIL en ref).');
    }

    const folio = 100_000_000 + randomInt(1, 9_000_000);
    const urlBase = process.env.SII_MOCK_DOCS_BASE ?? 'http://localhost:3000/mock-sii';
    const urlPdf = `${urlBase}/boleta-${folio}.pdf`;
    const urlXml = `${urlBase}/boleta-${folio}.xml`;
    this.log.log(
      `[MOCK] emitirBoleta ref=${args.externalReference} monto=${args.monto} → folio=${folio}`,
    );
    return {
      folio,
      urlPdf,
      urlXml,
      raw: {
        mode: 'mock',
        emitidoAt: new Date().toISOString(),
        externalReference: args.externalReference,
        rutReceptor: args.rutReceptor ?? null,
      },
    };
  }
}

/**
 * Stub para Open Factura (https://openfactura.cl). Cuando lleguen las
 * credenciales del cliente:
 *   1. Setear env OPENFACTURA_API_KEY y OPENFACTURA_API_BASE
 *   2. Implementar emitirBoleta usando fetch contra el endpoint
 *      `POST /v1/dte/emitir` con tipo=39 (boleta electrónica afecta).
 *   3. Mapear la respuesta a EmitirBoletaResult.
 *
 * Por ahora lanza error explícito si SII_MODE=sandbox|production.
 */
@Injectable()
export class OpenFacturaProvider extends SIIProvider {
  get nombre(): 'OPENFACTURA' {
    return 'OPENFACTURA';
  }

  async emitirBoleta(_args: EmitirBoletaArgs): Promise<EmitirBoletaResult> {
    throw new Error(
      'OpenFacturaProvider no implementado. Setear SII_MODE=mock o completar la integración Open Factura.',
    );
  }
}

/**
 * Token de DI. PagosModule / SIIModule lo resuelve al bootstrap según
 * SII_MODE.
 */
export const SII_PROVIDER = Symbol('SII_PROVIDER');
