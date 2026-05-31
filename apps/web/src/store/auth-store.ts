import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AuthTokens } from '@fixtura/types';

/**
 * Sprint 21 — RF-06: cuando el super admin entra a impersonar, guardamos
 * sus tokens originales en `originalTokens`. Al salir, los restauramos.
 * `impersonationTarget` tiene el email del usuario impersonado para el
 * banner visible siempre activo durante la sesión.
 */
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  originalTokens: AuthTokens | null;
  impersonationTarget: { userId: string; email: string } | null;
  setTokens: (tokens: AuthTokens) => void;
  clearTokens: () => void;
  startImpersonation: (
    targetTokens: AuthTokens,
    target: { userId: string; email: string },
  ) => void;
  endImpersonation: () => AuthTokens | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      originalTokens: null,
      impersonationTarget: null,
      setTokens: (tokens) =>
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      clearTokens: () =>
        set({
          accessToken: null,
          refreshToken: null,
          originalTokens: null,
          impersonationTarget: null,
        }),
      startImpersonation: (targetTokens, target) => {
        const state = get();
        // Solo guardamos backup si NO había impersonación previa (anti
        // anidamiento: super_admin → A → B perdería los tokens originales).
        const original =
          state.originalTokens ??
          (state.accessToken && state.refreshToken
            ? {
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                accessTokenExpiresIn: 0,
              }
            : null);
        set({
          accessToken: targetTokens.accessToken,
          refreshToken: targetTokens.refreshToken,
          originalTokens: original,
          impersonationTarget: target,
        });
      },
      endImpersonation: () => {
        const state = get();
        const restored = state.originalTokens;
        if (!restored) {
          set({ impersonationTarget: null });
          return null;
        }
        set({
          accessToken: restored.accessToken,
          refreshToken: restored.refreshToken,
          originalTokens: null,
          impersonationTarget: null,
        });
        return restored;
      },
    }),
    {
      name: 'fixtura-auth',
      // sessionStorage: la sesión muere al cerrar la pestaña/navegador.
      // Si el usuario vuelve a abrir el sitio, tiene que loggearse de nuevo.
      // Más seguro que localStorage para una app con datos sensibles.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : (undefined as never),
      ),
    },
  ),
);
