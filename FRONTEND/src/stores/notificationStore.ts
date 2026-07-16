/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { api, USE_MOCK } from '../lib/api/client';
import { realtime } from '../lib/api/ws';

export interface AppNotification {
  id: string;
  title: string;
  desc: string;
  type: 'critical' | 'warn' | 'info';
  isRead: boolean;
  timestamp: number;
  category: 'Safety Alerts' | 'Work Orders' | 'Compliance' | 'Quality Defects';
}

export interface NotificationPreferences {
  // Category x Channel matrix: Enabled channels per notification category
  [category: string]: {
    inAppToast: boolean;
    email: boolean;
    sms: boolean;
    pushApi: boolean;
  };
}

interface NotificationState {
  notifications: AppNotification[];
  activeToast: AppNotification | null;
  preferences: NotificationPreferences;
  addNotification: (notif: Omit<AppNotification, 'id' | 'isRead' | 'timestamp'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  dismissToast: () => void;
  updatePreference: (category: string, channel: keyof NotificationPreferences[string], value: boolean) => void;
  simulateIncomingEvent: () => void;
  /** Live mode only: fetch the server inbox + open the realtime WS. No-op in mock mode. */
  initLive: () => void;
}

// ── backend → frontend mapping (live mode) ───────────────────────────────────
// Backend categories (docs/05 S3): wo_assigned, gap_detected, prediction,
// doc_processed, mention, digest, safety_alert, system, plus quality/ncr events.
function mapServerCategory(cat?: string): AppNotification['category'] {
  switch ((cat || '').toLowerCase()) {
    case 'safety_alert':
    case 'safety':
      return 'Safety Alerts';
    case 'gap_detected':
    case 'compliance':
      return 'Compliance';
    case 'ncr':
    case 'quality':
    case 'defect':
      return 'Quality Defects';
    default: // wo_assigned, prediction, doc_processed, mention, digest, system
      return 'Work Orders';
  }
}

function mapServerType(priority?: string): AppNotification['type'] {
  const p = (priority || '').toLowerCase();
  if (p === 'critical') return 'critical';
  if (p === 'high' || p === 'warn' || p === 'warning') return 'warn';
  return 'info';
}

function mapServerNotification(n: any): AppNotification {
  return {
    id: String(n.id),
    title: n.title || 'Notification',
    desc: n.body || '',
    type: mapServerType(n.priority),
    isRead: n.read_at != null,
    timestamp: n.created_at ? new Date(n.created_at).getTime() : Date.now(),
    category: mapServerCategory(n.category),
  };
}

const DEFAULT_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: 'OISD WEEKLY TEST OVERDUE',
    desc: 'OISD-STD-118 Clause 6.4 Weekly diesel firewater run is overdue on Pump P-101A.',
    type: 'critical',
    isRead: false,
    timestamp: Date.now() - 10 * 60 * 1000, // 10m ago
    category: 'Safety Alerts'
  },
  {
    id: 'notif-2',
    title: 'HIGH VIBRATION WARN',
    desc: 'High frequency bearing vibration threshold deviation (7.2 mm/s) on Compressor C-302B.',
    type: 'warn',
    isRead: false,
    timestamp: Date.now() - 45 * 60 * 1000, // 45m ago
    category: 'Safety Alerts'
  },
  {
    id: 'notif-3',
    title: 'WORK ORDER ASSIGNED',
    desc: 'WO-2041 "Calibrate Pressure Gauge PG-104" has been assigned to your active queue.',
    type: 'info',
    isRead: false,
    timestamp: Date.now() - 3 * 3600 * 1000, // 3h ago
    category: 'Work Orders'
  },
  {
    id: 'notif-4',
    title: 'COMPLIANCE AUDIT DISCOVERY',
    desc: 'PESO gas expansion license renewal compliance evidence package compiles successfully.',
    type: 'info',
    isRead: true,
    timestamp: Date.now() - 6 * 3600 * 1000, // 6h ago
    category: 'Compliance'
  }
];

const DEFAULT_PREFERENCES: NotificationPreferences = {
  'Safety Alerts': { inAppToast: true, email: true, sms: true, pushApi: true },
  'Work Orders': { inAppToast: true, email: true, sms: false, pushApi: false },
  'Compliance': { inAppToast: true, email: true, sms: false, pushApi: true },
  'Quality Defects': { inAppToast: true, email: false, sms: false, pushApi: false }
};

const MOCK_SIMULATED_EVENTS = [
  {
    title: 'THERMAL FLANGE BREAK DETECTED',
    desc: 'Thermal camera registered gas weeping deviation (84°C) on primary manifold pipe near valve V-230.',
    type: 'critical' as const,
    category: 'Safety Alerts' as const
  },
  {
    title: 'NEW WORK ORDER DISPATCHED',
    desc: 'WO-2315 "Inspect Pump P-101B buffer fluid levels" auto-created by AI predictive lessons analysis.',
    type: 'info' as const,
    category: 'Work Orders' as const
  },
  {
    title: 'COMPLIANCE GAP WARNING',
    desc: 'Factory Act Section 41B reporting disclosure gap aged over 30 days without risk acceptance sign-off.',
    type: 'critical' as const,
    category: 'Compliance' as const
  },
  {
    title: 'NCR IN PROGRESS ADVANCEMENT',
    desc: 'NCR-2026-001 CAPA checklist progressed. Calibration step certified by supervisor.',
    type: 'info' as const,
    category: 'Quality Defects' as const
  },
  {
    title: 'VIBRATION BREACH RESOLVED',
    desc: 'Pump P-101A vibration rate returned to safety standard threshold limits (4.1 mm/s).',
    type: 'info' as const,
    category: 'Safety Alerts' as const
  }
];

// Guards the realtime listener against being attached more than once (the WS
// client is a singleton, so one listener survives all re-mounts).
let liveListenerAttached = false;

export const useNotificationStore = create<NotificationState>((set, get) => {
  // Initialize from LocalStorage or Fallbacks
  const loadNotifications = (): AppNotification[] => {
    // Live mode starts empty; the real inbox is hydrated by initLive() from the
    // server. Only the offline mock demo seeds fixture notifications.
    if (!USE_MOCK) return [];
    const stored = localStorage.getItem('indusmind_live_notifications');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return DEFAULT_NOTIFICATIONS;
  };

  const loadPreferences = (): NotificationPreferences => {
    const stored = localStorage.getItem('indusmind_notification_prefs');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return DEFAULT_PREFERENCES;
  };

  return {
    notifications: loadNotifications(),
    activeToast: null,
    preferences: loadPreferences(),

    addNotification: (notif) => {
      const prefs = get().preferences;
      const categoryPref = prefs[notif.category] || { inAppToast: true, email: false, sms: false, pushApi: false };

      const newNotif: AppNotification = {
        ...notif,
        id: 'notif-' + Date.now(),
        isRead: false,
        timestamp: Date.now()
      };

      const updated = [newNotif, ...get().notifications];
      localStorage.setItem('indusmind_live_notifications', JSON.stringify(updated));

      set({ 
        notifications: updated,
        activeToast: categoryPref.inAppToast ? newNotif : null
      });
    },

    markAsRead: (id) => {
      const updated = get().notifications.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      );
      if (USE_MOCK) {
        localStorage.setItem('indusmind_live_notifications', JSON.stringify(updated));
      } else {
        api.post('/notifications/mark-read', { ids: [id] }).catch(() => {});
      }
      set({ notifications: updated });
    },

    markAllAsRead: () => {
      const updated = get().notifications.map(n => ({ ...n, isRead: true }));
      if (USE_MOCK) {
        localStorage.setItem('indusmind_live_notifications', JSON.stringify(updated));
      } else {
        api.post('/notifications/mark-read', { all: true }).catch(() => {});
      }
      set({ notifications: updated });
    },

    clearNotification: (id) => {
      const updated = get().notifications.filter(n => n.id !== id);
      localStorage.setItem('indusmind_live_notifications', JSON.stringify(updated));
      set({ notifications: updated });
    },

    clearAll: () => {
      localStorage.setItem('indusmind_live_notifications', JSON.stringify([]));
      set({ notifications: [] });
    },

    dismissToast: () => set({ activeToast: null }),

    updatePreference: (category, channel, value) => {
      const updatedPrefs = {
        ...get().preferences,
        [category]: {
          ...get().preferences[category],
          [channel]: value
        }
      };
      localStorage.setItem('indusmind_notification_prefs', JSON.stringify(updatedPrefs));
      set({ preferences: updatedPrefs });
    },

    simulateIncomingEvent: () => {
      const randomEvent = MOCK_SIMULATED_EVENTS[Math.floor(Math.random() * MOCK_SIMULATED_EVENTS.length)];
      get().addNotification(randomEvent);
    },

    initLive: () => {
      if (USE_MOCK) return;

      // 1. Hydrate the inbox from the server (runs on every mount → always fresh).
      api.get<any>('/notifications')
        .then((res) => {
          const rows: any[] = Array.isArray(res) ? res : (res?.items ?? []);
          set({ notifications: rows.map(mapServerNotification) });
        })
        .catch((e) => console.error('Failed to load notifications', e));

      // 2. Attach the realtime listener exactly once (the socket is a singleton
      //    that survives re-mounts). The backend WS frame is
      //    { type: "notification.new", payload: {...} } (senders.py).
      if (!liveListenerAttached) {
        liveListenerAttached = true;
        realtime.on('notification.new', (msg) => {
          const payload = (msg as any).payload ?? msg;
          const notif = mapServerNotification(payload);
          const prefs = get().preferences;
          const categoryPref = prefs[notif.category] || { inAppToast: true, email: false, sms: false, pushApi: false };
          set((state) => {
            if (state.notifications.some(n => n.id === notif.id)) return state; // de-dupe
            return {
              notifications: [notif, ...state.notifications],
              activeToast: categoryPref.inAppToast ? notif : state.activeToast,
            };
          });
        });
      }
      // 3. Open (or reuse) the tenant socket — connect() is idempotent.
      realtime.connect();
    }
  };
});
