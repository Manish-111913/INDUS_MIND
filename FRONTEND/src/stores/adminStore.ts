import { create } from 'zustand';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  lastActive: string;
}

export interface Permission {
  code: string;
  label: string;
  resource: string;
}

export interface RolePermissions {
  [role: string]: string[]; // role -> array of permission codes
}

export interface AiCapability {
  key: string;
  title: string;
  provider: string;
  model: string;
  temperature: number;
  confidenceThreshold: number;
}

export interface PromptTemplate {
  key: string;
  capability: string;
  version: string;
  active: boolean;
  template: string;
  variables: string[];
  history: {
    version: string;
    template: string;
    date: string;
    author: string;
  }[];
}

export interface FeatureFlag {
  key: string;
  title: string;
  description: string;
  tenants: { [tenant: string]: boolean };
  roles: { [role: string]: boolean };
}

export interface AuditRecord {
  id: string;
  time: string;
  actor: string;
  action: string;
  entity: string;
  ip: string;
  beforeJson: string;
  afterJson: string;
}

export interface IngestionJob {
  id: string;
  filename: string;
  stage: string;
  reason: string;
  time: string;
}

export interface LookupOption {
  code: string;
  label: string;
  sort: number;
  active: boolean;
}

export interface LookupData {
  [category: string]: LookupOption[];
}

interface AdminState {
  users: AdminUser[];
  roles: string[];
  permissions: Permission[];
  rolePermissions: RolePermissions;
  aiCapabilities: AiCapability[];
  fallbackModel: string;
  prompts: PromptTemplate[];
  featureFlags: FeatureFlag[];
  auditLogs: AuditRecord[];
  ingestionJobs: IngestionJob[];
  lookups: LookupData;
  activeSessions: { id: string; device: string; ip: string; location: string; active: boolean }[];
  
  // Actions
  inviteUser: (name: string, email: string, roles: string[]) => void;
  toggleUserStatus: (id: string) => void;
  updateRolePermissions: (role: string, permissionCode: string, value: boolean) => void;
  saveRolePermissionsMatrix: () => void;
  updateAiCapability: (key: string, data: Partial<AiCapability>) => void;
  setFallbackModel: (model: string) => void;
  savePrompt: (key: string, template: string, activate: boolean) => void;
  toggleFlag: (flagKey: string, type: 'tenant' | 'role', target: string) => void;
  retryIngestionJob: (id: string) => void;
  retryAllIngestionJobs: () => void;
  addLookupOption: (category: string, option: LookupOption) => void;
  updateLookupOption: (category: string, code: string, data: Partial<LookupOption>) => void;
  deleteLookupOption: (category: string, code: string) => void;
  revokeSession: (id: string) => void;
}

const INITIAL_USERS: AdminUser[] = [
  { id: 'usr-1', name: 'Aditya Vardhan', email: 'admin@indusmind.io', roles: ['Admin'], status: 'active', lastActive: '12 Jul 2026 12:44' },
  { id: 'usr-2', name: 'Rajesh Nair', email: 'manager@indusmind.io', roles: ['Plant Manager'], status: 'active', lastActive: '12 Jul 2026 11:20' },
  { id: 'usr-3', name: 'Priya Sharma', email: 'engineer@indusmind.io', roles: ['Maintenance Engineer'], status: 'active', lastActive: '12 Jul 2026 10:15' },
  { id: 'usr-4', name: 'Meena Iyer', email: 'auditor@indusmind.io', roles: ['Compliance Officer'], status: 'active', lastActive: '11 Jul 2026 16:30' },
  { id: 'usr-5', name: 'Arun Kumar', email: 'tech@indusmind.io', roles: ['Maintenance Engineer'], status: 'inactive', lastActive: '09 Jul 2026 09:12' },
];

const INITIAL_PERMISSIONS: Permission[] = [
  // Documents Group
  { code: 'doc.read', label: 'View Documents', resource: 'Documents' },
  { code: 'doc.create', label: 'Upload Documents', resource: 'Documents' },
  { code: 'doc.delete', label: 'Delete Documents', resource: 'Documents' },
  { code: 'doc.reprocess', label: 'Reprocess Documents', resource: 'Documents' },
  // Work Orders Group
  { code: 'wo.read', label: 'Read Work Orders', resource: 'Work Orders' },
  { code: 'wo.create', label: 'Create Work Orders', resource: 'Work Orders' },
  { code: 'wo.assign', label: 'Assign Technicians', resource: 'Work Orders' },
  { code: 'wo.close', label: 'Close Out Permits', resource: 'Work Orders' },
  // Root Cause Analysis Group
  { code: 'rca.run', label: 'Execute RCA Wizard', resource: 'RCA Logic' },
  { code: 'rca.publish', label: 'Publish RCA Lessons', resource: 'RCA Logic' },
  // Compliance Group
  { code: 'comp.read', label: 'Read Regulations', resource: 'Compliance' },
  { code: 'comp.map', label: 'Map SOP to Clauses', resource: 'Compliance' },
  { code: 'comp.evidence.generate', label: 'Generate Evidence Packages', resource: 'Compliance' },
  // Admin & Settings
  { code: 'user.manage', label: 'Manage Plant Users', resource: 'System Admin' },
  { code: 'role.manage', label: 'Modify Access Matrix', resource: 'System Admin' },
  { code: 'ai.config', label: 'Tune AI Prompts & Models', resource: 'System Admin' },
];

const INITIAL_ROLE_PERMISSIONS: RolePermissions = {
  'Admin': ['doc.read', 'doc.create', 'doc.delete', 'doc.reprocess', 'wo.read', 'wo.create', 'wo.assign', 'wo.close', 'rca.run', 'rca.publish', 'comp.read', 'comp.map', 'comp.evidence.generate', 'user.manage', 'role.manage', 'ai.config'],
  'Plant Manager': ['doc.read', 'doc.create', 'wo.read', 'wo.create', 'wo.assign', 'wo.close', 'rca.run', 'comp.read', 'comp.evidence.generate'],
  'Maintenance Engineer': ['doc.read', 'doc.create', 'wo.read', 'wo.create', 'wo.close', 'rca.run', 'comp.read'],
  'Compliance Officer': ['doc.read', 'comp.read', 'comp.map', 'comp.evidence.generate'],
};

const INITIAL_AI_CAPABILITIES: AiCapability[] = [
  { key: 'chat', title: 'Expert Copilot Chat', provider: 'Google Gen AI', model: 'gemini-2.5-flash', temperature: 0.15, confidenceThreshold: 85 },
  { key: 'embedding', title: 'Text Embeddings (RAG)', provider: 'Google Gen AI', model: 'text-embedding-004', temperature: 0.00, confidenceThreshold: 90 },
  { key: 'extraction', title: 'SOP Entity Extraction', provider: 'Google Gen AI', model: 'gemini-2.5-pro', temperature: 0.10, confidenceThreshold: 80 },
  { key: 'rca', title: 'RCA Tree Hypothesis', provider: 'Google Gen AI', model: 'gemini-2.5-flash', temperature: 0.30, confidenceThreshold: 75 },
  { key: 'compliance', title: 'Regulatory Gap Auditor', provider: 'Google Gen AI', model: 'gemini-2.5-pro', temperature: 0.05, confidenceThreshold: 85 },
  { key: 'lessons', title: 'Lessons Learned Generator', provider: 'Google Gen AI', model: 'gemini-2.5-flash', temperature: 0.20, confidenceThreshold: 70 },
];

const INITIAL_PROMPTS: PromptTemplate[] = [
  {
    key: 'copilot_chat',
    capability: 'Expert Copilot Chat',
    version: 'V2.1',
    active: true,
    template: 'You are the IndusMind AI assistant configured for {plant_name}. Context is: {context}. Question: {question}. Rely strictly on OISD Standards and plant documentation. Do not invent safety instructions.',
    variables: ['plant_name', 'context', 'question'],
    history: [
      { version: 'V2.1', template: 'You are the IndusMind AI assistant configured for {plant_name}. Context is: {context}. Question: {question}. Rely strictly on OISD Standards and plant documentation. Do not invent safety instructions.', date: '11 Jul 2026', author: 'Aditya Vardhan' },
      { version: 'V2.0', template: 'Context: {context}. Question: {question}. Answer the question based on context.', date: '01 Jul 2026', author: 'System Bootstrap' }
    ]
  },
  {
    key: 'doc_extraction',
    capability: 'SOP Entity Extraction',
    version: 'V1.4',
    active: true,
    template: 'Extract plant tags, standards referenced, and failure modes from the following text: {text_block}. Return a structured JSON array matching schema: {json_schema}.',
    variables: ['text_block', 'json_schema'],
    history: [
      { version: 'V1.4', template: 'Extract plant tags, standards referenced, and failure modes from the following text: {text_block}. Return a structured JSON array matching schema: {json_schema}.', date: '05 Jul 2026', author: 'Priya Sharma' }
    ]
  },
  {
    key: 'rca_generator',
    capability: 'RCA Tree Hypothesis',
    version: 'V1.1',
    active: true,
    template: 'Generate a 5-Why root cause tree for the safety incident described as: {incident_description}. Contextual factors: {context_factors}. Standard OISD guidelines: {oisd_standard}.',
    variables: ['incident_description', 'context_factors', 'oisd_standard'],
    history: [
      { version: 'V1.1', template: 'Generate a 5-Why root cause tree for the safety incident described as: {incident_description}. Contextual factors: {context_factors}. Standard OISD guidelines: {oisd_standard}.', date: '09 Jul 2026', author: 'Aditya Vardhan' }
    ]
  }
];

const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'lessons_learned',
    title: 'Lessons Learned Hub',
    description: 'Enables cross-plant extraction of historic OISD failure records.',
    tenants: { 'Reliance Jamnagar Refinery - Sector A': true, 'Reliance Jamnagar Refinery - Sector B': true, 'Hazira Petrochemicals Complex - Unit 4': false },
    roles: { 'Admin': true, 'Plant Manager': true, 'Maintenance Engineer': true, 'Compliance Officer': true }
  },
  {
    key: 'predictive_maintenance',
    title: 'Predictive Maintenance AI',
    description: 'Enables automated vibration anomaly trigger systems.',
    tenants: { 'Reliance Jamnagar Refinery - Sector A': true, 'Reliance Jamnagar Refinery - Sector B': false, 'Hazira Petrochemicals Complex - Unit 4': true },
    roles: { 'Admin': true, 'Plant Manager': true, 'Maintenance Engineer': true, 'Compliance Officer': false }
  },
  {
    key: 'compliance_evidence_pack',
    title: 'Compliance Evidence Packer',
    description: 'Allows batch downloading of compliance evidence hashes for statutory reviews.',
    tenants: { 'Reliance Jamnagar Refinery - Sector A': true, 'Reliance Jamnagar Refinery - Sector B': true, 'Hazira Petrochemicals Complex - Unit 4': false },
    roles: { 'Admin': true, 'Plant Manager': true, 'Maintenance Engineer': false, 'Compliance Officer': true }
  },
  {
    key: 'advanced_analytics',
    title: 'Operational Analytics & Charts',
    description: 'Displays Recharts-driven cost impact and OEE savings projections.',
    tenants: { 'Reliance Jamnagar Refinery - Sector A': true, 'Reliance Jamnagar Refinery - Sector B': true, 'Hazira Petrochemicals Complex - Unit 4': true },
    roles: { 'Admin': true, 'Plant Manager': true, 'Maintenance Engineer': false, 'Compliance Officer': false }
  }
];

const INITIAL_AUDIT_LOGS: AuditRecord[] = [
  { id: 'aud-1', time: '12 Jul 2026 11:04', actor: 'Arun Kumar (Tech)', action: 'WO CLOSE_OUT_PERMIT', entity: 'WO-2041', ip: '10.220.12.84', beforeJson: '{\n  "id": "WO-2041",\n  "status": "pending_permit",\n  "permitHash": ""\n}', afterJson: '{\n  "id": "WO-2041",\n  "status": "closed",\n  "permitHash": "sha256-4c8d5e1f...",\n  "closedAt": "2026-07-12T11:04:12Z"\n}' },
  { id: 'aud-2', time: '12 Jul 2026 10:48', actor: 'Priya Sharma (Eng)', action: 'RCA UPDATE_WHY_LOGIC', entity: 'INC-991', ip: '10.220.15.11', beforeJson: '{\n  "incidentId": "INC-991",\n  "whys": [\n    "Pump stopped",\n    "Bearing failure"\n  ]\n}', afterJson: '{\n  "incidentId": "INC-991",\n  "whys": [\n    "Pump stopped",\n    "Bearing failure",\n    "Hydraulic cavitation from low level suction"\n  ]\n}' },
  { id: 'aud-3', time: '12 Jul 2026 09:12', actor: 'Meena Iyer (Comp)', action: 'EVIDENCE_PACKAGE_GENERATE', entity: 'REG-OISD-118', ip: '10.220.11.45', beforeJson: '{\n  "standard": "OISD-STD-118",\n  "evidenceCompiled": false\n}', afterJson: '{\n  "standard": "OISD-STD-118",\n  "evidenceCompiled": true,\n  "pdfHash": "sha256-11aa44bb...",\n  "filesIncluded": 3\n}' },
  { id: 'aud-4', time: '12 Jul 2026 08:34', actor: 'Aditya Vardhan (Admin)', action: 'CONFIG_OVERRIDE_LLM', entity: 'SYSTEM-AI', ip: '192.168.1.104', beforeJson: '{\n  "capability": "chat",\n  "temperature": 0.2\n}', afterJson: '{\n  "capability": "chat",\n  "temperature": 0.1\n}' },
];

const INITIAL_INGESTION_JOBS: IngestionJob[] = [
  { id: 'job-101', filename: 'SOP-202-V4-FUEL-GAS-VALVE.PDF', stage: 'OCR Engine', reason: 'Unreadable scanned pages (Low DPI)', time: '12 Jul 2026 11:23' },
  { id: 'job-102', filename: 'REF-PI-FLOW-MANIFOLD.DWG', stage: 'Vector Embedder', reason: 'Schema alignment validation failure', time: '12 Jul 2026 09:44' },
  { id: 'job-103', filename: 'OISD-STD-118-CL-6.TXT', stage: 'Graph Parser', reason: 'Entity unresolved relationship loops', time: '11 Jul 2026 15:10' },
];

const INITIAL_LOOKUPS: LookupData = {
  doc_types: [
    { code: 'pid', label: 'P&ID Schematic', sort: 10, active: true },
    { code: 'oem', label: 'Equipment Manual', sort: 20, active: true },
    { code: 'sop', label: 'Safety Procedure', sort: 30, active: true },
    { code: 'audit', label: 'Regulatory Audit', sort: 40, active: true },
    { code: 'wo', label: 'Work Order Record', sort: 50, active: true },
    { code: 'inc', label: 'Incident Report', sort: 60, active: true }
  ],
  plants: [
    { code: 'jam-a', label: 'Reliance Jamnagar Refinery - Sector A', sort: 10, active: true },
    { code: 'jam-b', label: 'Reliance Jamnagar Refinery - Sector B', sort: 20, active: true },
    { code: 'haz-4', label: 'Hazira Petrochemicals Complex - Unit 4', sort: 30, active: true },
    { code: 'kg-d6', label: 'KG-D6 Deepwater Gas Field Terminal', sort: 40, active: true }
  ],
  areas: [
    { code: 'crude-1', label: 'Crude Unit 1', sort: 10, active: true },
    { code: 'hydro-b', label: 'Hydrocracker Block', sort: 20, active: true },
    { code: 'boiler-u', label: 'Boiler Room Unit', sort: 30, active: true },
    { code: 'lpg-farm', label: 'LPG Tank Farm', sort: 40, active: true },
    { code: 'vent-a', label: 'Venting Station A', sort: 50, active: true },
    { code: 'comp-4', label: 'Compressor Shed 4', sort: 60, active: true }
  ]
};

const INITIAL_SESSIONS = [
  { id: 'sess-1', device: 'Edge 124 on Windows Desktop', ip: '10.220.12.84', location: 'Mumbai, India', active: true },
  { id: 'sess-2', device: 'Chrome 125 on Android Mobile', ip: '103.44.11.23', location: 'Gujarat, India', active: true },
  { id: 'sess-3', device: 'Safari on iPad Pro (Tablet)', ip: '10.220.15.11', location: 'Mumbai, India', active: false },
];

export const useAdminStore = create<AdminState>((set) => {
  // Load initial values from localStorage if available
  const loadLocal = <T>(key: string, defaults: T): T => {
    const val = localStorage.getItem(`indusmind_admin_${key}`);
    return val ? JSON.parse(val) : defaults;
  };

  const saveLocal = (key: string, data: any) => {
    localStorage.setItem(`indusmind_admin_${key}`, JSON.stringify(data));
  };

  return {
    users: loadLocal('users', INITIAL_USERS),
    roles: ['Admin', 'Plant Manager', 'Maintenance Engineer', 'Compliance Officer'],
    permissions: INITIAL_PERMISSIONS,
    rolePermissions: loadLocal('rolePermissions', INITIAL_ROLE_PERMISSIONS),
    aiCapabilities: loadLocal('aiCapabilities', INITIAL_AI_CAPABILITIES),
    fallbackModel: loadLocal('fallbackModel', 'gemini-2.5-pro'),
    prompts: loadLocal('prompts', INITIAL_PROMPTS),
    featureFlags: loadLocal('featureFlags', INITIAL_FEATURE_FLAGS),
    auditLogs: loadLocal('auditLogs', INITIAL_AUDIT_LOGS),
    ingestionJobs: loadLocal('ingestionJobs', INITIAL_INGESTION_JOBS),
    lookups: loadLocal('lookups', INITIAL_LOOKUPS),
    activeSessions: loadLocal('activeSessions', INITIAL_SESSIONS),

    inviteUser: (name, email, roles) => set((state) => {
      const newUser: AdminUser = {
        id: `usr-${Date.now()}`,
        name,
        email,
        roles,
        status: 'active',
        lastActive: 'Never'
      };
      const updated = [newUser, ...state.users];
      saveLocal('users', updated);
      
      // Append audit log
      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'USER_INVITE',
        entity: email,
        ip: '127.0.0.1',
        beforeJson: '{}',
        afterJson: JSON.stringify(newUser, null, 2)
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { users: updated, auditLogs: updatedAudits };
    }),

    toggleUserStatus: (id) => set((state) => {
      const updated = state.users.map((u) => {
        if (u.id === id) {
          const nextStatus: 'active' | 'inactive' = u.status === 'active' ? 'inactive' : 'active';
          
          // Append audit log
          const audit: AuditRecord = {
            id: `aud-${Date.now()}`,
            time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
            actor: 'Aditya Vardhan (Admin)',
            action: `USER_STATUS_TOGGLE`,
            entity: u.email,
            ip: '127.0.0.1',
            beforeJson: JSON.stringify({ status: u.status }),
            afterJson: JSON.stringify({ status: nextStatus })
          };
          setTimeout(() => {
            set((s) => {
              const updatedAudits = [audit, ...s.auditLogs];
              saveLocal('auditLogs', updatedAudits);
              return { auditLogs: updatedAudits };
            });
          }, 0);

          return { ...u, status: nextStatus };
        }
        return u;
      });
      saveLocal('users', updated);
      return { users: updated };
    }),

    updateRolePermissions: (role, permissionCode, value) => set((state) => {
      const currentPerms = state.rolePermissions[role] || [];
      const updatedPerms = value 
        ? [...currentPerms, permissionCode] 
        : currentPerms.filter(p => p !== permissionCode);
      
      const updated = {
        ...state.rolePermissions,
        [role]: updatedPerms
      };
      // Note: We don't save to local storage until saveRolePermissionsMatrix is explicitly called, or we can save on change.
      // The prompt says "save bar appearing on change" implying an explicit Save. We'll store it immediately but track changes
      // or save it instantly to storage for flawless UX. Let's save on change, but we will show the save success bar!
      return { rolePermissions: updated };
    }),

    saveRolePermissionsMatrix: () => set((state) => {
      saveLocal('rolePermissions', state.rolePermissions);
      // Create Audit Log
      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'UPDATE_ROLE_PERMISSIONS_MATRIX',
        entity: 'ROLE_MATRIX',
        ip: '127.0.0.1',
        beforeJson: 'Saved previously',
        afterJson: JSON.stringify(state.rolePermissions, null, 2)
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);
      return { auditLogs: updatedAudits };
    }),

    updateAiCapability: (key, data) => set((state) => {
      const updated = state.aiCapabilities.map((cap) => {
        if (cap.key === key) {
          const capBefore = { ...cap };
          const capAfter = { ...cap, ...data };
          
          const audit: AuditRecord = {
            id: `aud-${Date.now()}`,
            time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
            actor: 'Aditya Vardhan (Admin)',
            action: 'UPDATE_AI_CONFIG',
            entity: `CAPABILITY_${key.toUpperCase()}`,
            ip: '127.0.0.1',
            beforeJson: JSON.stringify(capBefore, null, 2),
            afterJson: JSON.stringify(capAfter, null, 2)
          };
          setTimeout(() => {
            set((s) => {
              const updatedAudits = [audit, ...s.auditLogs];
              saveLocal('auditLogs', updatedAudits);
              return { auditLogs: updatedAudits };
            });
          }, 0);

          return capAfter;
        }
        return cap;
      });
      saveLocal('aiCapabilities', updated);
      return { aiCapabilities: updated };
    }),

    setFallbackModel: (model) => set((state) => {
      const beforeModel = state.fallbackModel;
      saveLocal('fallbackModel', model);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'SET_FALLBACK_MODEL',
        entity: 'FALLBACK_LLM',
        ip: '127.0.0.1',
        beforeJson: JSON.stringify({ model: beforeModel }),
        afterJson: JSON.stringify({ model })
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { fallbackModel: model, auditLogs: updatedAudits };
    }),

    savePrompt: (key, template, activate) => set((state) => {
      const updated = state.prompts.map((p) => {
        if (p.key === key) {
          const beforePrompt = { ...p };
          let nextVersion = p.version;
          let nextHistory = [...p.history];
          
          if (activate) {
            const currentVerNum = parseFloat(p.version.replace('V', ''));
            nextVersion = `V${(currentVerNum + 0.1).toFixed(1)}`;
            nextHistory = [
              {
                version: nextVersion,
                template,
                date: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                author: 'Aditya Vardhan'
              },
              ...p.history
            ];
          }

          const afterPrompt = {
            ...p,
            template,
            version: nextVersion,
            history: nextHistory,
            active: activate ? true : p.active
          };

          const audit: AuditRecord = {
            id: `aud-${Date.now()}`,
            time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
            actor: 'Aditya Vardhan (Admin)',
            action: activate ? 'PROMPT_ACTIVATE_NEW_VERSION' : 'PROMPT_DRAFT_SAVE',
            entity: `PROMPT_${key.toUpperCase()}`,
            ip: '127.0.0.1',
            beforeJson: JSON.stringify(beforePrompt, null, 2),
            afterJson: JSON.stringify(afterPrompt, null, 2)
          };
          setTimeout(() => {
            set((s) => {
              const updatedAudits = [audit, ...s.auditLogs];
              saveLocal('auditLogs', updatedAudits);
              return { auditLogs: updatedAudits };
            });
          }, 0);

          return afterPrompt;
        }
        return p;
      });
      saveLocal('prompts', updated);
      return { prompts: updated };
    }),

    toggleFlag: (flagKey, type, target) => set((state) => {
      const updated = state.featureFlags.map((flag) => {
        if (flag.key === flagKey) {
          const beforeFlag = { ...flag };
          let afterFlag = { ...flag };
          
          if (type === 'tenant') {
            const nextVal = !flag.tenants[target];
            afterFlag = {
              ...flag,
              tenants: { ...flag.tenants, [target]: nextVal }
            };
          } else {
            const nextVal = !flag.roles[target];
            afterFlag = {
              ...flag,
              roles: { ...flag.roles, [target]: nextVal }
            };
          }

          const audit: AuditRecord = {
            id: `aud-${Date.now()}`,
            time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
            actor: 'Aditya Vardhan (Admin)',
            action: 'FEATURE_FLAG_TOGGLE',
            entity: `FLAG_${flagKey.toUpperCase()}`,
            ip: '127.0.0.1',
            beforeJson: JSON.stringify(beforeFlag, null, 2),
            afterJson: JSON.stringify(afterFlag, null, 2)
          };
          setTimeout(() => {
            set((s) => {
              const updatedAudits = [audit, ...s.auditLogs];
              saveLocal('auditLogs', updatedAudits);
              return { auditLogs: updatedAudits };
            });
          }, 0);

          return afterFlag;
        }
        return flag;
      });
      saveLocal('featureFlags', updated);
      return { featureFlags: updated };
    }),

    retryIngestionJob: (id) => set((state) => {
      // Find the job to get its name
      const job = state.ingestionJobs.find(j => j.id === id);
      const updated = state.ingestionJobs.filter(j => j.id !== id);
      saveLocal('ingestionJobs', updated);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'INGESTION_RETRY_JOB',
        entity: job ? job.filename : `JOB_${id}`,
        ip: '127.0.0.1',
        beforeJson: JSON.stringify(job || {}),
        afterJson: '{}'
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { ingestionJobs: updated, auditLogs: updatedAudits };
    }),

    retryAllIngestionJobs: () => set((state) => {
      const beforeJobsCount = state.ingestionJobs.length;
      saveLocal('ingestionJobs', []);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'INGESTION_RETRY_ALL_JOBS',
        entity: 'INGESTION_QUEUE',
        ip: '127.0.0.1',
        beforeJson: JSON.stringify({ count: beforeJobsCount }),
        afterJson: JSON.stringify({ count: 0 })
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { ingestionJobs: [], auditLogs: updatedAudits };
    }),

    addLookupOption: (category, option) => set((state) => {
      const currentCatList = state.lookups[category] || [];
      const updatedList = [...currentCatList, option].sort((a, b) => a.sort - b.sort);
      const updated = {
        ...state.lookups,
        [category]: updatedList
      };
      saveLocal('lookups', updated);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'LOOKUP_ADD_OPTION',
        entity: `LOOKUP_${category.toUpperCase()}`,
        ip: '127.0.0.1',
        beforeJson: '{}',
        afterJson: JSON.stringify({ category, option }, null, 2)
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { lookups: updated, auditLogs: updatedAudits };
    }),

    updateLookupOption: (category, code, data) => set((state) => {
      const currentCatList = state.lookups[category] || [];
      const beforeOpt = currentCatList.find(o => o.code === code);
      const updatedList = currentCatList.map((opt) => {
        if (opt.code === code) {
          return { ...opt, ...data };
        }
        return opt;
      }).sort((a, b) => a.sort - b.sort);

      const updated = {
        ...state.lookups,
        [category]: updatedList
      };
      saveLocal('lookups', updated);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'LOOKUP_UPDATE_OPTION',
        entity: `LOOKUP_${category.toUpperCase()}`,
        ip: '127.0.0.1',
        beforeJson: JSON.stringify(beforeOpt || {}),
        afterJson: JSON.stringify(updatedList.find(o => o.code === code) || {})
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { lookups: updated, auditLogs: updatedAudits };
    }),

    deleteLookupOption: (category, code) => set((state) => {
      const currentCatList = state.lookups[category] || [];
      const beforeOpt = currentCatList.find(o => o.code === code);
      const updatedList = currentCatList.filter(o => o.code !== code);

      const updated = {
        ...state.lookups,
        [category]: updatedList
      };
      saveLocal('lookups', updated);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'LOOKUP_DELETE_OPTION',
        entity: `LOOKUP_${category.toUpperCase()}`,
        ip: '127.0.0.1',
        beforeJson: JSON.stringify(beforeOpt || {}),
        afterJson: '{}'
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { lookups: updated, auditLogs: updatedAudits };
    }),

    revokeSession: (id) => set((state) => {
      const targetSession = state.activeSessions.find(s => s.id === id);
      const updated = state.activeSessions.map((s) => {
        if (s.id === id) {
          return { ...s, active: false };
        }
        return s;
      });
      saveLocal('activeSessions', updated);

      const audit: AuditRecord = {
        id: `aud-${Date.now()}`,
        time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
        actor: 'Aditya Vardhan (Admin)',
        action: 'SECURITY_SESSION_REVOKE',
        entity: targetSession ? targetSession.device : `SESSION_${id}`,
        ip: '127.0.0.1',
        beforeJson: JSON.stringify(targetSession || {}),
        afterJson: JSON.stringify({ ...targetSession, active: false })
      };
      const updatedAudits = [audit, ...state.auditLogs];
      saveLocal('auditLogs', updatedAudits);

      return { activeSessions: updated, auditLogs: updatedAudits };
    }),
  };
});
