/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { User, UserRole } from '../types';
import { api, setTokens, USE_MOCK, mapMeToUser } from '../lib/api/client';

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
        // Live backend (docs/02 §24): { access_token, expires_in, user } + an
        // httpOnly refresh cookie. Mock backend: { token, refreshToken, user }.
        const data = await api.post<any>('/auth/login', { email, password });
        setTokens(data.access_token ?? data.token, data.refreshToken ?? null);

        let user: User;
        if (!USE_MOCK) {
          // Roles/permissions/flags are not on the login payload — hydrate the
          // full profile from /auth/me.
          const me = await api.get<any>('/auth/me');
          user = mapMeToUser(me);
        } else {
          user = data.user as User;
        }
        set({ user, isAuthenticated: true, isLoading: false });
        return user;
      } catch (err: any) {
        const msg = err?.error?.message || 'Login failed';
        set({ error: msg, isLoading: false });
        throw err;
      }
    },

    register: async (name, email, password) => {
      // The live backend has no self-service registration endpoint (docs/02 §24
      // — accounts are provisioned via POST /users/invite by an admin). Only the
      // mock backend supports open sign-up.
      if (!USE_MOCK) {
        const err = { error: { code: 'NOT_SUPPORTED', message: 'Self sign-up is disabled. Ask an administrator to invite you.' } };
        set({ error: err.error.message, isLoading: false });
        throw err;
      }
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
      // Best-effort server-side revoke (clears the refresh cookie + session).
      if (!USE_MOCK) {
        api.post('/auth/logout').catch(() => {});
      }
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
        const me = await api.get<any>('/auth/me');
        // Live /auth/me → { user, roles, permissions, flags }; mock → User.
        const user: User = !USE_MOCK ? mapMeToUser(me) : (me as User);
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
