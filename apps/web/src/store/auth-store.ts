import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * A5 — El refresh token (7 días) ya NO vive en el store/sessionStorage: viaja
 * en una cookie HttpOnly que el navegador maneja solo (inaccesible a JS/XSS).
 * El store solo guarda el access token (vida corta, 15 min).
 *
 * Impersonación (Sprint 21): se intercambia SOLO el access token. El refresh
 * del super admin sigue en su cookie HttpOnly, intacto — la impersonación usa
 * un access token "solo" (sin refresh) emitido por el backend, así que dura lo
 * que ese access (≤15 min) y al expirar/salir el refresh del super admin lo
 * devuelve a su sesión (ver auth.controller / impersonation.service).
 */
interface AuthState {
  accessToken: string | null;
  /** Access token del super admin, guardado mientras impersona. */
  originalAccessToken: string | null;
  impersonationTarget: { userId: string; email: string } | null;
  setTokens: (tokens: { accessToken: string }) => void;
  clearTokens: () => void;
  startImpersonation: (
    targetAccessToken: string,
    target: { userId: string; email: string },
  ) => void;
  endImpersonation: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      originalAccessToken: null,
      impersonationTarget: null,
      setTokens: (tokens) => set({ accessToken: tokens.accessToken }),
      clearTokens: () =>
        set({
          accessToken: null,
          originalAccessToken: null,
          impersonationTarget: null,
        }),
      startImpersonation: (targetAccessToken, target) => {
        const state = get();
        // Anti-anidamiento: si ya impersonaba, conserva el access original.
        const original = state.originalAccessToken ?? state.accessToken;
        set({
          accessToken: targetAccessToken,
          originalAccessToken: original,
          impersonationTarget: target,
        });
      },
      endImpersonation: () => {
        const state = get();
        // Si no hay access original (caso anómalo), NO dejamos "pegado" el
        // token del target: limpiamos la sesión y forzamos re-login del super
        // admin (hallazgo revisión A5).
        if (!state.originalAccessToken) {
          set({ accessToken: null, originalAccessToken: null, impersonationTarget: null });
          return;
        }
        set({
          accessToken: state.originalAccessToken,
          originalAccessToken: null,
          impersonationTarget: null,
        });
      },
    }),
    {
      name: 'fixtura-auth',
      // A5: el modelo de sesión cambió (el refresh dejó de vivir en el store y
      // pasó a una cookie HttpOnly). El bump de versión descarta el estado
      // persistido viejo (que tenía refreshToken en sessionStorage) → un único
      // re-login forzado al desplegar, tras el cual el backend setea la cookie.
      version: 1,
      // sessionStorage: la sesión muere al cerrar la pestaña. El refresh real
      // vive en una cookie HttpOnly, no acá.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : (undefined as never),
      ),
    },
  ),
);
