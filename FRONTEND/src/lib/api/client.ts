/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MOCK_USERS, MOCK_NAV_ITEMS, MockUserDbEntry } from './mockData';
import { ApiResponseEnvelope, ApiErrorEnvelope, User, NavigationItem, DocumentFile, ExtractedEntity } from '../../types';
import { MOCK_LOOKUPS, SEED_DOCUMENTS } from './mockDocuments';

// Users created at runtime via the sign-up flow, persisted to localStorage so they
// survive reloads and can authenticate exactly like the seeded demo accounts.
const REGISTERED_USERS_KEY = 'indusmind_registered_users';

function getRegisteredUsers(): Record<string, MockUserDbEntry> {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveRegisteredUser(entry: MockUserDbEntry) {
  const users = getRegisteredUsers();
  users[entry.user.email] = entry;
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
}

// Look up a user across both the seeded demo accounts and runtime sign-ups.
function lookupUser(email: string): MockUserDbEntry | undefined {
  return MOCK_USERS[email] || getRegisteredUsers()[email];
}

// Helper to load/save documents from localStorage
export function getStoredDocuments(): DocumentFile[] {
  const stored = localStorage.getItem('indusmind_documents');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // fallback
    }
  }
  localStorage.setItem('indusmind_documents', JSON.stringify(SEED_DOCUMENTS));
  return SEED_DOCUMENTS;
}

export function saveStoredDocuments(docs: DocumentFile[]) {
  localStorage.setItem('indusmind_documents', JSON.stringify(docs));
}

export function getStoredSettings(): Record<string, any> {
  const DEFAULT_SETTINGS = {
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
  const stored = localStorage.getItem('indusmind_effective_settings');
  if (stored) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch (e) {}
  }
  localStorage.setItem('indusmind_effective_settings', JSON.stringify(DEFAULT_SETTINGS));
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: Record<string, any>) {
  localStorage.setItem('indusmind_effective_settings', JSON.stringify(settings));
}

export function getStoredSavedViews(): any[] {
  const stored = localStorage.getItem('indusmind_saved_views');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  const defaultViews = [
    {
      id: 'view-default-1',
      name: 'All Pendings',
      tableId: 'documents',
      columns: ['select', 'name', 'type', 'plant', 'status', 'confidence'],
      density: 'comfortable',
      sorting: [{ id: 'date', desc: true }],
      isShared: true,
      createdBy: 'System',
    },
    {
      id: 'view-default-2',
      name: 'My Area Criticals',
      tableId: 'documents',
      columns: ['select', 'name', 'status', 'confidence'],
      density: 'compact',
      sorting: [{ id: 'confidence', desc: false }],
      isShared: false,
      createdBy: 'Me',
    }
  ];
  localStorage.setItem('indusmind_saved_views', JSON.stringify(defaultViews));
  return defaultViews;
}

export function saveStoredSavedViews(views: any[]) {
  localStorage.setItem('indusmind_saved_views', JSON.stringify(views));
}

export function getStoredNotificationPrefs(): any[] {
  const stored = localStorage.getItem('indusmind_user_notification_prefs');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  const defaultPrefs = [
    { event: 'work_order.assigned', inApp: true, email: true, digest: 'Instant' },
    { event: 'work_order.overdue', inApp: true, email: true, digest: 'Instant' },
    { event: 'ingestion.completed', inApp: true, email: false, digest: 'Daily' },
    { event: 'ingestion.failed', inApp: true, email: true, digest: 'Instant' },
    { event: 'prediction.high_risk', inApp: true, email: true, digest: 'Instant' },
    { event: 'compliance.gap_found', inApp: true, email: true, digest: 'Daily' },
    { event: 'document.new_version', inApp: false, email: false, digest: 'Off' },
    { event: 'part.low_stock', inApp: true, email: true, digest: 'Daily' },
    { event: 'audit.upcoming', inApp: true, email: true, digest: 'Daily' },
    { event: 'mention.created', inApp: true, email: false, digest: 'Instant' }
  ];
  localStorage.setItem('indusmind_user_notification_prefs', JSON.stringify(defaultPrefs));
  return defaultPrefs;
}

export function saveStoredNotificationPrefs(prefs: any[]) {
  localStorage.setItem('indusmind_user_notification_prefs', JSON.stringify(prefs));
}

export function getStoredNotificationTemplates(): any[] {
  const stored = localStorage.getItem('indusmind_notification_templates');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  const defaultTemplates = [
    {
      id: 'tpl-1',
      event: 'work_order.assigned',
      channel: 'email',
      locale: 'en-IN',
      active: true,
      version: '1.0.1',
      subject: 'New Assignment: {{work_order_id}} for {{equipment_id}}',
      body: 'Hello {{user_name}},\n\nYou have been assigned work order {{work_order_id}} ("{{title}}") for equipment {{equipment_id}} at {{plant_name}}.\n\nPlease log in to review and close it out.\n\nBest regards,\nIndusMind Node Router'
    },
    {
      id: 'tpl-2',
      event: 'work_order.overdue',
      channel: 'email',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'OVERDUE NOTICE: {{work_order_id}}',
      body: 'Hello {{user_name}},\n\nUrgent: Work order {{work_order_id}} ("{{title}}") on {{equipment_id}} is now overdue. Please proceed with caution.'
    },
    {
      id: 'tpl-3',
      event: 'ingestion.completed',
      channel: 'inApp',
      locale: 'en-IN',
      active: true,
      version: '1.2.0',
      subject: 'Document Ingestion Successful: {{doc_name}}',
      body: 'Success: {{doc_name}} was successfully ingested. AI Confidence: {{confidence}}%.'
    },
    {
      id: 'tpl-4',
      event: 'ingestion.failed',
      channel: 'inApp',
      locale: 'en-IN',
      active: true,
      version: '1.1.0',
      subject: 'Ingestion Error on {{doc_name}}',
      body: 'Critical: Ingestion failed for {{doc_name}} due to: {{error_reason}}.'
    },
    {
      id: 'tpl-5',
      event: 'prediction.high_risk',
      channel: 'inApp',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'Anomaly Detected on {{equipment_id}}',
      body: 'Risk Threshold breached! {{equipment_id}} predicted high-risk. Metric deviation: {{metric}}.'
    },
    {
      id: 'tpl-6',
      event: 'compliance.gap_found',
      channel: 'email',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'Regulatory Gap Found: {{rule_id}}',
      body: 'Compliance alert! A gap was identified against standard {{rule_id}} at area {{area_name}}.'
    },
    {
      id: 'tpl-7',
      event: 'document.new_version',
      channel: 'inApp',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'New Document Version: {{doc_name}}',
      body: 'Operator update: Version {{version_id}} of {{doc_name}} was uploaded by {{uploader}}.'
    },
    {
      id: 'tpl-8',
      event: 'part.low_stock',
      channel: 'email',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'Part Inventory Low: {{part_id}}',
      body: 'Warehouse notice: Part {{part_id}} ({{part_name}}) is low on stock. Current quantity: {{qty}}.'
    },
    {
      id: 'tpl-9',
      event: 'audit.upcoming',
      channel: 'email',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'Upcoming Audit Reminder: {{audit_id}}',
      body: 'Dear {{user_name}},\n\nAn audit for {{rule_id}} is scheduled on {{audit_date}} at sector {{plant_name}}.'
    },
    {
      id: 'tpl-10',
      event: 'mention.created',
      channel: 'inApp',
      locale: 'en-IN',
      active: true,
      version: '1.0.0',
      subject: 'New Mention from {{sender}}',
      body: 'Operator {{sender}} mentioned you in a comment: "{{comment}}".'
    }
  ];
  localStorage.setItem('indusmind_notification_templates', JSON.stringify(defaultTemplates));
  return defaultTemplates;
}

export function saveStoredNotificationTemplates(templates: any[]) {
  localStorage.setItem('indusmind_notification_templates', JSON.stringify(templates));
}

export function getStoredAiFeedback(): any[] {
  const stored = localStorage.getItem('indusmind_ai_feedback');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  // Let's pre-seed some interesting flagged feedback to make the dashboard look populated and high fidelity!
  const defaultFeedback = [
    {
      id: 'fb-1',
      messageId: 'msg-seed-1',
      timestamp: Date.now() - 3600 * 1000 * 24, // 1 day ago
      score: -1,
      reason: 'missing_citation',
      comment: 'Answer omitted page citation for torque parameters of butterfly valve seal replacement.',
      messageText: 'To replace the PTFE seat seal on valve V-230, disassemble the actuator housing, remove the retention ring, and insert the seal. Ensure the flange alignment is precise.'
    },
    {
      id: 'fb-2',
      messageId: 'msg-seed-2',
      timestamp: Date.now() - 3600 * 1000 * 4, // 4 hours ago
      score: -1,
      reason: 'wrong_answer',
      comment: 'State torque limit as 180 N-m, but the valve manual specifically limits actuated stem sequences to 120 N-m.',
      messageText: 'Standard operating parameters for Triple-offset butterfly valve V-230 specifies a maximum torque of 180 N-m across star sequence. Use grease lubrication.'
    }
  ];
  localStorage.setItem('indusmind_ai_feedback', JSON.stringify(defaultFeedback));
  return defaultFeedback;
}

export function saveStoredAiFeedback(feedback: any[]) {
  localStorage.setItem('indusmind_ai_feedback', JSON.stringify(feedback));
}

export const EVENT_VARIABLES_LEGEND: Record<string, { varName: string, desc: string, sample: string }[]> = {
  'work_order.assigned': [
    { varName: 'work_order_id', desc: 'The unique ID of the work order', sample: 'WO-2041' },
    { varName: 'title', desc: 'Title of the work order', sample: 'Calibrate Pressure Gauge PG-104' },
    { varName: 'equipment_id', desc: 'The ID of the equipment', sample: 'PG-104' },
    { varName: 'user_name', desc: 'Assigned operator full name', sample: 'Aditya Vardhan' },
    { varName: 'plant_name', desc: 'Name of the operational refinery sector', sample: 'Reliance Jamnagar Refinery - Sector A' }
  ],
  'work_order.overdue': [
    { varName: 'work_order_id', desc: 'The unique ID of the work order', sample: 'WO-1982' },
    { varName: 'title', desc: 'Title of the work order', sample: 'Inspect Firewater Diesel Pump P-101A' },
    { varName: 'equipment_id', desc: 'The ID of the equipment', sample: 'P-101A' },
    { varName: 'user_name', desc: 'Assigned operator full name', sample: 'Aditya Vardhan' }
  ],
  'ingestion.completed': [
    { varName: 'doc_name', desc: 'The name of the ingested document', sample: 'PID-992-SECTOR-A-REFINERY.DWG.PDF' },
    { varName: 'confidence', desc: 'AI confidence score percentage', sample: '94' }
  ],
  'ingestion.failed': [
    { varName: 'doc_name', desc: 'The name of the document', sample: 'SOP-REF-V2.DOCX' },
    { varName: 'error_reason', desc: 'The error explanation', sample: 'OCR parsing timeout' }
  ],
  'prediction.high_risk': [
    { varName: 'equipment_id', desc: 'The ID of the equipment', sample: 'Compressor C-302B' },
    { varName: 'metric', desc: 'The anomaly metric description', sample: 'High vibration frequency (7.2 mm/s)' }
  ],
  'compliance.gap_found': [
    { varName: 'rule_id', desc: 'The regulatory standard ID', sample: 'OISD-STD-118' },
    { varName: 'area_name', desc: 'Refinery area name', sample: 'Crude Unit 1' }
  ],
  'document.new_version': [
    { varName: 'doc_name', desc: 'The document file name', sample: 'OEM-VALVE-V230-MANUAL.PDF' },
    { varName: 'version_id', desc: 'The version number', sample: 'V3.0' },
    { varName: 'uploader', desc: 'User who uploaded the version', sample: 'Priya Sharma' }
  ],
  'part.low_stock': [
    { varName: 'part_id', desc: 'The unique spare part ID', sample: 'PRT-9004' },
    { varName: 'part_name', desc: 'Part descriptive name', sample: 'Triple-offset PTFE seal V-230' },
    { varName: 'qty', desc: 'Current quantity in stock', sample: '2' }
  ],
  'audit.upcoming': [
    { varName: 'audit_id', desc: 'The scheduled audit ID', sample: 'AUD-8821' },
    { varName: 'rule_id', desc: 'The audit category standard', sample: 'PESO-EXPANSION-2026' },
    { varName: 'audit_date', desc: 'The target date of the audit', sample: '2026-07-20' },
    { varName: 'plant_name', desc: 'The target sector', sample: 'KG-D6 Deepwater Gas Field Terminal' },
    { varName: 'user_name', desc: 'Recipient name', sample: 'Aditya Vardhan' }
  ],
  'mention.created': [
    { varName: 'sender', desc: 'Name of the operator mentioning', sample: 'Arun Kumar' },
    { varName: 'comment', desc: 'The comment text snippet', sample: 'Vibration values seem to be rising again' }
  ]
};

// In-memory token storage
let inMemoryAccessToken: string | null = localStorage.getItem('indusmind_access_token');
let inMemoryRefreshToken: string | null = localStorage.getItem('indusmind_refresh_token');

export const getAccessToken = () => inMemoryAccessToken;
export const getRefreshToken = () => inMemoryRefreshToken;

export const setTokens = (accessToken: string | null, refreshToken: string | null) => {
  inMemoryAccessToken = accessToken;
  inMemoryRefreshToken = refreshToken;
  if (accessToken) {
    localStorage.setItem('indusmind_access_token', accessToken);
  } else {
    localStorage.removeItem('indusmind_access_token');
  }
  if (refreshToken) {
    localStorage.setItem('indusmind_refresh_token', refreshToken);
  } else {
    localStorage.removeItem('indusmind_refresh_token');
  }
};

// Base URL configuration
const API_BASE_URL = (import.meta as any).env.VITE_PUBLIC_API_BASE_URL || '/api/mock/v1';

// Helper to decode user email from mock token
function getUserFromToken(token: string): User | null {
  if (!token.startsWith('mock-jwt-token-for-')) return null;
  const email = token.replace('mock-jwt-token-for-', '');
  return lookupUser(email)?.user || null;
}

// Global flag to prevent infinite loops on token refreshing
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
};

/**
 * Custom Mock Interceptor that behaves like a real server
 */
async function simulateNetworkCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponseEnvelope<T>> {
  await new Promise((resolve) => setTimeout(resolve, 300)); // Realistic network latency

  const path = url.replace(API_BASE_URL, '').split('?')[0];
  const method = options.method || 'GET';
  const headers = (options.headers as Record<string, string>) || {};
  const authHeader = headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';

  // 0. Auth Register (create a new account + auto-login)
  if (path === '/auth/register' && method === 'POST') {
    const { name, email, password } = JSON.parse(options.body as string);
    if (!name || !email || !password) {
      throw {
        error: {
          code: 'BAD_REQUEST',
          message: 'Name, email and password are all required.',
        }
      };
    }
    if (lookupUser(email)) {
      throw {
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists. Please sign in instead.',
          fieldErrors: {
            email: 'This email is already registered',
          }
        }
      };
    }

    const newUser: User = {
      id: 'usr-' + Date.now(),
      email,
      name,
      role: 'Field Technician',
      plant: 'Reliance Jamnagar Refinery - Sector A',
      featureFlags: {
        lessons_learned: true,
        predictive_maintenance: false,
        compliance_evidence_pack: false,
        advanced_analytics: false,
      },
      permissions: [
        'doc.read', 'doc.create',
        'equip.read',
        'wo.read', 'wo.close',
        'comp.read',
        'lesson.read',
        'copilot.use',
        'graph.read',
        'readings.record',
        'imports.run'
      ]
    };

    saveRegisteredUser({ passwordHash: password, user: newUser });

    const mockAccess = `mock-jwt-token-for-${email}`;
    return {
      data: {
        token: mockAccess,
        refreshToken: 'mock-refresh-token',
        user: newUser,
      } as unknown as T,
    };
  }

  // 1. Auth Login
  if (path === '/auth/login' && method === 'POST') {
    const { email, password } = JSON.parse(options.body as string);
    const matchedUser = lookupUser(email);
    if (matchedUser && matchedUser.passwordHash === password) {
      const mockAccess = `mock-jwt-token-for-${email}`;
      const mockRefresh = 'mock-refresh-token';
      return {
        data: {
          token: mockAccess,
          refreshToken: mockRefresh,
          user: matchedUser.user,
        } as unknown as T,
      };
    }
    throw {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password. Use Demo@1234.',
        fieldErrors: {
          email: 'Check your email address',
          password: 'Incorrect password',
        }
      }
    };
  }

  // 2. Auth Refresh
  if (path === '/auth/refresh' && method === 'POST') {
    const { refreshToken } = JSON.parse(options.body as string || '{}');
    if (refreshToken === 'mock-refresh-token' && inMemoryAccessToken) {
      // Decode user from old token to generate a new token
      const oldEmail = inMemoryAccessToken.replace('mock-jwt-token-for-', '');
      const newAccess = `mock-jwt-token-for-${oldEmail}`;
      return {
        data: {
          token: newAccess,
          refreshToken: 'mock-refresh-token',
        } as unknown as T,
      };
    }
    throw {
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Your session has expired. Please log in again.',
      }
    };
  }

  // ALL OTHER ENDPOINTS require active session
  if (!token) {
    throw {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      }
    };
  }

  const currentUser = getUserFromToken(token);
  if (!currentUser) {
    throw {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session token.',
      }
    };
  }

  // Parse body safely if present
  let body: any = null;
  if (options.body) {
    try {
      body = JSON.parse(options.body as string);
    } catch (e) {}
  }

  // --- New Core Endpoints for P15 ---

  // lookups (with type query param)
  if (path === '/lookups' && method === 'GET') {
    const urlObj = new URL(url, 'http://localhost');
    const type = urlObj.searchParams.get('type');
    if (type === 'notification_events') {
      return {
        data: [
          'telemetry.alert',
          'compliance.violation',
          'report.generated',
          'system.error',
          'work_order.assigned',
          'work_order.overdue',
          'ingestion.completed',
          'ingestion.failed',
          'prediction.high_risk',
          'compliance.gap_found',
          'document.new_version',
          'part.low_stock',
          'audit.upcoming',
          'mention.created'
        ] as unknown as T
      };
    }
    if (type === 'api_scopes') {
      return {
        data: [
          'read:telemetry',
          'write:telemetry',
          'read:compliance',
          'write:compliance',
          'admin:all'
        ] as unknown as T
      };
    }
    if (type === 'ai_feedback_reason') {
      return {
        data: ['wrong_answer', 'missing_citation', 'outdated_source', 'hallucination', 'other'] as unknown as T
      };
    }
    if (type === 'import_entities') {
      return {
        data: ['equipment', 'readings', 'users'] as unknown as T
      };
    }
    if (type === 'cron_presets') {
      return {
        data: [
          { label: 'Every 5 Minutes (Testing)', value: '*/5 * * * *' },
          { label: 'Daily Plant Summary (0 6 * * *)', value: '0 6 * * *' },
          { label: 'Weekly Safety Audit Rollup (0 0 * * 1)', value: '0 0 * * 1' },
          { label: 'Monthly Safety Compliance (0 0 1 * *)', value: '0 0 1 * *' }
        ] as unknown as T
      };
    }
    if (type === 'shifts') {
      return {
        data: ['Morning Shift', 'Evening Shift', 'Night Shift'] as unknown as T
      };
    }
    if (type === 'stock_reasons') {
      return {
        data: ['receipt', 'wo_consume', 'adjustment', 'damaged'] as unknown as T
      };
    }
    if (type === 'bulk_actions_work_orders') {
      return {
        data: [
          { code: 'change_status', label: 'Change Status to Completed' },
          { code: 'bulk_assign', label: 'Assign to Priya Sharma' },
          { code: 'bulk_export', label: 'Export Selected to PDF' }
        ] as unknown as T
      };
    }
    if (type === 'bulk_actions_documents') {
      return {
        data: [
          { code: 'bulk_tag', label: 'Add Tag "OISD-118"' },
          { code: 'bulk_reingest', label: 'Force Re-ingest (AI OCR)' },
          { code: 'bulk_delete', label: 'Delete Selected Documents' }
        ] as unknown as T
      };
    }
    if (type === 'bulk_actions_notifications') {
      return {
        data: [
          { code: 'mark_read', label: 'Mark as Read' },
          { code: 'delete_notifications', label: 'Delete Selected' }
        ] as unknown as T
      };
    }
  }

  // user notification preferences
  if (path === '/me/notification-preferences' && method === 'GET') {
    const prefs = getStoredNotificationPrefs();
    return { data: prefs as unknown as T };
  }

  if (path.startsWith('/me/notification-preferences') && method === 'PUT') {
    const body = JSON.parse(options.body as string || '{}');
    const prefs = getStoredNotificationPrefs();
    
    // Support either per-row path PUT /me/notification-preferences/:event or general path
    const pathParts = path.split('/');
    const eventFromPath = pathParts.length > 3 ? pathParts[3] : null;
    const targetEvent = eventFromPath || body.event;

    if (!targetEvent) {
      throw { error: { code: 'BAD_REQUEST', message: 'No event specified for preferences update' } };
    }

    const updated = prefs.map(p => {
      if (p.event === targetEvent) {
        return {
          ...p,
          inApp: body.inApp !== undefined ? body.inApp : p.inApp,
          email: body.email !== undefined ? body.email : p.email,
          digest: body.digest !== undefined ? body.digest : p.digest
        };
      }
      return p;
    });

    saveStoredNotificationPrefs(updated);
    const updatedRow = updated.find(p => p.event === targetEvent);
    return { data: updatedRow as unknown as T };
  }

  // admin notification templates
  if (path === '/admin/notification-templates' && method === 'GET') {
    const templates = getStoredNotificationTemplates();
    return { data: templates as unknown as T };
  }

  if (path.startsWith('/admin/notification-templates/') && method === 'PUT') {
    const templateId = path.split('/').pop();
    const body = JSON.parse(options.body as string || '{}');
    const templates = getStoredNotificationTemplates();

    const updated = templates.map(t => {
      if (t.id === templateId) {
        return {
          ...t,
          subject: body.subject !== undefined ? body.subject : t.subject,
          body: body.body !== undefined ? body.body : t.body,
          active: body.active !== undefined ? body.active : t.active,
          version: body.version !== undefined ? body.version : t.version,
          locale: body.locale !== undefined ? body.locale : t.locale,
          channel: body.channel !== undefined ? body.channel : t.channel
        };
      }
      return t;
    });

    saveStoredNotificationTemplates(updated);
    const updatedTpl = updated.find(t => t.id === templateId);
    return { data: updatedTpl as unknown as T };
  }

  if (path === '/admin/notification-templates/preview' && method === 'POST') {
    const { event, subject, body } = JSON.parse(options.body as string || '{}');
    const vars = EVENT_VARIABLES_LEGEND[event] || [];
    const samplePayload: Record<string, string> = {};
    vars.forEach(v => {
      samplePayload[v.varName] = v.sample;
    });

    const replaceTokens = (text: string) => {
      let result = text || '';
      vars.forEach(v => {
        result = result.replace(new RegExp(`{{\\s*${v.varName}\\s*}}`, 'g'), v.sample);
      });
      return result;
    };

    return {
      data: {
        renderedSubject: replaceTokens(subject),
        renderedBody: replaceTokens(body),
        samplePayload
      } as unknown as T
    };
  }

  // AI Feedback
  if (path.startsWith('/chat/messages/') && path.endsWith('/feedback') && method === 'POST') {
    const parts = path.split('/');
    const msgId = parts[3];
    const body = JSON.parse(options.body as string || '{}');
    const feedbackList = getStoredAiFeedback();

    const newFeedback = {
      id: 'fb-' + Date.now(),
      messageId: msgId,
      timestamp: Date.now(),
      score: body.score,
      reason: body.reason || null,
      comment: body.comment || '',
      messageText: body.messageText || 'Sample answer text'
    };

    feedbackList.push(newFeedback);
    saveStoredAiFeedback(feedbackList);

    return { data: newFeedback as unknown as T };
  }

  // AI Observability summary
  if (path === '/admin/ai-usage/summary' && method === 'GET') {
    const feedbackList = getStoredAiFeedback();
    
    // Compile some live stats
    const totalRequests = 21370;
    const totalCost = 20.36;
    const avgLatency = 474;
    const avgCacheHit = 19.8;

    const daily = [
      { date: "2026-06-29", requests: 1420, tokensIn: 850000, tokensOut: 420000, latency: 450, cost: 1.27, cacheHit: 12 },
      { date: "2026-06-30", requests: 1580, tokensIn: 910000, tokensOut: 490000, latency: 480, cost: 1.40, cacheHit: 15 },
      { date: "2026-07-01", requests: 1310, tokensIn: 780000, tokensOut: 390000, latency: 430, cost: 1.17, cacheHit: 10 },
      { date: "2026-07-02", requests: 1690, tokensIn: 1020000, tokensOut: 530000, latency: 510, cost: 1.55, cacheHit: 18 },
      { date: "2026-07-03", requests: 1850, tokensIn: 1150000, tokensOut: 610000, latency: 490, cost: 1.76, cacheHit: 22 },
      { date: "2026-07-04", requests: 920, tokensIn: 450000, tokensOut: 210000, latency: 380, cost: 0.66, cacheHit: 25 },
      { date: "2026-07-05", requests: 850, tokensIn: 410000, tokensOut: 190000, latency: 360, cost: 0.60, cacheHit: 28 },
      { date: "2026-07-06", requests: 1720, tokensIn: 1090000, tokensOut: 580000, latency: 475, cost: 1.67, cacheHit: 14 },
      { date: "2026-07-07", requests: 1910, tokensIn: 1210000, tokensOut: 640000, latency: 520, cost: 1.85, cacheHit: 19 },
      { date: "2026-07-08", requests: 2040, tokensIn: 1300000, tokensOut: 690000, latency: 540, cost: 1.99, cacheHit: 21 },
      { date: "2026-07-09", requests: 1880, tokensIn: 1180000, tokensOut: 590000, latency: 495, cost: 1.77, cacheHit: 24 },
      { date: "2026-07-10", requests: 1950, tokensIn: 1250000, tokensOut: 620000, latency: 505, cost: 1.87, cacheHit: 20 },
      { date: "2026-07-11", requests: 1020, tokensIn: 510000, tokensOut: 240000, latency: 390, cost: 0.75, cacheHit: 26 },
      { date: "2026-07-12", requests: 1150, tokensIn: 580000, tokensOut: 290000, latency: 410, cost: 0.87, cacheHit: 23 }
    ];

    const models = [
      { name: "Gemini 1.5 Flash", requests: 14850, percentage: 69.5, tokens: 12450000, latency: 320, cost: 1.87 },
      { name: "Gemini 1.5 Pro", requests: 5120, percentage: 24.0, tokens: 8920000, latency: 850, cost: 13.38 },
      { name: "Gemini Pro 1.0", requests: 1400, percentage: 6.5, tokens: 2410000, latency: 510, cost: 5.11 }
    ];

    return {
      data: {
        summary: {
          totalRequests,
          totalCost,
          avgLatency,
          avgCacheHit
        },
        daily,
        models,
        flaggedFeedback: feedbackList.filter(f => f.score === -1)
      } as unknown as T
    };
  }

  // Settings Endpoints
  if (path === '/settings/effective' && method === 'GET') {
    const settings = getStoredSettings();
    return {
      data: settings as unknown as T
    };
  }

  if (path === '/me/preferences' && method === 'PUT') {
    const body = JSON.parse(options.body as string || '{}');
    const settings = getStoredSettings();
    const updated = { ...settings, ...body };
    saveStoredSettings(updated);
    return {
      data: updated as unknown as T
    };
  }

  if (path === '/admin/settings/definitions' && method === 'GET') {
    const definitions = [
      {
        group: "General",
        key: "locale.currency",
        name: "Default Currency",
        value_type: "select",
        options: ["INR", "USD", "EUR"],
        description: "Default currency used for financial calculations across views"
      },
      {
        group: "General",
        key: "locale.date_format",
        name: "Date Format",
        value_type: "select",
        options: ["dd MMM yyyy", "yyyy-MM-dd", "MM/dd/yyyy"],
        description: "Standard layout for display timestamps"
      },
      {
        group: "General",
        key: "locale.timezone",
        name: "Timezone",
        value_type: "select",
        options: ["Asia/Kolkata", "UTC", "America/New_York"],
        description: "Regional reference timezone for scheduled events"
      },
      {
        group: "Units",
        key: "units.system",
        name: "Unit System",
        value_type: "select",
        options: ["metric", "imperial"],
        description: "Primary physics system for calculations"
      },
      {
        group: "Units",
        key: "units.pressure",
        name: "Pressure Unit",
        value_type: "select",
        options: ["bar", "psi", "kPa"],
        description: "Measurement scale for pressure systems"
      },
      {
        group: "Units",
        key: "units.temperature",
        name: "Temperature Unit",
        value_type: "select",
        options: ["C", "F"],
        description: "Standard layout for thermodynamic metrics"
      },
      {
        group: "Branding",
        key: "branding.app_name",
        name: "Application Name",
        value_type: "string",
        description: "Custom title bar branding for the plant tenant"
      },
      {
        group: "Branding",
        key: "branding.logo_url",
        name: "Branding Logo URL",
        value_type: "string",
        description: "Remote asset reference for customer branding"
      },
      {
        group: "AI Settings",
        key: "ai.default_confidence_threshold",
        name: "AI Confidence Threshold",
        value_type: "number",
        description: "Tolerance threshold filter (0-100) for machine intelligence insights"
      }
    ];
    return {
      data: definitions as unknown as T
    };
  }

  if (path === '/admin/settings/values' && method === 'PUT') {
    const body = JSON.parse(options.body as string || '{}');
    const settings = getStoredSettings();
    const updated = { ...settings, ...body };
    saveStoredSettings(updated);
    return {
      data: updated as unknown as T
    };
  }

  // Saved Views Endpoints
  if (path === '/saved-views' && method === 'GET') {
    const views = getStoredSavedViews();
    return {
      data: views as unknown as T
    };
  }

  if (path === '/saved-views' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const views = getStoredSavedViews();
    const newView = {
      id: 'view-' + Date.now(),
      name: body.name || 'Unnamed View',
      tableId: body.tableId || 'documents',
      columns: body.columns || [],
      density: body.density || 'comfortable',
      sorting: body.sorting || [],
      isShared: body.isShared ?? false,
      createdBy: currentUser.name || 'User',
    };
    views.push(newView);
    saveStoredSavedViews(views);
    return {
      data: newView as unknown as T
    };
  }

  if (path.startsWith('/saved-views/') && method === 'DELETE') {
    const id = path.replace('/saved-views/', '');
    const views = getStoredSavedViews();
    const filtered = views.filter(v => v.id !== id);
    saveStoredSavedViews(filtered);
    return {
      data: { success: true } as unknown as T
    };
  }

  // 3. Auth Me
  if (path === '/auth/me' && method === 'GET') {
    return {
      data: currentUser as unknown as T,
    };
  }

  // 4. Dynamic Navigation
  if (path === '/navigation' && method === 'GET') {
    // Filter sidebar navigation items strictly by current user's permissions
    const filteredNavs = MOCK_NAV_ITEMS.filter((item) => {
      if (!item.requiredPermission) return true;
      return currentUser.permissions.includes(item.requiredPermission);
    });
    return {
      data: filteredNavs as unknown as T,
      meta: {
        page: 1,
        page_size: filteredNavs.length,
        total: filteredNavs.length,
      }
    };
  }

  // 5. Dashboard Configuration
  if (path === '/dashboards/config') {
    if (method === 'GET') {
      const savedConfig = localStorage.getItem(`indusmind_dashboard_config_${currentUser.role}`);
      if (savedConfig) {
        return { data: JSON.parse(savedConfig) as unknown as T };
      }
      return { data: DEFAULT_DASHBOARD_CONFIGS[currentUser.role] as unknown as T };
    }
    if (method === 'PUT') {
      const newConfig = JSON.parse(options.body as string);
      localStorage.setItem(`indusmind_dashboard_config_${currentUser.role}`, JSON.stringify(newConfig));
      return { data: newConfig as unknown as T };
    }
  }

  // 6. Widget Data Fetching
  if (path.startsWith('/dashboards/widgets/') && path.endsWith('/data') && method === 'GET') {
    const key = path.replace('/dashboards/widgets/', '').replace('/data', '');
    const data = getMockWidgetData(key);
    return { data: data as unknown as T };
  }

  // 7. Lookups
  if (path.startsWith('/lookups/') && method === 'GET') {
    const category = path.replace('/lookups/', '');
    const data = MOCK_LOOKUPS[category] || [];
    return { data: data as unknown as T };
  }

  // 8. Documents Endpoints
  if (path === '/documents') {
    const allDocs = getStoredDocuments();
    
    if (method === 'GET') {
      const urlObj = new URL(url, 'http://localhost');
      const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
      const pageSize = parseInt(urlObj.searchParams.get('page_size') || '25', 10);
      const search = urlObj.searchParams.get('search') || '';
      const docType = urlObj.searchParams.get('doc_type') || '';
      const status = urlObj.searchParams.get('status') || '';
      const tag = urlObj.searchParams.get('tag') || '';
      const plant = urlObj.searchParams.get('plant') || '';
      const area = urlObj.searchParams.get('area') || '';
      const sortBy = urlObj.searchParams.get('sort_by') || '';
      const sortOrder = urlObj.searchParams.get('sort_order') || 'asc';

      // Apply filters
      let filtered = [...allDocs];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(d => 
          d.name.toLowerCase().includes(s) || 
          d.content.toLowerCase().includes(s) ||
          d.uploader.toLowerCase().includes(s)
        );
      }
      if (docType) {
        filtered = filtered.filter(d => d.type === docType);
      }
      if (status) {
        filtered = filtered.filter(d => d.status === status);
      }
      if (tag) {
        filtered = filtered.filter(d => d.tags.includes(tag));
      }
      if (plant) {
        filtered = filtered.filter(d => d.plant === plant);
      }
      if (area) {
        filtered = filtered.filter(d => d.area === area);
      }

      // Apply sorting
      if (sortBy) {
        filtered.sort((a: any, b: any) => {
          let valA = a[sortBy];
          let valB = b[sortBy];
          
          if (sortBy === 'tags') {
            valA = a.tags.join(', ');
            valB = b.tags.join(', ');
          }

          if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
          }
          
          if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
      } else {
        // Default sort by date desc
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }

      // Apply pagination
      const total = filtered.length;
      const start = (page - 1) * pageSize;
      const paginated = filtered.slice(start, start + pageSize);

      return {
        data: paginated as unknown as T,
        meta: {
          page,
          page_size: pageSize,
          total
        }
      };
    }

    if (method === 'POST') {
      const newDoc = JSON.parse(options.body as string) as DocumentFile;
      const updated = [newDoc, ...allDocs];
      saveStoredDocuments(updated);
      return { data: newDoc as unknown as T };
    }
  }

  // Single document actions
  if (path.startsWith('/documents/') && path.endsWith('/confirm') && method === 'POST') {
    const id = path.replace('/documents/', '').replace('/confirm', '');
    const { entities } = JSON.parse(options.body as string);
    const allDocs = getStoredDocuments();
    const index = allDocs.findIndex(d => d.id === id);
    if (index === -1) {
      throw {
        error: {
          code: 'NOT_FOUND',
          message: `Document with ID ${id} not found.`
        }
      };
    }
    const updatedDoc = {
      ...allDocs[index],
      extractedEntities: entities,
      status: 'completed' as const
    };
    const updatedDocs = [...allDocs];
    updatedDocs[index] = updatedDoc;
    saveStoredDocuments(updatedDocs);
    return { data: updatedDoc as unknown as T };
  }

  if (path.startsWith('/documents/') && method === 'GET') {
    const id = path.replace('/documents/', '');
    const allDocs = getStoredDocuments();
    const doc = allDocs.find(d => d.id === id);
    if (!doc) {
      throw {
        error: {
          code: 'NOT_FOUND',
          message: `Document with ID ${id} not found.`
        }
      };
    }
    return { data: doc as unknown as T };
  }

  // Upload URL mock
  if (path === '/documents/upload-url' && method === 'POST') {
    return {
      data: {
        uploadUrl: 'https://mock-s3-bucket.indusmind.io/uploads/' + Math.random().toString(36).substring(7),
        id: 'doc-' + Date.now()
      } as unknown as T
    };
  }

  // Bulk actions
  if (path === '/documents/bulk-action' && method === 'POST') {
    const { action, ids, payload } = JSON.parse(options.body as string);
    let allDocs = getStoredDocuments();
    
    if (action === 'delete') {
      allDocs = allDocs.filter(d => !ids.includes(d.id));
    } else if (action === 'add-tags') {
      const tagsToAdd = payload as string[];
      allDocs = allDocs.map(d => {
        if (ids.includes(d.id)) {
          // unique union of tags
          const mergedTags = Array.from(new Set([...d.tags, ...tagsToAdd]));
          return { ...d, tags: mergedTags };
        }
        return d;
      });
    } else if (action === 'reprocess') {
      allDocs = allDocs.map(d => {
        if (ids.includes(d.id)) {
          return { ...d, status: 'pending', confidence: Math.floor(Math.random() * 10) + 90 };
        }
        return d;
      });
    }
    
    saveStoredDocuments(allDocs);
    return { data: { success: true } as unknown as T };
  }

  // 9. Search Suggestion Mock
  if (path === '/search/suggest' && method === 'GET') {
    const urlObj = new URL(url, 'http://localhost');
    const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
    
    const documents = [
      { id: 'd1', name: 'PID-992 schematic.pdf', category: 'Documents', desc: 'Plant Piping & Instrumentation Diagram', route: '#documents' },
      { id: 'd2', name: 'OEM Butterfly Valve Manual.pdf', category: 'Documents', desc: 'Operation & Maintenance instructions', route: '#documents' },
      { id: 'd3', name: 'INC-991 Impeller Cavitation Report.pdf', category: 'Documents', desc: 'Incident Root Cause Investigation', route: '#documents' },
      { id: 'd4', name: 'SOP-REF-112 Pump Maintenance.pdf', category: 'Documents', desc: 'Standard Operating Procedure', route: '#documents' }
    ];

    const equipment = [
      { id: 'P-101A', name: 'Feed Pump P-101A', category: 'Equipment', desc: 'Centrifugal Crude Feed Pump', route: '#equipment?tag=P-101A' },
      { id: 'C-302B', name: 'Compressor C-302B', category: 'Equipment', desc: 'High-Pressure Reciprocating Compressor', route: '#equipment?tag=C-302B' },
      { id: 'P-101B', name: 'Sludge Pump P-101B', category: 'Equipment', desc: 'Sludge Recirculation Secondary Pump', route: '#equipment?tag=P-101B' },
      { id: 'V-230', name: 'Valve V-230', category: 'Equipment', desc: 'Main Fuel Gas Isolation Valve', route: '#equipment?tag=V-230' }
    ];

    const workOrders = [
      { id: 'WO-1873', name: 'WO-1873 Bearing Overheat Repair', category: 'Work Orders', desc: 'Overdue mechanical seal maintenance', route: '#maintenance' },
      { id: 'WO-2041', name: 'WO-2041 Calibrate Pressure Gauge PG-104', category: 'Work Orders', desc: 'Safety audit critical action', route: '#maintenance' },
      { id: 'WO-2311', name: 'WO-2311 Weekly Firewater Pump Run-test', category: 'Work Orders', desc: 'OISD compliance inspection', route: '#maintenance' }
    ];

    const regulations = [
      { id: 'OISD-118', name: 'OISD-STD-118 Clause 6.4', category: 'Regulations', desc: 'Diesel Firewater Pump Weekly Run requirements', route: '#compliance' },
      { id: 'OISD-118-6.2', name: 'OISD-STD-118 Clause 6.2', category: 'Regulations', desc: 'Medium-expansion foam systems testing standard', route: '#compliance' },
      { id: 'FACT-41B', name: 'Factory Act Section 41B Compliance', category: 'Regulations', desc: 'Hazardous process safety reporting and disclosure', route: '#compliance' }
    ];

    const actions = [
      { id: 'action-create-wo', name: 'Create work order', category: 'Actions', desc: 'Dispatch work order for equipment maintenance', route: '#maintenance?action=create' },
      { id: 'action-ingest-doc', name: 'Ingest new safety document', category: 'Actions', desc: 'Upload safety SOPs or OEM manuals', route: '#documents?action=upload' },
      { id: 'action-audit-log', name: 'Audit system access logs', category: 'Actions', desc: 'Inspect security events & tamperproof logs', route: '#admin/audit-log' },
      { id: 'action-compliance-gap', name: 'Run compliance gaps diagnostics', category: 'Actions', desc: 'Evaluate active non-compliance risks', route: '#compliance' },
      { id: 'action-ask-copilot', name: 'Ask the Expert Copilot', category: 'Actions', desc: 'Open Copilot to ask a natural-language query', route: '#copilot' }
    ];

    if (!q) {
      return {
        data: {
          Documents: documents,
          Equipment: equipment,
          WorkOrders: workOrders,
          Regulations: regulations,
          Actions: actions
        } as unknown as T
      };
    }

    const filterFn = (item: any) => 
      item.name.toLowerCase().includes(q) || 
      item.desc.toLowerCase().includes(q) || 
      item.id.toLowerCase().includes(q);

    return {
      data: {
        Documents: documents.filter(filterFn),
        Equipment: equipment.filter(filterFn),
        WorkOrders: workOrders.filter(filterFn),
        Regulations: regulations.filter(filterFn),
        Actions: actions.filter(filterFn)
      } as unknown as T
    };
  }

  // 10. Main Search endpoint
  if (path === '/search' && method === 'GET') {
    const urlObj = new URL(url, 'http://localhost');
    const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
    
    const allResults = [
      {
        id: 'r1',
        title: 'Feed Pump P-101A Centrifugal Crude Feed Pump',
        type: 'Equipment',
        snippet: 'Primary feed pump delivering unrefined crude to distillation columns. Currently operating under high vibration warning due to possible impeller imbalance.',
        source: 'Tag Registry',
        relevance: 98,
        matchType: 'keyword',
        plant: 'Reliance Jamnagar Refinery - Sector A',
        date: '2026-07-02',
        status: 'warn',
        link: '#equipment?tag=P-101A'
      },
      {
        id: 'r2',
        title: 'SOP-REF-112 Pump Maintenance Procedure.pdf',
        type: 'Documents',
        snippet: 'Standard Operating Procedure for mechanical seals and vibration analysis on high-speed centrifugal pumps including P-101A and P-101B.',
        source: 'SOP Vault',
        relevance: 92,
        matchType: 'semantic',
        plant: 'Reliance Jamnagar Refinery - Sector A',
        date: '2026-05-14',
        status: 'completed',
        link: '#documents'
      },
      {
        id: 'r3',
        title: 'OISD-STD-118 Clause 6.4 (Weekly Firewater Run)',
        type: 'Regulations',
        snippet: 'Mandatory weekly test protocol of secondary diesel firewater pump systems. Requires mechanical seal test and motor casing temperature logs.',
        source: 'OISD Regulations',
        relevance: 85,
        matchType: 'semantic',
        plant: 'Hazira Petrochemicals Complex - Unit 4',
        date: '2025-11-20',
        status: 'critical',
        link: '#compliance'
      },
      {
        id: 'r4',
        title: 'WO-2311 Weekly Firewater Pump Run-test',
        type: 'Work Orders',
        snippet: 'Perform standard running test on Firewater Pump system. Log diesel fuel pressure, motor rotation RPM, and mechanical seal cooling flow rate.',
        source: 'SAP Work Order',
        relevance: 96,
        matchType: 'keyword',
        plant: 'Reliance Jamnagar Refinery - Sector B',
        date: '2026-07-11',
        status: 'pending',
        link: '#maintenance'
      },
      {
        id: 'r5',
        title: 'Regulatory Audit Gaps: Firewater System Block A',
        type: 'Regulations',
        snippet: 'Analysis of local non-compliance in firewater line. Safety valves have not been recalibrated within the 365-day statutory window of OISD regulations.',
        source: 'Compliance Gaps Portal',
        relevance: 89,
        matchType: 'semantic',
        plant: 'Hazira Petrochemicals Complex - Unit 4',
        date: '2026-07-01',
        status: 'critical',
        link: '#compliance'
      },
      {
        id: 'r6',
        title: 'INC-991 Impeller Cavitation and Seal Failure Report',
        type: 'Documents',
        snippet: 'Detailed root-cause investigation on historical seal failure of crude recycle pump. Primary driver was gas entrapment resulting in dry seal operation.',
        source: 'Incident Reports',
        relevance: 95,
        matchType: 'keyword',
        plant: 'Hazira Petrochemicals Complex - Unit 4',
        date: '2026-04-12',
        status: 'completed',
        link: '#documents'
      },
      {
        id: 'r7',
        title: 'WO-1873 Mechanical Seal Overhaul & Bearing Repair',
        type: 'Work Orders',
        snippet: 'Replace worn out carbon faces in mechanical seal cartridge. Clean secondary containment sleeves and inspect impeller vanes for wear.',
        source: 'SAP Work Order',
        relevance: 91,
        matchType: 'keyword',
        plant: 'Reliance Jamnagar Refinery - Sector A',
        date: '2026-06-15',
        status: 'completed',
        link: '#maintenance'
      },
      {
        id: 'r8',
        title: 'OEM Butterfly Valve Seal Replacement.pdf',
        type: 'Documents',
        snippet: 'Vendor specifications for high-durability elastomeric seals on gas isolation butterfly valves. Outlines recommended grease types and torque limits.',
        source: 'OEM Manuals',
        relevance: 78,
        matchType: 'semantic',
        plant: 'KG-D6 Deepwater Gas Field Terminal',
        date: '2024-03-10',
        status: 'completed',
        link: '#documents'
      }
    ];

    let filtered = allResults;
    if (q) {
      filtered = allResults.filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.snippet.toLowerCase().includes(q) || 
        item.source.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
      );

      if (filtered.length === 0) {
        filtered = [
          {
            id: 'r-dyn-1',
            title: `Custom Search Result for "${q}"`,
            type: 'Documents',
            snippet: `Found a semantic match for your query "${q}" in the main refinery corpus. The document discusses operations, hazard assessments, and safe working procedures.`,
            source: 'Dynamic Corpus',
            relevance: 82,
            matchType: 'semantic',
            plant: 'Reliance Jamnagar Refinery - Sector A',
            date: '2026-07-01',
            status: 'completed',
            link: '#documents'
          },
          {
            id: 'r-dyn-2',
            title: `Asset Tag Registry Match: tag/spec "${q}"`,
            type: 'Equipment',
            snippet: `Active registry lookup for "${q}". Related parameters include nominal operating temperature, hazard zones, and mechanical safety factors.`,
            source: 'Tag Registry',
            relevance: 74,
            matchType: 'keyword',
            plant: 'Hazira Petrochemicals Complex - Unit 4',
            date: '2026-07-05',
            status: 'ok',
            link: '#equipment'
          }
        ];
      }
    }

    return {
      data: filtered as unknown as T
    };
  }

  // --- EQUIPMENT CONDITION TAB ENDPOINTS (P16) ---
  
  // GET /equipment/{id}/meters
  if (path.startsWith('/equipment/') && path.endsWith('/meters') && method === 'GET') {
    const id = path.split('/')[2];
    return {
      data: [
        { id: 'vibration', label: 'Vibration Rate', unit: 'mm/s', normal_min: 0.5, normal_max: 5.0 },
        { id: 'bearing-temp', label: 'Bearing Temperature', unit: '°C', normal_min: 30.0, normal_max: 80.0 }
      ] as unknown as T
    };
  }

  // GET /equipment/{id}/readings
  if (path.startsWith('/equipment/') && path.endsWith('/readings') && method === 'GET') {
    const id = path.split('/')[2];
    const urlObj = new URL(url, 'http://localhost');
    const meterFilter = urlObj.searchParams.get('meter');
    const fromFilter = urlObj.searchParams.get('from') || '90d'; // 7d, 30d, 90d

    const storageKey = `indusmind_readings_${id}`;
    let readings = [];
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        readings = JSON.parse(stored);
      } catch (e) {}
    }

    if (readings.length === 0) {
      // Seed readings for 90 days trending upward
      const seedReadings = [];
      const now = Date.now();
      for (let i = 0; i <= 90; i++) {
        const timestamp = new Date(now - (90 - i) * 24 * 3600 * 1000).toISOString();
        
        // Vibration trending upward from 1.8 to 5.8
        const vibValue = Number((1.8 + (i / 90) * 4.0 + (Math.sin(i / 5) * 0.15) + (Math.random() - 0.5) * 0.1).toFixed(2));
        seedReadings.push({
          id: `r-vib-${i}`,
          meterId: 'vibration',
          value: vibValue,
          timestamp
        });

        // Bearing Temperature trending upward from 45 to 83
        const tempValue = Number((45 + (i / 90) * 38 + (Math.cos(i / 4) * 1.5) + (Math.random() - 0.5) * 1).toFixed(1));
        seedReadings.push({
          id: `r-temp-${i}`,
          meterId: 'bearing-temp',
          value: tempValue,
          timestamp
        });
      }
      localStorage.setItem(storageKey, JSON.stringify(seedReadings));
      readings = seedReadings;
    }

    // Filter by meter if specified
    if (meterFilter) {
      readings = readings.filter((r: any) => r.meterId === meterFilter);
    }

    // Filter by 'from' range
    const now = Date.now();
    let daysLimit = 90;
    if (fromFilter === '7d') daysLimit = 7;
    else if (fromFilter === '30d') daysLimit = 30;
    else if (fromFilter === '90d') daysLimit = 90;

    const cutoffTime = now - daysLimit * 24 * 3600 * 1000;
    readings = readings.filter((r: any) => new Date(r.timestamp).getTime() >= cutoffTime);

    // Sort by timestamp ascending for easy charting
    readings.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      data: readings as unknown as T
    };
  }

  // POST /equipment/{id}/readings
  if (path.startsWith('/equipment/') && path.endsWith('/readings') && method === 'POST') {
    const id = path.split('/')[2];
    const body = JSON.parse(options.body as string || '{}');
    const storageKey = `indusmind_readings_${id}`;
    
    let readings = [];
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        readings = JSON.parse(stored);
      } catch (e) {}
    }

    const newReading = {
      id: `r-new-${Date.now()}`,
      meterId: body.meterId || 'vibration',
      value: Number(body.value),
      timestamp: body.timestamp || new Date().toISOString()
    };

    readings.push(newReading);
    localStorage.setItem(storageKey, JSON.stringify(readings));

    return {
      data: newReading as unknown as T
    };
  }

  // --- IMPORT WIZARD ENDPOINTS (P16) ---
  
  // GET /import/templates/{entity}
  if (path.startsWith('/import/templates/') && method === 'GET') {
    const entity = path.split('/').pop();
    let csvContent = '';
    if (entity === 'equipment') {
      csvContent = 'id,name,tag,category,description,criticality,status\nP-101,Feed Pump,P-101,Equipment,Primary Feed Centrifugal Pump,High,Active';
    } else if (entity === 'readings') {
      csvContent = 'equipmentId,meterId,value,timestamp\nP-101,vibration,2.5,2026-07-12T12:00:00Z';
    } else {
      csvContent = 'id,name,email,role,status\nusr-999,Vardhan Aditya,vaditya@indusmind.io,Field Technician,active';
    }
    return {
      data: {
        filename: `${entity}_import_template.csv`,
        content: csvContent
      } as unknown as T
    };
  }

  // POST /import/jobs
  if (path === '/import/jobs' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const jobId = `job-${Date.now()}`;
    const job = {
      id: jobId,
      entity: body.entity || 'equipment',
      status: 'validating',
      created_at: new Date().toISOString(),
      okCount: 0,
      errorCount: 0,
      totalCount: 45,
      columnsMapping: body.columnsMapping || {}
    };

    const jobs = JSON.parse(localStorage.getItem('indusmind_import_jobs') || '{}');
    jobs[jobId] = job;
    localStorage.setItem('indusmind_import_jobs', JSON.stringify(jobs));

    return {
      data: job as unknown as T
    };
  }

  // GET /import/jobs/{id}
  if (path.startsWith('/import/jobs/') && method === 'GET') {
    const jobId = path.split('/').pop() || '';
    const jobs = JSON.parse(localStorage.getItem('indusmind_import_jobs') || '{}');
    const job = jobs[jobId];

    if (!job) {
      throw { error: { code: 'NOT_FOUND', message: 'Import job not found' } };
    }

    // Auto-advance status on query for simple, bulletproof polling simulation
    if (job.status === 'validating') {
      job.status = 'preview';
      job.okCount = 45;
      job.errorCount = 0;
    } else if (job.status === 'preview') {
      job.status = 'applying';
    } else if (job.status === 'applying') {
      job.status = 'done';
      job.okCount = 42;
      job.errorCount = 3; // mock 3 errors for realistic error-report downloads!
    }

    jobs[jobId] = job;
    localStorage.setItem('indusmind_import_jobs', JSON.stringify(jobs));

    return {
      data: job as unknown as T
    };
  }

  // --- GENERIC EXPORT ENDPOINTS (P16) ---

  // POST /exports
  if (path === '/exports' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const exportId = `exp-${Date.now()}`;
    return {
      data: {
        exportId,
        message: 'Export queued successfully.',
        downloadUrl: `http://localhost/api/exports/download/${exportId}.csv`
      } as unknown as T
    };
  }

  // --- ADMIN REPORTS ENDPOINTS (P16) ---

  // GET /admin/reports
  if (path === '/admin/reports' && method === 'GET') {
    const key = 'indusmind_admin_reports';
    let reports = [];
    const stored = localStorage.getItem(key);
    if (stored) {
      reports = JSON.parse(stored);
    } else {
      reports = [
        { id: 'rep-tpl-1', name: 'Daily Plant Summary', schedule: '0 6 * * *', recipients: ['manager@indusmind.io', 'engineer@indusmind.io'], lastRun: '2026-07-12 06:00:00' },
        { id: 'rep-tpl-2', name: 'Weekly Safety Audit Rollup', schedule: '0 0 * * 1', recipients: ['compliance@indusmind.io'], lastRun: '2026-07-06 00:00:00' },
        { id: 'rep-tpl-3', name: 'Monthly Equipment Health Pareto', schedule: '0 0 1 * *', recipients: ['admin@indusmind.io', 'manager@indusmind.io'], lastRun: '2026-07-01 00:00:00' }
      ];
      localStorage.setItem(key, JSON.stringify(reports));
    }
    return { data: reports as unknown as T };
  }

  // PUT /admin/reports/{id}
  if (path.startsWith('/admin/reports/') && !path.endsWith('/runs') && method === 'PUT') {
    const id = path.split('/').pop();
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_admin_reports';
    const reports = JSON.parse(localStorage.getItem(key) || '[]');
    
    const updated = reports.map((rep: any) => {
      if (rep.id === id) {
        return {
          ...rep,
          schedule: body.schedule !== undefined ? body.schedule : rep.schedule,
          recipients: body.recipients !== undefined ? body.recipients : rep.recipients
        };
      }
      return rep;
    });
    localStorage.setItem(key, JSON.stringify(updated));
    return { data: updated.find((r: any) => r.id === id) as unknown as T };
  }

  // GET /admin/reports/runs
  if (path === '/admin/reports/runs' && method === 'GET') {
    const key = 'indusmind_admin_report_runs';
    let runs = [];
    const stored = localStorage.getItem(key);
    if (stored) {
      runs = JSON.parse(stored);
    } else {
      runs = [
        { id: 'run-1', templateName: 'Daily Plant Summary', timestamp: '2026-07-12 06:00:00', status: 'done', downloadUrl: 'http://localhost/api/reports/download/run-1.pdf' },
        { id: 'run-2', templateName: 'Daily Plant Summary', timestamp: '2026-07-11 06:00:00', status: 'done', downloadUrl: 'http://localhost/api/reports/download/run-2.pdf' },
        { id: 'run-3', templateName: 'Weekly Safety Audit Rollup', timestamp: '2026-07-06 00:00:00', status: 'done', downloadUrl: 'http://localhost/api/reports/download/run-3.pdf' }
      ];
      localStorage.setItem(key, JSON.stringify(runs));
    }
    return { data: runs as unknown as T };
  }

  // POST /admin/reports/runs (Run now)
  if (path === '/admin/reports/runs' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_admin_report_runs';
    const runs = JSON.parse(localStorage.getItem(key) || '[]');
    
    const newRun = {
      id: `run-${Date.now()}`,
      templateName: body.templateName || 'Daily Plant Summary',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: 'queued',
      downloadUrl: ''
    };

    runs.unshift(newRun);
    localStorage.setItem(key, JSON.stringify(runs));
    return { data: newRun as unknown as T };
  }

  // PUT /admin/reports/runs/{id}
  if (path.startsWith('/admin/reports/runs/') && method === 'PUT') {
    const id = path.split('/').pop();
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_admin_report_runs';
    const runs = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = runs.map((r: any) => {
      if (r.id === id) {
        return {
          ...r,
          status: body.status || r.status,
          downloadUrl: body.downloadUrl || r.downloadUrl
        };
      }
      return r;
    });
    localStorage.setItem(key, JSON.stringify(updated));
    return { data: updated.find((r: any) => r.id === id) as unknown as T };
  }

  // --- EXTRACTION RULES ENDPOINTS (P17) ---
  if (path === '/admin/extraction-rules' && method === 'GET') {
    const key = 'indusmind_extraction_rules';
    let rules = JSON.parse(localStorage.getItem(key) || '[]');
    if (rules.length === 0) {
      rules = [
        { id: 'rule-1', entityType: 'Equipment Tag', method: 'regex', pattern: '[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+', priority: 1, confidence: 95, active: true, version: 'V1.0', hint: 'Standard plant equipment tag regex e.g. CS-4-302B' },
        { id: 'rule-2', entityType: 'OISD Reference', method: 'regex', pattern: 'OISD-STD-\\d+', priority: 2, confidence: 98, active: true, version: 'V1.1', hint: 'Matches Oil Industry Safety Directorate regulations' },
        { id: 'rule-3', entityType: 'Pressure Value', method: 'regex', pattern: '\\d+(\\.\\d+)?\\s*(bar|psi)', priority: 3, confidence: 90, active: true, version: 'V1.0', hint: 'Pressure measurements' },
        { id: 'rule-4', entityType: 'Temperature Value', method: 'regex', pattern: '\\d+(\\.\\d+)?\\s*(C|F|°C|°F)', priority: 3, confidence: 92, active: true, version: 'V1.0', hint: 'Temperature measurements' }
      ];
      localStorage.setItem(key, JSON.stringify(rules));
    }
    return { data: rules as unknown as T };
  }

  if (path === '/admin/extraction-rules' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_extraction_rules';
    const rules = JSON.parse(localStorage.getItem(key) || '[]');
    const newRule = {
      id: `rule-${Date.now()}`,
      entityType: body.entityType || 'Custom Tag',
      method: body.method || 'regex',
      pattern: body.pattern || '',
      priority: Number(body.priority) || 1,
      confidence: Number(body.confidence) || 90,
      active: body.active !== undefined ? body.active : true,
      version: body.version || 'V1.0',
      hint: body.hint || ''
    };
    rules.push(newRule);
    localStorage.setItem(key, JSON.stringify(rules));
    return { data: newRule as unknown as T };
  }

  if (path.startsWith('/admin/extraction-rules/') && method === 'PUT') {
    const id = path.split('/').pop();
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_extraction_rules';
    const rules = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = rules.map((r: any) => {
      if (r.id === id) {
        return { ...r, ...body };
      }
      return r;
    });
    localStorage.setItem(key, JSON.stringify(updated));
    return { data: updated.find((r: any) => r.id === id) as unknown as T };
  }

  if (path === '/admin/extraction-rules/test' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const { pattern, method: testMethod, sampleText } = body;
    const matches: any[] = [];
    if (testMethod === 'regex' && pattern) {
      try {
        const rx = new RegExp(pattern, 'g');
        let match;
        let count = 0;
        while ((match = rx.exec(sampleText)) !== null && count < 100) {
          count++;
          matches.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length,
            entityType: body.entityType || 'Matched Element',
            confidence: body.confidence || 95
          });
          if (rx.lastIndex === match.index) {
            rx.lastIndex++;
          }
        }
      } catch (e) {
        // Regex error
      }
    } else if (testMethod === 'llm') {
      const textLower = sampleText.toLowerCase();
      const words = ["OISD-STD-118", "IEC-61511", "ISO-9001", "CS-4-302B", "FT-101", "PT-202", "150 bar", "120C", "350 °F"];
      words.forEach(w => {
        let idx = -1;
        while ((idx = textLower.indexOf(w.toLowerCase(), idx + 1)) !== -1) {
          matches.push({
            text: sampleText.substring(idx, idx + w.length),
            start: idx,
            end: idx + w.length,
            entityType: body.entityType || 'LLM Entity',
            confidence: body.confidence || 88
          });
        }
      });
    }
    return { data: { matches } as unknown as T };
  }

  // --- INTEGRATIONS: API KEYS & WEBHOOKS (P17) ---
  if (path === '/admin/api-keys' && method === 'GET') {
    const key = 'indusmind_api_keys';
    let apiKeys = JSON.parse(localStorage.getItem(key) || '[]');
    if (apiKeys.length === 0) {
      apiKeys = [
        { id: 'key-1', name: 'DCS Telemetry Ingest', prefix: 'indus_live_dc...', scopes: ['read:telemetry', 'write:telemetry'], lastUsed: '2026-07-12 18:24:00', status: 'active', createdAt: '2026-06-01' }
      ];
      localStorage.setItem(key, JSON.stringify(apiKeys));
    }
    return { data: apiKeys as unknown as T };
  }

  if (path === '/admin/api-keys' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_api_keys';
    const apiKeys = JSON.parse(localStorage.getItem(key) || '[]');
    const generatedStr = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const rawKey = `indus_live_${generatedStr}`;
    const prefix = `indus_live_${generatedStr.substring(0, 4)}...`;
    const newKey = {
      id: `key-${Date.now()}`,
      name: body.name || 'API Key',
      prefix,
      scopes: body.scopes || [],
      lastUsed: 'Never',
      status: 'active',
      createdAt: new Date().toISOString().substring(0, 10)
    };
    apiKeys.push(newKey);
    localStorage.setItem(key, JSON.stringify(apiKeys));
    return { data: { key: newKey, rawKey } as unknown as T };
  }

  if (path.startsWith('/admin/api-keys/') && (path.endsWith('/revoke') || method === 'DELETE' || path.split('/').pop() === 'revoke')) {
    const parts = path.split('/');
    const id = parts[3];
    const key = 'indusmind_api_keys';
    const apiKeys = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = apiKeys.map((k: any) => {
      if (k.id === id) {
        return { ...k, status: 'revoked' };
      }
      return k;
    });
    localStorage.setItem(key, JSON.stringify(updated));
    return { data: { success: true } as unknown as T };
  }

  if (path === '/admin/webhooks' && method === 'GET') {
    const key = 'indusmind_webhooks';
    let webhooks = JSON.parse(localStorage.getItem(key) || '[]');
    if (webhooks.length === 0) {
      webhooks = [
        { id: 'wh-1', url: 'https://api.externalpartner.com/v1/alerts', secret: 'whsec_abc123xyz', events: ['telemetry.alert', 'compliance.violation'], active: true }
      ];
      localStorage.setItem(key, JSON.stringify(webhooks));
    }
    return { data: webhooks as unknown as T };
  }

  if (path === '/admin/webhooks' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_webhooks';
    const webhooks = JSON.parse(localStorage.getItem(key) || '[]');
    const newWh = {
      id: `wh-${Date.now()}`,
      url: body.url || '',
      secret: body.secret || `whsec_${Math.random().toString(36).substring(2, 10)}`,
      events: body.events || [],
      active: body.active !== undefined ? body.active : true
    };
    webhooks.push(newWh);
    localStorage.setItem(key, JSON.stringify(webhooks));
    return { data: newWh as unknown as T };
  }

  if (path.startsWith('/admin/webhooks/') && method === 'PUT') {
    const id = path.split('/').pop();
    const body = JSON.parse(options.body as string || '{}');
    const key = 'indusmind_webhooks';
    const webhooks = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = webhooks.map((wh: any) => {
      if (wh.id === id) {
        return { ...wh, ...body };
      }
      return wh;
    });
    localStorage.setItem(key, JSON.stringify(updated));
    return { data: updated.find((wh: any) => wh.id === id) as unknown as T };
  }

  if (path === '/admin/webhooks/test' && method === 'POST') {
    const body = JSON.parse(options.body as string || '{}');
    const { url: whUrl, event } = body;
    const deliveryKey = 'indusmind_webhook_deliveries';
    const deliveries = JSON.parse(localStorage.getItem(deliveryKey) || '[]');
    const newDelivery = {
      id: `del-${Date.now()}`,
      event: event || 'system.test',
      status: 'success',
      attempts: 1,
      responseCode: 200,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      payload: JSON.stringify({
        event: event || 'system.test',
        timestamp: new Date().toISOString(),
        data: {
          test: true,
          targetUrl: whUrl,
          msg: "IndusMind Webhook Integration Verified"
        }
      }, null, 2)
    };
    deliveries.unshift(newDelivery);
    localStorage.setItem(deliveryKey, JSON.stringify(deliveries));
    return { data: { success: true, delivery: newDelivery } as unknown as T };
  }

  if (path === '/admin/webhooks/deliveries' && method === 'GET') {
    const key = 'indusmind_webhook_deliveries';
    let deliveries = JSON.parse(localStorage.getItem(key) || '[]');
    if (deliveries.length === 0) {
      deliveries = [
        {
          id: 'del-1',
          event: 'compliance.violation',
          status: 'success',
          attempts: 1,
          responseCode: 200,
          payload: JSON.stringify({
            event: "compliance.violation",
            timestamp: "2026-07-12T14:22:11Z",
            data: {
              ruleId: "rule-2",
              entity: "OISD-STD-118",
              severity: "HIGH",
              message: "Explosive vapor sensors annual calibration overdue"
            }
          }, null, 2),
          timestamp: '2026-07-12 14:22:15'
        }
      ];
      localStorage.setItem(key, JSON.stringify(deliveries));
    }
    return { data: deliveries as unknown as T };
  }

  if (path.startsWith('/admin/webhooks/deliveries/') && path.endsWith('/retry') && method === 'POST') {
    const parts = path.split('/');
    const id = parts[4];
    const key = 'indusmind_webhook_deliveries';
    const deliveries = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = deliveries.map((d: any) => {
      if (d.id === id) {
        return {
          ...d,
          attempts: d.attempts + 1,
          status: 'success',
          responseCode: 200,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
      }
      return d;
    });
    localStorage.setItem(key, JSON.stringify(updated));
    return { data: updated.find((d: any) => d.id === id) as unknown as T };
  }

  // --- AUTH RECOVERY ENDPOINTS (N1) ---
  if (path === '/auth/forgot-password' && method === 'POST') {
    return { data: { success: true } as unknown as T };
  }
  if (path === '/auth/reset-password' && method === 'POST') {
    return { data: { success: true } as unknown as T };
  }

  // --- I18N ENDPOINTS (S9) ---
  if (path.startsWith('/i18n/') && method === 'GET') {
    const parts = path.split('/');
    const locale = parts[2];
    const namespace = parts[3];
    const initialMock: Record<string, Record<string, Record<string, string>>> = {
      en: {
        nav: {
          dashboard: 'Dashboard',
          copilot: 'Expert Copilot',
          documents: 'Documents',
          equipment: 'Equipment 360',
          maintenance: 'Maintenance Hub',
          compliance: 'Compliance',
          admin: 'Admin Suite',
          settings: 'Settings'
        },
        auth: {
          login: 'System Authorization',
          forgot: 'Forgot Password?',
          reset: 'Reset Password'
        },
        copilot: {
          title: 'Expert Copilot Chat',
          ask: 'Ask our specialized industrial AI...'
        }
      },
      hi: {
        nav: {
          dashboard: 'डैशबोर्ड',
          copilot: 'विशेषज्ञ कोपायलट',
          documents: 'दस्तावेज़',
          equipment: 'उपकरण 360',
          maintenance: 'रखरखाव केंद्र',
          compliance: 'अनुपालन',
          admin: 'एडमिन सूट',
          settings: 'सेटिंग्स'
        },
        auth: {
          login: 'प्रणाली प्राधिकरण',
          forgot: 'पासवर्ड भूल गए?',
          reset: 'पासवर्ड रीसेट करें'
        },
        copilot: {
          title: 'विशेषज्ञ कोपायलट चैट',
          ask: 'हमारे विशेष औद्योगिक एआई से पूछें...'
        }
      }
    };

    const key = 'indusmind_translations_v1';
    let translations = JSON.parse(localStorage.getItem(key) || 'null');
    if (!translations) {
      translations = initialMock;
      localStorage.setItem(key, JSON.stringify(translations));
    }

    const bundle = translations[locale]?.[namespace] || {};
    return { data: bundle as unknown as T };
  }

  if (path.startsWith('/admin/translations') && method === 'GET') {
    const initialMock: Record<string, Record<string, Record<string, string>>> = {
      en: {
        nav: {
          dashboard: 'Dashboard',
          copilot: 'Expert Copilot',
          documents: 'Documents',
          equipment: 'Equipment 360',
          maintenance: 'Maintenance Hub',
          compliance: 'Compliance',
          admin: 'Admin Suite',
          settings: 'Settings'
        },
        auth: {
          login: 'System Authorization',
          forgot: 'Forgot Password?',
          reset: 'Reset Password'
        },
        copilot: {
          title: 'Expert Copilot Chat',
          ask: 'Ask our specialized industrial AI...'
        }
      },
      hi: {
        nav: {
          dashboard: 'डैशबोर्ड',
          copilot: 'विशेषज्ञ कोपायलट',
          documents: 'दस्तावेज़',
          equipment: 'उपकरण 360',
          maintenance: 'रखरखाव केंद्र',
          compliance: 'अनुपालन',
          admin: 'एडमिन सूट',
          settings: 'सेटिंग्स'
        },
        auth: {
          login: 'प्रणाली प्राधिकरण',
          forgot: 'पासवर्ड भूल गए?',
          reset: 'पासवर्ड रीसेट करें'
        },
        copilot: {
          title: 'विशेषज्ञ कोपायलट चैट',
          ask: 'हमारे विशेष औद्योगिक एआई से पूछें...'
        }
      }
    };

    const key = 'indusmind_translations_v1';
    let translations = JSON.parse(localStorage.getItem(key) || 'null');
    if (!translations) {
      translations = initialMock;
      localStorage.setItem(key, JSON.stringify(translations));
    }

    // parse search params manually to be safe
    const searchStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(searchStr);
    const locale = params.get('locale') || 'en';
    const ns = params.get('namespace') || 'nav';

    const bundle = translations[locale]?.[ns] || {};
    const kvList = Object.entries(bundle).map(([k, v]) => ({ key: k, value: v }));
    return { data: kvList as unknown as T };
  }

  if (path === '/admin/translation-gaps' && method === 'GET') {
    const key = 'indusmind_translation_gaps';
    let gaps = JSON.parse(localStorage.getItem(key) || '[]');
    if (gaps.length === 0) {
      gaps = [
        { id: 'gap-1', locale: 'hi', namespace: 'copilot', key: 'feedback_received', first_seen_at: '2026-07-12 11:24', hits: 15 },
        { id: 'gap-2', locale: 'hi', namespace: 'nav', key: 'history', first_seen_at: '2026-07-11 14:15', hits: 8 }
      ];
      localStorage.setItem(key, JSON.stringify(gaps));
    }
    return { data: gaps as unknown as T };
  }

  if (path === '/admin/translations' && method === 'PUT') {
    const key = 'indusmind_translations_v1';
    let translations = JSON.parse(localStorage.getItem(key) || '{}');
    const body = options?.body ? JSON.parse(options.body as string) : {};
    const { locale, namespace, key: tKey, value } = body;
    if (locale && namespace && tKey) {
      if (!translations[locale]) translations[locale] = {};
      if (!translations[locale][namespace]) translations[locale][namespace] = {};
      translations[locale][namespace][tKey] = value;
      localStorage.setItem(key, JSON.stringify(translations));
    }
    return { data: { success: true } as unknown as T };
  }

  // --- SESSIONS & SECURITY ENDPOINTS (S11) ---
  if (path === '/me/sessions' && method === 'GET') {
    const key = 'indusmind_admin_activeSessions';
    const sessions = JSON.parse(localStorage.getItem(key) || '[]');
    return { data: sessions as unknown as T };
  }

  if (path.startsWith('/me/sessions/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const key = 'indusmind_admin_activeSessions';
    let sessions = JSON.parse(localStorage.getItem(key) || '[]');
    sessions = sessions.filter((s: any) => s.id !== id);
    localStorage.setItem(key, JSON.stringify(sessions));
    return { data: { success: true } as unknown as T };
  }

  if (path === '/me/sessions/revoke-all-others' && method === 'POST') {
    const key = 'indusmind_admin_activeSessions';
    let sessions = JSON.parse(localStorage.getItem(key) || '[]');
    sessions = sessions.filter((s: any) => s.id === 'sess-1' || s.device.includes('Edge 124'));
    localStorage.setItem(key, JSON.stringify(sessions));
    return { data: { success: true } as unknown as T };
  }

  if (path === '/me/change-password' && method === 'POST') {
    return { data: { success: true } as unknown as T };
  }

  // --- SPARE PARTS ENDPOINTS (S12) ---
  if (path === '/parts' && method === 'GET') {
    const key = 'indusmind_parts';
    let parts = JSON.parse(localStorage.getItem(key) || '[]');
    if (parts.length === 0) {
      parts = [
        { id: 'part-1', code: 'SEAL-40M', name: 'Mechanical Seal 40mm', on_hand: 2, min_stock: 5, location: 'Shed A-2', category: 'Seals' },
        { id: 'part-2', code: 'BRG-6312', name: 'Deep Groove Ball Bearing 6312', on_hand: 12, min_stock: 8, location: 'Shed B-1', category: 'Bearings' },
        { id: 'part-3', code: 'VALVE-1/2', name: '1/2 Inch Needle Valve', on_hand: 1, min_stock: 4, location: 'Shed C-3', category: 'Valves' },
        { id: 'part-4', code: 'GASKET-DN100', name: 'Flange Gasket DN100 PN16', on_hand: 45, min_stock: 30, location: 'Shed A-1', category: 'Gaskets' },
        { id: 'part-5', code: 'COUP-GRID', name: 'Grid Coupling Insert H10', on_hand: 0, min_stock: 2, location: 'Shed B-4', category: 'Couplings' },
        { id: 'part-6', code: 'FILT-HYD', name: 'Hydraulic Return Filter Element', on_hand: 7, min_stock: 5, location: 'Shed D-2', category: 'Filters' },
        { id: 'part-7', code: 'BOLT-M16', name: 'High-Tensile Stud Bolt M16x120', on_hand: 150, min_stock: 100, location: 'Shed A-3', category: 'Fasteners' },
        { id: 'part-8', code: 'O-RING-KIT', name: 'Viton O-Ring Assortment Kit', on_hand: 3, min_stock: 2, location: 'Shed A-2', category: 'Seals' },
        { id: 'part-9', code: 'PRESS-TX', name: 'Pressure Transmitter 0-10 Bar', on_hand: 1, min_stock: 3, location: 'Shed E-1', category: 'Instrumentation' },
        { id: 'part-10', code: 'TEMP-RTD', name: 'PT100 Temperature Sensor Element', on_hand: 4, min_stock: 3, location: 'Shed E-1', category: 'Instrumentation' }
      ];
      localStorage.setItem(key, JSON.stringify(parts));
    }
    return { data: parts as unknown as T };
  }

  if (path === '/parts' && method === 'POST') {
    const key = 'indusmind_parts';
    const parts = JSON.parse(localStorage.getItem(key) || '[]');
    const newPart = {
      id: `part-${Date.now()}`,
      ...body
    };
    parts.push(newPart);
    localStorage.setItem(key, JSON.stringify(parts));
    return { data: newPart as unknown as T };
  }

  if (path.startsWith('/parts/') && method === 'PUT') {
    const id = path.split('/').pop();
    const key = 'indusmind_parts';
    let parts = JSON.parse(localStorage.getItem(key) || '[]');
    parts = parts.map((p: any) => p.id === id ? { ...p, ...body } : p);
    localStorage.setItem(key, JSON.stringify(parts));
    return { data: body as unknown as T };
  }

  // --- SHIFT LOGBOOK ENDPOINTS (S13) ---
  if (path === '/shift-logs' && method === 'GET') {
    const key = 'indusmind_shift_logs';
    let logs = JSON.parse(localStorage.getItem(key) || '[]');
    if (logs.length === 0) {
      logs = [
        { id: 'log-1', date: '2026-07-13', shift: 'Morning Shift', plant: 'jam-a', operator: 'Rajesh Nair', text: 'Completed visual inspection of Crude Distillation Unit feed pump P-101. Noticed normal operation parameters, no vibration anomalies.', equipment: ['EQ-P-101'], tags: ['CDU', 'Pump'], submitted: true, timestamp: '2026-07-13 11:20:00' },
        { id: 'log-2', date: '2026-07-12', shift: 'Night Shift', plant: 'jam-a', operator: 'Priya Sharma', text: 'Alert: Heavy local vibration observed at Crude Unit feed pump P-101. Bearing housing temperature is stable at 64°C, but dynamic monitoring suggests resonance.', equipment: ['EQ-P-101'], tags: ['CDU', 'Vibration', 'Pump'], submitted: true, timestamp: '2026-07-12 23:45:00' },
        { id: 'log-3', date: '2026-07-12', shift: 'Evening Shift', plant: 'jam-a', operator: 'Arun Kumar', text: 'Re-tensioned foundation bolts on compressor shed C-4. Vibration slightly dampened but structural inspection requested.', equipment: ['EQ-C-4'], tags: ['Structural', 'Compressor'], submitted: true, timestamp: '2026-07-12 18:30:00' },
        { id: 'log-4', date: '2026-07-12', shift: 'Morning Shift', plant: 'jam-a', operator: 'Aditya Vardhan', text: 'LPG Farm gas sensor calibration completed successfully. OISD regulations fully verified with Zero gaps.', equipment: ['EQ-LPG-SENS'], tags: ['Compliance', 'LPG'], submitted: true, timestamp: '2026-07-12 09:15:00' },
        { id: 'log-5', date: '2026-07-11', shift: 'Night Shift', plant: 'jam-a', operator: 'Meena Iyer', text: 'Emergency shutdown test on block gas manifold completed in 12.4 seconds, well within statutory thresholds.', equipment: ['EQ-MANIFOLD'], tags: ['Safety', 'ESD'], submitted: true, timestamp: '2026-07-11 22:12:00' },
        { id: 'log-6', date: '2026-07-11', shift: 'Evening Shift', plant: 'jam-a', operator: 'Rajesh Nair', text: 'Slight dynamic torque offset detected on agitator motor AG-202. Lubricant topped up, status active.', equipment: ['EQ-AG-202'], tags: ['Agitator', 'Lubrication'], submitted: true, timestamp: '2026-07-11 15:40:00' }
      ];
      localStorage.setItem(key, JSON.stringify(logs));
    }
    return { data: logs as unknown as T };
  }

  if (path === '/shift-logs' && method === 'POST') {
    const key = 'indusmind_shift_logs';
    const logs = JSON.parse(localStorage.getItem(key) || '[]');
    const newLog = {
      id: `log-${Date.now()}`,
      operator: 'Aditya Vardhan',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      ...body
    };
    logs.unshift(newLog);
    localStorage.setItem(key, JSON.stringify(logs));
    return { data: newLog as unknown as T };
  }

  if (path.startsWith('/shift-logs/') && method === 'PUT') {
    const id = path.split('/').pop();
    const key = 'indusmind_shift_logs';
    let logs = JSON.parse(localStorage.getItem(key) || '[]');
    logs = logs.map((l: any) => l.id === id ? { ...l, ...body } : l);
    localStorage.setItem(key, JSON.stringify(logs));
    return { data: body as unknown as T };
  }

  if (path.startsWith('/shift-logs/') && path.endsWith('/summarize') && method === 'POST') {
    return {
      data: {
        summary: `### Executive Handover Report: ${new Date().toLocaleDateString()}
        
- **P-101 Feed Pump Anomaly**: Noted local resonance and elevated vibration markers in the previous shift log. Lubrication levels were confirmed stable, but structural foundation re-tightening or dynamic balancing is highly recommended for the next shift.
- **LPG Farm Gas Calibration**: Successfully validated and approved under OISD regulations.
- **Maintenance Actions**: AG-202 agitator was topped up; structural inspection of compressor shed foundation has been requested.`
      } as unknown as T
    };
  }

  // --- RETENTION ENDPOINTS (S14) ---
  if (path === '/admin/retention' && method === 'GET') {
    const key = 'indusmind_retention_policies';
    let policies = JSON.parse(localStorage.getItem(key) || '[]');
    if (policies.length === 0) {
      policies = [
        { id: 'ret-1', entity: 'Audit Logs', keep_days: 365, action: 'Purge / Delete', active: true, last_run: '2026-07-12 04:00', affected: 1542 },
        { id: 'ret-2', entity: 'Document Ingestion Jobs (Logs)', keep_days: 30, action: 'Archive to S3', active: true, last_run: '2026-07-11 04:00', affected: 34 },
        { id: 'ret-3', entity: 'Shift Handover Logbooks', keep_days: 1095, action: 'Purge / Delete', active: false, last_run: '2026-07-01 04:00', affected: 0 },
        { id: 'ret-4', entity: 'Webhook Delivery Payloads', keep_days: 14, action: 'Purge / Delete', active: true, last_run: '2026-07-12 04:00', affected: 412 }
      ];
      localStorage.setItem(key, JSON.stringify(policies));
    }
    return { data: policies as unknown as T };
  }

  if (path.startsWith('/admin/retention/') && method === 'PUT') {
    const id = path.split('/').pop();
    const key = 'indusmind_retention_policies';
    let policies = JSON.parse(localStorage.getItem(key) || '[]');
    policies = policies.map((p: any) => p.id === id ? { ...p, ...body } : p);
    localStorage.setItem(key, JSON.stringify(policies));
    return { data: body as unknown as T };
  }

  if (path.startsWith('/admin/retention/') && path.endsWith('/run') && method === 'POST') {
    const parts = path.split('/');
    const id = parts[3];
    const key = 'indusmind_retention_policies';
    let policies = JSON.parse(localStorage.getItem(key) || '[]');
    policies = policies.map((p: any) => {
      if (p.id === id) {
        return {
          ...p,
          last_run: new Date().toISOString().replace('T', ' ').substring(0, 16),
          affected: Math.floor(Math.random() * 500) + 12
        };
      }
      return p;
    });
    localStorage.setItem(key, JSON.stringify(policies));
    return { data: policies.find((p: any) => p.id === id) as unknown as T };
  }

  // --- EQUIPMENT QR ENDPOINTS (N2) ---
  if (path === '/equipment/labels' && method === 'POST') {
    return {
      data: {
        jobId: 'label-job-' + Date.now(),
        downloadUrl: '#download-labels-pdf'
      } as unknown as T
    };
  }

  if (path.startsWith('/equipment/by-code/') && method === 'GET') {
    const code = path.split('/').pop();
    const eqList = JSON.parse(localStorage.getItem('indusmind_equipment') || '[]');
    const equipment = eqList.find((e: any) => (e.code || '').toLowerCase() === code?.toLowerCase() || (e.id || '').toLowerCase() === code?.toLowerCase());
    if (equipment) {
      return { data: equipment as unknown as T };
    }
    return {
      data: {
        id: 'eq-scanned',
        code: code || 'EQ-P-101',
        name: 'Scanned Dynamic Reactor Pump',
        status: 'Operational',
        plant: 'jam-a',
        area: 'crude-1',
        tags: ['Scanned', 'Reactor', 'OISD']
      } as unknown as T
    };
  }

  // --- AUDIT LOGS VIEWER (N3) ---
  if (path === '/admin/audit-log' && method === 'GET') {
    const logs = JSON.parse(localStorage.getItem('indusmind_admin_auditLogs') || '[]');
    return { data: logs as unknown as T };
  }

  // --- SYSTEM LEGAL PAGES (N5) ---
  if (path.startsWith('/content/') && method === 'GET') {
    const slug = path.split('/').pop();
    if (slug === 'privacy') {
      return {
        data: {
          slug: 'privacy',
          title: 'Privacy Policy',
          content: `# Privacy Policy & Data Sovereignty
          
**Last Updated: July 2026**

This security node system operates strictly within **IndusMind\'s private sovereign on-premise cloud infrastructure**.
No telemetric, process, or analytical data is transmitted outside the secure refinery parameters.

### 1. Data Collection & Isolation
All asset records, telemetry readouts, SOP extraction indexes, and chat sessions are strictly sandboxed. 
Local authentication keys are hashed on-node with no external dependency.

### 2. Regulatory Compliance
Fully aligned with national critical infrastructure security standard guidelines.`
        } as unknown as T
      };
    }
    return {
      data: {
        slug: 'terms',
        title: 'Terms of Service',
        content: `# Terminal Terms of Service
        
**Last Updated: July 2026**

These terms govern the authorized engineering access to the **IndusMind Industrial Control HMI System**.

### 1. Authorized Access Node
This terminal session is restricted to certified plant operators, engineers, and authorized compliance personnel.
Sharing console access tokens is strictly prohibited under the Refinery Safety Directives.

### 2. Operational Accountability
Every operational commit, work order close-out, and log entry is digitally logged and cryptographically hashed inside our immutable local audit ledger.`
      } as unknown as T
    };
  }

  // --- BULK ACTIONS ENDPOINT (N4) ---
  if (path.endsWith('/bulk') && method === 'POST') {
    return {
      data: {
        success: true,
        count: (body as any)?.ids?.length || 0,
        message: 'Bulk action applied successfully.'
      } as unknown as T
    };
  }

  if (path === '/equipment/suggest' && method === 'GET') {
    return {
      data: [
        { code: 'EQ-P-101', name: 'Crude Feed Pump P-101' },
        { code: 'EQ-C-4', name: 'Compressor C-4 Foundation' },
        { code: 'EQ-LPG-SENS', name: 'LPG Gas Sensor S-42' },
        { code: 'EQ-MANIFOLD', name: 'Block Gas Manifold M-1' },
        { code: 'EQ-AG-202', name: 'Agitator Motor AG-202' }
      ] as unknown as T
    };
  }

  // --- ONBOARDING, SEEDING DEMO, AND PREFERENCES (P17) ---
  if (path === '/me/preferences' && method === 'GET') {
    const settings = getStoredSettings();
    return { data: settings as unknown as T };
  }

  if (path === '/admin/dashboard/counts' && method === 'GET') {
    const eq = JSON.parse(localStorage.getItem('indusmind_equipment') || '[]');
    const docs = JSON.parse(localStorage.getItem('indusmind_documents') || '[]');
    const team = JSON.parse(localStorage.getItem('indusmind_users') || '[]');
    const copilotCount = Number(localStorage.getItem('indusmind_copilot_messages_count') || '0');
    return {
      data: {
        equipmentCount: eq.length,
        documentsCount: docs.length,
        teamCount: team.length || 3,
        copilotCount
      } as unknown as T
    };
  }

  if (path === '/admin/seed-demo' && method === 'POST') {
    // Fill sample plant data in localStorage if empty or replace
    const eqKey = 'indusmind_equipment';
    const docKey = 'indusmind_documents';
    
    // Seed sample equipment
    const mockEq = [
      { id: 'CS-4-302B', name: 'Reciprocating Compressor B', type: 'Compressor', plant: 'Reliance Jamnagar Refinery - Sector A', status: 'optimal' },
      { id: 'FT-101', name: 'Differential Pressure Flow Transmitter', type: 'Transmitter', plant: 'Reliance Jamnagar Refinery - Sector A', status: 'maintenance_required' },
      { id: 'PT-202', name: 'Suction pressure sensor', type: 'Sensor', plant: 'Hazira Petrochemicals Complex - Unit 4', status: 'optimal' }
    ];
    localStorage.setItem(eqKey, JSON.stringify(mockEq));

    // Seed sample documents
    const mockDocs = [
      { id: 'doc-seed-1', name: 'OISD-STD-118-Safety-Standard.pdf', status: 'processed', version: 'V1.0' },
      { id: 'doc-seed-2', name: 'CS-4-302B-Maintenance-Procedure.pdf', status: 'processed', version: 'V1.3' }
    ];
    localStorage.setItem(docKey, JSON.stringify(mockDocs));

    // Mark as seeded in preference
    const settings = getStoredSettings();
    saveStoredSettings({ ...settings, demoSeeded: true });

    return { data: { success: true } as unknown as T };
  }

  // --- GUIDED TOUR & CHANGELOGS (P17) ---
  if (path === '/tours/main' && method === 'GET') {
    return {
      data: [
        { selector: '.tour-step-plant', title: 'Plant Selector', body: 'Instantly toggle between different refinery segments and assets across India. Watch telemetry and analytics update in real time.', order: 1 },
        { selector: '.tour-step-search', title: 'Unified Command Bar', body: 'Trigger via ⌘K or Ctrl+K to perform lightning-fast semantic queries across all plant assets, live parameters, and SOPs.', order: 2 },
        { selector: '.tour-step-copilot', title: 'Expert Copilot Chat', body: 'Ask our specialized industrial AI about OISD compliance guidelines, check maintenance tasks, or run safety scenario simulations.', order: 3 },
        { selector: '.tour-step-menu', title: 'Main Navigation Rail', body: 'Seamlessly shift between active maps, maintenance worksheets, compliance risk heatmaps, and administrative settings.', order: 4 },
        { selector: '.tour-step-help', title: 'Support & Help Desk', body: 'Relaunch this tour, view latest system changelogs, or view keyboard shortcuts registry at any time.', order: 5 }
      ] as unknown as T
    };
  }

  if (path === '/changelog' && method === 'GET') {
    return {
      data: [
        { id: 1, version: 'V2.4.0', date: '2026-07-10', title: 'Extraction Rules & Live Regex Tester', description: 'Engineers can now create, version, and debug compliance document extraction rules using regex and LLM pattern matchers live.' },
        { id: 2, version: 'V2.3.5', date: '2026-07-02', title: 'One-Time API Keys & Webhook Deliveries', description: 'Improved system integration capabilities. Generate secure third-party ingest keys and audit real-time webhook payload logs.' },
        { id: 3, version: 'V2.2.0', date: '2026-06-18', title: 'Guided Interactive Onboarding', description: 'New personnel onboarding workflow auto-tracks required milestones: equipment entries, document indexing, and AI verification.' }
      ] as unknown as T
    };
  }

  // Fallback for unhandled paths
  throw {
    error: {
      code: 'NOT_FOUND',
      message: `Mock endpoint [${method}] ${path} not found.`,
    }
  };
}

/**
 * Normalizes any error object into a standard ApiErrorEnvelope structure
 */
function normalizeError(err: any): ApiErrorEnvelope {
  if (err && err.error && err.error.code) {
    return err as ApiErrorEnvelope;
  }
  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message: err?.message || 'An unexpected error occurred. Please try again.',
    }
  };
}

/**
 * Primary API Request Handler
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (inMemoryAccessToken) {
    headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  const requestOptions = {
    ...options,
    headers,
  };

  try {
    // Check if we are running in mock mode
    if (API_BASE_URL.startsWith('/api/mock')) {
      const response = await simulateNetworkCall<T>(url, requestOptions);
      return response.data;
    }

    // Real API call logic (for production and backend integration)
    const res = await fetch(url, requestOptions);

    if (res.status === 401) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => {
            headers['Authorization'] = `Bearer ${newToken}`;
            resolve(apiRequest<T>(path, options));
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: inMemoryRefreshToken }),
        });

        if (refreshResponse.ok) {
          const envelope = await refreshResponse.json() as ApiResponseEnvelope<{ token: string; refreshToken: string }>;
          const { token, refreshToken } = envelope.data;
          setTokens(token, refreshToken);
          isRefreshing = false;
          onRefreshed(token);
          // Retry original request
          headers['Authorization'] = `Bearer ${token}`;
          const retryRes = await fetch(url, { ...options, headers });
          if (!retryRes.ok) {
            const errJson = await retryRes.json() as ApiErrorEnvelope;
            throw errJson;
          }
          const retryEnvelope = await retryRes.json() as ApiResponseEnvelope<T>;
          return retryEnvelope.data;
        } else {
          // Refresh failed
          setTokens(null, null);
          isRefreshing = false;
          window.dispatchEvent(new Event('auth-logout'));
          throw await refreshResponse.json();
        }
      } catch (refreshErr) {
        isRefreshing = false;
        throw refreshErr;
      }
    }

    if (!res.ok) {
      const errJson = await res.json() as ApiErrorEnvelope;
      throw errJson;
    }

    const envelope = await res.json() as ApiResponseEnvelope<T>;
    return envelope.data;
  } catch (error: any) {
    // If mock threw, we normalize it directly
    const normalized = normalizeError(error);
    // Emit logout event on unauthorized
    if (normalized.error.code === 'UNAUTHORIZED' || normalized.error.code === 'INVALID_REFRESH_TOKEN') {
      setTokens(null, null);
      window.dispatchEvent(new Event('auth-logout'));
    }
    throw normalized;
  }
}

// -------------------------------------------------------------------
// MOCK DASHBOARD STRUCTURES & ROLE CONFIGURATIONS
// -------------------------------------------------------------------

const DEFAULT_DASHBOARD_CONFIGS: Record<string, any> = {
  'Plant Manager': [
    { widget_key: 'pm-kpi-oee', grid: { x: 0, y: 0, w: 3, h: 2 }, params: { title: 'OEE Status', type: 'kpi' } },
    { widget_key: 'pm-kpi-downtime', grid: { x: 3, y: 0, w: 3, h: 2 }, params: { title: 'Unplanned Downtime', type: 'kpi' } },
    { widget_key: 'pm-kpi-backlog', grid: { x: 6, y: 0, w: 3, h: 2 }, params: { title: 'Backlog WOs', type: 'kpi' } },
    { widget_key: 'pm-kpi-compliance', grid: { x: 9, y: 0, w: 3, h: 2 }, params: { title: 'Compliance Level', type: 'kpi' } },
    { widget_key: 'pm-ai-insight', grid: { x: 0, y: 2, w: 6, h: 4 }, params: { title: 'AI Synthesis', type: 'insight' } },
    { widget_key: 'pm-emission-chart', grid: { x: 6, y: 2, w: 6, h: 4 }, params: { title: 'Emission & Fuel Metrics', type: 'chart' } },
    { widget_key: 'pm-permits-table', grid: { x: 0, y: 6, w: 12, h: 4 }, params: { title: 'Active Safety Permits', type: 'table' } }
  ],
  'Maintenance Engineer': [
    { widget_key: 'me-kpi-mtbf', grid: { x: 0, y: 0, w: 6, h: 2 }, params: { title: 'MTBF Rate', type: 'kpi' } },
    { widget_key: 'me-kpi-mttr', grid: { x: 6, y: 0, w: 6, h: 2 }, params: { title: 'MTTR Rate', type: 'kpi' } },
    { widget_key: 'me-backlog-chart', grid: { x: 0, y: 2, w: 6, h: 4 }, params: { title: 'Work Order Backlog Trend', type: 'chart' } },
    { widget_key: 'me-bearings-heatmap', grid: { x: 6, y: 2, w: 6, h: 4 }, params: { title: 'Bearings Temperature Matrix', type: 'heatmap' } },
    { widget_key: 'me-ai-insight', grid: { x: 0, y: 6, w: 6, h: 4 }, params: { title: 'Predictive Insights', type: 'insight' } },
    { widget_key: 'me-shortcuts', grid: { x: 6, y: 6, w: 6, h: 4 }, params: { title: 'Lessons-Learned Shortcuts', type: 'shortcuts' } }
  ],
  'Field Technician': [
    { widget_key: 'tech-tasks-table', grid: { x: 0, y: 0, w: 12, h: 4 }, params: { title: 'Today\'s Assigned Steps', type: 'table' } },
    { widget_key: 'tech-safety-brief', grid: { x: 0, y: 4, w: 6, h: 4 }, params: { title: 'Safety Brief Checklist', type: 'digest' } },
    { widget_key: 'tech-copilot-specs', grid: { x: 6, y: 4, w: 6, h: 4 }, params: { title: 'Copilot Instant Query Box', type: 'insight' } },
    { widget_key: 'tech-shortcuts', grid: { x: 0, y: 8, w: 12, h: 3 }, params: { title: 'Mobile Action Panel', type: 'shortcuts' } }
  ],
  'Admin': [
    { widget_key: 'admin-kpi-ingestion', grid: { x: 0, y: 0, w: 6, h: 2 }, params: { title: 'Daily Ingestion Volume', type: 'kpi' } },
    { widget_key: 'admin-kpi-ocr', grid: { x: 6, y: 0, w: 6, h: 2 }, params: { title: 'OCR Parse Efficiency', type: 'kpi' } },
    { widget_key: 'admin-latency-chart', grid: { x: 0, y: 2, w: 6, h: 4 }, params: { title: 'Vector DB Latency Trend', type: 'chart' } },
    { widget_key: 'admin-ingestion-feed', grid: { x: 6, y: 2, w: 6, h: 4 }, params: { title: 'Live Ingestion Monitor', type: 'feed' } },
    { widget_key: 'admin-nodes-heatmap', grid: { x: 0, y: 6, w: 12, h: 4 }, params: { title: 'Database Nodes Load Matrix', type: 'heatmap' } }
  ],
  'Compliance Officer': [
    { widget_key: 'comp-federal-digest', grid: { x: 0, y: 0, w: 6, h: 4 }, params: { title: 'Federal Factory Act Checklists', type: 'digest' } },
    { widget_key: 'comp-gaps-heatmap', grid: { x: 6, y: 0, w: 6, h: 4 }, params: { title: 'Safety Gaps Matrix', type: 'heatmap' } },
    { widget_key: 'comp-overdue-table', grid: { x: 0, y: 4, w: 6, h: 4 }, params: { title: 'Overdue Pressure Booster Checks', type: 'table' } },
    { widget_key: 'comp-shortcuts', grid: { x: 6, y: 4, w: 6, h: 4 }, params: { title: 'Regulatory Export Actions', type: 'shortcuts' } }
  ],
  'Executive': [
    { widget_key: 'exec-kpi-savings', grid: { x: 0, y: 0, w: 6, h: 2 }, params: { title: 'Overall Financial Savings', type: 'kpi' } },
    { widget_key: 'exec-kpi-capex', grid: { x: 6, y: 0, w: 6, h: 2 }, params: { title: 'Active CapEx Remaining', type: 'kpi' } },
    { widget_key: 'exec-capex-chart', grid: { x: 0, y: 2, w: 6, h: 4 }, params: { title: 'CapEx & Asset Lifecycle Cost', type: 'chart' } },
    { widget_key: 'exec-savings-insight', grid: { x: 6, y: 2, w: 6, h: 4 }, params: { title: 'Executive Savings Brief', type: 'insight' } },
    { widget_key: 'exec-shortcuts', grid: { x: 0, y: 6, w: 12, h: 3 }, params: { title: 'Financial Audit Actions', type: 'shortcuts' } }
  ]
};

function getMockWidgetData(key: string): any {
  const widgetDataMap: Record<string, any> = {
    // ------------------ PLANT MANAGER ------------------
    'pm-kpi-oee': {
      title: 'Overall Equipment Effectiveness (OEE)',
      value: '84.6%',
      delta: '▲ +1.2% VS LST SHIFT',
      status: 'ok',
      sparkline: [80, 81.5, 83, 82.1, 84, 84.6]
    },
    'pm-kpi-downtime': {
      title: 'Unplanned Downtime Hrs',
      value: '14.8 hrs',
      delta: '▼ +3.4 hrs COLD STARTS',
      status: 'critical',
      sparkline: [10, 11.2, 12.5, 11, 13.4, 14.8]
    },
    'pm-kpi-backlog': {
      title: 'Active Work Order Backlog',
      value: '24 WOs',
      delta: '6 HIGH PRIORITY OPEN',
      status: 'warn',
      sparkline: [28, 27, 25, 26, 24, 24]
    },
    'pm-kpi-compliance': {
      title: 'Compliance score',
      value: '98.2%',
      delta: '3 GAPS DETECTED',
      status: 'ok',
      sparkline: [95, 96, 98, 97.5, 98.2, 98.2]
    },
    'pm-ai-insight': {
      headline: 'Anomaly Warning: Compressor Station 4',
      body: 'Vibration sensors on COMP-302B have breached nominal limits (7.2 mm/s vs 5.0 mm/s target). Lessons Learned model matches this pattern with the June 2025 stator coil breakdown. Recommended inspection within 48 hours to avert unplanned outage.',
      confidence: 'High',
      evidenceLinks: [
        { label: 'View Incident [INC-991]', hashUrl: '#documents' },
        { label: 'SOP-302B Seal Guide', hashUrl: '#documents' }
      ],
      actionButtons: [
        { label: 'Dispatch Inspection', hashUrl: '#maintenance' },
        { label: 'Silence Alert', hashUrl: '#dashboard' }
      ]
    },
    'pm-emission-chart': {
      title: 'Emission & Fuel Volume Metrics',
      type: 'area',
      description: 'Historical particulate discharge against legal limits (ppm)',
      xAxisKey: 'name',
      series: [
        { key: 'emissions', name: 'Flue gas emissions (ppm)', color: '#0E7C86' },
        { key: 'target', name: 'Regulatory threshold (ppm)', color: '#E5484D' }
      ],
      data: [
        { name: 'Shift A', emissions: 120, target: 150 },
        { name: 'Shift B', emissions: 135, target: 150 },
        { name: 'Shift C', emissions: 142, target: 150 },
        { name: 'Shift D', emissions: 110, target: 150 },
        { name: 'Shift E', emissions: 98, target: 150 },
        { name: 'Shift F', emissions: 115, target: 150 }
      ]
    },
    'pm-permits-table': {
      title: 'Active Safety Permits',
      description: 'Permit-to-work (PTW) validations across plant sectors',
      headers: ['Permit ID', 'Block / Area', 'SOP Code', 'Requested By'],
      rows: [
        { id: '1', cells: ['PTW-9910', 'REF-A Crude Unit', 'SOP-CRUDE-SHUT', 'Priya Sharma'], status: { label: 'Approved', type: 'ok' }, actionLink: '#compliance' },
        { id: '2', cells: ['PTW-9914', 'REF-B Cat Cracker', 'SOP-HIGH-PRESSURE', 'Arun Kumar'], status: { label: 'Pending Safety Sign', type: 'warn' }, actionLink: '#compliance' },
        { id: '3', cells: ['PTW-9921', 'UTILITIES block', 'SOP-STEAM-LINE', 'P Priya'], status: { label: 'In Review', type: 'info' }, actionLink: '#compliance' }
      ]
    },

    // ------------------ MAINTENANCE ENGINEER ------------------
    'me-kpi-mtbf': {
      title: 'Mean Time Between Failure (MTBF)',
      value: '342 hrs',
      delta: '▲ +14% OVER 30D PERIOD',
      status: 'ok',
      sparkline: [300, 310, 312, 330, 335, 342]
    },
    'me-kpi-mttr': {
      title: 'Mean Time To Repair (MTTR)',
      value: '2.1 hrs',
      delta: '▼ -20m OPTIMISED BY CO-PILOT',
      status: 'ok',
      sparkline: [2.5, 2.4, 2.3, 2.2, 2.1, 2.1]
    },
    'me-backlog-chart': {
      title: 'Work Order Backlog Trend',
      type: 'line',
      description: 'Total active work orders vs completed per shift',
      xAxisKey: 'name',
      series: [
        { key: 'backlog', name: 'Open backlog count', color: '#E5484D' },
        { key: 'completed', name: 'Closed orders', color: '#2E9E5B' }
      ],
      data: [
        { name: 'Mon', backlog: 48, completed: 12 },
        { name: 'Tue', backlog: 46, completed: 14 },
        { name: 'Wed', backlog: 44, completed: 16 },
        { name: 'Thu', backlog: 49, completed: 10 },
        { name: 'Fri', backlog: 45, completed: 18 },
        { name: 'Sat', backlog: 42, completed: 22 }
      ]
    },
    'me-bearings-heatmap': {
      title: 'Bearing vibration temperature Matrix',
      description: 'Deviation percentage over safety threshold values',
      rows: ['Sector A', 'Sector B', 'Sector C', 'Sector D'],
      cols: ['Brg 1 Temp', 'Brg 2 Temp', 'Brg 1 Vibe', 'Brg 2 Vibe'],
      colorScale: 'amber',
      data: [
        [12, 45, 95, 14],
        [88, 11, 23, 76],
        [15, 14, 18, 12],
        [34, 45, 12, 11]
      ]
    },
    'me-ai-insight': {
      headline: 'Vibration Predictive Risk: Pump P-101B',
      body: 'RCA Agent correlates high-frequency bearing noise signatures on P-101B with previous impeller stall incidents. Seal failure probability has peaked at 92%. We recommend immediate preventive lubrication dispatch.',
      confidence: 92,
      evidenceLinks: [
        { label: 'Lessons Learned DB [LL-2041]', hashUrl: '#documents' },
        { label: 'P-101A Cavitation Logs', hashUrl: '#documents' }
      ],
      actionButtons: [
        { label: 'Draft 5-Why RCA Map', hashUrl: '#maintenance' }
      ]
    },
    'me-shortcuts': {
      title: 'Engineering Lessons-Learned shortcuts',
      description: 'Instant queries into IndusMind lessons repository',
      shortcuts: [
        { label: 'P-101 Cavitation lessons', sublabel: 'LL-PUMP-101', icon: 'FileText', hashUrl: '#documents', accent: 'primary' },
        { label: 'Comp-302B seal failures', sublabel: 'LL-COMP-SEAL', icon: 'FileText', hashUrl: '#documents', accent: 'accent' },
        { label: 'Booster pump pressure drops', sublabel: 'LL-BOOSTER-PRESS', icon: 'FileText', hashUrl: '#documents', accent: 'normal' },
        { label: 'Shutdown permit template', sublabel: 'SOP-SHUT-PROC', icon: 'Wrench', hashUrl: '#maintenance', accent: 'normal' }
      ]
    },

    // ------------------ FIELD TECHNICIAN ------------------
    'tech-tasks-table': {
      title: 'Assigned steps (WO-2041)',
      description: 'Calibration procedure checklists on Feed Pump P-101A',
      headers: ['Step ID', 'Procedural Operation', 'Safety Limit / Check'],
      rows: [
        { id: '1', cells: ['STEP 1', 'Isolate P-101A Feed Pump from active block lines', 'Verify bypass remains 0 BAR'], status: { label: 'Done', type: 'ok' } },
        { id: '2', cells: ['STEP 2', 'Shut primary downstream discharge valve V-102A', 'Manual override required'], status: { label: 'Done', type: 'ok' } },
        { id: '3', cells: ['STEP 3', 'Calibrate Pressure Gauge PG-104 on the block', 'Verify rating at 12 BAR max'], status: { label: 'Active', type: 'warn' } },
        { id: '4', cells: ['STEP 4', 'Log calibration certification sheet into system', 'OISD-STD-118 Clause 6.4 Link'], status: { label: 'Pending', type: 'info' } }
      ]
    },
    'tech-safety-brief': {
      title: 'Dynamic Safety checklist',
      description: 'Critical compliance guidelines for Sector A Block REF-A',
      items: [
        { id: 'ts-1', type: 'critical', text: 'Wear dynamic vapor respirator around Crude Block today due to nearby nitrogen purging.' },
        { id: 'ts-2', type: 'safety', text: 'Low pressure nitrogen flushing is active near Valve V-230. Confirm isolated.' },
        { id: 'ts-3', type: 'safety', text: 'Check local LEL (Lower Explosive Limit) detector reads 0.0% before commencing hot calibration work.' }
      ]
    },
    'tech-copilot-specs': {
      headline: 'Copilot Instant specifications lookup',
      body: 'Standard torque spec for PG-104 pressure gauge mounting bolts is 45 Nm (33 ft-lbs) using cross-pattern lubrication sequence. Do not exceed 50 Nm to prevent thread shearing on secondary adapter sleeves.',
      confidence: 'High',
      evidenceLinks: [
        { label: 'PG-104 Installation SOP', hashUrl: '#documents' }
      ]
    },
    'tech-shortcuts': {
      title: 'Mobile Touch Action console',
      description: 'One-tap field activities tracker',
      shortcuts: [
        { label: 'Register torque reading', sublabel: 'HMI log', icon: 'Wrench', hashUrl: '#copilot', accent: 'primary' },
        { label: 'Scan QR / Tag plate', sublabel: 'Hologram camera', icon: 'QrCode', hashUrl: '#equipment', accent: 'accent' },
        { label: 'Log delay roadblock', sublabel: 'Operational incident', icon: 'AlertTriangle', hashUrl: '#copilot', accent: 'critical' },
        { label: 'Request peer support', sublabel: 'Control room ping', icon: 'Users', hashUrl: '#copilot', accent: 'normal' }
      ]
    },

    // ------------------ ADMIN ------------------
    'admin-kpi-ingestion': {
      title: 'In-memory Ingestion Queue',
      value: '412 files',
      delta: 'OCR PIPELINE EXTRACTING',
      status: 'info',
      sparkline: [250, 310, 380, 410, 395, 412]
    },
    'admin-kpi-ocr': {
      title: 'OCR Parse Accuracy',
      value: '99.8%',
      delta: 'GRAPH SYNCHRONIZATION: SECURED',
      status: 'ok',
      sparkline: [98.5, 99.1, 99.4, 99.6, 99.8, 99.8]
    },
    'admin-latency-chart': {
      title: 'Vector/Graph DB Latency Trend',
      type: 'area',
      description: 'Search lookup and graph traversal performance (ms)',
      xAxisKey: 'name',
      series: [
        { key: 'vector', name: 'Vector DB search latency (ms)', color: '#0E7C86' },
        { key: 'graph', name: 'Graph DB traversal (ms)', color: '#F5A524' }
      ],
      data: [
        { name: '10:00', vector: 24, graph: 18 },
        { name: '11:00', vector: 32, graph: 15 },
        { name: '12:00', vector: 45, graph: 12 },
        { name: '13:00', vector: 28, graph: 22 },
        { name: '14:00', vector: 18, graph: 14 },
        { name: '15:00', vector: 42, graph: 16 }
      ]
    },
    'admin-ingestion-feed': {
      title: 'Live Document Ingestion Monitor',
      description: 'Active extraction pipeline states',
      items: [
        { id: 'f-1', title: 'PID-992-SECTOR-A-REFINERY.DWG.PDF', subtitle: 'OCR Processing entity extraction', time: '1m ago', progress: 82, iconType: 'file', status: { label: 'Extracting', type: 'info' } },
        { id: 'f-2', title: 'SOP-CRUDE-SHUTDOWN-PROCEDURE.DOCX', subtitle: 'Graph DB synchronization active', time: '12m ago', progress: 100, iconType: 'check', status: { label: 'Completed', type: 'ok' } },
        { id: 'f-3', title: 'VALVE-LEAKS-HISTORIC-REGISTRY.XLSX', subtitle: 'Embeddings mapping active', time: '1h ago', progress: 100, iconType: 'cpu', status: { label: 'Indexed', type: 'ok' } }
      ]
    },
    'admin-nodes-heatmap': {
      title: 'Database cluster nodes Load Matrix',
      description: 'Node resources utilized (CPU / Memory load %)',
      rows: ['Cluster A', 'Cluster B', 'Cluster C', 'Cluster D'],
      cols: ['CPU Core 1', 'CPU Core 2', 'Mem Node 1', 'Mem Node 2'],
      colorScale: 'teal',
      data: [
        [15, 82, 12, 11],
        [10, 14, 98, 12],
        [12, 11, 14, 15],
        [75, 45, 12, 88]
      ]
    },

    // ------------------ COMPLIANCE OFFICER ------------------
    'comp-federal-digest': {
      title: 'Federal Factory Act safety checklists',
      description: 'Mandatory clauses tracking under OISD standards',
      items: [
        { id: 'cs-1', type: 'audit', text: 'OISD-STD-118 Clause 6.4: Weekly pressure gauges and booster pump safety tests validation overdue by 4 shifts on REF-A.' },
        { id: 'cs-2', type: 'safety', text: 'Section 41B: Factory Act safety disclosure updates required for LPG storage expansion node. Schedule in 12 days.' },
        { id: 'cs-3', type: 'general', text: 'Annual PESO licensing audit portal opens in 21 days. Verify compliance packages are fully exported.' }
      ]
    },
    'comp-gaps-heatmap': {
      title: 'Safety Gaps Matrix (Audit Risks)',
      description: 'Detected gaps risk intensity across plant blocks',
      rows: ['Crude Block', 'Cat Cracker', 'Utilities', 'Storage Block'],
      cols: ['Procedural Gap', 'Log Overdue', 'Permit Override', 'Bypass Fault'],
      colorScale: 'red',
      data: [
        [95, 12, 11, 14],
        [12, 88, 14, 15],
        [11, 14, 76, 12],
        [14, 15, 12, 11]
      ]
    },
    'comp-overdue-table': {
      title: 'Gaps needing remediation',
      description: 'High-risk non-compliance items tracked by AI engine',
      headers: ['Clause Code', 'Severity', 'Plant Location', 'Procedural Gap Details'],
      rows: [
        { id: 'c1', cells: ['OISD-118', 'HIGH', 'Sector REF-A', 'Lacks link to explicit pressure logging procedure.'], status: { label: 'Breach risk', type: 'critical' }, actionLink: '#compliance' },
        { id: 'c2', cells: ['ACT-SEC-41', 'MED', 'LPG Storage Block', 'Explosive vapor sensors annual calibration overdue.'], status: { label: 'In audit window', type: 'warn' }, actionLink: '#compliance' }
      ]
    },
    'comp-shortcuts': {
      title: 'Audit & Regulatory Actions',
      description: 'Compile safety evidence materials',
      shortcuts: [
        { label: 'Generate PESO evidence ZIP', sublabel: 'SOP-PESO-COMP', icon: 'Download', hashUrl: '#compliance', accent: 'primary' },
        { label: 'Factory Act Section 41B PDF', sublabel: 'SEC-41B-DRAFT', icon: 'FileText', hashUrl: '#documents', accent: 'normal' },
        { label: 'Safety Gaps Heatmap export', sublabel: 'COMP-GAP-CSV', icon: 'Download', hashUrl: '#compliance', accent: 'normal' },
        { label: 'Dispatch compliance action', sublabel: 'Auto-WO task generator', icon: 'Wrench', hashUrl: '#maintenance', accent: 'normal' }
      ]
    },

    // ------------------ EXECUTIVE ------------------
    'exec-kpi-savings': {
      title: 'Total Fiscal Savings (en-IN)',
      value: '₹2,42,00,000',
      delta: '▲ SAVED ₹42L FROM UNPLANNED OUTAGE',
      status: 'ok',
      sparkline: [18000000, 20000000, 21500000, 23000000, 24000000, 24200000]
    },
    'exec-kpi-capex': {
      title: 'CapEx Budget remaining (en-IN)',
      value: '₹12,80,00,000',
      delta: '₹1.1Cr RESERVED FOR ASSET REPLACEMENTS',
      status: 'info',
      sparkline: [150000000, 140000000, 135000000, 130000000, 128500000, 128000000]
    },
    'exec-capex-chart': {
      title: 'CapEx Allocations & Asset Lifecycle Cost',
      type: 'pareto',
      description: 'Cumulative spending (₹) across refinery sectors',
      xAxisKey: 'name',
      series: [
        { key: 'capex', name: 'CapEx Invested (₹)', type: 'bar', color: '#0E7C86' },
        { key: 'cumulativePercent', name: 'Cumulative Spend %', type: 'line', color: '#F5A524' }
      ],
      data: [
        { name: 'Crude REF-A', capex: 45000000, cumulativePercent: 35 },
        { name: 'Cat Cracker REF-B', capex: 35000000, cumulativePercent: 62 },
        { name: 'Utilities Unit', capex: 25000000, cumulativePercent: 82 },
        { name: 'Storage Tank Block', capex: 15000000, cumulativePercent: 94 },
        { name: 'Safety systems', capex: 8000000, cumulativePercent: 100 }
      ]
    },
    'exec-savings-insight': {
      headline: 'Financial Optimization Brief: Compressor Station 4',
      body: 'AI preventative warning on Reciprocating Compressor COMP-302B is predicted to prevent 18 hrs of unplanned refinery downtime. Expected CapEx repair outlay: ₹18,0,000 vs. unplanned outage loss profile of over ₹1,40,0,000.',
      confidence: 94,
      evidenceLinks: [
        { label: 'Outage Loss Profile Document', hashUrl: '#documents' },
        { label: 'COMP-302B replacement plan', hashUrl: '#documents' }
      ]
    },
    'exec-shortcuts': {
      title: 'Financial Auditing console',
      description: 'Quick links to plant ledger and insurance reports',
      shortcuts: [
        { label: 'View Asset Lifecycle Ledger', sublabel: 'FIN-ASSET-LEDG', icon: 'FileText', hashUrl: '#documents', accent: 'primary' },
        { label: 'Downtime Insurance Evidence', sublabel: 'FIN-INSUR-DOC', icon: 'Download', hashUrl: '#documents', accent: 'normal' },
        { label: 'OEE Fiscal Impact Report', sublabel: 'FIN-OEE-ANNUAL', icon: 'FileText', hashUrl: '#documents', accent: 'normal' },
        { label: 'Submit CapEx release', sublabel: 'FORM-CAPEX-99', icon: 'Wrench', hashUrl: '#maintenance', accent: 'normal' }
      ]
    }
  };

  return widgetDataMap[key] || { title: 'Unknown Widget', value: 'N/A' };
}

export const api = {
  get: <T>(path: string, options?: RequestInit) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestInit) => apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
