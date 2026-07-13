import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { api } from './api/client';

interface I18nContextType {
  locale: string;
  t: (key: string, defaultValue?: string) => string;
  loading: boolean;
  setLocale: (locale: string) => Promise<void>;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Fallback default English translations in case loading fails or is pending
const DEFAULT_FALLBACKS: Record<string, string> = {
  'nav.dashboard': 'Dashboard',
  'nav.copilot': 'Expert Copilot',
  'nav.documents': 'Documents',
  'nav.equipment': 'Equipment 360',
  'nav.maintenance': 'Maintenance Hub',
  'nav.compliance': 'Compliance',
  'nav.admin': 'Admin Suite',
  'nav.settings': 'Settings',
  'auth.login': 'System Authorization',
  'auth.forgot': 'Forgot Password?',
  'auth.reset': 'Reset Password',
  'copilot.title': 'Expert Copilot Chat',
  'copilot.ask': 'Ask our specialized industrial AI...'
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateEffectiveSettings } = useSettingsStore();
  const locale = settings['locale.language'] || 'en';
  const [bundles, setBundles] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);

  // Load namespace bundles
  const loadBundles = async (currentLocale: string) => {
    setLoading(true);
    try {
      const namespaces = ['common', 'nav', 'auth', 'copilot'];
      const loaded: Record<string, Record<string, string>> = {};
      
      await Promise.all(
        namespaces.map(async (ns) => {
          try {
            const data = await api.get<Record<string, string>>(`/i18n/${currentLocale}/${ns}`);
            loaded[ns] = data || {};
          } catch (e) {
            console.warn(`Failed to load translation bundle for namespace ${ns}`, e);
            loaded[ns] = {};
          }
        })
      );
      setBundles(loaded);
    } catch (err) {
      console.error('Error loading i18n bundles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBundles(locale);
  }, [locale]);

  const setLocale = async (newLocale: string) => {
    try {
      await api.put('/me/preferences', { 'locale.language': newLocale });
      updateEffectiveSettings({ 'locale.language': newLocale });
    } catch (err) {
      console.error('Failed to persist language preference:', err);
    }
  };

  const t = (key: string, defaultValue?: string): string => {
    const parts = key.split('.');
    let ns = 'common';
    let k = key;

    if (parts.length > 1) {
      ns = parts[0];
      k = parts.slice(1).join('.');
    }

    const value = bundles[ns]?.[k];
    if (value !== undefined) return value;

    // Try fallback
    if (DEFAULT_FALLBACKS[key] !== undefined) {
      return DEFAULT_FALLBACKS[key];
    }

    return defaultValue || key;
  };

  return (
    <I18nContext.Provider value={{ locale, t, loading, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
