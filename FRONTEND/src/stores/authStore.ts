/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { User, UserRole } from '../types';
import { api, setTokens } from '../lib/api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  checkSession: () => Promise<User | null>;
  updatePlant: (plant: string) => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Listen for global logout events (triggered by expired refresh tokens or manual logout)
  if (typeof window !== 'undefined') {
    window.addEventListener('auth-logout', () => {
      set({ user: null, isAuthenticated: false, error: 'Session expired. Please log in again.' });
    });
  }

  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,

    login: async (email, password) => {
      set({ isLoading: true, error: null });
      try {
        const data = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/login', {
          email,
          password,
        });
        setTokens(data.token, data.refreshToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
        return data.user;
      } catch (err: any) {
        const msg = err?.error?.message || 'Login failed';
        set({ error: msg, isLoading: false });
        throw err;
      }
    },

    register: async (name, email, password) => {
      set({ isLoading: true, error: null });
      try {
        const data = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/register', {
          name,
          email,
          password,
        });
        setTokens(data.token, data.refreshToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
        return data.user;
      } catch (err: any) {
        const msg = err?.error?.message || 'Registration failed';
        set({ error: msg, isLoading: false });
        throw err;
      }
    },

    logout: () => {
      setTokens(null, null);
      set({ user: null, isAuthenticated: false, error: null });
    },

    checkSession: async () => {
      const token = localStorage.getItem('indusmind_access_token');
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return null;
      }

      set({ isLoading: true, error: null });
      try {
        const user = await api.get<User>('/auth/me');
        set({ user, isAuthenticated: true, isLoading: false });
        return user;
      } catch (err) {
        // If checking session fails, tokens are cleared and state reset
        setTokens(null, null);
        set({ user: null, isAuthenticated: false, isLoading: false });
        return null;
      }
    },

    updatePlant: (plant) => {
      const { user } = get();
      if (user) {
        set({ user: { ...user, plant } });
      }
    },

    hasPermission: (permission) => {
      const { user } = get();
      if (!user) return false;
      // Admins bypass all permission checks
      if (user.role === 'Admin') return true;
      return user.permissions.includes(permission);
    },
  };
});
