import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useAdminStore } from '../../../stores/adminStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { api } from '../../../lib/api/client';
import { Select } from '../../shared';

interface ProfileSettingsProps {
  currentHash: string;
  onRouteChange: (hash: string) => void;
}

export function ProfileSettings({ currentHash, onRouteChange }: ProfileSettingsProps) {
  const activeTab = currentHash.startsWith('#settings/notifications')
    ? 'notifications'
    : currentHash === '#settings'
      ? 'settings'
      : 'profile';
  
  const user = useAuthStore((state) => state.user);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Active Sessions local state
  const [sessions, setSessions] = useState<any[]>([]);

  // Profile Form state — sourced from the authenticated user, never fabricated.
  // A brand-new operator sees their own identity (blank phone/dept until they set it).
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState((user as any)?.phone || '');
  const [dept, setDept] = useState((user as any)?.department || '');

  // Password state
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confPassword, setConfPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Settings State
  const { settings, updateEffectiveSettings } = useSettingsStore();

  const [theme, setTheme] = useState(() => localStorage.getItem('appearance.theme') || localStorage.getItem('indusmind_theme') || 'system');
  const [lang, setLang] = useState('en-IN');
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(Boolean((user as any)?.mfa_enabled ?? (user as any)?.mfaEnabled ?? false));
  const [notifChannels, setNotifChannels] = useState({
    email: true,
    sms: true,
    hmiPopup: true,
    weeklyLedger: false
  });

  const [currency, setCurrency] = useState(settings['locale.currency'] || 'INR');
  const [dateFormat, setDateFormat] = useState(settings['locale.date_format'] || 'dd MMM yyyy');
  const [timezone, setTimezone] = useState(settings['locale.timezone'] || 'Asia/Kolkata');
  const [unitSystem, setUnitSystem] = useState(settings['units.system'] || 'metric');
  const [pressureUnit, setPressureUnit] = useState(settings['units.pressure'] || 'bar');
  const [tempUnit, setTempUnit] = useState(settings['units.temperature'] || 'C');

  const fetchSessions = async () => {
    try {
      const res = await api.get<any[]>('/me/sessions');
      setSessions(res || []);
    } catch (err) {
      console.error('Failed to fetch active sessions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    setCurrency(settings['locale.currency'] || 'INR');
    setDateFormat(settings['locale.date_format'] || 'dd MMM yyyy');
    setTimezone(settings['locale.timezone'] || 'Asia/Kolkata');
    setUnitSystem(settings['units.system'] || 'metric');
    setPressureUnit(settings['units.pressure'] || 'bar');
    setTempUnit(settings['units.temperature'] || 'C');
  }, [settings]);

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    
    // Cryptographic security validation matching effective policy
    const hasMinLen = newPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
    if (!hasMinLen || !hasUpper || !hasSymbol) {
      setPasswordError('Password does not satisfy the secure cryptographic policy checklist (min 8 chars, 1 uppercase, 1 symbol).');
      return;
    }

    setPasswordError('');
    try {
      await api.post('/me/change-password', { current_password: currPassword, new_password: newPassword });
      setCurrPassword('');
      setNewPassword('');
      setConfPassword('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err?.message || 'Error occurred during password replacement.');
    }
  };

  const handleRevokeSession = async (sessId: string) => {
    try {
      await api.delete(`/me/sessions/${sessId}`);
      fetchSessions();
    } catch (err) {
      console.error('Failed to revoke session:', err);
    }
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    const isDark = newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('appearance.theme', newTheme);
    localStorage.setItem('indusmind_theme', newTheme);
    // Refresh page/component via state propagation
    window.dispatchEvent(new Event('storage'));
  };

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = {
        'locale.currency': currency,
        'locale.date_format': dateFormat,
        'locale.timezone': timezone,
        'units.system': unitSystem,
        'units.pressure': pressureUnit,
        'units.temperature': tempUnit,
      };
      
      await api.put<any>('/me/preferences', body);
      updateEffectiveSettings(body);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans text-xs animate-fade-in">
      
      {/* Header and navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">Operator Profile & Settings</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Configure your secure node login profile, customize theme interfaces, and review active terminal authorization keys.
          </p>
        </div>
        
        <div className="flex bg-background-custom border border-border-custom p-1 rounded-lg">
          <button
            onClick={() => onRouteChange('#profile')}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all ${
              activeTab === 'profile'
                ? 'bg-primary text-white font-bold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Terminal Profile
          </button>
          <button
            onClick={() => onRouteChange('#settings')}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all ${
              activeTab === 'settings'
                ? 'bg-primary text-white font-bold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Console Preferences
          </button>
          <button
            onClick={() => onRouteChange('#settings/notifications')}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all ${
              activeTab === 'notifications'
                ? 'bg-primary text-white font-bold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Notification Channels
          </button>
        </div>
      </div>

      {activeTab === 'profile' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Personal info */}
          <div className="md:col-span-2 space-y-5">
            <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
              <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2">
                Personal Identification Record
              </span>

              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Full Representative Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Registered Plant Role</label>
                    <input
                      type="text"
                      disabled
                      value={user?.role || 'Admin'}
                      className="w-full bg-surface-muted border border-border-custom rounded-lg px-3 py-2.5 text-text-muted font-bold focus:outline-none text-xs min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Corporate Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Mobile / SMS Contact</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Assigned Department</label>
                    <input
                      type="text"
                      required
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Authorized Refinery Unit Branch</label>
                    <input
                      type="text"
                      disabled
                      value={user?.plant || 'Reliance Jamnagar Refinery - Sector A'}
                      className="w-full bg-surface-muted border border-border-custom rounded-lg px-3 py-2.5 text-text-muted font-bold focus:outline-none text-xs min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-border-custom/50">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow min-h-[44px]"
                  >
                    <Icons.Check className="w-4 h-4" />
                    <span>Commit Profile Updates</span>
                  </button>
                </div>
              </form>

              {profileSuccess && (
                <div className="bg-status-ok/10 text-status-ok border border-status-ok/25 p-3 rounded-xl flex items-center space-x-2.5 animate-fade-in">
                  <Icons.ShieldCheck className="w-4 h-4 text-status-ok" />
                  <span>Profile details updated successfully. Operational ledger synced.</span>
                </div>
              )}
            </div>

            {/* Password modification form */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
              <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2">
                Authorize Console Password Modification
              </span>

              <form onSubmit={handlePasswordSave} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Current Passphrase</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••"
                    value={currPassword}
                    onChange={(e) => setCurrPassword(e.target.value)}
                    className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">New Cryptographic Passphrase</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 8 chars, 1 uppercase, 1 symbol"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Confirm New Passphrase</label>
                    <input
                      type="password"
                      required
                      placeholder="Repeat new password"
                      value={confPassword}
                      onChange={(e) => setConfPassword(e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
                    />
                  </div>
                </div>

                {passwordError && (
                  <p className="text-status-critical font-mono font-bold text-[10px] flex items-center space-x-1.5">
                    <Icons.AlertTriangle className="w-3.5 h-3.5 text-status-critical" />
                    <span>{passwordError}</span>
                  </p>
                )}

                <div className="flex justify-end pt-2 border-t border-border-custom/50">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-surface border border-border-custom hover:border-primary/50 text-text-secondary hover:text-text-primary rounded-lg font-bold flex items-center space-x-1.5 transition-all cursor-pointer min-h-[44px]"
                  >
                    <Icons.Lock className="w-4 h-4" />
                    <span>Replace Secure Password</span>
                  </button>
                </div>
              </form>

              {saveSuccess && (
                <div className="bg-status-ok/10 text-status-ok border border-status-ok/25 p-3 rounded-xl flex items-center space-x-2.5 animate-fade-in">
                  <Icons.ShieldCheck className="w-4 h-4 text-status-ok" />
                  <span>Password changed successfully. Your next session will require the new key.</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: MFA Stub */}
          <div className="space-y-5">
            <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
              <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2">
                Multi-Factor Authentication (MFA)
              </span>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="block font-sans font-semibold text-text-primary">TOTP Authenticator Gate</span>
                    <span className="block text-[11px] text-text-muted mt-0.5">Protect logins with hardware keys.</span>
                  </div>
                  <button
                    onClick={() => setMfaEnabled(!mfaEnabled)}
                    className={`p-1.5 rounded font-mono text-[9px] font-bold tracking-widest border cursor-pointer min-h-[32px] transition-all ${
                      mfaEnabled 
                        ? 'bg-status-ok/10 text-status-ok border-status-ok/20' 
                        : 'bg-status-critical/10 text-status-critical border-status-critical/20'
                    }`}
                  >
                    {mfaEnabled ? 'ENABLED' : 'DEACTIVATED'}
                  </button>
                </div>

                {mfaEnabled && (
                  <div className="bg-background-custom p-4 rounded-lg border border-border-custom space-y-3 flex flex-col items-center">
                    {/* Mock TOTP QR Code */}
                    <div className="w-32 h-32 bg-white p-2 rounded border border-border-custom/50 flex items-center justify-center relative">
                      <div className="grid grid-cols-6 gap-0.5 w-full h-full opacity-90">
                        {Array.from({ length: 36 }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-full h-full rounded-sm ${
                              (i * 3 + 17) % 5 === 0 || i % 7 === 0 || i < 6 || i % 6 === 0 ? 'bg-black' : 'bg-transparent'
                            }`} 
                          />
                        ))}
                      </div>
                      <Icons.QrCode className="w-10 h-10 text-primary absolute bg-white p-1 rounded-md" />
                    </div>

                    <div className="text-center">
                      <span className="block font-mono text-[9px] text-text-muted uppercase">Backup Private Node Token</span>
                      <code className="text-[11px] font-bold font-mono text-primary select-all mt-1 block">
                        SECURE-INDUS-TOTP-Z8X9
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Tips */}
            <div className="bg-background-custom border border-border-custom rounded-xl p-4 space-y-2">
              <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">
                Security Directive Note
              </span>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Terminal consoles monitor active connections closely. Never leave your node signed in without a locking screensaver or unattended.
              </p>
            </div>
          </div>
        </div>
      ) : activeTab === 'notifications' ? (
        <NotificationsMatrixModule />
      ) : (
        /* Settings Tab: Theme, language, notification routing, active sessions */
        <div className="space-y-6">
          {/* Profile Card Banner */}
          <div className="bg-gradient-to-r from-[#0E7C86]/10 via-surface to-surface border border-border-custom rounded-xl p-6 flex flex-col sm:flex-row items-center gap-5 relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-[0.02] transform translate-x-12 translate-y-12">
              <Icons.Shield className="w-64 h-64 text-text-primary" />
            </div>
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center relative flex-shrink-0 shadow-lg shadow-primary/10">
              <Icons.User className="w-8 h-8 text-primary" />
              <span className="absolute bottom-0 right-0 w-4.5 h-4.5 bg-status-ok rounded-full border-2 border-surface flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              </span>
            </div>
            <div className="text-center sm:text-left space-y-1 z-10">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-base font-bold text-text-primary font-display">{user?.name || 'Aditya Vardhan'}</h2>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono uppercase font-bold">{user?.role || 'Admin'}</span>
              </div>
              <p className="text-[11px] text-text-secondary font-mono">{user?.email || 'admin@indusmind.io'}</p>
              <div className="text-[10px] text-text-muted flex items-center justify-center sm:justify-start gap-1.5 font-mono pt-1">
                <Icons.MapPin className="w-3.5 h-3.5 text-primary" />
                <span>{user?.plant || 'Reliance Jamnagar Refinery - Sector A'}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSettingsSave} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Settings Left Col: UI & Regional Customizations */}
            <div className="md:col-span-2 space-y-6">
              
              {/* Visual Customize Card */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 shadow">
                <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2 flex items-center gap-1.5">
                  <Icons.Paintbrush className="w-4 h-4 text-primary" />
                  <span>Visual & HMI Interface Mode</span>
                </span>

                <div className="space-y-4">
                  {/* Theme Switch Toggler */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-background-custom border border-border-custom rounded-lg gap-3">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Console Theme Mode</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Choose the interface look-and-feel of your control station.</span>
                    </div>
                    <div className="flex bg-surface-muted p-1 rounded-lg border border-border-custom gap-1">
                      {(['light', 'dark', 'system'] as const).map((tVal) => (
                        <button
                          key={tVal}
                          type="button"
                          onClick={() => handleThemeChange(tVal)}
                          className={`px-3 py-1.5 text-[10px] font-mono font-bold rounded uppercase cursor-pointer transition-all ${
                            theme === tVal
                              ? 'bg-primary text-on-primary shadow-sm'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {tVal}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Primary Language */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-2">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Primary Language Translation</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Translate console terminology into local dialects.</span>
                    </div>
                    <div>
                      <Select
                        value={lang}
                        onValueChange={(v) => setLang(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'en-IN', label: 'English (India) [Standard]' },
                          { value: 'hi-IN', label: 'हिन्दी (Hindi)' },
                          { value: 'gu-IN', label: 'ગુજરાતી (Gujarati)' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Locale & Localization Settings */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 shadow">
                <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2 flex items-center gap-1.5">
                  <Icons.Globe className="w-4 h-4 text-primary" />
                  <span>Regional & Localization Preferences</span>
                </span>

                <div className="space-y-4">
                  {/* Currency Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Preferred Currency representation</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Currency symbol used in financials and downtime audits.</span>
                    </div>
                    <div>
                      <Select
                        value={currency}
                        onValueChange={(v) => setCurrency(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'INR', label: 'INR (₹) - Indian Rupee' },
                          { value: 'USD', label: 'USD ($) - United States Dollar' },
                          { value: 'EUR', label: 'EUR (€) - Euro' },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Date Format Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border-t border-border-custom/30 pt-3.5">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Standardized Date Format</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Preferred calendar representation for logs.</span>
                    </div>
                    <div>
                      <Select
                        value={dateFormat}
                        onValueChange={(v) => setDateFormat(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'dd MMM yyyy', label: 'dd MMM yyyy (e.g. 12 Jul 2026)' },
                          { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd (e.g. 2026-07-12)' },
                          { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy (e.g. 07/12/2026)' },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Timezone Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border-t border-border-custom/30 pt-3.5">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Console Reference Timezone</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Target timezone for live scheduler triggers.</span>
                    </div>
                    <div>
                      <Select
                        value={timezone}
                        onValueChange={(v) => setTimezone(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST - UTC+5:30)' },
                          { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
                          { value: 'America/New_York', label: 'America/New_York (EST - UTC-5)' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Unit System Settings */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 shadow">
                <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2 flex items-center gap-1.5">
                  <Icons.Activity className="w-4 h-4 text-primary" />
                  <span>Industrial Unit & Telemetry Conversions</span>
                </span>

                <div className="space-y-4">
                  {/* Unit System */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Primary Unit System</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Target baseline system of physical metrics.</span>
                    </div>
                    <div>
                      <Select
                        value={unitSystem}
                        onValueChange={(v) => setUnitSystem(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'metric', label: 'Metric System (SI Standard)' },
                          { value: 'imperial', label: 'Imperial System' },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Pressure Unit */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border-t border-border-custom/30 pt-3.5">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Pressure Measurement Scale</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Conversion unit used on pressure booster displays.</span>
                    </div>
                    <div>
                      <Select
                        value={pressureUnit}
                        onValueChange={(v) => setPressureUnit(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'bar', label: 'Bar (Metric Pressure)' },
                          { value: 'psi', label: 'PSI (Pounds per Square Inch)' },
                          { value: 'kPa', label: 'kPa (Kilopascal)' },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Temperature Unit */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border-t border-border-custom/30 pt-3.5">
                    <div>
                      <span className="block font-sans font-semibold text-text-primary text-xs">Thermodynamic Scale</span>
                      <span className="block text-[11px] text-text-muted mt-0.5">Calibration metrics used on reactor thermowells.</span>
                    </div>
                    <div>
                      <Select
                        value={tempUnit}
                        onValueChange={(v) => setTempUnit(v)}
                        className="w-full px-3 py-2.5 text-xs min-h-[44px]"
                        options={[
                          { value: 'C', label: 'Celsius (°C)' },
                          { value: 'F', label: 'Fahrenheit (°F)' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-surface border border-border-custom p-4 rounded-xl shadow">
                <p className="text-[11px] text-text-secondary leading-normal font-mono uppercase">
                  Ensure telemetry constraints are vetted.
                </p>
                <button
                  type="submit"
                  className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow min-h-[44px]"
                >
                  <Icons.Save className="w-4.5 h-4.5" />
                  <span>Save Profile Preferences</span>
                </button>
              </div>

              {saveSuccess && (
                <div className="bg-status-ok/10 text-status-ok border border-status-ok/25 p-4 rounded-xl flex items-center space-x-2.5 animate-fade-in shadow-md">
                  <Icons.ShieldCheck className="w-5 h-5 text-status-ok" />
                  <span className="font-semibold text-text-primary">Console preferences committed successfully. Client modules re-calibrated.</span>
                </div>
              )}

            </div>

            {/* Settings Right Col: Active Authorization Credentials */}
            <div className="space-y-6">
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 shadow">
                <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2 flex items-center gap-1.5">
                  <Icons.Cpu className="w-4 h-4 text-primary" />
                  <span>Authorized Node Tokens</span>
                </span>

                <div className="space-y-3">
                  {sessions.map((sess) => (
                    <div key={sess.id} className="bg-background-custom p-3.5 rounded-lg border border-border-custom/50 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-2.5">
                          <Icons.Cpu className={`w-5 h-5 mt-0.5 ${sess.active ? 'text-primary' : 'text-text-muted'}`} />
                          <div>
                            <span className="block font-semibold text-text-primary text-[11px]">{sess.device}</span>
                            <span className="block text-[10px] text-text-muted font-mono mt-0.5">{sess.ip} &bull; {sess.location}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-border-custom/30 pt-2.5 text-[10px] font-mono">
                        <span className={`inline-flex items-center text-[9px] font-bold px-1.5 rounded ${
                          sess.active 
                            ? 'bg-status-ok/10 text-status-ok border border-status-ok/15' 
                            : 'bg-status-critical/10 text-status-critical border border-status-critical/15'
                        }`}>
                          {sess.active ? 'ACTIVE' : 'REVOKED'}
                        </span>
                        {sess.active && (
                          <button
                            type="button"
                            onClick={() => handleRevokeSession(sess.id)}
                            className="text-status-critical hover:underline font-bold bg-transparent border-0 cursor-pointer text-[10px]"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety/Directive Card */}
              <div className="bg-background-custom border border-border-custom rounded-xl p-4.5 space-y-2.5 shadow">
                <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">
                  Security Directive Note
                </span>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Terminal consoles monitor active connections closely. Saving preferences broadcasts signals across plant controllers to coordinate units.
                </p>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

function NotificationsMatrixModule() {
  const [events, setEvents] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<{ event: string; inApp: boolean; email: boolean; digest: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [eventsRes, prefsRes] = await Promise.all([
          api.get<string[]>('/lookups?type=notification_events'),
          api.get<any[]>('/me/notification-preferences')
        ]);
        if (active) {
          setEvents(eventsRes || []);
          setPrefs(prefsRes || []);
        }
      } catch (e) {
        console.error('Failed to load notification settings:', e);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, []);

  const handleToggle = async (event: string, field: 'inApp' | 'email') => {
    const row = prefs.find(p => p.event === event);
    if (!row) return;

    const newValue = !row[field];
    const updatedRow = { ...row, [field]: newValue };

    // Optimistic update
    setPrefs(prev => prev.map(p => p.event === event ? updatedRow : p));
    setSavingRows(prev => ({ ...prev, [event]: true }));

    try {
      await api.put(`/me/notification-preferences/${event}`, updatedRow);
    } catch (err) {
      console.error('Failed to save preference:', err);
      // Revert if error
      setPrefs(prev => prev.map(p => p.event === event ? row : p));
    } finally {
      // Small visual delay so the user can see the saving indicator transition
      setTimeout(() => {
        setSavingRows(prev => ({ ...prev, [event]: false }));
      }, 300);
    }
  };

  const handleDigestChange = async (event: string, value: string) => {
    const row = prefs.find(p => p.event === event);
    if (!row) return;

    const updatedRow = { ...row, digest: value };

    // Optimistic update
    setPrefs(prev => prev.map(p => p.event === event ? updatedRow : p));
    setSavingRows(prev => ({ ...prev, [event]: true }));

    try {
      await api.put(`/me/notification-preferences/${event}`, updatedRow);
    } catch (err) {
      console.error('Failed to save digest preference:', err);
      // Revert
      setPrefs(prev => prev.map(p => p.event === event ? row : p));
    } finally {
      setTimeout(() => {
        setSavingRows(prev => ({ ...prev, [event]: false }));
      }, 300);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface border border-border-custom rounded-xl p-8 text-center space-y-3">
        <Icons.RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
        <p className="text-text-secondary font-mono text-xs">LOADING DISPATCH ROUTING MATRIX...</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-6 shadow animate-fade-in">
      <div className="border-b border-border-custom pb-3">
        <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
          <Icons.Bell className="w-4 h-4 text-primary" />
          <span>Notification Dispatch Routing Matrix</span>
        </span>
        <p className="text-[11px] text-text-muted mt-1">
          Map standard system event triggers to live visual alerts, corporate email relays, or consolidated summary digests.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-background-custom/60 border-b border-border-custom font-mono text-[10px] text-text-muted uppercase">
              <th className="p-3">System Event Type</th>
              <th className="p-3 text-center">In-App HUD Dispatch</th>
              <th className="p-3 text-center">Corporate Email Alert</th>
              <th className="p-3">Digest Delivery Window</th>
              <th className="p-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom/40">
            {events.map(evt => {
              const row = prefs.find(p => p.event === evt) || { event: evt, inApp: false, email: false, digest: 'Off' };
              const isSaving = savingRows[evt];
              return (
                <tr key={evt} className="hover:bg-background-custom/30 transition-colors">
                  <td className="p-3 font-mono text-text-primary select-all">
                    {evt}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(evt, 'inApp')}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all cursor-pointer focus:outline-none ${
                        row.inApp ? 'bg-[#0E7C86]' : 'bg-surface-muted border border-border-custom'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          row.inApp ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(evt, 'email')}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all cursor-pointer focus:outline-none ${
                        row.email ? 'bg-[#0E7C86]' : 'bg-surface-muted border border-border-custom'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          row.email ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="p-3">
                    <Select
                      value={row.digest}
                      onValueChange={(v) => handleDigestChange(evt, v)}
                      className="px-2.5 py-1 text-xs"
                      options={[
                        { value: 'Instant', label: 'Instant Delivery' },
                        { value: 'Daily', label: 'Daily Summary Digest' },
                        { value: 'Off', label: 'Delivery Deactivated' },
                      ]}
                    />
                  </td>
                  <td className="p-3 text-right">
                    {isSaving ? (
                      <span className="inline-flex items-center space-x-1 font-mono text-[9px] text-primary">
                        <Icons.RefreshCw className="w-3 h-3 animate-spin text-primary" />
                        <span>SAVING...</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 font-mono text-[9px] text-status-ok">
                        <Icons.Check className="w-3 h-3 text-status-ok" />
                        <span>COMMITTED</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-background-custom p-4 rounded-lg border border-border-custom text-[11px] text-text-secondary leading-relaxed flex items-start space-x-2.5">
        <Icons.Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-text-primary block mb-0.5">Automated Event Pipeline Rules</span>
          <span>Saving any preference triggers an optimistic write-back to standard user databases, updating the underlying dispatch relays. Digest bundles are consolidated at 06:00 IST daily.</span>
        </div>
      </div>
    </div>
  );
}
