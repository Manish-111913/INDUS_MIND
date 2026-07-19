import { useState, useMemo, useEffect, useRef } from 'react';
import * as Icons from 'lucide-react';
import { Select } from '../../shared';
import { useAdminStore, AdminUser, Permission, AiCapability, PromptTemplate, FeatureFlag, AuditRecord, LookupOption } from '../../../stores/adminStore';
import { renderIcon } from '../../layout/AppShell';
import { useSettingsStore } from '../../../stores/settingsStore';
import { api, USE_MOCK } from '../../../lib/api/client';
import { TranslationsModule } from './TranslationsModule';
import { RetentionModule } from './RetentionModule';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useAuthStore } from '../../../stores/authStore';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

interface AdminSuiteProps {
  currentHash: string;
  onRouteChange: (hash: string) => void;
}

export function AdminSuite({ currentHash, onRouteChange }: AdminSuiteProps) {
  const activeModule = useMemo(() => {
    const parts = currentHash.replace('#', '').split('/');
    return parts[1] || 'users'; // default to users
  }, [currentHash]);

  const handleModuleChange = (module: string) => {
    onRouteChange(`#admin/${module}`);
  };

  // In LIVE mode, pull every admin module's real data from the backend once on
  // mount (empty for a brand-new tenant). No-op in MOCK mode, which keeps the
  // existing fixture/localStorage behavior.
  const hydrateFromBackend = useAdminStore((s) => s.hydrateFromBackend);
  useEffect(() => {
    hydrateFromBackend();
  }, [hydrateFromBackend]);

  const adminMenu = [
    { id: 'users', label: 'User Directory', icon: 'Users', badge: null },
    { id: 'roles', label: 'Access Matrix', icon: 'ShieldCheck', badge: 'SECURE' },
    { id: 'ai-config', label: 'AI Model Tuning', icon: 'Sliders', badge: null },
    { id: 'prompts', label: 'Prompt Templates', icon: 'Terminal', badge: 'PRO' },
    { id: 'notification-templates', label: 'Alert Templates', icon: 'Bell', badge: 'NEW' },
    { id: 'reports', label: 'Scheduled Reports', icon: 'Calendar', badge: 'REPORTS' },
    { id: 'extraction-rules', label: 'Extraction Rules', icon: 'FileCode', badge: 'RULE' },
    { id: 'integrations', label: 'Integrations', icon: 'Network', badge: 'INTEG' },
    { id: 'ai-observability', label: 'AI Quality Ledger', icon: 'Eye', badge: 'STATS' },
    { id: 'feature-flags', label: 'Feature Toggles', icon: 'ToggleRight', badge: null },
    { id: 'audit-log', label: 'Audit Ledger', icon: 'History', badge: 'APPEND' },
    { id: 'ingestion', label: 'Ingestion Pipeline', icon: 'Cpu', badge: 'QUEUE' },
    { id: 'lookups', label: 'Lookups & Options', icon: 'Database', badge: 'CORE' },
    { id: 'system-health', label: 'Node Diagnostics', icon: 'Activity', badge: 'LIVE' },
    { id: 'translations', label: 'Localizations & i18n', icon: 'Globe', badge: 'GAPS' },
    { id: 'retention', label: 'Retention Policies', icon: 'ShieldAlert', badge: 'PRUNING' },
    { id: 'settings', label: 'System Settings', icon: 'Settings', badge: 'CONFIG' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0 animate-fade-in font-sans">
      {/* Admin Sidebar Navigation */}
      <div className="w-full lg:w-64 flex-shrink-0 bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
        <div className="space-y-4">
          <div className="px-3 py-2 border-b border-border-custom">
            <span className="block font-display font-bold text-sm tracking-tight text-text-primary">Console Administration</span>
            <span className="block font-mono text-[9px] text-text-muted mt-0.5 tracking-wider uppercase">NODE-A ACCESS GRANTED</span>
          </div>
          <nav className="space-y-1">
            {adminMenu.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleModuleChange(item.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs font-medium tracking-wide transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-primary/10 text-primary border border-primary/25 font-semibold shadow-sm'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {renderIcon(item.icon, `w-4 h-4 ${isActive ? 'text-primary' : 'text-text-muted'}`)}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`font-mono text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest ${
                      item.id === 'roles' ? 'bg-status-ok/10 text-status-ok border border-status-ok/20' :
                      item.id === 'prompts' ? 'bg-primary/10 text-primary border border-primary/20' :
                      item.id === 'audit-log' ? 'bg-status-critical/10 text-status-critical border border-status-critical/20' :
                      'bg-surface-muted text-text-muted border border-border-custom'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 bg-surface-muted/50 border border-border-custom rounded-lg mt-4 text-[10px] font-mono text-text-muted space-y-1.5">
          <div className="flex justify-between">
            <span>MFA STATE:</span>
            <span className="text-status-ok font-bold">ENFORCED</span>
          </div>
          <div className="flex justify-between">
            <span>LEDGER SYNC:</span>
            <span className="text-status-ok font-bold">100% SECURE</span>
          </div>
          <div className="flex justify-between">
            <span>SESSION KEY:</span>
            <span className="text-primary font-bold">NODE-A-24X1</span>
          </div>
        </div>
      </div>

      {/* Admin Active Module Area */}
      <div className="flex-1 bg-surface border border-border-custom rounded-xl p-5 shadow-sm min-w-0 overflow-y-auto">
        {activeModule === 'users' && <UsersModule />}
        {activeModule === 'roles' && <RolesPermissionsModule />}
        {activeModule === 'ai-config' && <AiConfigModule />}
        {activeModule === 'prompts' && <PromptsModule />}
        {activeModule === 'notification-templates' && <NotificationTemplatesModule />}
        {activeModule === 'reports' && <ReportsModule />}
        {activeModule === 'extraction-rules' && <ExtractionRulesModule />}
        {activeModule === 'integrations' && <IntegrationsModule />}
        {activeModule === 'ai-observability' && <AiObservabilityModule />}
        {activeModule === 'feature-flags' && <FeatureFlagsModule />}
        {activeModule === 'audit-log' && <AuditLogModule />}
        {activeModule === 'ingestion' && <IngestionModule />}
        {activeModule === 'lookups' && <LookupsModule />}
        {activeModule === 'system-health' && <SystemHealthModule />}
        {activeModule === 'translations' && <TranslationsModule />}
        {activeModule === 'retention' && <RetentionModule />}
        {activeModule === 'settings' && <AdminSettingsModule />}
      </div>
    </div>
  );
}

// ============================================================================
// 0. ADMIN SETTINGS DYNAMIC MODULE
// ============================================================================
interface SettingDefinition {
  group: string;
  key: string;
  name: string;
  value_type: "select" | "string" | "number";
  options?: string[];
  description: string;
}

function AdminSettingsModule() {
  const { settings, updateEffectiveSettings } = useSettingsStore();
  const [definitions, setDefinitions] = useState<SettingDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [values, setValues] = useState<{ [key: string]: any }>({});
  const [activeGroup, setActiveGroup] = useState<string>('General');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchDefinitions = async () => {
      try {
        const res = await api.get<SettingDefinition[]>('/admin/settings/definitions');
        if (active) {
          setDefinitions(res || []);
          if (res && res.length > 0) {
            setActiveGroup(res[0].group);
          }
        }
      } catch (err) {
        console.error("Failed to load admin setting definitions:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchDefinitions();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const initialValues: { [key: string]: any } = {};
    definitions.forEach(def => {
      initialValues[def.key] = settings[def.key] !== undefined ? settings[def.key] : '';
    });
    setValues(initialValues);
  }, [definitions, settings]);

  const handleValueChange = (key: string, val: any) => {
    setValues(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.put<any>('/admin/settings/values', values);
      updateEffectiveSettings(values);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save admin settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const groups = useMemo(() => {
    const list = new Set<string>();
    definitions.forEach(d => list.add(d.group));
    return Array.from(list);
  }, [definitions]);

  const filteredDefinitions = useMemo(() => {
    return definitions.filter(d => d.group === activeGroup);
  }, [definitions, activeGroup]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icons.RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-xs font-sans">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">System & Tenant Settings Definition</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Define global system defaults, baseline physics unit configurations, and client tenant white-label branding variables.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation tabs column */}
        <div className="space-y-1">
          {groups.map(group => (
            <button
              key={group}
              type="button"
              onClick={() => setActiveGroup(group)}
              className={`w-full flex items-center space-x-2.5 p-3 rounded-lg text-left text-xs font-medium cursor-pointer transition-all ${
                activeGroup === group
                  ? 'bg-primary/10 text-primary border border-primary/20 font-bold'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary border border-transparent'
              }`}
            >
              <span>{group} Settings</span>
            </button>
          ))}
        </div>

        {/* Dynamic form fields column */}
        <div className="md:col-span-3">
          <form onSubmit={handleSave} className="space-y-6 bg-surface border border-border-custom rounded-xl p-6 shadow">
            <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2">
              {activeGroup} Config parameters
            </span>

            <div className="space-y-5">
              {filteredDefinitions.map(def => {
                const val = values[def.key] ?? '';
                return (
                  <div key={def.key} className="space-y-1.5">
                    <div className="flex justify-between items-start">
                      <label className="font-sans font-semibold text-text-primary text-xs">{def.name}</label>
                      <span className="font-mono text-[9px] text-text-muted bg-background-custom px-1.5 py-0.5 rounded border border-border-custom/50 uppercase">{def.value_type}</span>
                    </div>
                    <p className="text-[11px] text-text-muted">{def.description}</p>
                    
                    {def.value_type === 'select' ? (
                      <Select
                        value={val}
                        onValueChange={(v) => handleValueChange(def.key, v)}
                        className="w-full px-3 py-2.5 font-medium text-xs min-h-[44px]"
                        placeholder="-- Choose Option --"
                        options={[
                          { value: '', label: '-- Choose Option --' },
                          ...(def.options?.map(opt => ({ value: opt, label: opt })) ?? []),
                        ]}
                      />
                    ) : def.value_type === 'number' ? (
                      <input
                        type="number"
                        value={val}
                        onChange={(e) => handleValueChange(def.key, Number(e.target.value))}
                        className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none text-xs min-h-[44px]"
                      />
                    ) : (
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => handleValueChange(def.key, e.target.value)}
                        className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none text-xs min-h-[44px]"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-border-custom flex justify-end items-center gap-3">
              {saveSuccess && (
                <span className="text-status-ok text-xs font-mono font-bold animate-pulse">✓ SAVED DEFINED VALUES</span>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow min-h-[44px]"
              >
                {isSaving ? <Icons.RefreshCw className="w-4 h-4 animate-spin" /> : <Icons.Save className="w-4 h-4" />}
                <span>Save System Configurations</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 1. USERS DIRECTORY MODULE
// ============================================================================
function UsersModule() {
  const { users, inviteUser, toggleUserStatus } = useAdminStore();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('');
  
  // Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoles, setInviteRoles] = useState<string[]>(['Maintenance Engineer']);

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail) return;
    inviteUser(inviteName, inviteEmail, inviteRoles);
    setIsInviteOpen(false);
    // Reset
    setInviteName('');
    setInviteEmail('');
    setInviteRoles(['Maintenance Engineer']);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = selectedRoleFilter ? u.roles.includes(selectedRoleFilter) : true;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, selectedRoleFilter]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Plant User Directory</h2>
          <p className="text-xs text-text-secondary mt-0.5">Invite, provision credentials, and toggle status for terminal operation staff.</p>
        </div>
        <button
          onClick={() => setIsInviteOpen(true)}
          className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-md transition-all cursor-pointer min-h-[44px]"
        >
          <Icons.UserPlus className="w-4 h-4" />
          <span>Invite Plant Operator</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div className="relative">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name or corporate email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background-custom border border-border-custom rounded-lg pl-9 pr-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 min-h-[44px]"
          />
        </div>
        <div>
          <Select
            value={selectedRoleFilter}
            onValueChange={(v) => setSelectedRoleFilter(v)}
            className="w-full px-3 py-2.5 text-xs min-h-[44px]"
            options={[
              { value: '', label: 'All Plant Roles' },
              { value: 'Admin', label: 'Admin' },
              { value: 'Plant Manager', label: 'Plant Manager' },
              { value: 'Maintenance Engineer', label: 'Maintenance Engineer' },
              { value: 'Compliance Officer', label: 'Compliance Officer' },
            ]}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-border-custom rounded-xl overflow-hidden bg-background-custom">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-surface-muted text-text-muted font-mono uppercase tracking-wider text-[10px] border-b border-border-custom">
                <th className="p-4 font-semibold">User Details</th>
                <th className="p-4 font-semibold">Authorized Roles</th>
                <th className="p-4 font-semibold">Console Node Status</th>
                <th className="p-4 font-semibold">Last Active Connection</th>
                <th className="p-4 font-semibold text-right">Operational Switch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/50">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-text-muted">
                    No terminal operators matching filters found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-muted/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs uppercase font-mono">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <span className="block font-semibold text-text-primary">{user.name}</span>
                          <span className="block text-[11px] text-text-muted">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((r) => (
                          <span key={r} className="font-mono text-[9px] font-medium px-2 py-0.5 rounded bg-surface border border-border-custom text-text-secondary">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium font-mono border ${
                        user.status === 'active' 
                          ? 'bg-status-ok/10 text-status-ok border-status-ok/25'
                          : 'bg-status-critical/10 text-status-critical border-status-critical/25'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${user.status === 'active' ? 'bg-status-ok animate-pulse' : 'bg-status-critical'}`} />
                        {user.status === 'active' ? 'AUTHORIZATION ACTIVE' : 'SUSPENDED/REVOKED'}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-[11px] text-text-muted">
                      {user.lastActive}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => toggleUserStatus(user.id)}
                        className={`font-mono text-[10px] font-bold px-3 py-1.5 rounded-md border cursor-pointer min-h-[32px] transition-all ${
                          user.status === 'active'
                            ? 'bg-status-critical/10 text-status-critical border-status-critical/30 hover:bg-status-critical hover:text-white'
                            : 'bg-status-ok/10 text-status-ok border-status-ok/30 hover:bg-status-ok hover:text-white'
                        }`}
                      >
                        {user.status === 'active' ? 'Deactivate Operator' : 'Activate Operator'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-surface border border-border-custom w-full max-w-md rounded-xl p-6 shadow-2xl relative space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-3">
              <div className="flex items-center space-x-2.5">
                <Icons.UserPlus className="w-5 h-5 text-primary" />
                <span className="font-display font-bold text-sm text-text-primary">Invite Plant Staff</span>
              </div>
              <button 
                onClick={() => setIsInviteOpen(false)} 
                className="text-text-muted hover:text-text-primary p-1 rounded transition-colors bg-transparent border-0 cursor-pointer min-h-[44px]"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-bold uppercase text-text-muted">Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Kumar"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[10px] font-bold uppercase text-text-muted">Corporate Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rkumar@indusmind.io"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[10px] font-bold uppercase text-text-muted">Authorize Access Level</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {['Admin', 'Plant Manager', 'Maintenance Engineer', 'Compliance Officer'].map((role) => {
                    const isSelected = inviteRoles.includes(role);
                    return (
                      <button
                        type="button"
                        key={role}
                        onClick={() => {
                          if (isSelected) {
                            if (inviteRoles.length > 1) {
                              setInviteRoles(inviteRoles.filter(r => r !== role));
                            }
                          } else {
                            setInviteRoles([...inviteRoles, role]);
                          }
                        }}
                        className={`p-2.5 rounded-lg border font-mono text-[10px] text-center transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-primary/10 text-primary border-primary/50 font-bold' 
                            : 'bg-background-custom border-border-custom text-text-muted'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-border-custom flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-border-custom hover:bg-surface-muted text-text-secondary cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold flex items-center space-x-2 cursor-pointer min-h-[44px]"
                >
                  <Icons.UserPlus className="w-4 h-4" />
                  <span>Send Authorization Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. ACCESS PERMISSION MATRIX MODULE
// ============================================================================
function RolesPermissionsModule() {
  const { roles, permissions, rolePermissions, updateRolePermissions, saveRolePermissionsMatrix } = useAdminStore();
  const [dirty, setDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Backend-driven role columns in LIVE; fall back to the canonical set only if
  // roles haven't loaded (e.g. MOCK bootstrap or a permission-scoped fetch).
  const rolesList = roles.length ? roles : ['Admin', 'Plant Manager', 'Maintenance Engineer', 'Compliance Officer'];

  const groupedPermissions = useMemo(() => {
    const groups: { [resource: string]: Permission[] } = {};
    permissions.forEach((p) => {
      if (!groups[p.resource]) groups[p.resource] = [];
      groups[p.resource].push(p);
    });
    return groups;
  }, [permissions]);

  const handleCellToggle = (role: string, permissionCode: string, checked: boolean) => {
    updateRolePermissions(role, permissionCode, checked);
    setDirty(true);
  };

  const handleSaveMatrix = () => {
    saveRolePermissionsMatrix();
    setDirty(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleResetMatrix = () => {
    // Simply reset state dirty flag - actual store can re-pull or reload from local storage
    setDirty(false);
  };

  return (
    <div className="space-y-5 animate-fade-in relative pb-16">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Plant Permissions Matrix</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Explicitly map OISD operations, document control stages, and administrative rights to plant personnel tiers.
        </p>
      </div>

      <div className="border border-border-custom rounded-xl overflow-hidden bg-background-custom">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs min-w-[640px]">
            <thead>
              <tr className="bg-surface-muted border-b border-border-custom">
                <th className="p-4 font-mono uppercase tracking-wider text-[10px] font-semibold sticky left-0 bg-surface border-r border-border-custom z-10 w-64">
                  OPERATIONAL PRIVILEGES
                </th>
                {rolesList.map((role) => (
                  <th key={role} className="p-4 font-mono uppercase tracking-wider text-[10px] font-bold text-center">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedPermissions).map(([resource, perms]) => (
                <optgroup key={resource} label={resource} className="contents">
                  <tr className="bg-surface-muted/30 border-y border-border-custom/40">
                    <td colSpan={5} className="px-4 py-2 font-mono text-[9px] font-bold text-primary tracking-widest uppercase sticky left-0 bg-background-custom/90 backdrop-blur border-r border-border-custom/40">
                      ■ {resource} OPERATIONS
                    </td>
                  </tr>
                  {perms.map((p) => (
                    <tr key={p.code} className="hover:bg-surface-muted/20 border-b border-border-custom/30 transition-colors">
                      <td className="p-3 font-medium sticky left-0 bg-background-custom border-r border-border-custom/40 z-10">
                        <span className="block text-text-primary text-xs">{p.label}</span>
                        <span className="block font-mono text-[9px] text-text-muted">{p.code}</span>
                      </td>
                      {rolesList.map((role) => {
                        const hasPermission = rolePermissions[role]?.includes(p.code) || false;
                        return (
                          <td key={role} className="p-3 text-center align-middle">
                            <label className="inline-flex items-center justify-center p-2 rounded cursor-pointer hover:bg-surface-muted transition-colors min-w-[44px] min-h-[44px]">
                              <input
                                type="checkbox"
                                checked={hasPermission}
                                onChange={(e) => handleCellToggle(role, p.code, e.target.checked)}
                                className="w-4.5 h-4.5 rounded bg-background-custom border-border-custom text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </optgroup>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Persistent / Floating Change Save Bar */}
      {dirty && (
        <div className="fixed bottom-6 left-6 md:left-72 right-6 bg-surface border border-primary/40 p-4 rounded-xl shadow-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 z-40 animate-bounce">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center justify-center">
              <Icons.SlidersHorizontal className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="block text-xs font-bold text-text-primary">Unsaved modifications to Access Control Matrix!</span>
              <span className="block text-[10px] text-text-muted">Uncommitted changes will reset on session reload or node reconnect.</span>
            </div>
          </div>
          <div className="flex space-x-3 w-full sm:w-auto">
            <button
              onClick={handleResetMatrix}
              className="flex-1 sm:flex-none px-4 py-2 border border-border-custom text-text-secondary rounded-lg hover:bg-surface-muted text-xs cursor-pointer min-h-[44px]"
            >
              Reset Matrix
            </button>
            <button
              onClick={handleSaveMatrix}
              className="flex-1 sm:flex-none px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-2 shadow-lg cursor-pointer min-h-[44px]"
            >
              <Icons.Check className="w-4 h-4" />
              <span>Apply Changes Safely</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Save Toast feedback */}
      {saveSuccess && (
        <div className="fixed bottom-24 right-6 bg-status-ok/15 text-status-ok border border-status-ok/30 p-3.5 rounded-xl flex items-center space-x-3 z-40 animate-fade-in">
          <Icons.ShieldCheck className="w-5 h-5 text-status-ok" />
          <span className="text-xs font-semibold">Access Matrix persisted safely in Ledger Node. Audit log written.</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. AI CAPABILITY MODULE
// ============================================================================
function AiConfigModule() {
  const { aiCapabilities, fallbackModel, updateAiCapability, setFallbackModel } = useAdminStore();
  const [editingCap, setEditingCap] = useState<AiCapability | null>(null);

  // Edit Drawer Form State
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0);
  const [threshold, setThreshold] = useState(0);

  const handleEditClick = (cap: AiCapability) => {
    setEditingCap(cap);
    setProvider(cap.provider);
    setModel(cap.model);
    setTemperature(cap.temperature);
    setThreshold(cap.confidenceThreshold);
  };

  const handleDrawerSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCap) return;
    updateAiCapability(editingCap.key, {
      provider,
      model,
      temperature,
      confidenceThreshold: threshold
    });
    setEditingCap(null);
  };

  return (
    <div className="space-y-5 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">AI Engine Capability Configurations</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Configure default large language models, generation temperature settings, and semantic confidence matching thresholds.
          </p>
        </div>
        
        {/* Fallback Model Option */}
        <div className="flex items-center space-x-2 bg-background-custom border border-border-custom px-3 py-1.5 rounded-lg">
          <span className="font-mono text-[9px] text-text-muted uppercase font-bold">Fallback Model:</span>
          <Select
            value={fallbackModel}
            onValueChange={(v) => setFallbackModel(v)}
            className="text-xs font-mono font-bold min-h-[32px]"
            options={[
              { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Precision)' },
              { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Speed)' },
              { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Legacy)' },
            ]}
          />
        </div>
      </div>

      {/* Capabilities Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {aiCapabilities.map((cap) => (
          <div key={cap.key} className="bg-background-custom border border-border-custom rounded-xl p-4 flex flex-col justify-between hover:border-primary/35 transition-all">
            <div className="space-y-2.5">
              <div className="flex justify-between items-start">
                <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/15 uppercase">
                  {cap.key}
                </span>
                <Icons.Sliders className="w-4 h-4 text-text-muted" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-primary text-xs">{cap.title}</h3>
                <span className="text-[11px] font-mono text-text-muted block mt-0.5">{cap.provider} &bull; {cap.model}</span>
              </div>

              {/* Status / Confidence bar */}
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[10px] font-mono text-text-secondary">
                  <span>Temperature (Variance)</span>
                  <span className="font-bold">{cap.temperature.toFixed(2)}</span>
                </div>
                <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-status-warn" 
                    style={{ width: `${cap.temperature * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-text-secondary">
                  <span>Confidence Threshold</span>
                  <span className="font-bold text-status-ok">{cap.confidenceThreshold}%</span>
                </div>
                <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-status-ok" 
                    style={{ width: `${cap.confidenceThreshold}%` }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => handleEditClick(cap)}
              className="mt-4 w-full bg-surface border border-border-custom hover:border-primary/40 text-text-secondary hover:text-text-primary text-xs font-semibold py-2 rounded-lg transition-colors cursor-pointer min-h-[44px]"
            >
              Tune Hyperparameters
            </button>
          </div>
        ))}
      </div>

      {/* Edit Drawer Modal */}
      {editingCap && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-end z-50 animate-fade-in">
          {/* Overlay click to close */}
          <div className="absolute inset-0" onClick={() => setEditingCap(null)} />
          
          <div className="bg-surface border-l border-border-custom w-full max-w-md h-full relative z-10 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
            <div className="space-y-5 text-xs">
              <div className="flex justify-between items-center border-b border-border-custom pb-3">
                <div>
                  <h3 className="font-display font-bold text-sm text-text-primary">Tuning Panel: {editingCap.title}</h3>
                  <span className="text-[10px] text-text-muted font-mono">Tuning Module ID: {editingCap.key.toUpperCase()}</span>
                </div>
                <button 
                  onClick={() => setEditingCap(null)} 
                  className="text-text-muted hover:text-text-primary p-1 rounded cursor-pointer min-h-[44px]"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleDrawerSave} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-mono text-[10px] font-bold uppercase text-text-muted">Cloud Provider</label>
                  <input
                    type="text"
                    required
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[10px] font-bold uppercase text-text-muted">Inference Model</label>
                  <input
                    type="text"
                    required
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="font-bold uppercase text-text-muted">LLM Temperature</span>
                    <span className="font-bold text-primary text-xs">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-primary bg-surface-muted h-1 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-text-muted leading-tight">
                    Lower settings (e.g. 0.05) force extremely deterministic text. Higher values (0.7+) allow creative brainstorming.
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="font-bold uppercase text-text-muted">Acceptance Confidence Threshold</span>
                    <span className="font-bold text-status-ok text-xs">{threshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="100"
                    step="1"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full accent-status-ok bg-surface-muted h-1 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-text-muted leading-tight">
                    Minimum certainty required before the AI commits extracted metadata as regulatory fact without manual engineering verification.
                  </p>
                </div>

                <div className="pt-4 border-t border-border-custom flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditingCap(null)}
                    className="px-4 py-2 border border-border-custom text-text-secondary rounded-lg hover:bg-surface-muted cursor-pointer min-h-[44px]"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold cursor-pointer min-h-[44px]"
                  >
                    Commit Hyperparameters
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. PROMPT TEMPLATE EDITOR MODULE
// ============================================================================
function PromptsModule() {
  const { prompts, savePrompt } = useAdminStore();
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);

  // Editor states
  const [templateText, setTemplateText] = useState('');
  const [testVariables, setTestVariables] = useState<{ [key: string]: string }>({});
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState('');

  const handleEditClick = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setTemplateText(prompt.template);
    // Auto populate test variables
    const vars: { [key: string]: string } = {};
    prompt.variables.forEach((v) => {
      vars[v] = '';
    });
    setTestVariables(vars);
    setTestOutput('');
  };

  const detectedVariables = useMemo(() => {
    const matches = templateText.match(/\{([a-zA-Z0-9_]+)\}/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map(m => m.replace(/[\{\}]/g, ''))));
  }, [templateText]);

  const handleVariableInputChange = (variable: string, val: string) => {
    setTestVariables({
      ...testVariables,
      [variable]: val
    });
  };

  const handleTestRun = () => {
    setIsTestRunning(true);
    setTestOutput('');
    setTimeout(() => {
      setIsTestRunning(false);
      // Simulate compiling template
      let compiled = templateText;
      detectedVariables.forEach((v) => {
        const val = testVariables[v] || `[MISSING: ${v}]`;
        compiled = compiled.replace(new RegExp(`\\{${v}\\}`, 'g'), val);
      });

      setTestOutput(
        `[INFERENCE NODE COMPILING PROMPT SUCCESS]\n\n` +
        `>>> EXECUTED INPUT PROMPT:\n"${compiled}"\n\n` +
        `>>> MOCK AI INFRASTRUCTURE RESPONSE (Confidence: 94.2%):\n` +
        `"Based on standard regulatory guidelines, the system confirms tag validation and isolates safety criteria matching your plant constraints. No critical compliance violations found for safety clauses in reference. Verified with 3 historic plant records."`
      );
    }, 1200);
  };

  // Highlights brackets in templates
  const renderTemplateHighlight = () => {
    if (!templateText) return null;
    const parts = templateText.split(/(\{.*?\})/g);
    return (
      <div className="p-3 bg-background-custom border border-border-custom rounded-lg font-mono text-xs text-text-primary whitespace-pre-wrap leading-relaxed min-h-[100px] overflow-y-auto">
        {parts.map((p, i) => {
          if (p.startsWith('{') && p.endsWith('}')) {
            return <span key={i} className="text-amber bg-amber/10 border border-amber/15 px-1 py-0.2 rounded font-bold">{p}</span>;
          }
          return <span key={i}>{p}</span>;
        })}
      </div>
    );
  };

  const handlePromptSave = (activate: boolean) => {
    if (!editingPrompt) return;
    savePrompt(editingPrompt.key, templateText, activate);
    setEditingPrompt(null);
  };

  return (
    <div className="space-y-5 animate-fade-in relative">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">AI Prompt Template Engine</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Write, version, and test core system prompts. Dynamic curly brace variables are highlighted automatically.
        </p>
      </div>

      <div className="border border-border-custom rounded-xl overflow-hidden bg-background-custom">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-surface-muted text-text-muted font-mono uppercase tracking-wider text-[10px] border-b border-border-custom">
                <th className="p-4 font-semibold">Prompt ID Key</th>
                <th className="p-4 font-semibold">Associated Capability</th>
                <th className="p-4 font-semibold">Active Version</th>
                <th className="p-4 font-semibold">Required Variables</th>
                <th className="p-4 font-semibold">In Use</th>
                <th className="p-4 font-semibold text-right">Prompt Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/50">
              {prompts.map((p) => (
                <tr key={p.key} className="hover:bg-surface-muted/20 transition-colors">
                  <td className="p-4 font-mono font-bold text-primary">{p.key}</td>
                  <td className="p-4 font-semibold text-text-primary">{p.capability}</td>
                  <td className="p-4">
                    <span className="font-mono text-xs bg-surface-muted border border-border-custom px-1.5 py-0.5 rounded text-text-secondary font-bold">
                      {p.version}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {p.variables.map((v) => (
                        <span key={v} className="font-mono text-[9px] bg-background-custom text-text-muted px-1.5 py-0.5 rounded border border-border-custom/50">
                          {v}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-status-ok/10 text-status-ok border border-status-ok/20">
                      LIVE IN PRODUCTION
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleEditClick(p)}
                      className="inline-flex items-center space-x-1.5 bg-surface border border-border-custom hover:border-primary/45 text-text-secondary hover:text-text-primary text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer min-h-[32px]"
                    >
                      <Icons.Terminal className="w-3.5 h-3.5 text-primary" />
                      <span>Edit & Test Run</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Prompts Edit Drawer */}
      {editingPrompt && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-end z-50 animate-fade-in">
          <div className="absolute inset-0" onClick={() => setEditingPrompt(null)} />
          
          <div className="bg-surface border-l border-border-custom w-full max-w-4xl h-full relative z-10 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
            <div className="space-y-5 text-xs flex-1">
              
              <div className="flex justify-between items-center border-b border-border-custom pb-3">
                <div>
                  <h3 className="font-display font-bold text-sm text-text-primary">System Prompt Architect: {editingPrompt.key}</h3>
                  <span className="text-[10px] text-text-muted font-mono">{editingPrompt.capability}</span>
                </div>
                <button 
                  onClick={() => setEditingPrompt(null)} 
                  className="text-text-muted hover:text-text-primary p-1 rounded cursor-pointer min-h-[44px]"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
                
                {/* Left Side: Prompt Editor */}
                <div className="space-y-4 flex flex-col">
                  <div className="space-y-1.5">
                    <label className="font-mono text-[10px] font-bold uppercase text-text-muted flex justify-between">
                      <span>Source System Template Text</span>
                      <span className="text-primary">{detectedVariables.length} Dynamic Variables Detected</span>
                    </label>
                    <textarea
                      rows={8}
                      value={templateText}
                      onChange={(e) => setTemplateText(e.target.value)}
                      placeholder="Enter system instruction prompt... use {variable_name} syntax."
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 font-mono text-xs text-text-primary focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[10px] font-bold uppercase text-text-muted">Template Live Parser Highlight Preview</label>
                    {renderTemplateHighlight()}
                  </div>

                  {/* Version History List */}
                  <div className="space-y-2 border border-border-custom rounded-lg p-3 bg-background-custom flex-1 overflow-y-auto max-h-[220px]">
                    <span className="font-mono text-[9px] font-bold text-text-muted uppercase block">Revision Ledger History</span>
                    <div className="space-y-1.5">
                      {editingPrompt.history.map((h, i) => (
                        <div key={i} className="flex justify-between items-center bg-surface p-2 rounded border border-border-custom/40">
                          <div>
                            <span className="font-mono font-bold text-text-primary">{h.version}</span>
                            <span className="text-[10px] text-text-muted block mt-0.5 font-mono">By {h.author} &bull; {h.date}</span>
                          </div>
                          {i === 0 && (
                            <span className="font-mono text-[8px] bg-status-ok/10 text-status-ok border border-status-ok/25 px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                              ACTIVE NOW
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Variables + Test Run */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-3 bg-surface-muted border border-border-custom rounded-xl p-4 flex-1">
                    <div className="flex items-center space-x-2 text-primary font-mono text-[10px] font-bold uppercase tracking-wider border-b border-border-custom/50 pb-2">
                      <Icons.Play className="w-3.5 h-3.5 text-primary" />
                      <span>Live Prompt Compilation Sandbox</span>
                    </div>

                    <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                      {detectedVariables.length === 0 ? (
                        <div className="text-center text-text-muted text-xs p-3">
                          No {`{variable}`} inputs found. Add some in the editor to compile sample runs.
                        </div>
                      ) : (
                        detectedVariables.map((v) => (
                          <div key={v} className="space-y-1">
                            <label className="font-mono text-[9px] font-semibold text-text-secondary">Input Key: {v}</label>
                            <input
                              type="text"
                              value={testVariables[v] || ''}
                              onChange={(e) => handleVariableInputChange(v, e.target.value)}
                              placeholder={`Sample value for ${v}...`}
                              className="w-full bg-background-custom border border-border-custom rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary/50"
                            />
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={detectedVariables.length === 0 || isTestRunning}
                      onClick={handleTestRun}
                      className="w-full bg-primary hover:bg-primary-hover disabled:bg-surface-muted disabled:border-border-custom disabled:text-text-muted border-0 text-white font-bold text-xs py-2 rounded-lg cursor-pointer flex items-center justify-center space-x-2 shadow min-h-[44px]"
                    >
                      {isTestRunning ? (
                        <>
                          <Icons.Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Processing Sandbox Run...</span>
                        </>
                      ) : (
                        <>
                          <Icons.Play className="w-4 h-4" />
                          <span>Run Inference Sandbox Test</span>
                        </>
                      )}
                    </button>

                    {/* Test output console */}
                    {testOutput && (
                      <div className="pt-2">
                        <div className="bg-background-custom border border-border-custom rounded-lg p-3 font-mono text-[10px] text-text-primary leading-relaxed h-[180px] overflow-y-auto whitespace-pre-wrap select-text">
                          {testOutput}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-border-custom flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => handlePromptSave(false)}
                      className="px-4 py-2 border border-border-custom text-text-secondary rounded-lg hover:bg-surface-muted cursor-pointer min-h-[44px]"
                    >
                      Save Draft Template
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptSave(true)}
                      className="px-5 py-2 bg-status-ok hover:bg-status-ok/90 text-white rounded-lg font-semibold flex items-center space-x-2 cursor-pointer shadow min-h-[44px]"
                    >
                      <Icons.Check className="w-4 h-4" />
                      <span>Deploy as New Active Version</span>
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. FEATURE FLAGS MODULE
// ============================================================================
function FeatureFlagsModule() {
  const { featureFlags, toggleFlag, roles } = useAdminStore();

  // Tenant gates are a MOCK-only concept (the backend flag model is flat +
  // per-tenant scoped to the current tenant). In LIVE we only render role gates.
  const mockTenants = USE_MOCK
    ? [
        'Reliance Jamnagar Refinery - Sector A',
        'Reliance Jamnagar Refinery - Sector B',
        'Hazira Petrochemicals Complex - Unit 4'
      ]
    : [];

  const mockRoles = roles.length
    ? roles
    : ['Admin', 'Plant Manager', 'Maintenance Engineer', 'Compliance Officer'];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Enterprise Feature Toggles & Guards</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Enable or restrict modular IndusMind components on a per-tenant (refinery branch) or per-role access level basis.
        </p>
      </div>

      <div className="space-y-4">
        {featureFlags.map((flag) => (
          <div key={flag.key} className="bg-background-custom border border-border-custom rounded-xl p-5 hover:border-primary/20 transition-all">
            <div className="flex justify-between items-start border-b border-border-custom/50 pb-3 mb-4">
              <div>
                <h3 className="font-display font-bold text-sm text-text-primary flex items-center space-x-2">
                  <span>{flag.title}</span>
                  <span className="font-mono text-[9px] text-text-muted uppercase">[{flag.key}]</span>
                </h3>
                <p className="text-xs text-text-muted mt-1 font-sans">{flag.description}</p>
              </div>
              <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-status-ok/10 text-status-ok border border-status-ok/20 font-bold uppercase">
                STABLE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              
              {/* Tenant Gates */}
              <div className="space-y-3 bg-surface p-3.5 rounded-lg border border-border-custom/40">
                <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block border-b border-border-custom/30 pb-1.5">
                  Tenant Gate Controls
                </span>
                <div className="space-y-2">
                  {mockTenants.map((t) => {
                    const isEnabled = flag.tenants[t] || false;
                    return (
                      <div key={t} className="flex justify-between items-center">
                        <span className="text-text-secondary text-[11px] font-sans pr-4 truncate" title={t}>
                          {t.split(' - ')[0]}
                        </span>
                        <button
                          onClick={() => toggleFlag(flag.key, 'tenant', t)}
                          className={`flex items-center space-x-1.5 font-mono text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer min-h-[32px] ${
                            isEnabled 
                              ? 'bg-status-ok/10 text-status-ok border-status-ok/25' 
                              : 'bg-status-critical/10 text-status-critical border-status-critical/25'
                          }`}
                        >
                          {isEnabled ? <Icons.Check className="w-3.5 h-3.5 text-status-ok" /> : <Icons.X className="w-3.5 h-3.5 text-status-critical" />}
                          <span>{isEnabled ? 'ENABLED' : 'RESTRICTED'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Role Gates */}
              <div className="space-y-3 bg-surface p-3.5 rounded-lg border border-border-custom/40">
                <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block border-b border-border-custom/30 pb-1.5">
                  Authorized Role Filters
                </span>
                <div className="space-y-2">
                  {mockRoles.map((r) => {
                    const isEnabled = flag.roles[r] || false;
                    return (
                      <div key={r} className="flex justify-between items-center">
                        <span className="text-text-secondary text-[11px] font-sans font-medium">{r}</span>
                        <button
                          onClick={() => toggleFlag(flag.key, 'role', r)}
                          className={`flex items-center space-x-1.5 font-mono text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer min-h-[32px] ${
                            isEnabled 
                              ? 'bg-status-ok/10 text-status-ok border-status-ok/25' 
                              : 'bg-status-critical/10 text-status-critical border-status-critical/25'
                          }`}
                        >
                          {isEnabled ? <Icons.Check className="w-3.5 h-3.5 text-status-ok" /> : <Icons.X className="w-3.5 h-3.5 text-status-critical" />}
                          <span>{isEnabled ? 'GRANTED' : 'BLOCKED'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 6. CRYPTOGRAPHIC AUDIT LOGS MODULE
// ============================================================================
function AuditLogModule() {
  const { auditLogs } = useAdminStore();
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [operatorFilter, setOperatorFilter] = useState('');
  const [actionSearch, setActionSearch] = useState('');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchesOperator = operatorFilter ? log.actor.includes(operatorFilter) : true;
      const matchesAction = actionSearch ? (log.action || '').toLowerCase().includes(actionSearch.toLowerCase()) || (log.entity || '').toLowerCase().includes(actionSearch.toLowerCase()) : true;
      return matchesOperator && matchesAction;
    });
  }, [auditLogs, operatorFilter, actionSearch]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Cryptographic Security Audit Ledger</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Read-only, append-only operational chain recording precise user logins, policy modifications, and AI prompt adjustments.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by Action or Target Entity (e.g. ROLE_MATRIX)..."
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
            className="w-full bg-background-custom border border-border-custom rounded-lg pl-9 pr-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 min-h-[44px]"
          />
        </div>
        <div>
          <Select
            value={operatorFilter}
            onValueChange={(v) => setOperatorFilter(v)}
            className="w-full px-3 py-2.5 text-xs min-h-[44px]"
            options={[
              { value: '', label: 'All Actors/Operators' },
              { value: 'Aditya Vardhan', label: 'Aditya Vardhan (Admin)' },
              { value: 'Rajesh Nair', label: 'Rajesh Nair (Manager)' },
              { value: 'Priya Sharma', label: 'Priya Sharma (Engineer)' },
              { value: 'Arun Kumar', label: 'Arun Kumar (Tech)' },
            ]}
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="border border-border-custom rounded-xl overflow-hidden bg-background-custom">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-surface-muted text-text-muted font-mono uppercase tracking-wider text-[10px] border-b border-border-custom">
                <th className="p-4 font-semibold">TIMESTAMP (UTC+5.5)</th>
                <th className="p-4 font-semibold">SECURITY OPERATOR</th>
                <th className="p-4 font-semibold">ACTION COMPLETED</th>
                <th className="p-4 font-semibold">TARGET ENTITY</th>
                <th className="p-4 font-semibold">IP ADDRESS</th>
                <th className="p-4 font-semibold text-right">STATE DIFF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/50 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted font-sans">
                    No secure audit entries matches filters found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-muted/20 transition-colors">
                    <td className="p-4 text-text-muted">{log.time}</td>
                    <td className="p-4 font-sans font-semibold text-text-primary">{log.actor}</td>
                    <td className="p-4">
                      <span className="font-bold text-primary">{log.action}</span>
                    </td>
                    <td className="p-4 text-text-secondary">{log.entity}</td>
                    <td className="p-4 text-text-muted">{log.ip}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedRecord(log)}
                        className="inline-flex items-center space-x-1 hover:text-primary transition-colors cursor-pointer min-h-[32px] px-2 py-1 rounded hover:bg-surface-muted border border-transparent hover:border-border-custom"
                      >
                        <Icons.SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                        <span>View JSON Diff</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side JSON Diff Drawer */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-end z-50 animate-fade-in">
          <div className="absolute inset-0" onClick={() => setSelectedRecord(null)} />
          
          <div className="bg-surface border-l border-border-custom w-full max-w-2xl h-full relative z-10 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
            <div className="space-y-5 text-xs flex-1">
              <div className="flex justify-between items-center border-b border-border-custom pb-3">
                <div>
                  <h3 className="font-display font-bold text-sm text-text-primary">Cryptographic Node State Delta Viewer</h3>
                  <span className="text-[10px] text-text-muted font-mono">Record Verification Signature: secure-hash-{selectedRecord.id}</span>
                </div>
                <button 
                  onClick={() => setSelectedRecord(null)} 
                  className="text-text-muted hover:text-text-primary p-1 rounded cursor-pointer min-h-[44px]"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 bg-background-custom p-3.5 rounded-xl border border-border-custom font-mono text-[10px] text-text-secondary">
                  <div>
                    <span className="text-text-muted uppercase">OPERATOR:</span>
                    <p className="font-sans font-bold text-text-primary mt-0.5">{selectedRecord.actor}</p>
                  </div>
                  <div>
                    <span className="text-text-muted uppercase">ACTION:</span>
                    <p className="font-bold text-primary mt-0.5">{selectedRecord.action}</p>
                  </div>
                  <div>
                    <span className="text-text-muted uppercase">TIMESTAMP:</span>
                    <p className="mt-0.5">{selectedRecord.time}</p>
                  </div>
                  <div>
                    <span className="text-text-muted uppercase">IP PROTOCOL:</span>
                    <p className="mt-0.5">{selectedRecord.ip}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Before State */}
                  <div className="space-y-1.5">
                    <span className="font-mono text-[9px] font-bold text-status-critical uppercase block tracking-wider">
                      ◀ PRE-COMMIT STATE
                    </span>
                    <pre className="p-3.5 rounded-lg border border-status-critical/15 bg-[#1C0F10] text-[10px] text-red-300 font-mono overflow-auto max-h-[350px] leading-relaxed whitespace-pre-wrap select-text">
                      {selectedRecord.beforeJson}
                    </pre>
                  </div>

                  {/* After State */}
                  <div className="space-y-1.5">
                    <span className="font-mono text-[9px] font-bold text-status-ok uppercase block tracking-wider">
                      ▶ COMMIT TRANSACTION COMPLETED
                    </span>
                    <pre className="p-3.5 rounded-lg border border-status-ok/15 bg-[#0E1E12] text-[10px] text-green-300 font-mono overflow-auto max-h-[350px] leading-relaxed whitespace-pre-wrap select-text">
                      {selectedRecord.afterJson}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border-custom flex justify-end">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-5 py-2.5 bg-surface-muted border border-border-custom rounded-lg hover:bg-surface text-text-secondary cursor-pointer font-semibold min-h-[44px]"
              >
                Close Delta Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. INGESTION PIPELINE MONITOR MODULE
// ============================================================================
function IngestionModule() {
  const { ingestionJobs, retryIngestionJob, retryAllIngestionJobs } = useAdminStore();

  const mockPipelineStages = [
    { name: 'OCR Raw Engine', rate: 45, status: 'Active' },
    { name: 'XML/SOP Parser', rate: 38, status: 'Active' },
    { name: 'Chunk Divider', rate: 84, status: 'Active' },
    { name: 'Vector Embedder', rate: 92, status: 'Active' },
    { name: 'Graph Synthesizer', rate: 12, status: 'Active' },
    { name: 'Vector Indexer', rate: 99, status: 'Active' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Structured Document Ingestion Pipeline</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Real-time status of OISD ingestion threads, vector embedding indexing queues, and failed parsing jobs.
        </p>
      </div>

      {/* Queue Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'OCR Process Queue', count: '14 Files', trend: 'STABLE LOAD', status: 'ok' },
          { label: 'Chunk Dividers', count: '3 Files', trend: 'DECREASING', status: 'ok' },
          { label: 'Graph Relationships', count: '18 Nodes', trend: 'HIGH TRAFFIC', status: 'warn' },
          { label: 'Vector Index Queue', count: '0 Pending', trend: 'COMPLETED', status: 'ok' },
        ].map((card, i) => (
          <div key={i} className="bg-background-custom border border-border-custom rounded-xl p-4 flex flex-col justify-between">
            <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider">{card.label}</span>
            <div className="mt-1.5 flex justify-between items-baseline">
              <span className="font-display text-lg font-bold text-text-primary">{card.count}</span>
              <span className={`font-mono text-[8px] font-bold px-1.5 rounded uppercase ${
                card.status === 'ok' ? 'bg-status-ok/10 text-status-ok' : 'bg-status-warn/10 text-status-warn'
              }`}>
                {card.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stage throughput list */}
        <div className="bg-background-custom border border-border-custom rounded-xl p-4 space-y-4 lg:col-span-1">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block border-b border-border-custom pb-2">
            Pipeline Stage Performance
          </span>
          <div className="space-y-3.5">
            {mockPipelineStages.map((stage, i) => (
              <div key={i} className="space-y-1.5 text-xs">
                <div className="flex justify-between text-[11px] font-mono text-text-secondary">
                  <span className="font-medium text-text-primary">{stage.name}</span>
                  <span className="font-bold text-primary">{stage.rate} files/min</span>
                </div>
                <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary" 
                    style={{ width: `${(stage.rate / 100) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Failed jobs table */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex justify-between items-center bg-background-custom border border-border-custom/50 rounded-xl p-3">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-status-critical animate-ping" />
              <span className="font-mono text-[10px] font-bold text-text-muted uppercase">PARSING EXCEPTION LOGS (FAILED JOBS)</span>
            </div>
            {ingestionJobs.length > 0 && (
              <button
                onClick={retryAllIngestionJobs}
                className="font-mono text-[9px] font-bold text-primary hover:underline uppercase bg-transparent border-0 cursor-pointer min-h-[32px]"
              >
                Retry All Failed Jobs
              </button>
            )}
          </div>

          <div className="border border-border-custom rounded-xl overflow-hidden bg-background-custom text-xs">
            {ingestionJobs.length === 0 ? (
              <div className="p-8 text-center text-text-muted font-sans">
                ✓ Perfect pipeline health. Zero extraction errors registered.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-surface-muted text-text-muted font-mono uppercase tracking-wider text-[9px] border-b border-border-custom">
                      <th className="p-3 font-semibold">Corrupt File Name</th>
                      <th className="p-3 font-semibold">Crashed Stage</th>
                      <th className="p-3 font-semibold">Detailed Failure Reason</th>
                      <th className="p-3 font-semibold">Crash Time</th>
                      <th className="p-3 font-semibold text-right">Retry Command</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-custom/50 font-sans text-xs">
                    {ingestionJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-surface-muted/20 transition-colors">
                        <td className="p-3 font-medium text-text-primary break-all">{job.filename}</td>
                        <td className="p-3 font-mono text-[10px] text-status-critical font-bold">{job.stage}</td>
                        <td className="p-3 text-text-muted text-[11px] max-w-[180px] truncate" title={job.reason}>{job.reason}</td>
                        <td className="p-3 font-mono text-[10px] text-text-muted whitespace-nowrap">{job.time}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => retryIngestionJob(job.id)}
                            className="bg-primary/10 hover:bg-primary hover:text-white border border-primary/20 hover:border-transparent text-primary font-mono text-[10px] font-bold px-2 py-1.5 rounded transition-all cursor-pointer min-h-[32px]"
                          >
                            RETRY INGEST
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 8. GLOBAL LOOKUP TABLES MODULE
// ============================================================================
function LookupsModule() {
  const { lookups, addLookupOption, updateLookupOption, deleteLookupOption } = useAdminStore();
  
  const categories = [
    { key: 'doc_types', label: 'Document Formats' },
    { key: 'plants', label: 'Authorized Refinery Nodes' },
    { key: 'areas', label: 'Plant Area Sectors' }
  ];

  const [activeCategory, setActiveCategory] = useState('doc_types');
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newSort, setNewSort] = useState(10);

  const activeOptions = useMemo(() => {
    return lookups[activeCategory] || [];
  }, [lookups, activeCategory]);

  const handleAddOption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newLabel) return;
    addLookupOption(activeCategory, {
      code: newCode,
      label: newLabel,
      sort: Number(newSort),
      active: true
    });
    // Reset inputs
    setNewCode('');
    setNewLabel('');
    setNewSort(prev => prev + 10);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="border-b border-border-custom pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Global Schema Dictionary Tables (Lookups)</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Configure dropdown options, plant names, and compliance area selections mapped into general dropdown elements.
          </p>
        </div>
        <div className="bg-amber/10 border border-amber/35 px-3 py-2 rounded-lg max-w-sm">
          <span className="block font-mono text-[9px] text-amber font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Icons.AlertTriangle className="w-3.5 h-3.5 text-amber" />
            System Architect Announcement
          </span>
          <p className="text-[10px] text-text-muted leading-tight mt-0.5">
            All dropdown selections, search filters, and tags across this HMI cockpit are dynamically fed from this lookups table.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        {/* Left Side: Category selector list */}
        <div className="bg-background-custom border border-border-custom rounded-xl p-3 space-y-2">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block border-b border-border-custom pb-2 px-1">
            Lookup Category Modules
          </span>
          <div className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-colors cursor-pointer ${
                  activeCategory === cat.key
                    ? 'bg-primary/10 border border-primary/30 text-primary font-bold'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary border border-transparent'
                }`}
              >
                <span>{cat.label}</span>
                <span className="font-mono text-[9px] text-text-muted bg-surface-muted px-1.5 py-0.2 rounded border border-border-custom">
                  {lookups[cat.key]?.length || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: Options Editor Table */}
        <div className="md:col-span-2 space-y-4">
          <div className="border border-border-custom rounded-xl overflow-hidden bg-background-custom">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-surface-muted text-text-muted font-mono uppercase tracking-wider text-[9px] border-b border-border-custom">
                  <th className="p-3 font-semibold">Schema Unique Code</th>
                  <th className="p-3 font-semibold">Human Friendly Label</th>
                  <th className="p-3 font-semibold">Sequence Sort</th>
                  <th className="p-3 font-semibold">Module Active</th>
                  <th className="p-3 font-semibold text-right">Lookup Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/50">
                {activeOptions.map((opt) => (
                  <tr key={opt.code} className="hover:bg-surface-muted/20 transition-colors">
                    <td className="p-3 font-mono font-bold text-primary">{opt.code}</td>
                    <td className="p-3 font-semibold text-text-primary">
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => updateLookupOption(activeCategory, opt.code, { label: e.target.value })}
                        className="bg-transparent border-b border-transparent hover:border-border-custom focus:border-primary/50 text-xs px-1 py-0.5 focus:outline-none w-full"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={opt.sort}
                        onChange={(e) => updateLookupOption(activeCategory, opt.code, { sort: Number(e.target.value) })}
                        className="bg-transparent border-b border-transparent hover:border-border-custom focus:border-primary/50 text-xs font-mono px-1 py-0.5 focus:outline-none w-16"
                      />
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => updateLookupOption(activeCategory, opt.code, { active: !opt.active })}
                        className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer min-h-[32px] ${
                          opt.active 
                            ? 'bg-status-ok/10 text-status-ok border-status-ok/20' 
                            : 'bg-status-critical/10 text-status-critical border-status-critical/20'
                        }`}
                      >
                        {opt.active ? 'ACTIVE' : 'DEACTIVATED'}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => deleteLookupOption(activeCategory, opt.code)}
                        className="p-1.5 text-text-muted hover:text-status-critical rounded hover:bg-status-critical/10 border border-transparent hover:border-status-critical/20 cursor-pointer min-h-[32px]"
                        title="Delete lookup option"
                      >
                        <Icons.Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Option Form */}
          <form onSubmit={handleAddOption} className="bg-surface-muted border border-border-custom rounded-xl p-4 space-y-3">
            <span className="font-mono text-[10px] font-bold text-text-primary uppercase tracking-wider block">
              ✚ Add New Option Category Option
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-mono text-[9px] font-semibold text-text-muted">Unique Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. refineries-d"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full bg-background-custom border border-border-custom rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 min-h-[36px]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[9px] font-semibold text-text-muted">Descriptive Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sector D LPG Terminal"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full bg-background-custom border border-border-custom rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 min-h-[36px]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[9px] font-semibold text-text-muted">Sort Sequence Order</label>
                <input
                  type="number"
                  required
                  value={newSort}
                  onChange={(e) => setNewSort(Number(e.target.value))}
                  className="w-full bg-background-custom border border-border-custom rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 min-h-[36px]"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5 cursor-pointer shadow min-h-[44px]"
              >
                <Icons.Plus className="w-4 h-4" />
                <span>Inject Schema Option</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 9. SYSTEM HEALTH MONITORING MODULE
// ============================================================================
function SystemHealthModule() {
  // No backend telemetry/health endpoint is exposed under the API surface
  // (only server-root /healthz + /readyz probes). In LIVE, render an
  // "unavailable" state instead of the mock charts/dependency fixtures.
  if (!USE_MOCK) {
    return (
      <div className="space-y-5 animate-fade-in text-xs">
        <div className="border-b border-border-custom pb-4">
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">System Node Telemetry & Diagnostic Health</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time performance measurements of API server request latency, error distribution curves, and database node status.
          </p>
        </div>
        <div className="border border-border-custom rounded-xl bg-background-custom p-10 flex flex-col items-center justify-center text-center space-y-3">
          <Icons.Activity className="w-8 h-8 text-text-muted" />
          <span className="font-display font-semibold text-sm text-text-primary">Telemetry Unavailable</span>
          <p className="text-[11px] text-text-muted max-w-md">
            No system-health telemetry endpoint is exposed on this backend. Node diagnostics will appear here once a metrics service is connected.
          </p>
        </div>
      </div>
    );
  }

  // Mock Latency Data over past 12 hours
  const mockHealthData = [
    { hour: '00:00', latency: 42, errors: 0, cpu: 12 },
    { hour: '02:00', latency: 48, errors: 1, cpu: 15 },
    { hour: '04:00', latency: 51, errors: 0, cpu: 18 },
    { hour: '06:00', latency: 39, errors: 0, cpu: 14 },
    { hour: '08:00', latency: 110, errors: 3, cpu: 44 },
    { hour: '10:00', latency: 124, errors: 4, cpu: 56 },
    { hour: '12:00', latency: 98, errors: 1, cpu: 38 },
  ];

  const dependencies = [
    { name: 'Primary SQLite DB Ledger', type: 'Database (Persistence)', status: 'Online', latency: '4ms', uptime: '99.99%', load: 'low' },
    { name: 'Neo4j Compliance Knowledge Graph', type: 'Graph Database (Semantic)', status: 'Online', latency: '22ms', uptime: '99.92%', load: 'low' },
    { name: 'Redis Job Broker Queue', type: 'Message Broker', status: 'Online', latency: '1ms', uptime: '100%', load: 'medium' },
    { name: 'GCP Cloud Blob Storage', type: 'Static File Repository', status: 'Online', latency: '45ms', uptime: '99.99%', load: 'low' },
    { name: 'Gemini LLM API Gateway', type: 'AI Cloud Core Engine', status: 'Online', latency: '412ms', uptime: '99.95%', load: 'high' }
  ];

  return (
    <div className="space-y-5 animate-fade-in text-xs">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">System Node Telemetry & Diagnostic Health</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Real-time performance measurements of API server request latency, error distribution curves, and database node status.
        </p>
      </div>

      {/* Latency Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Latency Recharts Area Chart */}
        <div className="bg-background-custom border border-border-custom rounded-xl p-4 space-y-3 h-[280px] flex flex-col">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">
            API Endpoints Service Latency Profile (Past 12 Hours)
          </span>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHealthData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0E7C86" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0E7C86" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C262C" />
                <XAxis dataKey="hour" stroke="#4C6575" fontSize={9} />
                <YAxis stroke="#4C6575" fontSize={9} label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1519', border: '1px solid #1C262C', fontSize: 10 }} />
                <Area type="monotone" dataKey="latency" name="Latency (ms)" stroke="#0E7C86" fillOpacity={1} fill="url(#latencyGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Errors & Resource Load Bar Chart */}
        <div className="bg-background-custom border border-border-custom rounded-xl p-4 space-y-3 h-[280px] flex flex-col">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">
            HTTP Error Distribution & Load Peaks (Index Units)
          </span>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockHealthData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C262C" />
                <XAxis dataKey="hour" stroke="#4C6575" fontSize={9} />
                <YAxis stroke="#4C6575" fontSize={9} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1519', border: '1px solid #1C262C', fontSize: 10 }} />
                <Bar dataKey="errors" name="Exception Blocks (Count)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cpu" name="CPU/Core Load (%)" fill="#F5A524" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Dependency statuses */}
      <div className="space-y-3">
        <span className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider block">
          Enterprise Integration Dependency Health
        </span>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dependencies.map((dep, i) => (
            <div key={i} className="bg-background-custom border border-border-custom rounded-xl p-4 space-y-3 hover:border-primary/20 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-display font-semibold text-text-primary text-xs">{dep.name}</h4>
                  <span className="font-mono text-[9px] text-text-muted uppercase mt-0.5 block">{dep.type}</span>
                </div>
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-status-ok/10 text-status-ok border border-status-ok/20">
                  <span className="w-1.5 h-1.5 rounded-full mr-1 bg-status-ok animate-pulse" />
                  ONLINE
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-border-custom/40 pt-2.5 text-[10px] font-mono">
                <div>
                  <span className="text-text-muted text-[8px] uppercase">Ping Rate</span>
                  <p className="font-bold text-text-primary mt-0.5">{dep.latency}</p>
                </div>
                <div>
                  <span className="text-text-muted text-[8px] uppercase">Uptime Avg</span>
                  <p className="font-bold text-text-primary mt-0.5">{dep.uptime}</p>
                </div>
                <div>
                  <span className="text-text-muted text-[8px] uppercase">Load State</span>
                  <p className={`font-bold mt-0.5 uppercase ${dep.load === 'high' ? 'text-status-warn' : 'text-primary'}`}>{dep.load}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Notification Template Editor Module
// ============================================================================
import { EVENT_VARIABLES_LEGEND } from '../../../lib/api/client';

function NotificationTemplatesModule() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);

  // Editor drawer fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [version, setVersion] = useState('1.0.0');
  const [locale, setLocale] = useState('en-IN');
  const [channel, setChannel] = useState('email');

  // Preview state
  const [previewData, setPreviewData] = useState<{ renderedSubject: string; renderedBody: string; samplePayload: any } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchTemplates = async () => {
    try {
      const res = await api.get<any[]>('/admin/notification-templates');
      setTemplates(res || []);
    } catch (e) {
      console.error('Failed to load templates:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleEditClick = (tpl: any) => {
    setEditingTemplate(tpl);
    setSubject(tpl.subject);
    setBody(tpl.body);
    setIsActive(tpl.active);
    setVersion(tpl.version);
    setLocale(tpl.locale);
    setChannel(tpl.channel);
    setPreviewData(null);
  };

  useEffect(() => {
    if (!editingTemplate) return;

    const controller = new AbortController();
    const delayDebounce = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const preview = await api.post<any>('/admin/notification-templates/preview', {
          event: editingTemplate.event,
          subject,
          body
        });
        setPreviewData(preview);
      } catch (err) {
        console.error('Failed to generate template preview:', err);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(delayDebounce);
      controller.abort();
    };
  }, [subject, body, editingTemplate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    try {
      await api.put(`/admin/notification-templates/${editingTemplate.id}`, {
        subject,
        body,
        active: isActive,
        version,
        locale,
        channel
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      fetchTemplates();
      setEditingTemplate(null);
    } catch (err) {
      console.error('Failed to save template changes:', err);
    }
  };

  const variablesLegend = editingTemplate ? (EVENT_VARIABLES_LEGEND[editingTemplate.event] || []) : [];

  if (isLoading) {
    return (
      <div className="p-8 text-center space-y-3">
        <Icons.RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
        <p className="text-text-secondary font-mono text-xs text-center">RETRIEVING TEMPLATE DIRECTORIES...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border-custom pb-4 flex justify-between items-center">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Notification Template Manager</h2>
          <p className="text-xs text-text-muted mt-0.5">Edit alert headers and operational templates with dynamic syntax tokens.</p>
        </div>
      </div>

      <div className="bg-surface border border-border-custom rounded-xl overflow-hidden shadow">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-background-custom/60 border-b border-border-custom font-mono text-[10px] text-text-muted uppercase">
              <th className="p-3">Event Key Trigger</th>
              <th className="p-3">Target Channel</th>
              <th className="p-3">Locale</th>
              <th className="p-3">Version</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom/40">
            {templates.map(tpl => (
              <tr key={tpl.id} className="hover:bg-background-custom/30 transition-colors">
                <td className="p-3 font-mono text-text-primary font-semibold select-all">
                  {tpl.event}
                </td>
                <td className="p-3 font-mono">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    tpl.channel === 'email' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-[#0E7C86]/10 text-[#0E7C86] border border-[#0E7C86]/20'
                  }`}>
                    {tpl.channel.toUpperCase()}
                  </span>
                </td>
                <td className="p-3 font-mono text-text-secondary">
                  {tpl.locale}
                </td>
                <td className="p-3 font-mono text-text-muted">
                  v{tpl.version}
                </td>
                <td className="p-3">
                  {tpl.active ? (
                    <span className="inline-flex items-center space-x-1 text-status-ok font-mono text-[9px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-ok" />
                      <span>ACTIVE</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 text-text-muted font-mono text-[9px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
                      <span>INACTIVE</span>
                    </span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleEditClick(tpl)}
                    className="px-2.5 py-1 rounded bg-[#0E7C86]/10 hover:bg-[#0E7C86]/20 text-[#0E7C86] font-mono text-[10px] font-bold tracking-wide transition-all border border-[#0E7C86]/20 cursor-pointer"
                  >
                    EDIT TEMPLATE
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingTemplate && (
        <div className="fixed inset-0 bg-black/85 flex justify-end z-50 p-0 font-sans backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-surface border-l border-border-custom h-full flex flex-col p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200">

            <div className="flex justify-between items-start border-b border-border-custom pb-4">
              <div>
                <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block">
                  TEMPLATE COMPILER PANEL
                </span>
                <h3 className="font-display font-bold text-text-primary text-base mt-1 select-all">
                  {editingTemplate.event}
                </h3>
              </div>
              <button
                onClick={() => setEditingTemplate(null)}
                className="p-1 rounded hover:bg-surface-muted text-text-secondary hover:text-white transition-colors cursor-pointer"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
              <div className="space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] font-bold text-text-muted uppercase">Target Delivery Channel</label>
                      <Select
                        value={channel}
                        onValueChange={(v) => setChannel(v)}
                        className="w-full px-3 py-2 text-xs"
                        options={[
                          { value: 'email', label: 'EMAIL RELAY' },
                          { value: 'inApp', label: 'IN-APP HUD ALERTS' },
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] font-bold text-text-muted uppercase">Version Identifier</label>
                      <input
                        type="text"
                        required
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        className="w-full bg-background-custom border border-border-custom rounded px-3 py-2 text-text-primary text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold text-text-muted uppercase">Localization Locale</label>
                    <input
                      type="text"
                      required
                      value={locale}
                      onChange={(e) => setLocale(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded px-3 py-2 text-text-primary text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold text-text-muted uppercase">Notification Alert Subject</label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter subject header template..."
                      className="w-full bg-background-custom border border-border-custom rounded px-3 py-2 text-text-primary text-xs font-semibold focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold text-text-muted uppercase">Dynamic Body Template Content</label>
                    <textarea
                      required
                      rows={8}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write message template payload using standard tokens..."
                      className="w-full bg-background-custom border border-border-custom rounded p-3 text-text-primary text-xs font-sans leading-relaxed focus:outline-none focus:border-primary resize-none"
                    />
                  </div>

                  <div className="flex items-center space-x-2 py-1">
                    <input
                      type="checkbox"
                      id="tpl-active-checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#0E7C86] rounded"
                    />
                    <label htmlFor="tpl-active-checkbox" className="font-sans text-xs text-text-secondary select-none">
                      Active and deployment ready (broadcast in routing tables)
                    </label>
                  </div>
                </div>

                <div className="bg-background-custom border border-border-custom rounded-lg p-3 space-y-2">
                  <span className="font-mono text-[9px] font-bold text-primary uppercase block">Available Event Context Variables</span>
                  {variablesLegend.length === 0 ? (
                    <span className="text-[10px] text-text-muted font-mono block">No dynamic tokens registered for this event.</span>
                  ) : (
                    <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto text-[10px]">
                      {variablesLegend.map(v => (
                        <div key={v.varName} className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-1 border-b border-border-custom/20">
                          <code className="text-primary font-bold font-mono">{"{{"}{v.varName}{"}}"}</code>
                          <span className="text-text-muted text-[9px]">{v.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col space-y-3 bg-background-custom border border-border-custom rounded-xl p-4 min-h-[350px]">
                <div className="flex justify-between items-center border-b border-border-custom pb-2">
                  <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center space-x-1.5">
                    <Icons.Play className="w-3 h-3 text-primary" />
                    <span>Real-time Ingress Render Preview</span>
                  </span>
                  {isPreviewLoading ? (
                    <span className="text-[9px] font-mono text-primary animate-pulse flex items-center gap-1">
                      <Icons.Loader className="w-2.5 h-2.5 animate-spin" /> Rendering...
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-status-ok flex items-center gap-1">
                      <Icons.Eye className="w-3 h-3" /> Live Synced
                    </span>
                  )}
                </div>

                {previewData ? (
                  <div className="flex-1 flex flex-col space-y-4">
                    <div className="space-y-1.5 border-b border-border-custom/40 pb-3 text-xs">
                      <div className="flex justify-between">
                        <span className="font-mono text-[9px] text-text-muted uppercase">Render Type:</span>
                        <span className="font-mono text-[10px] font-bold text-text-primary uppercase">{channel === 'email' ? 'CORPORATE EMAIL RELAY' : 'OPERATOR HUD ALERTS'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-mono text-[9px] text-text-muted uppercase">Subject line:</span>
                        <span className="text-text-primary font-semibold truncate max-w-xs">{previewData.renderedSubject || '(Draft Subject Empty)'}</span>
                      </div>
                    </div>

                    <div className="flex-1 bg-surface border border-border-custom rounded-lg p-4 font-sans text-xs flex flex-col text-text-primary shadow-inner overflow-y-auto">
                      {channel === 'email' ? (
                        <div className="space-y-4">
                          <div className="bg-surface-muted/50 p-2.5 border-b border-border-custom/40 font-mono text-[10px] text-text-muted">
                            <p>To: operator@indusmind.io</p>
                            <p>From: alert-dispatcher@indusmind-node.net</p>
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed select-text font-sans text-xs p-1 text-text-secondary">
                            {previewData.renderedBody || 'Write alert body syntax to view generated render.'}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 max-w-sm mx-auto">
                          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5 relative overflow-hidden">
                            <div className="absolute right-0 top-0 opacity-10">
                              <Icons.BellRing className="w-16 h-16 text-primary" />
                            </div>
                            <span className="font-mono text-[9px] font-bold text-primary block tracking-wider uppercase">INGRESS HUD NOTIFICATION</span>
                            <h4 className="text-text-primary font-bold text-xs mt-1.5">{previewData.renderedSubject || 'HUD Header'}</h4>
                            <p className="text-[11px] text-text-secondary leading-relaxed mt-1 whitespace-pre-wrap select-all">
                              {previewData.renderedBody || 'Active prompt body...'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-surface border border-border-custom/60 rounded-lg p-2.5 font-mono text-[9px] text-text-secondary">
                      <span className="text-primary font-bold block mb-1">MOCK VARIABLE SCOPE:</span>
                      <pre className="overflow-x-auto text-[8px] leading-tight text-text-secondary max-h-32">
                        {JSON.stringify(previewData.samplePayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center text-center space-y-2">
                    <Icons.Cpu className="w-7 h-7 text-text-muted" />
                    <p className="text-[11px] font-mono text-text-muted">Awaiting dynamic parser render compiler feedback...</p>
                  </div>
                )}
              </div>
            </form>

            <div className="border-t border-border-custom pt-4 flex justify-end space-x-3 font-mono font-bold">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 bg-transparent hover:bg-surface-muted text-text-secondary hover:text-white rounded border border-border-custom transition-all cursor-pointer text-xs"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#0E7C86] hover:bg-[#119CA8] text-white rounded shadow-lg transition-all cursor-pointer text-xs"
              >
                COMPILE & RE-DEPLOY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AI Observability & Quality Dashboard Module
// ============================================================================
function AiObservabilityModule() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unwrap = (r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r);
    Promise.all([
      api.get<any>('/admin/ai-usage/summary?group_by=day').then(unwrap).catch(() => ({})),
      api.get<any>('/admin/ai-usage/summary?group_by=model').then(unwrap).catch(() => ({})),
      api.get<any>('/admin/ai-feedback?rating=down').then(unwrap).catch(() => []),
    ])
      .then(([dayRes, modelRes, fbRes]) => {
        if (!active) return;
        const totals = dayRes?.totals ?? {};
        const daySeries: any[] = Array.isArray(dayRes?.series) ? dayRes.series : [];
        const modelSeries: any[] = Array.isArray(modelRes?.series) ? modelRes.series : [];
        const feedback: any[] = Array.isArray(fbRes) ? fbRes : (Array.isArray(fbRes?.items) ? fbRes.items : []);
        const totalCalls = Number(totals.calls ?? 0);
        const latSum = daySeries.reduce((s, r) => s + Number(r.avg_latency_ms ?? 0) * Number(r.calls ?? 0), 0);
        const cacheHits = daySeries.reduce((s, r) => s + Number(r.cache_hits ?? 0), 0);
        setData({
          summary: {
            totalRequests: totalCalls,
            totalCost: Number(totals.cost_usd ?? 0),
            avgLatency: totalCalls ? Math.round(latSum / totalCalls) : 0,
            avgCacheHit: totalCalls ? Math.round((cacheHits / totalCalls) * 100) : 0,
          },
          daily: daySeries.map((r) => ({
            date: r.bucket ?? '',
            requests: Number(r.calls ?? 0),
            latency: Number(r.avg_latency_ms ?? 0),
            tokensIn: Number(r.prompt_tokens ?? 0),
            tokensOut: Number(r.completion_tokens ?? 0),
          })),
          models: modelSeries.map((r) => ({
            name: r.bucket ?? 'unknown',
            requests: Number(r.calls ?? 0),
            percentage: totalCalls ? Math.round((Number(r.calls ?? 0) / totalCalls) * 100) : 0,
            latency: Number(r.avg_latency_ms ?? 0),
            cost: Number(r.cost_usd ?? 0),
          })),
          flaggedFeedback: feedback.map((f) => ({
            id: f.id,
            timestamp: f.created_at ?? f.timestamp ?? null,
            messageText: f.answer ?? f.question ?? '',
            reason: f.reason_code ?? f.reason ?? 'unspecified',
            comment: f.comment ?? '',
          })),
        });
      })
      .catch(e => console.error('Failed to fetch observability summary:', e))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (isLoading) {
    return (
      <div className="p-8 text-center space-y-3">
        <Icons.RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
        <p className="text-text-secondary font-mono text-xs text-center">COLLECTING MODEL TELEMETRY LOGS...</p>
      </div>
    );
  }

  const { summary, daily, models, flaggedFeedback } = data || {
    summary: { totalRequests: 0, totalCost: 0, avgLatency: 0, avgCacheHit: 0 },
    daily: [],
    models: [],
    flaggedFeedback: []
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs font-sans">
      <div className="border-b border-border-custom pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Icons.Eye className="w-5 h-5 text-primary" />
            <span>AI LLM Observability & Quality Ledger</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">Audit cognitive requests, latency, cost parameters, and reinforcement alignment (RLHF) indicators.</p>
        </div>
        <div className="px-2.5 py-1 rounded bg-[#0E7C86]/10 border border-[#0E7C86]/25 text-[#0E7C86] font-mono text-[9px] font-bold uppercase tracking-wider">
          PRIVILEGED SCHEME: ai.observability.view ACCESS GRANTED
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-muted/30 border border-border-custom rounded-xl p-4 space-y-1.5 hover:border-primary/20 transition-all shadow-sm">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase block">Cumulative API Calls</span>
          <div className="flex justify-between items-baseline">
            <span className="font-display font-bold text-lg text-text-primary">{summary.totalRequests.toLocaleString()}</span>
            <span className="font-mono text-[9px] font-bold text-status-ok flex items-center space-x-0.5">
              <span>▲ 14.2%</span>
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-0.5">Live counts across 14 periods.</p>
        </div>

        <div className="bg-surface-muted/30 border border-border-custom rounded-xl p-4 space-y-1.5 hover:border-primary/20 transition-all shadow-sm">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase block">Mean Network Latency</span>
          <div className="flex justify-between items-baseline">
            <span className="font-display font-bold text-lg text-text-primary">{summary.avgLatency} ms</span>
            <span className="font-mono text-[9px] font-bold text-status-ok">▼ 45ms optimizer</span>
          </div>
          <p className="text-[10px] text-text-muted mt-0.5">Average parsing latency threshold.</p>
        </div>

        <div className="bg-surface-muted/30 border border-border-custom rounded-xl p-4 space-y-1.5 hover:border-primary/20 transition-all shadow-sm">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase block">Calculated API Expense</span>
          <div className="flex justify-between items-baseline">
            <span className="font-display font-bold text-lg text-text-primary">${summary.totalCost.toFixed(2)}</span>
            <span className="font-mono text-[9px] font-bold text-primary">Est. token weights</span>
          </div>
          <p className="text-[10px] text-text-muted mt-0.5">Based on context input/output rates.</p>
        </div>

        <div className="bg-surface-muted/30 border border-border-custom rounded-xl p-4 space-y-1.5 hover:border-primary/20 transition-all shadow-sm">
          <span className="font-mono text-[9px] font-bold text-text-muted uppercase block">Semantic Cache Hits</span>
          <div className="flex justify-between items-baseline">
            <span className="font-display font-bold text-lg text-text-primary">{summary.avgCacheHit}%</span>
            <span className="font-mono text-[9px] font-bold text-status-ok">▲ 3.4% hitrate</span>
          </div>
          <div className="w-full bg-[#0E1316] h-1.5 rounded-full overflow-hidden mt-1.5 border border-border-custom/40">
            <div className="bg-[#0E7C86] h-full rounded-full" style={{ width: `${summary.avgCacheHit}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border-custom rounded-xl p-4 space-y-3 shadow-sm">
          <div className="border-b border-border-custom/50 pb-2 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">Cognitive Traffic & Latency Over Time</span>
            <div className="flex items-center space-x-3 text-[9px] font-mono">
              <span className="flex items-center gap-1 text-primary"><span className="w-2 h-2 rounded-full bg-[#0E7C86]" /> Requests</span>
              <span className="flex items-center gap-1 text-amber-500"><span className="w-2 h-2 rounded-full bg-amber-500" /> Latency (ms)</span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0E7C86" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0E7C86" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#232D35" vertical={false} />
                <XAxis dataKey="date" stroke="#607482" fontSize={8} tickLine={false} />
                <YAxis stroke="#607482" fontSize={8} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0E1316', borderColor: '#232D35', borderRadius: '8px' }}
                  labelStyle={{ color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}
                  itemStyle={{ fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#0E7C86" strokeWidth={2} fillOpacity={1} fill="url(#colorRequests)" name="Requests" />
                <Area type="monotone" dataKey="latency" stroke="#D97706" strokeWidth={1.5} fillOpacity={0} name="Avg Latency (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface border border-border-custom rounded-xl p-4 space-y-3 shadow-sm">
          <div className="border-b border-border-custom/50 pb-2 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">Context Tokens Distribution</span>
            <div className="flex items-center space-x-3 text-[9px] font-mono">
              <span className="flex items-center gap-1 text-emerald-500"><span className="w-2 h-2 rounded-full bg-[#10B981]" /> Prompt Tokens</span>
              <span className="flex items-center gap-1 text-sky-500"><span className="w-2 h-2 rounded-full bg-[#0EA5E9]" /> Completion Tokens</span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232D35" vertical={false} />
                <XAxis dataKey="date" stroke="#607482" fontSize={8} tickLine={false} />
                <YAxis stroke="#607482" fontSize={8} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0E1316', borderColor: '#232D35', borderRadius: '8px' }}
                  labelStyle={{ color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}
                  itemStyle={{ fontSize: '10px' }}
                />
                <Bar dataKey="tokensIn" stackId="tokens" fill="#10B981" name="Prompt (In)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="tokensOut" stackId="tokens" fill="#0EA5E9" name="Completion (Out)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border-custom rounded-xl p-4 space-y-3 shadow-sm">
        <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block border-b border-border-custom/40 pb-2">Active LLM Routing Nodes Analysis</span>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-background-custom/40 border-b border-border-custom font-mono text-[9px] text-text-muted uppercase">
                <th className="p-2.5">Model Node Descriptor</th>
                <th className="p-2.5 text-right">Calls Assigned</th>
                <th className="p-2.5 text-right">Traffic Share</th>
                <th className="p-2.5 text-right">Median Latency</th>
                <th className="p-2.5 text-right">Simulated Weight Expense</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/30 font-mono text-[11px]">
              {models.map((model: any) => (
                <tr key={model.name} className="hover:bg-background-custom/20 transition-colors">
                  <td className="p-2.5 text-text-primary font-semibold">{model.name}</td>
                  <td className="p-2.5 text-right text-text-secondary">{model.requests.toLocaleString()}</td>
                  <td className="p-2.5 text-right text-text-secondary">{model.percentage}%</td>
                  <td className="p-2.5 text-right text-text-secondary">{model.latency} ms</td>
                  <td className="p-2.5 text-right text-primary font-bold">${model.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface border border-border-custom rounded-xl p-4 space-y-3 shadow-sm">
        <span className="font-mono text-[9px] font-bold text-status-critical uppercase tracking-wider block border-b border-border-custom/40 pb-2">RLHF Registry: User-Flagged Deficiencies</span>
        
        {flaggedFeedback.length === 0 ? (
          <div className="text-center py-6 font-mono text-text-muted">
            <Icons.CheckCircle className="w-6 h-6 text-status-ok mx-auto mb-2 opacity-60" />
            <span>Zero alignment overrides active. Model compliance 100%.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-background-custom/40 border-b border-border-custom font-mono text-[9px] text-text-muted uppercase">
                  <th className="p-2.5">Timestamp</th>
                  <th className="p-2.5">Flagged Generation Snippet</th>
                  <th className="p-2.5">Declared Fault Category</th>
                  <th className="p-2.5">Operator Feedback Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/30 text-xs">
                {flaggedFeedback.map((fb: any) => (
                  <tr key={fb.id} className="hover:bg-background-custom/20 transition-colors text-[11px] font-sans">
                    <td className="p-2.5 font-mono text-text-muted text-[10px] whitespace-nowrap">
                      {new Date(fb.timestamp).toLocaleString()}
                    </td>
                    <td className="p-2.5 text-text-secondary font-mono max-w-xs truncate" title={fb.messageText}>
                      {fb.messageText}
                    </td>
                    <td className="p-2.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[9px] font-bold bg-status-critical/10 text-status-critical border border-status-critical/20 uppercase">
                        {fb.reason.split('_').join(' ')}
                      </span>
                    </td>
                    <td className="p-2.5 text-text-primary italic">
                      "{fb.comment || '(No written commentary provided)'}"
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Scheduled Reports & Generation Engine Module
// ============================================================================
interface ReportTemplate {
  id: string;
  name: string;
  schedule: string;
  recipients: string[];
  lastRun: string;
}

interface ReportRun {
  id: string;
  templateName: string;
  timestamp: string;
  status: 'done' | 'queued' | 'failed';
  downloadUrl: string;
}

function ReportsModule() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  
  // Edit Dialog State
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [editSchedule, setEditSchedule] = useState('');
  const [editRecipients, setEditRecipients] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  
  // Toast/Notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const unwrapList = (r: any): any[] =>
    Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : (Array.isArray(r?.items) ? r.items : []));

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      // Backend templates (code/name/…) and schedules (cron/recipients/last_run) are
      // separate resources; merge a template with its schedule so the card renders.
      const [tplRes, schRes] = await Promise.all([
        api.get<any>('/admin/reports'),
        api.get<any>('/report-schedules').catch(() => []),
      ]);
      const rawTemplates = unwrapList(tplRes);
      const schedules = unwrapList(schRes);
      const schedByTemplate: Record<string, any> = {};
      for (const s of schedules) {
        if (s?.template_id != null) schedByTemplate[String(s.template_id)] = s;
      }
      const merged: ReportTemplate[] = rawTemplates.map((t) => {
        const sch = schedByTemplate[String(t.id)] || {};
        return {
          id: String(t.id),
          name: t.name ?? t.code ?? 'Untitled Report',
          schedule: sch.cron_expr ?? '',
          recipients: Array.isArray(sch.recipients) ? sch.recipients : [],
          lastRun: sch.last_run_at ?? '',
        };
      });
      setTemplates(merged);
    } catch (e) {
      console.error(e);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchRuns = async () => {
    // The backend has no persisted "runs" ledger — run-now returns report data
    // inline. Leave the historical-runs list empty (its empty state handles this).
    setRuns([]);
    setLoadingRuns(false);
  };

  useEffect(() => {
    fetchTemplates();
    fetchRuns();
  }, []);

  const handleOpenEdit = (tpl: ReportTemplate) => {
    setEditingTemplate(tpl);
    setEditSchedule(tpl.schedule);
    setEditRecipients(tpl.recipients.join(', '));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setIsSavingTemplate(true);
    try {
      const updatedRecipients = editRecipients
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);

      await api.put(`/admin/reports/${editingTemplate.id}`, {
        schedule: editSchedule,
        recipients: updatedRecipients
      });

      setToastMessage('Report template schedule updated successfully.');
      setTimeout(() => setToastMessage(null), 3000);
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleForceRun = async (template: ReportTemplate) => {
    try {
      setToastMessage(`Ad-hoc generation for ${template.name} queued.`);
      setTimeout(() => setToastMessage(null), 3000);

      // Real run-now endpoint: computes and returns the report data inline.
      await api.post(`/admin/reports/${template.id}/run`, {});

      const { addNotification } = useNotificationStore.getState();
      addNotification({
        title: 'REPORT COMPILED SUCCESSFULLY',
        desc: `The ad-hoc generation run for template "${template.name}" completed. Open Analytics to view the compiled result.`,
        type: 'info',
        category: 'Compliance'
      });

      setToastMessage(`Report "${template.name}" successfully compiled!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error(err);
      setToastMessage(`Failed to run report "${template.name}".`);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Convert standard cron strings to readable text for compliance clarity
  const translateCron = (cron: string) => {
    if (cron === '0 6 * * *') return 'Daily at 06:00 AM (Refinery Shift Change)';
    if (cron === '0 0 * * 1') return 'Weekly on Mondays at 12:00 AM (Audit Period Start)';
    if (cron === '0 0 1 * *') return 'Monthly on 1st at 12:00 AM (Fiscal Closing)';
    return `Custom cron interval: [ ${cron} ]`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-primary border border-primary/35 text-white px-4 py-3 rounded-lg shadow-xl flex items-center space-x-2 z-50 animate-bounce font-sans text-xs">
          <Icons.CheckCircle className="w-4 h-4 text-white bg-white/20 rounded p-0.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Heading Block */}
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">Scheduled Reports & Generation Engine</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Manage regulatory report schedules, dispatch target lists, and review compiled system audit PDF logs.
        </p>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Scheduled templates */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center space-x-1.5 pb-1">
            <Icons.Calendar className="w-4 h-4 text-primary" />
            <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Scheduled Templates</span>
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center p-12 border border-border-custom rounded-lg bg-surface-muted/30">
              <Icons.Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center border border-border-custom rounded-lg bg-surface-muted/30 font-mono text-[11px] text-text-muted uppercase">
              No report templates configured for this node yet
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-background-custom/35 border border-border-custom hover:border-border-custom/80 p-4 rounded-xl flex flex-col justify-between space-y-4 transition-all">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wide">
                        {tpl.name}
                      </span>
                      <span className="font-mono text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded uppercase">
                        {tpl.id}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-[10px] font-mono text-text-muted uppercase block">DISPATCH CRON SCHEDULE:</span>
                        <span className="font-mono text-text-primary text-[11px] font-semibold">{tpl.schedule || '— not scheduled —'}</span>
                        {tpl.schedule && <span className="text-text-muted block text-[10px] italic">{translateCron(tpl.schedule)}</span>}
                      </div>

                      <div className="pt-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase block">RECIPIENTS DISPATCH LIST:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(tpl.recipients || []).length === 0 ? (
                            <span className="font-mono text-[9px] text-text-muted italic">No recipients configured</span>
                          ) : (tpl.recipients || []).map(email => (
                            <span key={email} className="bg-surface border border-border-custom px-2 py-0.5 rounded font-mono text-[9px] text-text-secondary">
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border-custom/50 flex justify-between gap-2">
                    <button
                      onClick={() => handleOpenEdit(tpl)}
                      className="flex-1 py-1.5 bg-surface-muted hover:bg-surface border border-border-custom text-text-primary text-[10px] font-mono font-bold rounded transition-colors cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Icons.Settings className="w-3 h-3 text-text-muted" />
                      <span>EDIT SCHEDULE</span>
                    </button>
                    <button
                      onClick={() => handleForceRun(tpl)}
                      className="flex-1 py-1.5 bg-primary hover:bg-primary/90 text-white text-[10px] font-mono font-bold rounded transition-colors cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Icons.Play className="w-3 h-3" />
                      <span>RUN NOW</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Column: Compliance Guidelines */}
        <div className="space-y-4">
          <div className="flex items-center space-x-1.5 pb-1">
            <Icons.ShieldAlert className="w-4 h-4 text-primary" />
            <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Compliance Context</span>
          </div>

          <div className="bg-background-custom/35 border border-border-custom p-4 rounded-xl space-y-3 text-xs leading-relaxed">
            <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wide">
              Automated Plant Audit Mandate
            </h4>
            <p className="text-text-secondary">
              Under federal asset and environmental safety standards (EPA-Section-112r, OISD-STD-118), refinery operators must sustain an immutable historical audit schedule ledger.
            </p>
            <p className="text-text-secondary">
              Report compiling triggers automated validation runs, matching OEE telemetry alerts, compliance safety indices, and technician work orders against registered nodes.
            </p>
            <div className="p-3 bg-primary/5 border border-primary/20 rounded font-mono text-[10px] text-text-secondary">
              SECURE INTEGRITY SEAL: <span className="text-text-primary font-bold">SHA-256 REGISTERED</span>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Block: Generation Runs List */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between border-b border-border-custom pb-2">
          <div className="flex items-center space-x-1.5">
            <Icons.History className="w-4 h-4 text-primary" />
            <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Historical Runs Ledger</span>
          </div>
          <span className="text-[10px] font-mono text-text-muted uppercase">Showing Latest Generation Instances</span>
        </div>

        {loadingRuns ? (
          <div className="flex items-center justify-center p-12 border border-border-custom rounded-lg bg-surface-muted/30">
            <Icons.Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : runs.length > 0 ? (
          <div className="overflow-x-auto border border-border-custom rounded-lg">
            <table className="w-full border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-surface-muted border-b border-border-custom font-mono text-[10px] text-text-muted uppercase text-left">
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">Report Template Type</th>
                  <th className="px-4 py-3">Compile Timestamp</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/40">
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-surface-muted/30">
                    <td className="px-4 py-3.5 font-mono text-text-primary font-semibold">
                      {run.id}
                    </td>
                    <td className="px-4 py-3.5 text-text-primary font-medium">
                      {run.templateName}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-text-secondary text-[11px]">
                      {run.timestamp}
                    </td>
                    <td className="px-4 py-3.5">
                      {run.status === 'queued' ? (
                        <span className="inline-flex items-center space-x-1 bg-amber/10 border border-amber/25 text-amber text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          <Icons.RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>COMPILING COMPLIANCE DATA</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 bg-status-ok/10 border border-status-ok/25 text-status-ok text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          <Icons.CheckCircle className="w-2.5 h-2.5" />
                          <span>ARCHIVED SECURELY</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {run.status === 'done' ? (
                        <a
                          href={run.downloadUrl}
                          download
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded font-mono text-[9px] font-bold transition-colors cursor-pointer"
                        >
                          <Icons.Download className="w-3 h-3" />
                          <span>DOWNLOAD PDF REPORT</span>
                        </a>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-surface-muted border border-border-custom text-text-muted rounded font-mono text-[9px] font-bold cursor-not-allowed"
                        >
                          <Icons.Download className="w-3 h-3 opacity-50" />
                          <span>PENDING GENERATION</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-border-custom rounded-lg bg-background-custom/10">
            <Icons.Info className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-secondary text-xs">No historical report runs logged inside the current secure node session.</p>
          </div>
        )}
      </div>

      {/* Configure Template Schedule Dialog Drawer */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-sm flex items-center justify-end z-50 p-4 transition-all">
          <div className="fixed inset-0" onClick={() => setEditingTemplate(null)} />
          
          <div className="bg-surface border border-border-custom w-full max-w-md h-full rounded-l-xl shadow-2xl relative z-10 overflow-hidden font-sans flex flex-col justify-between">
            <div>
              <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                <div className="flex items-center space-x-2 text-primary">
                  <Icons.Calendar className="w-4 h-4" />
                  <span className="font-mono font-bold text-xs uppercase text-text-primary">Configure Dispatch Parameters</span>
                </div>
                <button 
                  onClick={() => setEditingTemplate(null)} 
                  className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveTemplate} className="p-5 space-y-4 text-xs">
                <div className="p-3 bg-primary/5 rounded border border-primary/20 font-mono text-[10px] text-text-secondary">
                  TARGET TEMPLATE ID: <strong className="text-text-primary">{editingTemplate.id}</strong>
                  <span className="block mt-1">REPORT NAME: <strong className="text-text-primary uppercase">{editingTemplate.name}</strong></span>
                </div>

                {/* Cron Schedule */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Dispatch Cron Schedule:</label>
                  <input
                    type="text"
                    required
                    value={editSchedule}
                    onChange={(e) => setEditSchedule(e.target.value)}
                    placeholder="e.g. 0 6 * * *"
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-mono text-text-primary focus:outline-none focus:border-primary"
                  />
                  <span className="block text-[9px] text-text-muted font-mono uppercase mt-1">
                    Standard 5-field unix cron interval. Example: '0 6 * * *' generates every shift cycle.
                  </span>
                </div>

                {/* Recipients Emails */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Recipient List (Comma Separated):</label>
                  <textarea
                    required
                    rows={3}
                    value={editRecipients}
                    onChange={(e) => setEditRecipients(e.target.value)}
                    placeholder="engineer@indusmind.io, manager@indusmind.io"
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-mono text-text-primary focus:outline-none focus:border-primary resize-none"
                  />
                  <span className="block text-[9px] text-text-muted font-mono uppercase mt-1">
                    Provide comma delimited email strings. Notifications with PDF logs are compiled and dispatched directly.
                  </span>
                </div>

                {/* Action buttons */}
                <div className="pt-4 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-xs font-bold text-text-secondary cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTemplate}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSavingTemplate ? 'SAVING...' : 'SAVE CONFIGURATION'}
                  </button>
                </div>
              </form>
            </div>

            <div className="p-4 bg-surface-muted/30 border-t border-border-custom/50 text-[10px] text-text-muted font-mono leading-relaxed">
              Updates to cron parameter settings instantly realign background schedules in the daemon runner. Safety overrides validate schedule signatures prior to dispatch execution.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 15. EXTRACTION RULES MODULE (P17)
// ============================================================================
interface ExtractionRule {
  id: string;
  entityType: string;
  method: 'regex' | 'llm';
  pattern: string;
  priority: number;
  confidence: number;
  active: boolean;
  version: string;
  hint?: string;
}

function ExtractionRulesModule() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('extraction.rules.manage');
  
  const [rules, setRules] = useState<ExtractionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Drawer / editor state
  const [editingRule, setEditingRule] = useState<Partial<ExtractionRule> | null>(null);
  const [sampleText, setSampleText] = useState('E.g. CS-4-302B is operating at 120 bar pressure and temperature 85C, conforming to OISD-STD-118 guidelines.');
  const [testMatches, setTestMatches] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await api.get<ExtractionRule[]>('/admin/extraction-rules');
      setRules(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleOpenEdit = (rule: ExtractionRule) => {
    setEditingRule(rule);
    setTestMatches([]);
  };

  const handleOpenCreate = () => {
    setEditingRule({
      entityType: '',
      method: 'regex',
      pattern: '',
      priority: 1,
      confidence: 90,
      active: true,
      version: 'V1.0',
      hint: ''
    });
    setTestMatches([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    try {
      if (editingRule.id) {
        await api.put(`/admin/extraction-rules/${editingRule.id}`, editingRule);
        setToastMessage('Extraction rule updated successfully.');
      } else {
        await api.post('/admin/extraction-rules', editingRule);
        setToastMessage('New extraction rule created successfully.');
      }
      setTimeout(() => setToastMessage(null), 3000);
      setEditingRule(null);
      fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTest = async () => {
    if (!editingRule) return;
    setTesting(true);
    try {
      const res = await api.post<{ matches: any[] }>('/admin/extraction-rules/test', {
        pattern: editingRule.pattern,
        method: editingRule.method,
        entityType: editingRule.entityType || 'Test Entity',
        confidence: editingRule.confidence || 90,
        hint: editingRule.hint,
        sampleText
      });
      setTestMatches(res.matches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTesting(false);
    }
  };

  const getEntityColorClass = (entityType: string) => {
    const type = (entityType || '').toLowerCase();
    if (type.includes('equipment') || type.includes('tag')) {
      return 'bg-primary/20 text-primary border-primary/30';
    }
    if (type.includes('oisd') || type.includes('regulation') || type.includes('reference')) {
      return 'bg-status-warn/25 text-status-warn border-status-warn/35';
    }
    if (type.includes('pressure')) {
      return 'bg-cyan-500/25 text-cyan-400 border-cyan-500/30';
    }
    if (type.includes('temperature')) {
      return 'bg-amber-500/25 text-amber-400 border-amber-500/30';
    }
    return 'bg-purple-500/25 text-purple-400 border-purple-500/30';
  };

  const renderHighlightedText = (text: string, matches: any[]) => {
    if (!matches || matches.length === 0) return <span className="text-text-secondary">{text}</span>;
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    
    sorted.forEach((m, idx) => {
      if (m.start < lastIndex) return;
      if (m.start > lastIndex) {
        result.push(<span key={`text-${lastIndex}`} className="text-text-secondary">{text.substring(lastIndex, m.start)}</span>);
      }
      const colorClass = getEntityColorClass(m.entityType);
      result.push(
        <span 
          key={`match-${m.start}-${idx}`} 
          className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold border ${colorClass}`}
          title={`Entity: ${m.entityType} | Conf: ${m.confidence}%`}
        >
          {text.substring(m.start, m.end)}
        </span>
      );
      lastIndex = m.end;
    });
    if (lastIndex < text.length) {
      result.push(<span key={`text-end`} className="text-text-secondary">{text.substring(lastIndex)}</span>);
    }
    return <div className="whitespace-pre-wrap leading-relaxed">{result}</div>;
  };

  if (!canManage) {
    return (
      <div className="p-8 text-center border border-border-custom rounded-xl bg-background-custom/10">
        <Icons.ShieldAlert className="w-12 h-12 text-status-critical mx-auto mb-4" />
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider font-display">Access Control Restriction</h3>
        <p className="text-text-secondary text-xs mt-1">You do not possess the required permission [<strong>extraction.rules.manage</strong>] to access this node module.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-primary border border-primary/35 text-white px-4 py-3 rounded-lg shadow-xl flex items-center space-x-2 z-50 font-sans text-xs">
          <Icons.CheckCircle className="w-4 h-4 text-white bg-white/20 rounded p-0.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Heading Block */}
      <div className="border-b border-border-custom pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">AI SOP & Metadata Extraction Rules</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Configure regex-based and LLM-assisted structural entity matching rules used in plant compliance ingestion pipelines.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white font-mono text-xs font-bold rounded flex items-center space-x-1 cursor-pointer transition-colors"
        >
          <Icons.Plus className="w-4 h-4" />
          <span>CREATE EXTRACTION RULE</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 border border-border-custom rounded-lg bg-surface-muted/30">
          <Icons.Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-border-custom rounded-lg">
          <table className="w-full border-collapse font-sans text-xs">
            <thead>
              <tr className="bg-surface-muted border-b border-border-custom font-mono text-[10px] text-text-muted uppercase text-left">
                <th className="px-4 py-3">Entity Type</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Pattern / Hint</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/40">
              {rules.map(rule => (
                <tr key={rule.id} className="hover:bg-surface-muted/30">
                  <td className="px-4 py-3.5 font-display text-text-primary font-semibold">
                    <span className={`px-2 py-0.5 rounded font-mono text-[9px] border ${getEntityColorClass(rule.entityType)}`}>
                      {rule.entityType}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center space-x-1 font-mono font-bold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${
                      rule.method === 'regex' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'
                    }`}>
                      {rule.method === 'regex' ? 'REGEX' : 'LLM-COGNITIVE'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-text-secondary text-[11px] max-w-xs truncate">
                    {rule.method === 'regex' ? rule.pattern : rule.hint || 'LLM semantic prompt match'}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-text-primary text-[11px] font-semibold">
                    {rule.priority}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-text-primary text-[11px]">
                    {rule.confidence}%
                  </td>
                  <td className="px-4 py-3.5 font-mono text-text-muted text-[11px]">
                    {rule.version}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center space-x-1 font-mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      rule.active ? 'bg-status-ok/10 text-status-ok border border-status-ok/25' : 'bg-surface-muted text-text-muted border border-border-custom'
                    }`}>
                      {rule.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => handleOpenEdit(rule)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-surface-muted hover:bg-surface text-text-primary border border-border-custom rounded font-mono text-[9px] font-bold transition-colors cursor-pointer"
                    >
                      <Icons.Edit className="w-3 h-3 text-text-muted" />
                      <span>EDIT / TEST RULE</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Configure rule Dialog Drawer */}
      {editingRule && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-sm flex items-center justify-end z-50 p-4 transition-all">
          <div className="fixed inset-0" onClick={() => setEditingRule(null)} />
          
          <div className="bg-surface border border-border-custom w-full max-w-lg h-full rounded-l-xl shadow-2xl relative z-10 overflow-hidden font-sans flex flex-col justify-between text-left">
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                <div className="flex items-center space-x-2 text-primary">
                  <Icons.FileCode className="w-4 h-4" />
                  <span className="font-mono font-bold text-xs uppercase text-text-primary">
                    {editingRule.id ? 'Edit Extraction Rule' : 'Create Extraction Rule'}
                  </span>
                </div>
                <button 
                  onClick={() => setEditingRule(null)} 
                  className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
                {editingRule.id && (
                  <div className="p-3 bg-primary/5 rounded border border-primary/20 font-mono text-[10px] text-text-secondary">
                    RULE TARGET ID: <strong className="text-text-primary">{editingRule.id}</strong>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Entity Type Name:</label>
                    <input
                      type="text"
                      required
                      value={editingRule.entityType || ''}
                      onChange={(e) => setEditingRule({ ...editingRule, entityType: e.target.value })}
                      placeholder="e.g. Pressure Indicator"
                      className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Version Identifier:</label>
                    <input
                      type="text"
                      required
                      value={editingRule.version || ''}
                      onChange={(e) => setEditingRule({ ...editingRule, version: e.target.value })}
                      placeholder="e.g. V1.0"
                      className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Matching Method:</label>
                    <Select
                      value={editingRule.method || 'regex'}
                      onValueChange={(v) => setEditingRule({ ...editingRule, method: v as 'regex' | 'llm' })}
                      className="w-full px-3 py-2 font-sans"
                      options={[
                        { value: 'regex', label: 'Regular Expression Pattern (Speed/Local)' },
                        { value: 'llm', label: 'LLM Cognitive Parsing (Contextual)' },
                      ]}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Active Pipeline State:</label>
                    <div className="flex items-center h-10">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingRule.active || false}
                          onChange={(e) => setEditingRule({ ...editingRule, active: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-background-custom peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:border-border-custom after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        <span className="ml-3 font-mono text-[10px] text-text-secondary uppercase">
                          {editingRule.active ? 'Active (ENABLED)' : 'Inactive (MUTED)'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Execution Priority Order:</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={editingRule.priority || 1}
                      onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Minimum Confidence Match %:</label>
                    <input
                      type="number"
                      required
                      min={50}
                      max={100}
                      value={editingRule.confidence || 90}
                      onChange={(e) => setEditingRule({ ...editingRule, confidence: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {editingRule.method === 'regex' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Regular Expression Pattern:</label>
                    <input
                      type="text"
                      required
                      value={editingRule.pattern || ''}
                      onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                      placeholder="e.g. [A-Z]{2}-\d+"
                      className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-mono text-text-primary focus:outline-none focus:border-primary"
                    />
                    <span className="block text-[9px] text-text-muted font-sans mt-1">
                      Provide a standard javascript regex syntax pattern. Do not include leading/trailing slashes.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">LLM Prompt Cognitive Context Hint:</label>
                    <textarea
                      rows={3}
                      value={editingRule.hint || ''}
                      onChange={(e) => setEditingRule({ ...editingRule, hint: e.target.value })}
                      placeholder="e.g. Match temperature mentions in text, extracting both the numerical value and scale unit."
                      className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                )}

                {/* LIVE RULE TESTER PASS */}
                <div className="border border-border-custom/50 rounded-xl p-4 bg-background-custom/25 space-y-3">
                  <div className="flex items-center justify-between border-b border-border-custom pb-2">
                    <span className="font-mono text-[10px] font-bold text-text-primary uppercase tracking-wider flex items-center space-x-1.5">
                      <Icons.PlayCircle className="w-3.5 h-3.5 text-primary" />
                      <span>Extraction dry-run tester</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={testing || (editingRule.method === 'regex' && !editingRule.pattern)}
                      className="px-2.5 py-1 bg-primary hover:bg-primary/90 text-white font-mono text-[10px] font-bold rounded flex items-center space-x-1 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {testing ? (
                        <>
                          <Icons.Loader2 className="w-3 h-3 animate-spin" />
                          <span>TESTING...</span>
                        </>
                      ) : (
                        <>
                          <Icons.Zap className="w-3 h-3" />
                          <span>DRY RUN TEST</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-mono text-text-muted uppercase block">Sample raw source text:</label>
                    <textarea
                      rows={2}
                      value={sampleText}
                      onChange={(e) => setSampleText(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none text-[11px] resize-none text-left"
                    />
                  </div>

                  {testMatches.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[9px] font-mono text-status-ok uppercase block">Live Extraction Match Highlights:</span>
                      <div className="p-3 bg-surface rounded border border-border-custom min-h-16 text-xs text-text-primary text-left">
                        {renderHighlightedText(sampleText, testMatches)}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-surface/50 rounded border border-dashed border-border-custom text-center text-text-muted text-[11px]">
                      No matched entities registered. Hit "DRY RUN TEST" to verify parser criteria.
                    </div>
                  )}
                </div>

                {/* Form Action Buttons */}
                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingRule(null)}
                    className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-xs font-bold text-text-secondary cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold cursor-pointer transition-colors"
                  >
                    SAVE PIPELINE RULE
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 16. INTEGRATIONS MODULE (P17)
// ============================================================================
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsed: string;
  status: 'active' | 'revoked';
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

interface WebhookDelivery {
  id: string;
  event: string;
  status: 'success' | 'failed';
  attempts: number;
  responseCode: number;
  payload: string;
  timestamp: string;
}

function IntegrationsModule() {
  const [activeTab, setActiveTab] = useState<'api-keys' | 'webhooks'>('api-keys');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [scopesLookup, setScopesLookup] = useState<string[]>([]);
  const [oneTimeRawKey, setOneTimeRawKey] = useState<string | null>(null);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [editingWebhook, setEditingWebhook] = useState<Partial<Webhook> | null>(null);
  const [eventsLookup, setEventsLookup] = useState<string[]>([]);
  
  // Deliveries state
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  const [selectedPayload, setSelectedPayload] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const data = await api.get<ApiKey[]>('/admin/api-keys');
      setApiKeys(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchWebhooks = async () => {
    setLoadingWebhooks(true);
    try {
      const data = await api.get<Webhook[]>('/admin/webhooks');
      setWebhooks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const fetchDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const data = await api.get<WebhookDelivery[]>('/admin/webhooks/deliveries');
      setDeliveries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const scopes = await api.get<string[]>('/lookups?type=api_scopes');
      setScopesLookup(scopes);
      const events = await api.get<string[]>('/lookups?type=notification_events');
      setEventsLookup(events);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchKeys();
    fetchWebhooks();
    fetchDeliveries();
    fetchLookups();
  }, []);

  // API Key handlers
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post<{ key: ApiKey; rawKey: string }>('/admin/api-keys', {
        name: newKeyName,
        scopes: newKeyScopes
      });
      setOneTimeRawKey(res.rawKey);
      setNewKeyName('');
      setNewKeyScopes([]);
      setIsCreateKeyOpen(false);
      fetchKeys();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!window.confirm('Are you sure you want to revoke this API credential key? Any background task utilizing this endpoint token will instantly lose operational access.')) return;
    try {
      await api.delete(`/admin/api-keys/${id}`);
      setToastMessage('API key credentials successfully revoked.');
      setTimeout(() => setToastMessage(null), 3000);
      fetchKeys();
    } catch (err) {
      console.error(err);
    }
  };

  // Webhooks handlers
  const handleOpenWebhookEdit = (wh: Webhook) => {
    setEditingWebhook(wh);
  };

  const handleOpenWebhookCreate = () => {
    setEditingWebhook({
      url: '',
      secret: `whsec_${Math.random().toString(36).substring(2, 10)}`,
      events: [],
      active: true
    });
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebhook) return;
    try {
      if (editingWebhook.id) {
        await api.put(`/admin/webhooks/${editingWebhook.id}`, editingWebhook);
        setToastMessage('Webhook endpoint configuration updated.');
      } else {
        await api.post('/admin/webhooks', editingWebhook);
        setToastMessage('New webhook target registered successfully.');
      }
      setTimeout(() => setToastMessage(null), 3000);
      setEditingWebhook(null);
      fetchWebhooks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendTestWebhook = async (wh: Webhook) => {
    if (wh.events.length === 0) {
      alert('Please select at least one notification event subscription first.');
      return;
    }
    const targetEvent = wh.events[0];
    try {
      setToastMessage(`Dispatched test event ${targetEvent} to webhook target.`);
      setTimeout(() => setToastMessage(null), 3000);
      await api.post('/admin/webhooks/test', {
        url: wh.url,
        event: targetEvent
      });
      fetchDeliveries();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryDelivery = async (id: string) => {
    try {
      setToastMessage('Replaying delivery log entry...');
      setTimeout(() => setToastMessage(null), 3000);
      await api.post(`/admin/webhooks/deliveries/${id}/retry`);
      fetchDeliveries();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleScopeSelection = (scope: string) => {
    setNewKeyScopes(prev => 
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const toggleWebhookEventSelection = (evt: string) => {
    if (!editingWebhook) return;
    const currentEvents = editingWebhook.events || [];
    const updatedEvents = currentEvents.includes(evt) 
      ? currentEvents.filter(e => e !== evt) 
      : [...currentEvents, evt];
    setEditingWebhook({ ...editingWebhook, events: updatedEvents });
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans text-left">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-primary border border-primary/35 text-white px-4 py-3 rounded-lg shadow-xl flex items-center space-x-2 z-50 font-sans text-xs">
          <Icons.CheckCircle className="w-4 h-4 text-white bg-white/20 rounded p-0.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Heading Block */}
      <div className="border-b border-border-custom pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight text-left">System Integrations & API Access</h2>
          <p className="text-xs text-text-secondary mt-0.5 text-left">
            Manage third-party telemetry ingest API tokens, register outbound notification webhooks, and audit compliance message delivery status logs.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex bg-surface-muted p-1 border border-border-custom rounded-lg self-start">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`px-3 py-1.5 font-mono text-xs font-bold rounded cursor-pointer transition-colors ${
              activeTab === 'api-keys' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            API KEYS
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`px-3 py-1.5 font-mono text-xs font-bold rounded cursor-pointer transition-colors ${
              activeTab === 'webhooks' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            WEBHOOKS
          </button>
        </div>
      </div>

      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Registered Client Ingest Keys</span>
            <button
              onClick={() => setIsCreateKeyOpen(true)}
              className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white font-mono text-xs font-bold rounded flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <Icons.Plus className="w-4 h-4" />
              <span>CREATE SECURE TOKEN</span>
            </button>
          </div>

          {loadingKeys ? (
            <div className="flex items-center justify-center p-12 border border-border-custom rounded-lg bg-surface-muted/30">
              <Icons.Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto border border-border-custom rounded-lg">
              <table className="w-full border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-surface-muted border-b border-border-custom font-mono text-[10px] text-text-muted uppercase text-left">
                    <th className="px-4 py-3">Client Name</th>
                    <th className="px-4 py-3">Key Prefix</th>
                    <th className="px-4 py-3">Assigned Scopes</th>
                    <th className="px-4 py-3">Last Authenticated</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom/40">
                  {apiKeys.map(key => (
                    <tr key={key.id} className="hover:bg-surface-muted/30">
                      <td className="px-4 py-3.5 font-display text-text-primary font-semibold">
                        {key.name}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-text-secondary text-[11px]">
                        {key.prefix}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.map(sc => (
                            <span key={sc} className="bg-primary/5 text-primary border border-primary/15 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase font-bold">
                              {sc}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-text-secondary text-[11px]">
                        {key.lastUsed}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-text-muted text-[11px]">
                        {key.createdAt}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center space-x-1 font-mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          key.status === 'active' ? 'bg-status-ok/10 text-status-ok border border-status-ok/25' : 'bg-status-critical/10 text-status-critical border border-status-critical/25'
                        }`}>
                          {key.status === 'active' ? 'ACTIVE' : 'REVOKED'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {key.status === 'active' ? (
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-status-critical/10 hover:bg-status-critical/20 text-status-critical border border-status-critical/20 rounded font-mono text-[9px] font-bold transition-colors cursor-pointer"
                          >
                            <Icons.Trash className="w-3 h-3" />
                            <span>REVOKE TOKEN</span>
                          </button>
                        ) : (
                          <span className="text-text-muted font-mono text-[9px] uppercase tracking-wider font-bold">REVOKED INACTIVE</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Outbound Webhook Recipient Targets</span>
              <button
                onClick={handleOpenWebhookCreate}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white font-mono text-xs font-bold rounded flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <Icons.Plus className="w-4 h-4" />
                <span>REGISTER WEBHOOK</span>
              </button>
            </div>

            {loadingWebhooks ? (
              <div className="flex items-center justify-center p-12 border border-border-custom rounded-lg bg-surface-muted/30">
                <Icons.Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {webhooks.map(wh => (
                  <div key={wh.id} className="bg-background-custom/35 border border-border-custom hover:border-border-custom/80 p-4 rounded-xl flex flex-col justify-between space-y-4 transition-all text-left">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[70%]">
                          {wh.url}
                        </span>
                        <span className="font-mono text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded uppercase font-bold">
                          {wh.id}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div>
                          <span className="text-[9px] font-mono text-text-muted uppercase block text-left">SECURE DISPATCH KEY:</span>
                          <span className="font-mono text-text-primary text-[10px] font-semibold text-left block">{wh.secret}</span>
                        </div>

                        <div className="pt-1">
                          <span className="text-[9px] font-mono text-text-muted uppercase block text-left">EVENT SUBSCRIPTION TOPICS:</span>
                          <div className="flex flex-wrap gap-1 mt-1 text-left">
                            {wh.events.map(ev => (
                              <span key={ev} className="bg-surface border border-border-custom px-1.5 py-0.5 rounded font-mono text-[8px] text-text-secondary uppercase">
                                {ev}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border-custom/50 flex justify-between gap-2">
                      <button
                        onClick={() => handleSendTestWebhook(wh)}
                        className="flex-1 py-1 bg-primary hover:bg-primary/90 text-white text-[9px] font-mono font-bold rounded transition-colors cursor-pointer flex items-center justify-center space-x-1"
                      >
                        <Icons.Zap className="w-3 h-3" />
                        <span>SEND TEST</span>
                      </button>
                      <button
                        onClick={() => handleOpenWebhookEdit(wh)}
                        className="flex-1 py-1 bg-surface-muted hover:bg-surface border border-border-custom text-text-primary text-[9px] font-mono font-bold rounded transition-colors cursor-pointer flex items-center justify-center space-x-1"
                      >
                        <Icons.Settings className="w-3 h-3 text-text-muted" />
                        <span>EDIT TARGET</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Webhook deliveries ledger */}
          <div className="space-y-4 pt-4 border-t border-border-custom text-left">
            <div className="flex items-center justify-between border-b border-border-custom pb-2">
              <span className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Outgoing Delivery Attempt Ledger</span>
              <span className="text-[9px] font-mono text-text-muted uppercase">REAL-TIME WEBHOOK METRICS</span>
            </div>

            {loadingDeliveries ? (
              <div className="flex items-center justify-center p-12 border border-border-custom rounded-lg bg-surface-muted/30">
                <Icons.Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : deliveries.length > 0 ? (
              <div className="overflow-x-auto border border-border-custom rounded-lg">
                <table className="w-full border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-surface-muted border-b border-border-custom font-mono text-[10px] text-text-muted uppercase text-left">
                      <th className="px-4 py-3">Delivery ID</th>
                      <th className="px-4 py-3">Trigger Event</th>
                      <th className="px-4 py-3">Attempts</th>
                      <th className="px-4 py-3">Response Code</th>
                      <th className="px-4 py-3">Dispatched Time</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-custom/40 text-left">
                    {deliveries.map(del => (
                      <tr key={del.id} className="hover:bg-surface-muted/30">
                        <td className="px-4 py-3.5 font-mono text-text-primary font-semibold">
                          {del.id}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-text-primary text-[11px]">
                          {del.event}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-text-secondary text-[11px]">
                          {del.attempts}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-text-secondary text-[11px]">
                          <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                            del.responseCode === 200 ? 'bg-status-ok/10 text-status-ok border-status-ok/25' : 'bg-status-critical/10 text-status-critical border-status-critical/25'
                          }`}>
                            {del.responseCode}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-text-muted text-[11px]">
                          {del.timestamp}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center space-x-1 font-mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            del.status === 'success' ? 'bg-status-ok/10 text-status-ok border border-status-ok/25' : 'bg-status-critical/10 text-status-critical border-status-critical/25'
                          }`}>
                            {del.status === 'success' ? 'DELIVERED' : 'FAILED'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right flex justify-end space-x-2">
                          <button
                            onClick={() => setSelectedPayload(del.payload)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-surface-muted hover:bg-surface text-text-primary border border-border-custom rounded font-mono text-[9px] font-bold transition-colors cursor-pointer"
                          >
                            <Icons.Code className="w-3 h-3 text-text-muted" />
                            <span>VIEW JSON</span>
                          </button>
                          <button
                            onClick={() => handleRetryDelivery(del.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded font-mono text-[9px] font-bold transition-colors cursor-pointer"
                          >
                            <Icons.RotateCcw className="w-3 h-3" />
                            <span>RETRY</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-border-custom rounded-lg bg-background-custom/10">
                <Icons.Info className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-text-secondary text-xs">No active webhook deliveries logged inside the current secure node session.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create API Key Dialog */}
      {isCreateKeyOpen && (
        <div className="fixed inset-0 bg-[#0B0F12]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="fixed inset-0" onClick={() => setIsCreateKeyOpen(false)} />
          <div className="bg-surface border border-border-custom w-full max-w-md rounded-xl p-5 shadow-2xl relative z-10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border-custom">
              <span className="font-display font-bold text-sm text-text-primary uppercase tracking-wider">Generate Client Token Credentials</span>
              <button onClick={() => setIsCreateKeyOpen(false)} className="text-text-secondary hover:text-text-primary cursor-pointer">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4 text-xs">
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-mono text-text-muted uppercase block">Client Integration Name:</label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Reliance Jamnagar SCADA Node"
                  className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded text-text-primary font-sans focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-mono text-text-muted uppercase block">Assigned Token Access Scopes:</label>
                <div className="grid grid-cols-2 gap-2 p-2.5 bg-background-custom/30 rounded border border-border-custom max-h-40 overflow-y-auto text-left">
                  {scopesLookup.map(sc => {
                    const isSelected = newKeyScopes.includes(sc);
                    return (
                      <button
                        type="button"
                        key={sc}
                        onClick={() => toggleScopeSelection(sc)}
                        className={`p-2 rounded border text-left font-mono text-[9px] uppercase font-semibold transition-all cursor-pointer ${
                          isSelected ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'bg-surface-muted/35 border-transparent text-text-secondary hover:border-border-custom'
                        }`}
                      >
                        {sc}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateKeyOpen(false)}
                  className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-xs font-bold text-text-secondary cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold cursor-pointer transition-colors"
                >
                  GENERATE TOKEN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Key Display Modal */}
      {oneTimeRawKey && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-surface border border-status-warn/40 w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-status-warn">
              <Icons.ShieldAlert className="w-5 h-5" />
              <span className="font-display font-bold text-sm text-text-primary uppercase tracking-wider">Secure token compiled once</span>
            </div>

            <p className="text-text-secondary text-xs leading-relaxed text-left">
              Copy this API client ingestion token immediately. It is stored securely in hashed format on the master nodes, and <strong>you won't see this again</strong> under any circumstances.
            </p>

            <div className="p-3 bg-background-custom rounded-lg border border-border-custom font-mono text-[11px] text-text-primary select-all break-all flex items-center justify-between gap-4">
              <span>{oneTimeRawKey}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(oneTimeRawKey);
                  setToastMessage('Raw token string copied to clipboard!');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="px-2.5 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/25 rounded cursor-pointer transition-colors flex items-center space-x-1 flex-shrink-0"
              >
                <Icons.Copy className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">COPY</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setOneTimeRawKey(null)}
                className="w-full py-2 bg-status-warn text-background-custom font-mono font-bold text-xs rounded hover:bg-status-warn/90 cursor-pointer transition-colors"
              >
                I HAVE ARCHIVED THIS TOKEN SECURELY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook edit Drawer / Dialog */}
      {editingWebhook && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-sm flex items-center justify-end z-50 p-4 transition-all">
          <div className="fixed inset-0" onClick={() => setEditingWebhook(null)} />
          
          <div className="bg-surface border border-border-custom w-full max-w-md h-full rounded-l-xl shadow-2xl relative z-10 overflow-hidden font-sans flex flex-col justify-between text-left">
            <div>
              <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                <div className="flex items-center space-x-2 text-primary">
                  <Icons.Network className="w-4 h-4" />
                  <span className="font-mono font-bold text-xs uppercase text-text-primary">
                    {editingWebhook.id ? 'Edit Outbound Webhook' : 'Register Outbound Webhook'}
                  </span>
                </div>
                <button 
                  onClick={() => setEditingWebhook(null)} 
                  className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveWebhook} className="p-5 space-y-4 text-xs">
                {editingWebhook.id && (
                  <div className="p-3 bg-primary/5 rounded border border-primary/20 font-mono text-[10px] text-text-secondary text-left">
                    WEBHOOK TARGET ID: <strong className="text-text-primary">{editingWebhook.id}</strong>
                  </div>
                )}

                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Target Webhook Endpoint URL:</label>
                  <input
                    type="url"
                    required
                    value={editingWebhook.url || ''}
                    onChange={(e) => setEditingWebhook({ ...editingWebhook, url: e.target.value })}
                    placeholder="https://api.yourplantserver.com/v1/webhook"
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-sans text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Signature Secret Token:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={editingWebhook.secret || ''}
                      onChange={(e) => setEditingWebhook({ ...editingWebhook, secret: e.target.value })}
                      placeholder="whsec_xxxxx"
                      className="flex-1 px-3 py-2 bg-background-custom border border-border-custom rounded font-mono text-text-primary focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingWebhook({ ...editingWebhook, secret: `whsec_${Math.random().toString(36).substring(2, 10)}` })}
                      className="px-2.5 bg-surface-muted hover:bg-surface border border-border-custom text-text-secondary rounded cursor-pointer transition-colors"
                      title="Regenerate Secret Key"
                    >
                      <Icons.RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-mono text-text-muted uppercase block text-left">Event Subscriptions:</label>
                  <div className="space-y-1.5 p-2.5 bg-background-custom/30 rounded border border-border-custom text-left">
                    {eventsLookup.map(ev => {
                      const isSelected = (editingWebhook.events || []).includes(ev);
                      return (
                        <button
                          type="button"
                          key={ev}
                          onClick={() => toggleWebhookEventSelection(ev)}
                          className={`w-full p-2 rounded border text-left font-mono text-[9px] uppercase font-semibold flex items-center justify-between transition-all cursor-pointer ${
                            isSelected ? 'bg-primary/10 border-primary/30 text-primary font-bold' : 'bg-surface-muted/20 border-transparent text-text-muted hover:border-border-custom'
                          }`}
                        >
                          <span>{ev}</span>
                          {isSelected && <Icons.Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="pt-4 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingWebhook(null)}
                    className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-xs font-bold text-text-secondary cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold cursor-pointer transition-colors"
                  >
                    SAVE DISPATCH ENDPOINT
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Payload JSON view dialog */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-[#0B0F12]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="fixed inset-0" onClick={() => setSelectedPayload(null)} />
          <div className="bg-surface border border-border-custom w-full max-w-lg rounded-xl p-5 shadow-2xl relative z-10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border-custom">
              <span className="font-mono font-bold text-xs text-text-primary uppercase tracking-wider font-sans text-left">Outbound Webhook payload logs</span>
              <button onClick={() => setSelectedPayload(null)} className="text-text-secondary hover:text-text-primary cursor-pointer">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <pre className="p-4 bg-background-custom border border-border-custom rounded-lg font-mono text-[10px] text-green-400 overflow-x-auto max-h-96 whitespace-pre text-left">
              {selectedPayload}
            </pre>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedPayload(null)}
                className="px-4 py-2 bg-surface-muted hover:bg-surface border border-border-custom text-text-primary rounded font-mono text-xs font-bold cursor-pointer transition-colors"
              >
                CLOSE VIEWER
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
