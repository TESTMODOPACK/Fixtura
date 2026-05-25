/**
 * Cliente fetch tipado con manejo automático de:
 *   - Authorization Bearer si hay accessToken en el store
 *   - Refresh automático si el access token expiró (queue de requests
 *     en vuelo para no disparar N refreshes en paralelo)
 *   - Parsing de errores con shape { statusCode, message, error }
 */
import type { AuthTokens } from '@fixtura/types';

import { useAuthStore } from '@/store/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const API_BASE = `${API_URL}/api/v1`;

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

type FetchOpts = Omit<RequestInit, 'body'> & {
  body?: unknown;
  skipAuth?: boolean;
};

let refreshPromise: Promise<AuthTokens> | null = null;

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;
  const { refreshToken, setTokens, clearTokens } = useAuthStore.getState();
  if (!refreshToken) throw new ApiError(401, 'No refresh token');

  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        clearTokens();
        throw new ApiError(res.status, 'Refresh failed');
      }
      const tokens = (await res.json()) as AuthTokens;
      setTokens(tokens);
      return tokens;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = opts;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

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
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : res.statusText;
    throw new ApiError(res.status, message, parsed);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
