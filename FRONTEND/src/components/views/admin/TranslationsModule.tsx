import { useState, useEffect } from 'react';
import { api } from '../../../lib/api/client';
import { Globe, AlertCircle, Check, Search, Save, Plus, ArrowRight, BookOpen } from 'lucide-react';
import { Select } from '../../shared';

interface TranslationKV {
  key: string;
  value: string;
}

interface TranslationGap {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  first_seen_at: string;
  hits: number;
}

export function TranslationsModule() {
  const [activeTab, setActiveTab] = useState<'all' | 'gaps'>('all');
  const [selectedLocale, setSelectedLocale] = useState<string>('hi'); // Default to hi so they see Hindi translations
  const [selectedNs, setSelectedNs] = useState<string>('nav');
  const [translations, setTranslations] = useState<TranslationKV[]>([]);
  const [gaps, setGaps] = useState<TranslationGap[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<{ [key: string]: 'idle' | 'saving' | 'success' | 'error' }>({});

  // New Key state
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newKeyError, setNewKeyError] = useState('');

  // Inline translate state for gaps
  const [gapTranslatingId, setGapTranslatingId] = useState<string | null>(null);
  const [gapValue, setGapValue] = useState('');

  const fetchTranslations = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<TranslationKV[]>(`/admin/translations?locale=${selectedLocale}&namespace=${selectedNs}`);
      setTranslations(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGaps = async () => {
    try {
      const res = await api.get<TranslationGap[]>('/admin/translation-gaps');
      setGaps(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'all') {
      fetchTranslations();
    } else {
      fetchGaps();
    }
  }, [selectedLocale, selectedNs, activeTab]);

  const handleStartEdit = (item: TranslationKV) => {
    setEditingKey(item.key);
    setEditingValue(item.value);
  };

  const handleSaveEdit = async (itemKey: string) => {
    setSaveStatus(prev => ({ ...prev, [itemKey]: 'saving' }));
    try {
      await api.put('/admin/translations', {
        locale: selectedLocale,
        namespace: selectedNs,
        key: itemKey,
        value: editingValue
      });
      setSaveStatus(prev => ({ ...prev, [itemKey]: 'success' }));
      setEditingKey(null);
      fetchTranslations();
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [itemKey]: 'idle' }));
      }, 1500);
    } catch (err) {
      setSaveStatus(prev => ({ ...prev, [itemKey]: 'error' }));
    }
  };

  const handleAddNewKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setNewKeyError('');

    try {
      await api.put('/admin/translations', {
        locale: selectedLocale,
        namespace: selectedNs,
        key: newKey.trim(),
        value: newValue.trim()
      });
      setNewKey('');
      setNewValue('');
      fetchTranslations();
    } catch (err: any) {
      setNewKeyError(err?.message || 'Failed to insert translation key.');
    }
  };

  const handleTranslateGap = async (gap: TranslationGap) => {
    if (!gapValue.trim()) return;
    try {
      await api.put('/admin/translations', {
        locale: gap.locale,
        namespace: gap.namespace,
        key: gap.key,
        value: gapValue.trim()
      });
      
      // Update gaps locally in UI list
      const updatedGaps = gaps.filter(g => g.id !== gap.id);
      setGaps(updatedGaps);
      localStorage.setItem('indusmind_translation_gaps', JSON.stringify(updatedGaps));

      // Trigger translation key addition in current table if matched
      if (gap.locale === selectedLocale && gap.namespace === selectedNs) {
        fetchTranslations();
      }

      setGapTranslatingId(null);
      setGapValue('');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTranslations = translations.filter(t => 
    t.key.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <span>Internationalization Engine (i18n)</span>
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Maintain local translation catalogs, lookups, and trace un-translated dictionary gaps.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-surface-muted/60 p-1 rounded-lg border border-border-custom">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-all ${
              activeTab === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Translation Keys
          </button>
          <button
            onClick={() => setActiveTab('gaps')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'gaps'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>Missing Gaps</span>
            {gaps.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-status-critical text-[9px] text-white flex items-center justify-center font-bold">
                {gaps.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'all' ? (
        <div className="space-y-6">
          {/* Pickers & Query Search bar */}
          <div className="p-4 rounded-xl bg-background-custom border border-border-custom flex flex-col md:flex-row gap-4 justify-between items-end">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full md:w-auto">
              <div>
                <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Target Locale</label>
                <Select
                  value={selectedLocale}
                  onValueChange={(v) => setSelectedLocale(v)}
                  className="w-full sm:w-48 px-3 py-2 text-xs font-mono"
                  options={[
                    { value: 'en', label: 'en (English)' },
                    { value: 'hi', label: 'hi (हिन्दी / Hindi)' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Namespace Catalog</label>
                <Select
                  value={selectedNs}
                  onValueChange={(v) => setSelectedNs(v)}
                  className="w-full sm:w-48 px-3 py-2 text-xs font-mono"
                  options={[
                    { value: 'nav', label: 'nav (System Shell Navigation)' },
                    { value: 'auth', label: 'auth (Credential Gateway)' },
                    { value: 'copilot', label: 'copilot (AI Agent Assistant)' },
                  ]}
                />
              </div>
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search catalog keys..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface text-text-primary text-xs border border-border-custom rounded focus:outline-none focus:border-primary font-sans"
              />
            </div>
          </div>

          {/* New Key Ingestion Form */}
          <div className="p-4 rounded-xl bg-surface-muted/40 border border-border-custom">
            <span className="block text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider mb-3">Add Translation Key Pair</span>
            <form onSubmit={handleAddNewKey} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="key (e.g. system_ok)"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-surface text-text-primary text-xs border border-border-custom rounded focus:outline-none focus:border-primary font-mono"
              />
              <input
                type="text"
                placeholder="Translated String value"
                required
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-surface text-text-primary text-xs border border-border-custom rounded focus:outline-none focus:border-primary font-sans"
              />
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-mono font-bold text-white bg-primary hover:bg-primary-hover rounded flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ingest Key</span>
              </button>
            </form>
            {newKeyError && (
              <span className="text-[10px] font-mono text-status-critical block mt-2">FAULT: {newKeyError}</span>
            )}
          </div>

          {/* Editable KV Catalog Table */}
          <div className="border border-border-custom rounded-xl overflow-hidden bg-surface">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-text-muted font-mono">LOADING TRANSLATION BUNDLES...</div>
            ) : filteredTranslations.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted font-mono">NO KEY MATCHES FOUND IN CATALOG</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted/80 text-[10px] font-mono text-text-muted uppercase tracking-wider border-b border-border-custom">
                  <tr>
                    <th className="p-3 w-1/3">Translation Key</th>
                    <th className="p-3">Current Localization Value</th>
                    <th className="p-3 w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom font-mono">
                  {filteredTranslations.map((item) => (
                    <tr key={item.key} className="hover:bg-background-custom/30 transition-colors">
                      <td className="p-3 font-semibold text-text-secondary text-[11px] font-mono tracking-wide">
                        {item.key}
                      </td>
                      <td className="p-3 font-sans">
                        {editingKey === item.key ? (
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="w-full px-2.5 py-1 bg-background-custom text-text-primary text-xs border border-primary focus:outline-none rounded font-sans"
                            autoFocus
                          />
                        ) : (
                          <span className="text-text-primary text-xs leading-relaxed font-sans">{item.value}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {editingKey === item.key ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(item.key)}
                              className="p-1.5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors cursor-pointer"
                              title="Commit edits"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="px-2 py-1 bg-surface-muted text-text-muted hover:text-text-primary rounded text-[10px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {saveStatus[item.key] === 'success' && (
                              <Check className="w-4 h-4 text-status-ok animate-pulse" />
                            )}
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="px-2.5 py-1 text-[10px] text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded cursor-pointer transition-colors"
                            >
                              Edit Value
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* Translation Gaps module */
        <div className="space-y-4">
          <div className="p-4 bg-status-critical/5 border border-status-critical/15 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-status-critical flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider">Un-translated System Signals Detected</h4>
              <p className="text-[11px] text-text-secondary mt-1">
                The platform traces whenever a component requests a translation key with missing locales in runtime. Add values below to purge live gaps.
              </p>
            </div>
          </div>

          <div className="border border-border-custom rounded-xl overflow-hidden bg-surface">
            {gaps.length === 0 ? (
              <div className="p-12 text-center text-xs text-text-muted font-mono flex flex-col items-center justify-center gap-2">
                <Check className="w-8 h-8 text-status-ok" />
                <span>ALL SYSTEMS TRANSLATED! ZERO LOCALIZATION GAPS REPORTED</span>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted/80 text-[10px] font-mono text-text-muted uppercase tracking-wider border-b border-border-custom">
                  <tr>
                    <th className="p-3">Target Locale</th>
                    <th className="p-3">Namespace</th>
                    <th className="p-3">Missing Key</th>
                    <th className="p-3">Audit First Seen</th>
                    <th className="p-3 text-center">Hits</th>
                    <th className="p-3 text-right">Resolve Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom font-mono">
                  {gaps.map((gap) => (
                    <tr key={gap.id} className="hover:bg-background-custom/30 transition-colors">
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded bg-[#0E7C86]/10 text-primary border border-[#0E7C86]/15 font-bold uppercase tracking-wider text-[9px]">
                          {gap.locale}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-text-secondary uppercase text-[10px]">{gap.namespace}</td>
                      <td className="p-3 font-semibold text-text-primary">{gap.key}</td>
                      <td className="p-3 text-text-muted">{gap.first_seen_at}</td>
                      <td className="p-3 text-center font-bold text-primary">{gap.hits}</td>
                      <td className="p-3 text-right">
                        {gapTranslatingId === gap.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="text"
                              placeholder={`Value for ${gap.locale.toUpperCase()}...`}
                              required
                              value={gapValue}
                              onChange={(e) => setGapValue(e.target.value)}
                              className="px-2 py-1 bg-background-custom text-text-primary text-xs border border-primary focus:outline-none rounded font-sans"
                            />
                            <button
                              onClick={() => handleTranslateGap(gap)}
                              className="p-1.5 rounded bg-primary text-white hover:bg-primary-hover transition-colors cursor-pointer"
                              title="Commit resolution"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setGapTranslatingId(null)}
                              className="text-[10px] text-text-muted hover:text-text-primary px-1.5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setGapTranslatingId(gap.id);
                              setGapValue('');
                            }}
                            className="px-2.5 py-1 text-[10px] text-status-critical bg-status-critical/5 hover:bg-status-critical/10 border border-status-critical/20 rounded cursor-pointer transition-colors"
                          >
                            Resolve Translation
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
