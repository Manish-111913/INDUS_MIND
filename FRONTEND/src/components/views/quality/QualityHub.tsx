/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, Cpu, Wrench, ShieldAlert, Check, Plus, 
  ArrowRight, Sparkles, Filter, ExternalLink, Trash2,
  CheckCircle, AlertTriangle, Info, MapPin, BarChart3,
  ListTodo, TrendingUp, Compass, Bookmark, ArrowLeft, Settings
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ComposedChart 
} from 'recharts';
import { StatusChip, ConfidenceBadge, Select } from '../../shared';
import { api, USE_MOCK } from '../../../lib/api/client';

export interface Ncr {
  id: string;
  equipment: string;
  defectType: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  operator: string;
  date: string;
  docLink?: string;
  docName?: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  capaChecklist: { id: string; task: string; isCompleted: boolean }[];
  description: string;
}

const INITIAL_NCRS: Ncr[] = [
  {
    id: 'NCR-2026-001',
    equipment: 'P-101A',
    defectType: 'Cavitation & Pitting',
    severity: 'Critical',
    operator: 'Priya Sharma',
    date: '2026-07-02',
    docName: 'INC-991 Impeller Cavitation Report.pdf',
    docLink: '#documents',
    status: 'In Progress',
    description: 'High frequency acoustic monitoring registered severe cavitation signatures. Physical tear-down confirms micro-implosion pitted casing near impeller eye.',
    capaChecklist: [
      { id: '1', task: 'Isolate P-101A pump head and inspect impeller vanes for pitting', isCompleted: true },
      { id: '2', task: 'Run dynamic laser shaft alignment diagnostics', isCompleted: true },
      { id: '3', task: 'Revise nominal suction head thresholds to 1.5 Bar on DCS loop controls', isCompleted: false },
      { id: '4', task: 'Deliver shift briefing on cavitation prevention limits', isCompleted: false }
    ]
  },
  {
    id: 'NCR-2026-002',
    equipment: 'P-101B',
    defectType: 'Mechanical Seal Rupture',
    severity: 'High',
    operator: 'Arun Kumar',
    date: '2026-07-05',
    docName: 'OEM Butterfly Valve Manual.pdf',
    docLink: '#documents',
    status: 'Open',
    description: 'Crude oil micro-leakage at auxiliary buffer seal face. Internal seal buffer fluid pressures fell to 0.4 Bar under continuous humidity cycle.',
    capaChecklist: [
      { id: '1', task: 'Torque mounting adapter bolts to vendor specs of 45 Nm', isCompleted: true },
      { id: '2', task: 'Completely flush secondary fluid chamber with fresh demineralized water', isCompleted: false },
      { id: '3', task: 'Install silica breathers on seal fluid storage vessels', isCompleted: false }
    ]
  },
  {
    id: 'NCR-2026-003',
    equipment: 'C-302B',
    defectType: 'Insulation Core Fault',
    severity: 'Medium',
    operator: 'Rajesh Nair',
    date: '2026-06-28',
    status: 'Resolved',
    description: 'Reciprocating stator temperatures spiked to 138°C, breaching thermal thresholds. Megger insulation resistance testing logged slight conductivity deviation.',
    capaChecklist: [
      { id: '1', task: 'Clear ventilation duct blockages and deploy auxiliary ventilation fan', isCompleted: true },
      { id: '2', task: 'Verify temperature monitoring thermocouple calibration', isCompleted: true },
      { id: '3', task: 'Test motor windings resistance on cold startup', isCompleted: true }
    ]
  },
  {
    id: 'NCR-2026-004',
    equipment: 'V-230',
    defectType: 'Valve Flange Misalignment',
    severity: 'Medium',
    operator: 'Arun Kumar',
    date: '2026-07-01',
    status: 'Open',
    description: 'Slight gas weeping detected near main fuel gas isolation valve. Flange gasket shows signs of asymmetric pressure loading.',
    capaChecklist: [
      { id: '1', task: 'Replace damaged spiral-wound gasket on the block flange', isCompleted: false },
      { id: '2', task: 'Recalibrate fuel line isolation actuator limit switches', isCompleted: false }
    ]
  }
];

// Recharts data for Defect Pareto (Pareto Principle: 80% defects come from 20% causes)
const PARETO_DATA = [
  { defect: 'Seal Ruptures', count: 18, cumulative: 34.6 },
  { defect: 'Cavitation/Pitting', count: 14, cumulative: 61.5 },
  { defect: 'Flange Leaks', count: 8, cumulative: 76.9 },
  { defect: 'Insulation Faults', count: 5, cumulative: 86.5 },
  { defect: 'Calibration Drift', count: 4, cumulative: 94.2 },
  { defect: 'Others', count: 3, cumulative: 100.0 }
];

// Recharts data for Deviation Rate trends across manufacturing/operation lines
const TRENDS_DATA = [
  { month: 'Jan', 'Line A (Refinery)': 1.2, 'Line B (Gas Terminal)': 0.8 },
  { month: 'Feb', 'Line A (Refinery)': 1.4, 'Line B (Gas Terminal)': 0.9 },
  { month: 'Mar', 'Line A (Refinery)': 2.1, 'Line B (Gas Terminal)': 1.1 },
  { month: 'Apr', 'Line A (Refinery)': 1.8, 'Line B (Gas Terminal)': 1.3 },
  { month: 'May', 'Line A (Refinery)': 2.8, 'Line B (Gas Terminal)': 1.2 },
  { month: 'Jun', 'Line A (Refinery)': 3.4, 'Line B (Gas Terminal)': 1.5 } // Peak in monsoon startup season!
];

// Map a backend NCRRead row (see BACKEND/app/modules/quality/schemas.py) onto the
// frontend `Ncr` type. Backend enums are lowercase snake_case; fields it doesn't
// expose (defect label, operator, doc) fall back to empty defaults so a new tenant
// renders an empty register while the demo tenant shows its real NCRs.
const NCR_SEVERITY_MAP: Record<string, Ncr['severity']> = {
  critical: 'Critical', high: 'High', major: 'High',
  medium: 'Medium', low: 'Low', minor: 'Low',
};
const NCR_STATUS_MAP: Record<string, Ncr['status']> = {
  open: 'Open', in_review: 'In Progress', in_progress: 'In Progress',
  closed: 'Resolved', resolved: 'Resolved', void: 'Resolved',
};
function mapNcr(row: any): Ncr {
  const severity = NCR_SEVERITY_MAP[String(row?.severity ?? '').toLowerCase()] ?? 'Medium';
  const status = NCR_STATUS_MAP[String(row?.status ?? '').toLowerCase()] ?? 'Open';
  const capa = row?.capa;
  const capaItems = Array.isArray(capa) ? capa : (Array.isArray(capa?.items) ? capa.items : []);
  const capaChecklist = capaItems.map((c: any, i: number) => ({
    id: String(c?.id ?? i + 1),
    task: c?.task ?? String(c ?? ''),
    isCompleted: !!(c?.isCompleted ?? c?.completed),
  }));
  const detected = row?.detected_at ?? row?.date ?? '';
  return {
    id: String(row?.ncr_number ?? row?.id ?? ''),
    equipment: row?.equipment_id ? String(row.equipment_id) : '',
    defectType: row?.defect_type ?? '',
    severity,
    operator: row?.operator ?? '',
    date: detected ? String(detected).slice(0, 10) : '',
    status,
    capaChecklist,
    description: row?.description ?? '',
  };
}

export function QualityHub() {
  const [ncrs, setNcrs] = useState<Ncr[]>(() => {
    // LIVE: start empty and hydrate from GET /quality/ncrs in an effect below.
    if (!USE_MOCK) return [];
    const stored = localStorage.getItem('indusmind_quality_ncrs');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_NCRS;
  });

  // Chart datasets: mock fixtures in MOCK, backend-derived (or empty) in LIVE.
  const [paretoData, setParetoData] = useState<any[]>(USE_MOCK ? PARETO_DATA : []);
  const [trendsData, setTrendsData] = useState<any[]>(USE_MOCK ? TRENDS_DATA : []);

  // Tab State: 'register' | 'trends'
  const [activeTab, setActiveTab] = useState<'register' | 'trends'>('register');
  const [selectedNcrId, setSelectedNcrId] = useState<string | null>(null);

  // Filters State
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // CAPA Addition State
  const [newCapaText, setNewCapaText] = useState<string>('');

  // Sync state to LocalStorage (mock-only persistence).
  const saveNcrs = (updated: Ncr[]) => {
    setNcrs(updated);
    if (USE_MOCK) localStorage.setItem('indusmind_quality_ncrs', JSON.stringify(updated));
  };

  // LIVE: fetch NCRs + trends from the backend on mount (empty for a new tenant).
  useEffect(() => {
    if (USE_MOCK) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.get('/quality/ncrs');
        const rows: any[] = res?.data ?? res?.items ?? res ?? [];
        if (!cancelled) setNcrs((Array.isArray(rows) ? rows : []).map(mapNcr));
      } catch (e) {
        if (!cancelled) setNcrs([]);
      }
      try {
        const tr: any = await api.get('/quality/ncrs/trends');
        const t = tr?.data ?? tr ?? {};
        const pareto = Array.isArray(t?.defect_pareto) ? t.defect_pareto : [];
        const byLine = Array.isArray(t?.deviation_rate_by_line) ? t.deviation_rate_by_line : [];
        if (!cancelled) {
          setParetoData(pareto.map((p: any) => ({
            defect: p?.defect_type ?? 'Unclassified',
            count: p?.count ?? 0,
            cumulative: p?.cumulative_pct ?? 0,
          })));
          // Backend has no monthly series; plot deviation rate per line under the
          // primary series so the chart renders real data (empty when no NCRs).
          setTrendsData(byLine.map((l: any) => ({
            month: l?.line ?? 'Unassigned',
            'Line A (Refinery)': l?.rate_pct ?? 0,
          })));
        }
      } catch (e) {
        if (!cancelled) { setParetoData([]); setTrendsData([]); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for hash subrouting
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#quality/ncr/')) {
        const id = hash.replace('#quality/ncr/', '');
        setSelectedNcrId(id);
        setActiveTab('register');
      } else if (hash === '#quality/trends') {
        setActiveTab('trends');
        setSelectedNcrId(null);
      } else {
        setSelectedNcrId(null);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleToggleCapaItem = (ncrId: string, itemId: string) => {
    const updated = ncrs.map(n => {
      if (n.id === ncrId) {
        const updatedChecklist = n.capaChecklist.map(item => {
          if (item.id === itemId) {
            return { ...item, isCompleted: !item.isCompleted };
          }
          return item;
        });

        // Auto-advance NCR status based on CAPA completeness
        const allDone = updatedChecklist.every(item => item.isCompleted);
        const someDone = updatedChecklist.some(item => item.isCompleted);
        let nextStatus = n.status;
        if (allDone) {
          nextStatus = 'Resolved' as const;
        } else if (someDone) {
          nextStatus = 'In Progress' as const;
        }

        return { ...n, capaChecklist: updatedChecklist, status: nextStatus };
      }
      return n;
    });
    saveNcrs(updated);
  };

  const handleAddCapaItem = (ncrId: string) => {
    if (!newCapaText.trim()) return;
    const updated = ncrs.map(n => {
      if (n.id === ncrId) {
        const newItem = {
          id: (n.capaChecklist.length + 1).toString(),
          task: newCapaText.trim(),
          isCompleted: false
        };
        return { 
          ...n, 
          capaChecklist: [...n.capaChecklist, newItem],
          status: 'In Progress' as const // set to in progress if we add steps
        };
      }
      return n;
    });
    saveNcrs(updated);
    setNewCapaText('');
  };

  const handleUpdateNcrStatus = (ncrId: string, nextStatus: 'Open' | 'In Progress' | 'Resolved') => {
    const updated = ncrs.map(n => {
      if (n.id === ncrId) {
        return { ...n, status: nextStatus };
      }
      return n;
    });
    saveNcrs(updated);
  };

  const handleDeleteNcr = (ncrId: string) => {
    if (confirm(`Are you sure you want to remove Non-Conformance Record ${ncrId}?`)) {
      const updated = ncrs.filter(n => n.id !== ncrId);
      saveNcrs(updated);
      window.location.hash = '#quality';
    }
  };

  const activeNcr = ncrs.find(n => n.id === selectedNcrId);

  // Apply filters to NCR register
  const filteredNcrs = ncrs.filter(n => {
    if (selectedSeverity !== 'all' && n.severity !== selectedSeverity) return false;
    if (selectedStatus !== 'all' && n.status !== selectedStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (n.id || '').toLowerCase().includes(q) || 
             (n.equipment || '').toLowerCase().includes(q) || 
             (n.defectType || '').toLowerCase().includes(q) ||
             (n.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6" id="quality-suite">
      
      {selectedNcrId && activeNcr ? (
        /* ==================== NCR DETAIL SCREEN ==================== */
        <div className="space-y-6">
          <button 
            onClick={() => { window.location.hash = '#quality'; }}
            className="flex items-center space-x-2 text-xs font-mono text-text-secondary hover:text-text-primary cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>BACK TO NCR REGISTER</span>
          </button>

          <div className="bg-surface border border-border-custom rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#F5A524]" />

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-border-custom pb-4 mb-6">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-xs font-mono font-bold text-[#F5A524] bg-[#F5A524]/10 px-2 py-0.5 rounded border border-[#F5A524]/20">
                    {activeNcr.id}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    activeNcr.severity === 'Critical' ? 'bg-status-critical/10 text-status-critical border border-status-critical/20' :
                    activeNcr.severity === 'High' ? 'bg-status-warn/10 text-status-warn border border-status-warn/20' :
                    'bg-status-info/10 text-status-info border border-status-info/20'
                  }`}>
                    {activeNcr.severity.toUpperCase()}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    activeNcr.status === 'Resolved' ? 'bg-status-ok/10 text-status-ok border border-status-ok/20' :
                    activeNcr.status === 'In Progress' ? 'bg-status-info/10 text-status-info border border-status-info/20' :
                    'bg-status-warn/10 text-status-warn border border-status-warn/20'
                  }`}>
                    {activeNcr.status.toUpperCase()}
                  </span>
                </div>
                
                <h1 className="font-display text-xl md:text-2xl font-bold text-text-primary tracking-tight">
                  Defect Vector: {activeNcr.defectType}
                </h1>
                
                <p className="text-xs text-text-secondary mt-1 flex items-center space-x-2">
                  <Cpu className="w-3.5 h-3.5 text-accent" />
                  <span>Equipment Ref: <a href={`#equipment?tag=${activeNcr.equipment}`} className="text-text-primary font-bold font-mono hover:underline">{activeNcr.equipment}</a></span>
                  <span>•</span>
                  <span>Logged on: <span className="text-text-primary font-semibold font-mono">{activeNcr.date}</span></span>
                  <span>•</span>
                  <span>Lead Investigator: <span className="text-primary font-semibold">{activeNcr.operator}</span></span>
                </p>
              </div>

              {/* Status and Delete Actions */}
              <div className="flex items-center space-x-2">
                <Select
                  value={activeNcr.status}
                  onValueChange={(v) => handleUpdateNcrStatus(activeNcr.id, v as any)}
                  options={[
                    { value: 'Open', label: 'OPEN STATUS' },
                    { value: 'In Progress', label: 'IN PROGRESS' },
                    { value: 'Resolved', label: 'RESOLVED' },
                  ]}
                  className="px-3 py-1.5 text-xs font-mono"
                />

                <button
                  onClick={() => handleDeleteNcr(activeNcr.id)}
                  className="p-1.5 rounded border border-status-critical/30 hover:bg-status-critical/10 text-status-critical cursor-pointer"
                  title="Delete Record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left 2 Columns: Description and CAPA checklist */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-background-custom/40 border border-border-custom rounded-lg p-5">
                  <h3 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider mb-2.5">
                    Anomalous Defect Findings
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed font-sans">
                    {activeNcr.description}
                  </p>

                  {activeNcr.docName && (
                    <div className="mt-4 flex items-center space-x-2 p-2 bg-surface rounded border border-border-custom max-w-sm">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-xs text-text-primary font-mono truncate">{activeNcr.docName}</span>
                      <a 
                        href={activeNcr.docLink}
                        className="text-[10px] text-primary hover:underline ml-auto font-mono font-bold"
                      >
                        OPEN LINK
                      </a>
                    </div>
                  )}
                </div>

                {/* Interactive CAPA list */}
                <div className="bg-surface border border-border-custom rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-border-custom pb-2">
                    <h3 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider flex items-center space-x-2">
                      <ListTodo className="w-4 h-4 text-primary" />
                      <span>Corrective and Preventive Action (CAPA) Checklist</span>
                    </h3>
                    <span className="text-[10px] font-mono text-text-muted">
                      Completeness: {activeNcr.capaChecklist.filter(c => c.isCompleted).length}/{activeNcr.capaChecklist.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeNcr.capaChecklist.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleToggleCapaItem(activeNcr.id, item.id)}
                        className={`w-full text-left p-3 rounded border text-xs font-sans flex items-center space-x-3 cursor-pointer transition-all ${
                          item.isCompleted 
                            ? 'bg-status-ok/5 border-status-ok/25 text-text-secondary line-through' 
                            : 'bg-background-custom/30 border-border-custom text-text-primary hover:border-primary'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          item.isCompleted ? 'bg-status-ok border-status-ok text-white' : 'border-text-muted'
                        }`}>
                          {item.isCompleted && <Check className="w-3 h-3" />}
                        </div>
                        <span className="flex-1 leading-snug">{item.task}</span>
                      </button>
                    ))}
                  </div>

                  {/* Add CAPA step input */}
                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="text"
                      placeholder="Add critical engineering check to CAPA guidelines..."
                      value={newCapaText}
                      onChange={(e) => setNewCapaText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddCapaItem(activeNcr.id); }}
                      className="flex-1 bg-background-custom border border-border-custom rounded p-2 text-xs text-text-primary focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => handleAddCapaItem(activeNcr.id)}
                      className="px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-bold flex items-center space-x-1 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ADD CHECK</span>
                    </button>
                  </div>

                </div>

              </div>

              {/* Right Column: Asset Details Link, AI Insight, Recommendations */}
              <div className="space-y-6">
                
                <div className="bg-surface border border-border-custom rounded-lg p-4 space-y-3">
                  <span className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
                    Equipment Lifecycle Details
                  </span>
                  <div className="p-3.5 bg-background-custom/40 border border-border-custom rounded font-sans text-xs space-y-2">
                    <p className="text-text-primary font-semibold">Machinery Ref: {activeNcr.equipment}</p>
                    <p className="text-text-secondary leading-relaxed">This unit is mapped to refinery sector Block A. Continuous mechanical tracking and localized vibration logs are available.</p>
                    <button
                      onClick={() => { window.location.hash = `#equipment?tag=${activeNcr.equipment}`; }}
                      className="text-[11px] text-primary hover:underline font-mono font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Access Equipment 360° Portal</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Emerging quality pattern link */}
                <div className="bg-surface border border-border-custom rounded-lg p-4 space-y-3">
                  <span className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>AI Pattern Cross-Reference</span>
                  </span>
                  
                  <div className="p-3.5 bg-primary/5 border border-primary/10 rounded font-sans text-xs space-y-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono text-[9px] font-bold text-primary bg-primary/10 px-1 rounded">LL-2041</span>
                      <span className="font-semibold text-text-primary">Monsoon Startup Pattern</span>
                    </div>
                    <p className="text-text-secondary text-[11px] leading-relaxed">
                      Core AI correlates this seal leak directly with historical cluster failure Mode LL-2041. Review winter/monsoon moisture purging steps to avoid recurrences.
                    </p>
                    <button
                      onClick={() => { window.location.hash = '#lessons-learned/LL-2041'; }}
                      className="w-full py-2 bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 text-xs font-mono font-bold cursor-pointer transition-colors flex items-center justify-center space-x-1"
                    >
                      <span>Jump to Lessons Learned</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      ) : (
        /* ==================== REGISTER & TRENDS TABS ==================== */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4 gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
                <ShieldAlert className="w-6.5 h-6.5 text-[#F5A524] animate-pulse" />
                <span>Quality Management Command</span>
              </h1>
              <p className="text-xs text-text-secondary mt-1">
                Establish rigorous non-conformance records, assign corrective preventative actions (CAPAs), and track system-wide defect analytics.
              </p>
            </div>

            {/* Hub tabs */}
            <div className="flex bg-surface p-1 rounded border border-border-custom text-xs self-start">
              <button
                onClick={() => { window.location.hash = '#quality'; }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'register' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                NCR Register ({ncrs.length})
              </button>
              <button
                onClick={() => { window.location.hash = '#quality/trends'; }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'trends' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Defect & Quality Trends
              </button>
            </div>
          </div>

          {activeTab === 'register' ? (
            /* REGISTER SUBVIEW */
            <div className="space-y-4">
              
              {/* Filter controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-surface p-4 border border-border-custom rounded-lg">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search NCR records, equipment tags, defects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-background-custom border border-border-custom rounded p-2 pl-8.5 text-xs text-text-primary focus:outline-none focus:border-primary placeholder-text-muted"
                  />
                  <Filter className="w-4 h-4 text-text-muted absolute left-2.5 top-2.5" />
                </div>

                <div>
                  <Select
                    value={selectedSeverity}
                    onValueChange={(v) => setSelectedSeverity(v)}
                    options={[
                      { value: 'all', label: '-- All Severity Levels --' },
                      { value: 'Critical', label: 'Critical' },
                      { value: 'High', label: 'High' },
                      { value: 'Medium', label: 'Medium' },
                      { value: 'Low', label: 'Low' },
                    ]}
                    className="w-full p-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <Select
                    value={selectedStatus}
                    onValueChange={(v) => setSelectedStatus(v)}
                    options={[
                      { value: 'all', label: '-- All Status Types --' },
                      { value: 'Open', label: 'Open' },
                      { value: 'In Progress', label: 'In Progress' },
                      { value: 'Resolved', label: 'Resolved' },
                    ]}
                    className="w-full p-2 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Register Table */}
              <div className="bg-surface border border-border-custom rounded-lg overflow-hidden">
                <div className="p-3 border-b border-border-custom bg-surface-muted/30 font-mono text-[10px] text-text-muted uppercase tracking-wider flex justify-between">
                  <span>Non-Conformance Record Catalog [ACTIVE]</span>
                  <span>Results matched: {filteredNcrs.length}</span>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] text-text-muted uppercase font-mono">
                        <th className="p-3">NCR Code</th>
                        <th className="p-3">Equipment</th>
                        <th className="p-3">Defect Description</th>
                        <th className="p-3">Severity</th>
                        <th className="p-3">Investigator</th>
                        <th className="p-3">Date Mapped</th>
                        <th className="p-3">CAPA Progress</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-custom/50 text-text-secondary">
                      {filteredNcrs.map((n) => {
                        const totalCapa = n.capaChecklist.length;
                        const doneCapa = n.capaChecklist.filter(c => c.isCompleted).length;
                        const pctCapa = totalCapa > 0 ? Math.round((doneCapa / totalCapa) * 100) : 0;

                        return (
                          <tr 
                            key={n.id} 
                            onClick={() => { window.location.hash = `#quality/ncr/${n.id}`; }}
                            className="hover:bg-background-custom/30 transition-colors cursor-pointer group"
                          >
                            <td className="p-3 font-mono font-bold text-text-primary select-all">{n.id}</td>
                            <td className="p-3 font-mono text-accent">{n.equipment}</td>
                            <td className="p-3 font-sans text-text-primary">
                              <span className="block font-semibold">{n.defectType}</span>
                              <span className="block text-[11px] text-text-muted truncate max-w-xs">{n.description}</span>
                            </td>
                            <td className="p-3">
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                n.severity === 'Critical' ? 'bg-status-critical/10 text-status-critical' :
                                n.severity === 'High' ? 'bg-status-warn/10 text-status-warn' :
                                'bg-status-info/10 text-status-info'
                              }`}>
                                {n.severity}
                              </span>
                            </td>
                            <td className="p-3 font-medium">{n.operator}</td>
                            <td className="p-3 font-mono text-text-muted">{n.date}</td>
                            <td className="p-3">
                              <div className="flex items-center space-x-2">
                                <div className="w-16 bg-surface-muted h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary" 
                                    style={{ width: `${pctCapa}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[10px] text-text-muted">{doneCapa}/{totalCapa}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex items-center w-2 h-2 rounded-full mr-1 ${
                                n.status === 'Resolved' ? 'bg-status-ok' :
                                n.status === 'In Progress' ? 'bg-status-info' : 'bg-status-warn'
                              }`} />
                              <span className="font-mono text-[10px] text-text-primary">{n.status}</span>
                            </td>
                            <td className="p-3 text-right">
                              <button className="p-1.5 rounded hover:bg-primary/10 text-text-muted group-hover:text-primary transition-colors">
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ==================== QUALITY TRENDS ANALYSIS ==================== */
            <div className="space-y-6">
              
              {/* Emerging Quality Pattern AI Card (mock-only fabricated insight) */}
              {USE_MOCK && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Sparkles className="w-32 h-32 text-primary" />
                </div>

                <div className="flex items-start space-x-3.5 relative z-10">
                  <div className="p-2 bg-primary/15 rounded text-primary border border-primary/30">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono font-bold text-primary tracking-wider uppercase block">Emerging Quality Pattern Diagnostic [AI Core]</span>
                    <h3 className="text-sm font-bold text-text-primary leading-tight">Mechanical Seal Failures Cluster Identified Near Monsoon Startup Thresholds</h3>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-4xl pt-1">
                      Data analytics crossed <span className="text-text-primary font-semibold">18 active seal ruptures</span> in the Pareto database and highlighted a sharp <span className="text-text-primary font-semibold">42% surge</span> during high-humidity seasonal startup sequences. This pattern traces directly to particulate hydration in external buffer fluid.
                    </p>
                    <div className="pt-3">
                      <button
                        onClick={() => { window.location.hash = '#lessons-learned/LL-2041'; }}
                        className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
                      >
                        <span>Cross-Examine Lesson LL-2041</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Pareto and Trend charts side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Defect Pareto Chart */}
                <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider">Defect Category Pareto Principle Analysis</h3>
                    <p className="text-[11px] text-text-secondary">Pareto distribution charting total frequency counts against cumulative percentages.</p>
                  </div>

                  <div className="h-80 w-full bg-background-custom/30 rounded border border-border-custom/40 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={paretoData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222d36" />
                        <XAxis dataKey="defect" stroke="#687b8d" fontSize={10} />
                        <YAxis yAxisId="left" label={{ value: 'Incident Frequency', angle: -90, position: 'insideLeft', fill: '#687b8d', fontSize: 10 }} stroke="#687b8d" fontSize={10} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fill: '#687b8d', fontSize: 10 }} stroke="#687b8d" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar yAxisId="left" dataKey="count" name="Defect Counts" fill="#0E7C86" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke="#F5A524" strokeWidth={2} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Line deviation rate trends chart */}
                <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider">Monthly Deviation Rates by Refinery Line</h3>
                    <p className="text-[11px] text-text-secondary">Percentage of components showing deviations during weekly safety checks.</p>
                  </div>

                  <div className="h-80 w-full bg-background-custom/30 rounded border border-border-custom/40 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222d36" />
                        <XAxis dataKey="month" stroke="#687b8d" fontSize={10} />
                        <YAxis label={{ value: 'Deviation Rate %', angle: -90, position: 'insideLeft', fill: '#687b8d', fontSize: 10 }} stroke="#687b8d" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="Line A (Refinery)" stroke="#0E7C86" strokeWidth={2.5} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Line B (Gas Terminal)" stroke="#F5A524" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
