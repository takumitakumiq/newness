/**
 * MATSU - Auth State Store (Zustand)
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/types";
import * as api from "@/lib/api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    password_confirm: string;
    first_name?: string;
    last_name?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true });
        try {
          await api.login({ username, password });
          const user = await api.getCurrentUser();
          set({ user, isAuthenticated: !!user, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          await api.register(data);
          // Auto login after registration
          await api.login({ username: data.username, password: data.password });
          const user = await api.getCurrentUser();
          set({ user, isAuthenticated: !!user, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        await api.logout();
        set({ user: null, isAuthenticated: false, isLoading: false });
      },

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const user = await api.getCurrentUser();
          if (user) {
            set({ user, isAuthenticated: true, isLoading: false });
          } else {
            // Try to refresh token
            const refreshed = await api.refreshToken();
            if (refreshed) {
              const user = await api.getCurrentUser();
              set({ user, isAuthenticated: !!user, isLoading: false });
            } else {
              set({ user: null, isAuthenticated: false, isLoading: false });
            }
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      updateProfile: async (data) => {
        const user = await api.updateProfile(data);
        set({ user });
      },
    }),
    {
      name: "matsu-auth",
      partialize: (state) => ({
        // Only persist user data, not loading states
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
