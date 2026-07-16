import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  initialize: () => void;
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

      // Initialize auth state - call this on app mount
      initialize: () => {
        // Check if we have persisted auth data
        const state = get();
        if (state.accessToken && state.user) {
          // We have valid auth, keep isLoading false (already set by persist)
          set({ isLoading: false, sessionExpired: false });
        } else {
          // No auth data, stop loading
          set({ isLoading: false, sessionExpired: false });
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
          accessToken,
          isAuthenticated: true,
        }),
    }),
    { name: 'jobtailor-auth' }
  )
);