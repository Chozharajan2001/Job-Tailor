import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionExpired: boolean;

  // Actions
  setAuth: (user: User, accessToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
  setSessionExpired: (expired: boolean) => void;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      sessionExpired: false,

      // Initialize auth state - call this on app mount.
      // The access token lives only in memory, so after a page reload we try
      // to restore the session silently using the HttpOnly refresh cookie.
      initialize: async () => {
        const state = get();

        if (!state.user) {
          // No persisted user — nothing to restore
          set({ isLoading: false, sessionExpired: false });
          return;
        }

        // Lazily import to avoid a circular dependency (api -> authStore)
        const { api } = await import("../services/api");
        const restored = await api.trySilentRefresh();

        if (restored) {
          set({
            isAuthenticated: true,
            isLoading: false,
            sessionExpired: false,
          });
        } else {
          // Cookie expired or invalid — fully reset and clear any stale caches
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            sessionExpired: false,
          });
        }
      },

      setAuth: (user, accessToken) =>
        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
          sessionExpired: false,
        }),

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          sessionExpired: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),
      setSessionExpired: (sessionExpired) => set({ sessionExpired }),
      setAccessToken: (accessToken) =>
        set({
          accessToken: accessToken || null,
          isAuthenticated: Boolean(accessToken),
        }),
    }),
    {
      name: "jobtailor-auth",
      partialize: (state) => ({
        user: state.user,
        sessionExpired: state.sessionExpired,
      }),
    },
  ),
);
