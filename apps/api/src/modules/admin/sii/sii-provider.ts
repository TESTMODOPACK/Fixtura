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

/** Credenciales BYO de la liga (API key descifrada de tenants.sii_api_key_enc). */
export interface SiiCredenciales {
  apiKey: string;
  ambiente: 'CERTIFICACION' | 'PRODUCCION';
}

/** Datos del emisor para el DTE (snapshot de tenants.sii_config). */
export interface SiiEmisor {
  rut: string;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  acteco: number | null;
}

export interface EmitirBoletaArgs {
  monto: number;
  rutReceptor?: string | null;
  razonSocial?: string | null;
  conceptos: Array<{ descripcion: string; monto: number; cantidad?: number }>;
  /** Para idempotencia: si Open Factura recibe la misma key, no re-emite. */
  externalReference: string;
  /** BYO por liga: si vienen, el provider las usa en vez de las env globales. */
  credenciales?: SiiCredenciales;
  emisor?: SiiEmisor;
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

/** Datos del emisor que devuelve GET /v2/dte/organization de OpenFactura. */
export interface SiiOrganizacion {
  rut: string;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  acteco: number | null;
}

/**
 * Keys de demo PÚBLICAS de OpenFactura (documentadas por Haulmer): rutean
 * siempre al ambiente de desarrollo, con CAF simulado. Útiles para que una
 * liga pruebe el flujo antes de contratar su cuenta.
 */
const OPENFACTURA_DEMO_KEYS = [
  '928e15a2d14d4a6292345f04960f4bd3',
  '41eb78998d444dbaa4922c410ef14057',
];

/**
 * Integración real con Open Factura (Haulmer). API REST autenticada con
 * header `apikey`.
 *
 *   - POST /v2/dte/document      → emite el DTE (boleta 39). Pedimos
 *     response ["FOLIO","SELF_SERVICE"]: el folio asignado + una URL web
 *     donde ver/descargar el documento (evita manejar PDF base64).
 *   - GET  /v2/dte/organization  → datos del emisor asociado a la API key
 *     (para "probar conexión" y autocompletar el snapshot del emisor).
 *
 * Ambientes: producción api.haulmer.com / certificación dev-api.haulmer.com.
 * Las API keys de demo público van SIEMPRE contra dev (como hace el plugin
 * oficial de WooCommerce de Haulmer).
 *
 * Multi-tenant (BYO): si args.credenciales viene, se usa esa key/ambiente;
 * si no, cae a las env globales (OPENFACTURA_API_KEY + SII_MODE) — ese es el
 * caso de la facturación de plataforma (LigaPlus → liga).
 */
@Injectable()
export class OpenFacturaProvider extends SIIProvider {
  private readonly log = new Logger(OpenFacturaProvider.name);

  private static readonly TIMEOUT_MS = 30_000;

  get nombre(): 'OPENFACTURA' {
    return 'OPENFACTURA';
  }

  private baseUrl(creds?: SiiCredenciales): string {
    const apiKey = creds?.apiKey ?? process.env.OPENFACTURA_API_KEY ?? '';
    if (OPENFACTURA_DEMO_KEYS.includes(apiKey)) return 'https://dev-api.haulmer.com';
    const ambiente =
      creds?.ambiente ??
      ((process.env.SII_MODE ?? '').toLowerCase() === 'production'
        ? 'PRODUCCION'
        : 'CERTIFICACION');
    return ambiente === 'PRODUCCION'
      ? 'https://api.haulmer.com'
      : 'https://dev-api.haulmer.com';
  }

  private apiKeyDe(creds?: SiiCredenciales): string {
    const key = creds?.apiKey ?? process.env.OPENFACTURA_API_KEY;
    if (!key || !key.trim()) {
      throw new Error(
        'Sin API key de OpenFactura: la liga no tiene la suya configurada y OPENFACTURA_API_KEY no está seteada.',
      );
    }
    return key.trim();
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    creds: SiiCredenciales | undefined,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OpenFacturaProvider.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl(creds)}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKeyDe(creds),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        json = { raw: text };
      }
      if (!res.ok) {
        // OpenFactura devuelve el detalle del rechazo en el body — lo
        // propagamos para que quede en documento.ultimo_error.
        throw new Error(
          `OpenFactura ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`,
        );
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Datos del emisor asociado a la API key. Usado por "Probar conexión" en
   * Ajustes: valida la key y autocompleta el snapshot del emisor.
   */
  async obtenerOrganizacion(creds: SiiCredenciales): Promise<SiiOrganizacion> {
    const org = await this.request('GET', '/v2/dte/organization', creds);
    const actividades = Array.isArray(org.actividades)
      ? (org.actividades as Array<Record<string, unknown>>)
      : [];
    const acteco = Number(actividades[0]?.codigoActividadEconomica) || null;
    if (!org.rut || !org.razonSocial) {
      throw new Error(
        'OpenFactura respondió sin rut/razón social — revisa que la API key sea válida.',
      );
    }
    return {
      rut: String(org.rut),
      razonSocial: String(org.razonSocial),
      giro: org.glosaDescriptiva ? String(org.glosaDescriptiva) : null,
      direccion: org.direccion ? String(org.direccion) : null,
      comuna: org.comuna ? String(org.comuna) : null,
      acteco,
    };
  }

  async emitirBoleta(args: EmitirBoletaArgs): Promise<EmitirBoletaResult> {
    const emisor = args.emisor ?? this.emisorDesdeEnv();
    // Boleta afecta (39): montos brutos con IVA incluido. El SII exige
    // desglosar neto + IVA en Totales; el detalle va en bruto.
    const total = Math.round(args.monto);
    const neto = Math.round(total / 1.19);
    const iva = total - neto;
    const hoy = new Date().toISOString().slice(0, 10);

    const detalle = args.conceptos.map((c, i) => ({
      NroLinDet: i + 1,
      NmbItem: c.descripcion.slice(0, 80),
      QtyItem: c.cantidad ?? 1,
      PrcItem: Math.round(c.monto / (c.cantidad ?? 1)),
      MontoItem: Math.round(c.monto),
    }));

    const payload = {
      response: ['FOLIO', 'SELF_SERVICE'],
      dte: {
        Encabezado: {
          IdDoc: {
            TipoDTE: 39,
            FchEmis: hoy,
            // 3 = boletas de venta y servicios (obligatorio en tipo 39).
            IndServicio: 3,
          },
          Emisor: {
            RUTEmisor: emisor.rut,
            RznSocEmisor: emisor.razonSocial.slice(0, 100),
            GiroEmisor: (emisor.giro ?? 'Servicios').slice(0, 80),
            ...(emisor.direccion ? { DirOrigen: emisor.direccion.slice(0, 70) } : {}),
            ...(emisor.comuna ? { CmnaOrigen: emisor.comuna.slice(0, 20) } : {}),
            ...(emisor.acteco ? { Acteco: emisor.acteco } : {}),
          },
          Receptor: {
            // Consumidor final: RUT genérico del SII si no hay receptor real.
            RUTRecep: args.rutReceptor?.trim() || '66666666-6',
            RznSocRecep: (args.razonSocial?.trim() || 'Consumidor final').slice(0, 100),
          },
          Totales: {
            MntNeto: neto,
            TasaIVA: '19.00',
            IVA: iva,
            MntTotal: total,
          },
        },
        Detalle: detalle,
      },
    };

    const res = await this.request('POST', '/v2/dte/document', args.credenciales, payload);

    const folio = Number(res.FOLIO);
    if (!Number.isFinite(folio) || folio <= 0) {
      throw new Error(
        `OpenFactura no devolvió FOLIO válido: ${JSON.stringify(res).slice(0, 300)}`,
      );
    }
    const selfService = res.SELF_SERVICE as Record<string, unknown> | undefined;
    const urlDoc = selfService?.url ? String(selfService.url) : '';

    this.log.log(
      `[OPENFACTURA] emitirBoleta ref=${args.externalReference} monto=${total} → folio=${folio}`,
    );
    return {
      folio,
      // SELF_SERVICE.url es la página pública del documento (ver/descargar
      // PDF). Si el plan no la incluye, queda vacía y la UI muestra "Pronto".
      urlPdf: urlDoc,
      urlXml: urlDoc,
      raw: { ...res, externalReference: args.externalReference },
    };
  }

  /** Emisor global (facturación de plataforma) desde env. */
  private emisorDesdeEnv(): SiiEmisor {
    const rut = process.env.OPENFACTURA_EMISOR_RUT;
    const razonSocial = process.env.OPENFACTURA_EMISOR_RAZON_SOCIAL;
    if (!rut || !razonSocial) {
      throw new Error(
        'Faltan OPENFACTURA_EMISOR_RUT / OPENFACTURA_EMISOR_RAZON_SOCIAL para emitir sin credenciales de liga.',
      );
    }
    return {
      rut,
      razonSocial,
      giro: process.env.OPENFACTURA_EMISOR_GIRO ?? null,
      direccion: process.env.OPENFACTURA_EMISOR_DIRECCION ?? null,
      comuna: process.env.OPENFACTURA_EMISOR_COMUNA ?? null,
      acteco: process.env.OPENFACTURA_EMISOR_ACTECO
        ? Number(process.env.OPENFACTURA_EMISOR_ACTECO)
        : null,
    };
  }
}

/**
 * Token de DI. PagosModule / SIIModule lo resuelve al bootstrap según
 * SII_MODE.
 */
export const SII_PROVIDER = Symbol('SII_PROVIDER');
