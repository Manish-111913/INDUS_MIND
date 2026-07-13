/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { api } from '../lib/api/client';

export interface EffectiveSettings {
  'locale.currency': string;
  'locale.date_format': string;
  'locale.timezone': string;
  'units.system': string;
  'units.pressure': string;
  'units.temperature': string;
  'branding.app_name': string;
  'branding.logo_url': string;
  'ai.default_confidence_threshold': number;
  [key: string]: any;
}

interface SettingsState {
  settings: EffectiveSettings;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateEffectiveSettings: (newSettings: Partial<EffectiveSettings>) => void;
}

export const DEFAULT_SETTINGS: EffectiveSettings = {
  'locale.currency': 'INR',
  'locale.date_format': 'dd MMM yyyy',
  'locale.timezone': 'Asia/Kolkata',
  'units.system': 'metric',
  'units.pressure': 'bar',
  'units.temperature': 'C',
  'branding.app_name': 'IndusMind',
  'branding.logo_url': '',
  'ai.default_confidence_threshold': 85,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  error: null,
  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<EffectiveSettings>('/settings/effective');
      set({ settings: { ...DEFAULT_SETTINGS, ...data }, isLoading: false });
    } catch (err: any) {
      set({ error: err?.message || 'Failed to fetch settings', isLoading: false });
    }
  },
  updateEffectiveSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    }));
  }
}));
