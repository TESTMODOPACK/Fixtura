/**
 * Cliente fetch tipado con manejo automático de:
 *   - Authorization Bearer si hay accessToken en el store
 *   - Refresh automático si el access token expiró (queue de requests
 *     en vuelo para no disparar N refreshes en paralelo)
 *   - Parsing de errores con shape { statusCode, message, error }
 */
import type { AuthTokens } from '@fixtura/types';

import { useAuthStore } from '@/store/auth-store';
import { enqueue as enqueueOffline } from '@/lib/offline-queue';

/**
 * Construye la base URL del API tolerando que la env var venga con o sin
 * sufijos `/`, `/api` o `/api/v1`. Históricamente el docker-compose la
 * pasaba con `/api` final y el código también concatenaba `/api/v1`,
 * resultando en `/api/api/v1/...` y todos los requests fallando con 401.
 */
function buildApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  // Normaliza: saca trailing slash, después remueve sufijo /api/v1 o /api si existe.
  const stripped = raw
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '')
    .replace(/\/api$/, '');
  return `${stripped}/api/v1`;
}
export const API_URL = buildApiBase();
const API_BASE = API_URL;

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Convierte un error de mutación (de TanStack Query, fetch, etc.) a un
 * string legible para mostrar al usuario.
 *
 * Maneja:
 *  - ApiError con `body.message: string` → ese string.
 *  - ApiError con `body.message: string[]` (class-validator) → unidos
 *    con comas; el primero como título.
 *  - ApiError con statusCode 401/403 → "Sesión expirada" / "Sin permiso".
 *  - Error genérico → error.message.
 *  - unknown → "Ocurrió un error inesperado".
 */
export function parseApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (err.statusCode === 403) return 'No tienes permiso para esta acción.';
    if (err.statusCode === 404) return err.message || 'No se encontró el recurso solicitado.';
    if (err.body && typeof err.body === 'object' && 'message' in err.body) {
      const m = (err.body as { message: unknown }).message;
      if (Array.isArray(m)) return m.filter((x) => typeof x === 'string').join(' · ') || err.message;
      if (typeof m === 'string') return m;
    }
    return err.message || 'Ocurrió un error con la solicitud.';
  }
  if (err instanceof Error) return err.message || 'Ocurrió un error inesperado.';
  if (typeof err === 'string') return err;
  return 'Ocurrió un error inesperado.';
}

type FetchOpts = Omit<RequestInit, 'body'> & {
  body?: unknown;
  skipAuth?: boolean;
  /**
   * Si true y el cliente está offline, en lugar de fallar encola la
   * operación en IndexedDB. Aplica solo para POST/PATCH. La promesa
   * resuelve con un placeholder `__queued: true`. El caller debe
   * tolerar ese caso (típicamente con optimistic update en UI).
   */
  enqueueIfOffline?: {
    kind: 'incidencia' | 'cerrar-acta' | 'certificar-presentes' | 'otro';
    partidoId?: string;
  };
};

/** Indica si una respuesta es un "queued" (encolada offline). */
export function isQueuedResponse(res: unknown): boolean {
  return typeof res === 'object' && res !== null && '__queued' in res;
}

let refreshPromise: Promise<AuthTokens> | null = null;

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;

  // A5 — el refresh token va en la cookie HttpOnly (credentials: 'include'); no
  // se manda en el body ni se lee del store.
  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })
    .then(async (res) => {
      const { setTokens, clearTokens, impersonationTarget } = useAuthStore.getState();
      if (!res.ok) {
        clearTokens();
        throw new ApiError(res.status, 'Refresh failed');
      }
      const tokens = (await res.json()) as AuthTokens;
      setTokens(tokens);
      // Si estábamos impersonando, este refresh usó la cookie del super admin
      // (el access del target expiró) → volvemos a su sesión y cerramos el modo.
      if (impersonationTarget) {
        useAuthStore.setState({ impersonationTarget: null, originalAccessToken: null });
      }
      return tokens;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { body, skipAuth, headers, enqueueIfOffline, ...rest } = opts;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // Si estamos offline + esta operación es encolable → IDB en vez de fail
  if (
    enqueueIfOffline &&
    typeof navigator !== 'undefined' &&
    !navigator.onLine &&
    (rest.method === 'POST' || rest.method === 'PATCH')
  ) {
    const token = useAuthStore.getState().accessToken;
    await enqueueOffline({
      url: path,
      method: rest.method as 'POST' | 'PATCH',
      body,
      authToken: token,
      kind: enqueueIfOffline.kind,
      partidoId: enqueueIfOffline.partidoId,
    });
    return { __queued: true } as unknown as T;
  }

  const buildHeaders = (token: string | null): HeadersInit => {
    const h: Record<string, string> = {
      Accept: 'application/json',
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(headers as Record<string, string> | undefined),
    };
    if (token && !skipAuth) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const doFetch = async (token: string | null): Promise<Response> =>
    fetch(url, {
      ...rest,
      headers: buildHeaders(token),
      body: body
        ? body instanceof FormData
          ? body
          : JSON.stringify(body)
        : undefined,
      credentials: 'include',
      // Datos de API siempre frescos: TanStack Query maneja el cache a nivel
      // de app. Sin esto, el navegador podía servir un GET viejo de su HTTP
      // cache tras una mutación (ej. cambiar estado de cancha → al refrescar
      // volvía al valor anterior).
      cache: 'no-store',
    });

  const token = useAuthStore.getState().accessToken;
  let res = await doFetch(token);

  if (res.status === 401 && !skipAuth) {
    try {
      const fresh = await refreshTokens();
      res = await doFetch(fresh.accessToken);
    } catch {
      useAuthStore.getState().clearTokens();
      throw new ApiError(401, 'Sesión expirada');
    }
  }

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* ignore */
    }
    // F57 — suscripción suspendida: el backend responde 402 (Payment
    // Required), usado SOLO para este caso. Mandamos a la pantalla de pago.
    if (
      res.status === 402 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/suscripcion')
    ) {
      window.location.href = '/suscripcion';
    }
    let message: string;
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const raw = (parsed as { message: unknown }).message;
      if (Array.isArray(raw)) {
        // class-validator: ["nombre must be at least 2 chars", ...]
        message = raw.filter((x) => typeof x === 'string').join(' · ') || res.statusText;
      } else if (typeof raw === 'string') {
        message = raw;
      } else {
        message = res.statusText;
      }
    } else {
      message = res.statusText;
    }
    throw new ApiError(res.status, message, parsed);
  }

  // 204/205 no traen cuerpo. Además, varios endpoints (ej. DELETE que
  // retornan void) responden 200 con cuerpo vacío: parsear eso como JSON
  // tira "Unexpected end of JSON input". Leemos como texto y solo
  // parseamos si hay contenido.
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
