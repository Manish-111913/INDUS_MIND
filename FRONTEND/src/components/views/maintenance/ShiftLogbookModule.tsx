import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { api } from '../../../lib/api/client';
import { Select } from '../../shared';

export function ShiftLogbookModule() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  
  // New entry form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLogText, setNewLogText] = useState('');
  const [newLogShift, setNewLogShift] = useState('Morning Shift');
  const [newLogPlant, setNewLogPlant] = useState('jam-a');
  const [newLogEquipment, setNewLogEquipment] = useState('');
  const [newLogTags, setNewLogTags] = useState('');
  const [addError, setAddError] = useState('');

  // Summarize state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [handoverSummary, setHandoverSummary] = useState<string | null>(null);

  // The live API returns { content, author_name, plant_name, submitted_at,
  // created_at, shift, tags }. This maps those onto the field names the card
  // renders (text/operator/timestamp/plantName) so nothing shows up blank.
  const normalizeLog = (l: any) => {
    if (!l) return l;
    const ts = l.timestamp ?? l.submitted_at ?? l.created_at ?? null;
    let timestamp = l.timestamp ?? '';
    if (ts && !l.timestamp) {
      const d = new Date(ts);
      timestamp = isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
    }
    return {
      ...l,
      text: l.text ?? l.content ?? '',
      operator: l.operator ?? l.author_name ?? 'Shift Operator',
      timestamp,
      plantName: l.plantName ?? l.plant_name ?? null,
    };
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get<any[]>('/shift-logs');
      setLogs((res || []).map(normalizeLog));
    } catch (err) {
      console.error('Failed to load shift logbook:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogText.trim()) {
      setAddError('Log description cannot be empty.');
      return;
    }
    setAddError('');
    try {
      const parsedTags = newLogTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const parsedEquipment = newLogEquipment
        .split(',')
        .map(eq => eq.trim())
        .filter(eq => eq.length > 0);

      const body = {
        date: new Date().toISOString().split('T')[0],
        shift: newLogShift,
        plant: newLogPlant,
        text: newLogText,
        equipment: parsedEquipment,
        tags: parsedTags,
        submitted: true
      };

      const res = await api.post<any>('/shift-logs', body);
      setLogs(prev => [normalizeLog(res || {}), ...prev]);

      // Reset
      setNewLogText('');
      setNewLogEquipment('');
      setNewLogTags('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to submit shift log:', err);
      setAddError('Server rejection during log submission.');
    }
  };

  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    setHandoverSummary(null);
    try {
      const res = await api.post<{ summary: string }>('/shift-logs/123/summarize');
      // Simulate thinking timer
      await new Promise(resolve => setTimeout(resolve, 1500));
      setHandoverSummary(res.summary);
    } catch (err) {
      console.error('Failed to summarize handover logs:', err);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Get unique tags across all log entries
  const allTags = Array.from(
    new Set(logs.flatMap(log => log && log.tags ? log.tags : []))
  );

  // Filter lists
  const filteredLogs = logs.filter(log => {
    if (!log) return false;
    const matchesSearch = (log.text || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (log.operator || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (log.equipment || []).some((eq: string) => eq && eq.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = selectedTag === 'All' || (log.tags || []).includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-custom pb-4 gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
            <Icons.History className="w-5 h-5 text-primary" />
            <span>Shift Handover Logbook</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Log machinery anomalies and operational events. Auto-generate structured summary reports for seamless shift handovers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateSummary}
            disabled={isSummarizing || logs.length === 0}
            className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {isSummarizing ? (
              <Icons.Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Icons.Sparkles className="w-4 h-4 text-primary animate-pulse" />
            )}
            <span>{isSummarizing ? 'Analyzing Logs...' : 'Generate AI Handover Report'}</span>
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow min-h-[44px]"
          >
            {showAddForm ? <Icons.X className="w-4 h-4" /> : <Icons.Plus className="w-4 h-4" />}
            <span>{showAddForm ? 'Cancel Log Entry' : 'Log Shift Entry'}</span>
          </button>
        </div>
      </div>

      {/* AI Handover Summary Output */}
      {handoverSummary && (
        <div className="bg-surface border border-primary/25 rounded-xl p-5 space-y-4 animate-fade-in relative overflow-hidden shadow-lg shadow-primary/5">
          <div className="absolute right-0 top-0 opacity-[0.02] transform translate-x-4 -translate-y-4">
            <Icons.Sparkles className="w-48 h-48 text-primary" />
          </div>
          <div className="flex justify-between items-center border-b border-border-custom pb-2">
            <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Icons.Sparkles className="w-4 h-4 text-primary" />
              <span>Co-pilot Draft Handover Summary Report</span>
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(handoverSummary);
                alert('Handover summary copied to clipboard.');
              }}
              className="px-2 py-1 bg-surface-muted border border-border-custom text-[10px] font-mono text-text-secondary hover:text-text-primary rounded cursor-pointer transition-all"
            >
              Copy Report
            </button>
          </div>
          <div className="text-xs text-text-primary leading-relaxed font-mono whitespace-pre-wrap">
            {handoverSummary}
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 animate-fade-in shadow-lg">
          <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2">
            Record Live Shift Operations & Machinery Anomalies
          </span>
          <form onSubmit={handleAddLog} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Target Operating Shift</label>
              <Select
                value={newLogShift}
                onValueChange={(v) => setNewLogShift(v)}
                options={[
                  { value: 'Morning Shift', label: 'Morning Shift (06:00 - 14:00)' },
                  { value: 'Evening Shift', label: 'Evening Shift (14:00 - 22:00)' },
                  { value: 'Night Shift', label: 'Night Shift (22:00 - 06:00)' }
                ]}
                className="w-full px-3 py-2 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Refinery Unit Branch</label>
              <Select
                value={newLogPlant}
                onValueChange={(v) => setNewLogPlant(v)}
                options={[
                  { value: 'jam-a', label: 'Reliance Jamnagar Refinery - Sector A' },
                  { value: 'jam-b', label: 'Reliance Jamnagar Refinery - Sector B' },
                  { value: 'hazira-4', label: 'Hazira Petrochemicals Complex - Unit 4' }
                ]}
                className="w-full px-3 py-2 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Linked Machinery Codes (comma separated)</label>
              <input
                type="text"
                placeholder="e.g., EQ-P-101, EQ-C-4"
                value={newLogEquipment}
                onChange={(e) => setNewLogEquipment(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Operational Tags (comma separated)</label>
              <input
                type="text"
                placeholder="e.g., CDU, Vibration, Safety"
                value={newLogTags}
                onChange={(e) => setNewLogTags(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Log Entry / Event Description</label>
              <textarea
                required
                rows={4}
                placeholder="Enter detailed observations, vibration levels, valve pressure logs, structural status etc..."
                value={newLogText}
                onChange={(e) => setNewLogText(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg p-3 text-text-primary focus:outline-none focus:border-primary/50 text-xs resize-y"
              />
            </div>

            {addError && (
              <p className="text-status-critical font-mono font-bold text-[10px] md:col-span-2">{addError}</p>
            )}

            <div className="md:col-span-2 flex justify-end border-t border-border-custom/40 pt-3">
              <button
                type="submit"
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow min-h-[44px]"
              >
                <Icons.Check className="w-4 h-4" />
                <span>Submit Shift Log Entry</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FILTER TOOLBAR */}
      <div className="bg-surface border border-border-custom rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search shift logs by description, machinery, operator name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background-custom border border-border-custom rounded-lg pl-9 pr-4 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
            />
            <Icons.Search className="w-4 h-4 text-text-muted absolute left-3 top-3.5" />
          </div>

          <Select
            value={selectedTag}
            onValueChange={(v) => setSelectedTag(v)}
            options={[
              { value: 'All', label: 'All Operations Tags' },
              ...allTags.map(tag => ({ value: tag, label: tag }))
            ]}
            className="px-3 py-2 text-xs min-h-[44px] sm:w-48"
          />
        </div>
      </div>

      {/* LOG ENTRIES TIMELINE */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-text-muted font-mono animate-pulse flex flex-col items-center justify-center space-y-3 bg-surface border border-border-custom rounded-xl">
            <Icons.Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span>Syncing shift logbooks...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-text-secondary font-mono bg-surface border border-border-custom rounded-xl space-y-2">
            <Icons.History className="w-10 h-10 text-text-muted mx-auto" />
            <p>No shift logs matched search parameters.</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 hover:border-border-custom/80 transition-all shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-custom/40 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-primary/15 rounded-full flex items-center justify-center border border-primary/25">
                    <Icons.User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="block font-sans font-semibold text-text-primary text-xs">{log.operator}</span>
                    <span className="block text-[10px] text-text-muted font-mono mt-0.5">{log.timestamp}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] font-bold">
                  <span className="bg-primary/10 text-primary border border-primary/15 px-2 py-0.5 rounded">
                    {(log.shift || '').toUpperCase()}
                  </span>
                  <span className="bg-surface-muted border border-border-custom text-text-secondary px-2 py-0.5 rounded">
                    {log.plantName || (log.plant === 'jam-a' ? 'CDU SECTOR-A' : log.plant === 'jam-b' ? 'CDU SECTOR-B' : 'HAZIRA UNIT-4')}
                  </span>
                </div>
              </div>

              <p className="text-xs text-text-primary leading-relaxed font-sans">{log.text}</p>

              {(log.equipment?.length > 0 || log.tags?.length > 0) && (
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] border-t border-border-custom/20">
                  {log.equipment?.length > 0 && (
                    <div className="flex items-center space-x-1.5 text-accent font-mono">
                      <Icons.Cpu className="w-3.5 h-3.5" />
                      <span>{log.equipment.join(', ')}</span>
                    </div>
                  )}

                  {log.tags?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {log.tags.map((tag: string) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-background-custom border border-border-custom text-text-secondary rounded text-[9px] font-mono">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
