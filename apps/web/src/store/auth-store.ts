import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthTokens } from '@fixtura/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (tokens: AuthTokens) => void;
  clearTokens: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      setTokens: (tokens) =>
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      clearTokens: () => set({ accessToken: null, refreshToken: null }),
    }),
    { name: 'fixtura-auth' },
  ),
);
