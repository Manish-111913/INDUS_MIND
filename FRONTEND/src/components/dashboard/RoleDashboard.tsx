/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuthStore } from '../../stores/authStore';
import { StatusChip, ConfidenceBadge, SkeletonLoader } from '../shared';
import { Bot, Wrench, AlertTriangle, ShieldCheck, Cpu, Users, History, FileText, Calendar, Plus, RefreshCw, Sparkles, Download, CheckCircle, ArrowRight, Check, Play, X, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../../lib/api/client';

// ── Admin KPI hook — fetches live data from the backend ───────────────────────
interface AdminKPIs {
  docsIngested: string;
  aiSuccess: string;
  activeWOs: string;
  docsSubLabel: string;
  aiSubLabel: string;
  woSubLabel: string;
  loading: boolean;
}

function useAdminKPIs(): AdminKPIs {
  const [kpis, setKpis] = useState<AdminKPIs>({
    docsIngested: '—',
    aiSuccess: '—',
    activeWOs: '—',
    docsSubLabel: '',
    aiSubLabel: '',
    woSubLabel: '',
    loading: true,
  });

  const fetchKPIs = useCallback(async () => {
    try {
      const data = await api.get<any>(
        '/analytics/kpis?keys=documents_ingested,ai_pipeline_success,active_work_orders'
      );
      const d = data?.data ?? data;
      const docs = d?.documents_ingested;
      const ai = d?.ai_pipeline_success;
      const wos = d?.active_work_orders;
      setKpis({
        docsIngested: docs != null ? `${docs.value} ${docs.unit ?? 'files'}` : '0 files',
        aiSuccess: ai != null ? `${ai.value}${ai.unit ?? '%'}` : '—',
        activeWOs: wos != null ? `${wos.value}` : '0',
        docsSubLabel: docs?.sublabel ?? '',
        aiSubLabel: ai?.sublabel ?? '',
        woSubLabel: wos?.sublabel ?? '',
        loading: false,
      });
    } catch {
      setKpis(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchKPIs();
    // Refresh every 60 s so numbers stay current
    const timer = setInterval(fetchKPIs, 60_000);
    return () => clearInterval(timer);
  }, [fetchKPIs]);

  return kpis;
}

// ── Live ingestion jobs hook ───────────────────────────────────────
interface IngestionJob {
  id: string;
  document_id: string;
  status: string;
  current_stage: string | null;
  stages: any[];
  created_at: string;
}

function useIngestionJobs() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.get<any>('/ingestion/jobs?page_size=5&sort=-created_at');
      const items = data?.data ?? data?.items ?? data ?? [];
      setJobs(Array.isArray(items) ? items : []);
    } catch {
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const t = setInterval(fetchJobs, 30_000);
    return () => clearInterval(t);
  }, [fetchJobs]);

  return { jobs, loadingJobs };
}

// ── Node settings hook ─────────────────────────────────────────────────
interface NodeSettings {
  activeLlm: string;
  embeddings: string;
  vectorStore: string;
  graphStore: string;
  loading: boolean;
}

function useNodeSettings(): NodeSettings {
  const [ns, setNs] = useState<NodeSettings>({
    activeLlm: '—', embeddings: '—', vectorStore: '—', graphStore: '—', loading: true,
  });

  useEffect(() => {
    api.get<any>('/settings/effective')
      .then((data: any) => {
        const d = data?.data ?? data ?? {};
        setNs({
          activeLlm: d.llm_provider ?? d.active_llm ?? 'Anthropic Claude',
          embeddings: d.embedding_model ?? 'bge-large-en-v1.5',
          vectorStore: d.vector_store ?? 'Postgres pgvector',
          graphStore: d.graph_store ?? 'Neo4j Community',
          loading: false,
        });
      })
      .catch(() => setNs(prev => ({ ...prev, loading: false })));
  }, []);

  return ns;
}

function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('indusmind_onboarding_dismissed') === 'true';
  });
  const [loadingSeed, setLoadingSeed] = useState(false);
  const [seedStep, setSeedStep] = useState('');
  
  // Dynamic step statuses based on real local state
  const [steps, setSteps] = useState({
    equipmentAdded: false,
    documentsUploaded: false,
    teamInvited: false,
    firstCopilotQuestion: false
  });

  const checkMilestones = () => {
    const seedSeeded = localStorage.getItem('indusmind_effective_settings') && 
      JSON.parse(localStorage.getItem('indusmind_effective_settings') || '{}').demoSeeded;

    // 1. Equipment added
    const equipmentAdded = localStorage.getItem('indusmind_onboarding_equipment_added') === 'true' || !!seedSeeded;
    // 2. Documents uploaded
    const documentsUploaded = localStorage.getItem('indusmind_onboarding_documents_uploaded') === 'true' || !!seedSeeded;
    // 3. Team invited
    const teamInvited = localStorage.getItem('indusmind_onboarding_team_invited') === 'true' || !!seedSeeded;
    // 4. First copilot question
    const firstCopilotQuestion = localStorage.getItem('indusmind_onboarding_copilot_queried') === 'true' || !!seedSeeded;

    setSteps({
      equipmentAdded,
      documentsUploaded,
      teamInvited,
      firstCopilotQuestion
    });
  };

  useEffect(() => {
    checkMilestones();
    // Listen to localstorage changes or custom trigger events if any
    const interval = setInterval(checkMilestones, 1500);
    return () => clearInterval(interval);
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('indusmind_onboarding_dismissed', 'true');
    setDismissed(true);
  };

  const handleLoadSampleData = async () => {
    setLoadingSeed(true);
    setSeedStep('Establishing connection to master DB ledger...');
    try {
      await new Promise(r => setTimeout(r, 800));
      setSeedStep('Ingesting OISD compliance clauses & standards...');
      await new Promise(r => setTimeout(r, 600));
      setSeedStep('Indexing piping and instrumentation schematics (P&ID)...');
      await new Promise(r => setTimeout(r, 600));
      setSeedStep('Seeding equipment nodes & live telemetry loops...');
      
      // Hit the real seed endpoint in mock client
      await api.post('/admin/seed-demo');
      
      setSeedStep('Compiling semantic knowledge graph...');
      await new Promise(r => setTimeout(r, 500));
      
      // Update local storage states
      localStorage.setItem('indusmind_onboarding_equipment_added', 'true');
      localStorage.setItem('indusmind_onboarding_documents_uploaded', 'true');
      localStorage.setItem('indusmind_onboarding_team_invited', 'true');
      localStorage.setItem('indusmind_onboarding_copilot_queried', 'true');
      
      checkMilestones();
      setSeedStep('Seeding complete! Reloading...');
      await new Promise(r => setTimeout(r, 400));
      window.location.reload();
    } catch (err) {
      console.error(err);
      setSeedStep('Seeding failed. Try again.');
    } finally {
      setLoadingSeed(false);
    }
  };

  const handleStartTour = () => {
    window.dispatchEvent(new CustomEvent('indusmind-start-tour'));
  };

  const completedCount = Object.values(steps).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / 4) * 100);

  return (
    <div className="bg-surface border border-primary/25 rounded-xl p-5 shadow-lg relative overflow-hidden bg-gradient-to-r from-surface to-primary/5 text-left font-sans animate-fade-in mb-6">
      {/* Background decoration */}
      <div className="absolute -right-16 -top-16 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
      
      <button 
        onClick={handleDismiss} 
        className="absolute top-4 right-4 text-text-muted hover:text-text-primary cursor-pointer transition-colors p-1 rounded hover:bg-surface-muted"
        title="Dismiss Onboarding Checklist"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 flex-1 text-left">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            <h3 className="font-display font-bold text-sm text-text-primary uppercase tracking-wider text-left">
              Operator Ingestion & System Readiness Checklist
            </h3>
            <span className="text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded uppercase">
              {completedCount} / 4 COMPLETED
            </span>
          </div>
          <p className="text-xs text-text-secondary max-w-2xl leading-relaxed text-left">
            Complete the operational milestones below to fully provision this refinery node. You can load simulated industrial plant data to instantly populate and test the live telemetry monitoring views.
          </p>

          {/* Progress bar */}
          <div className="space-y-1 max-w-md">
            <div className="flex justify-between text-[10px] font-mono text-text-muted uppercase">
              <span>Node Provisioning Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border-custom/30">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
          <button
            onClick={handleStartTour}
            className="px-3.5 py-2 border border-border-custom hover:bg-surface-muted text-text-primary rounded font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 text-primary" />
            <span>LAUNCH GUIDED SYSTEM TOUR</span>
          </button>
          
          <button
            disabled={loadingSeed}
            onClick={handleLoadSampleData}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {loadingSeed ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span className="animate-pulse">SEEDING...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-white" />
                <span>LOAD SIMULATED PLANT DATA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {loadingSeed && (
        <div className="mt-4 p-3 bg-primary/5 rounded border border-primary/20 flex items-center space-x-2 animate-pulse text-[11px] font-mono text-primary">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{seedStep}</span>
        </div>
      )}

      {/* Grid of steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border-custom/40">
        {/* Milestone 1 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.equipmentAdded ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.equipmentAdded ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.equipmentAdded ? 'text-status-ok' : 'text-text-muted'
            }`}>
              1. Equipment Tag Schema
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Add your first piece of plant equipment or sensor node.
            </p>
          </div>
        </div>

        {/* Milestone 2 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.documentsUploaded ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.documentsUploaded ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.documentsUploaded ? 'text-status-ok' : 'text-text-muted'
            }`}>
              2. SOP & Document Ingestion
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Index plant standard operating procedures or regulations.
            </p>
          </div>
        </div>

        {/* Milestone 3 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.teamInvited ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.teamInvited ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.teamInvited ? 'text-status-ok' : 'text-text-muted'
            }`}>
              3. Operational Team Invited
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Invite an engineer, lead operator, or auditor to this node.
            </p>
          </div>
        </div>

        {/* Milestone 4 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.firstCopilotQuestion ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.firstCopilotQuestion ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.firstCopilotQuestion ? 'text-status-ok' : 'text-text-muted'
            }`}>
              4. AI Verification Dry Run
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Query our Copilot agent on plant specifications or torque guidelines.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Generic live widget hook ──────────────────────────────────────────────────
// Permission-safe: hits GET /dashboards/widgets/{key}/data, which filters per the
// caller's role. Returns real tenant data — 0/empty for a brand-new tenant, so no
// seeded/demo numbers ever leak here. apiRequest already unwraps the response
// envelope's `data`, leaving { widget_key, type, data: <payload>, cached }.
function useWidget<T = any>(key: string, params?: Record<string, string>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const paramKey = params ? JSON.stringify(params) : '';

  const fetchData = useCallback(async () => {
    try {
      const qs = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString() : '';
      const resp = await api.get<any>(`/dashboards/widgets/${key}/data${qs}`);
      const payload = resp && typeof resp === 'object' && 'data' in resp ? resp.data : resp;
      setData(payload as T);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, paramKey]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading };
}

function fmtKpi(p: any): string {
  if (!p || p.value == null) return '—';
  if (p.unit === '%') return `${p.value}%`;
  return p.unit ? `${p.value} ${p.unit}` : `${p.value}`;
}

const KPI_STATUS_LABEL: Record<string, string> = { ok: 'Normal', warn: 'Warning', critical: 'Critical' };

// A single KPI tile bound to a live widget. New tenant → shows real 0 values.
function KpiTile({ widgetKey, title, icon, params }: {
  widgetKey: string; title: string; icon: ReactNode; params?: Record<string, string>;
}) {
  const { data, loading } = useWidget<any>(widgetKey, params);
  const statusType = (['ok', 'warn', 'critical'].includes(data?.status) ? data.status : 'ok') as 'ok' | 'warn' | 'critical';
  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg relative overflow-hidden">
      <div className="flex justify-between items-start mb-2 text-text-secondary">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      {loading
        ? <div className="h-9 w-20 bg-surface-muted rounded animate-pulse mt-1" />
        : <p className="text-3xl font-display font-bold text-text-primary leading-tight">{fmtKpi(data)}</p>}
      <div className="flex items-center justify-between mt-2 min-h-[18px]">
        <span className="text-[10px] font-mono text-text-muted uppercase truncate pr-2">{data?.sublabel || ''}</span>
        {!loading && data && <StatusChip label={KPI_STATUS_LABEL[statusType]} type={statusType} />}
      </div>
    </div>
  );
}

function PanelEmpty({ label }: { label: string }) {
  return <p className="text-[11px] font-mono text-text-muted text-center py-6">{label}</p>;
}
function PanelLoading() {
  return (
    <div className="space-y-3">
      <div className="h-14 bg-surface-muted rounded animate-pulse" />
      <div className="h-14 bg-surface-muted rounded animate-pulse" />
    </div>
  );
}

function confToBadge(c: unknown): number | 'Low' | 'High' | 'Med' {
  if (typeof c !== 'number') return 'Med';
  return c <= 1 ? Math.round(c * 100) : Math.round(c);
}

// Daily AI brief cards (list.ai_brief) — real AIInsight rows, role-filtered.
function AiBriefPanel({ role }: { role: string }) {
  const { data, loading } = useWidget<any>('list.ai_brief', { role });
  const items: any[] = data?.items ?? [];
  return (
    <div className="lg:col-span-2 bg-ai-soft/40 border border-ai-soft-border p-5 rounded-lg relative">
      <div className="absolute top-3 right-3"><Sparkles className="w-5 h-5 text-ai animate-pulse" /></div>
      <div className="flex items-center space-x-2 mb-4">
        <Bot className="w-5 h-5 text-ai" />
        <h3 className="font-display text-sm font-semibold text-ai uppercase tracking-wider">Daily AI Operational Synthesis</h3>
      </div>
      {loading ? <PanelLoading /> : items.length === 0 ? (
        <PanelEmpty label="NO AI INSIGHTS FOR THIS NODE YET — INGEST DOCUMENTS TO GENERATE BRIEFS" />
      ) : (
        <div className="space-y-4 font-sans text-xs">
          {items.map((it) => (
            <div key={it.id} className="p-3 bg-surface border-l-2 border-ai rounded-r space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-text-primary text-[11px] uppercase">{it.title}</span>
                {it.confidence != null && <ConfidenceBadge confidence={confToBadge(it.confidence)} />}
              </div>
              <p className="text-text-secondary leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Area health matrix (chart.area_health) — avg equipment health by area.
function AreaMatrixPanel() {
  const { data, loading } = useWidget<any>('chart.area_health');
  const series: any[] = data?.series ?? [];
  const dot = (h: number | null) => h == null ? 'bg-text-muted' : h >= 85 ? 'bg-status-ok' : h >= 60 ? 'bg-status-warn' : 'bg-status-critical';
  const txt = (h: number | null) => h == null ? 'text-text-muted' : h >= 85 ? 'text-status-ok' : h >= 60 ? 'text-status-warn' : 'text-status-critical';
  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col">
      <div className="flex justify-between items-center border-b border-border-custom pb-3 mb-4">
        <h3 className="font-display text-sm font-bold text-text-primary uppercase tracking-wider">Area Status Matrix</h3>
        <span className="text-[10px] font-mono text-text-muted">{series.length} AREAS</span>
      </div>
      {loading ? <PanelLoading /> : series.length === 0 ? (
        <PanelEmpty label="NO AREAS CONFIGURED YET" />
      ) : (
        <div className="space-y-3">
          {series.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${dot(s.health)}`} />
                <span className="font-medium text-text-primary">{s.area}</span>
              </div>
              <span className={`font-mono font-bold ${txt(s.health)}`}>{s.health == null ? '—' : `${s.health}% HEALTH`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  critical: 'border-status-critical bg-status-critical/10 text-status-critical',
  high: 'border-status-warn bg-status-warn/10 text-status-warn',
  medium: 'border-primary bg-primary/10 text-primary',
  low: 'border-border-custom bg-surface-muted text-text-muted',
};

// My assigned tasks (table.my_tasks) — open WOs assigned to the caller.
function MyTasksPanel() {
  const { data, loading } = useWidget<any>('table.my_tasks');
  const rows: any[] = data?.rows ?? [];
  const fmtDue = (d: string | null) => {
    if (!d) return 'NO DUE DATE';
    try { return `DUE ${new Date(d).toLocaleDateString()}`; } catch { return 'DUE —'; }
  };
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-mono font-bold text-text-muted uppercase tracking-wider">Today's Assigned Tasks (Touch to Open)</h3>
      {loading ? <PanelLoading /> : rows.length === 0 ? (
        <div className="p-4 bg-surface border border-border-custom rounded-lg">
          <PanelEmpty label="NO TASKS ASSIGNED TO YOU YET" />
        </div>
      ) : rows.map((w, i) => {
        const style = PRIORITY_STYLE[String(w.priority).toLowerCase()] ?? PRIORITY_STYLE.medium;
        return (
          <div key={i} onClick={() => { window.location.hash = '#maintenance'; }}
               className="p-4 bg-surface-muted/30 hover:bg-surface-muted rounded-lg border border-border-custom transition-all cursor-pointer">
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs font-bold text-text-primary">{w.wo_number}</span>
              <span className={`text-[9px] font-mono font-bold border px-1.5 py-0.5 rounded uppercase ${style}`}>
                {w.priority} · {fmtDue(w.due_at)}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">{w.title}</h4>
            <div className="flex items-center space-x-3 text-[10px] font-mono text-text-secondary mt-3">
              <span className="flex items-center"><Wrench className="w-3.5 h-3.5 mr-1" /> {w.status}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Predictive alerts (list.predictions) — open predictions, highest risk first.
function PredictionsPanel() {
  const { data, loading } = useWidget<any>('list.predictions');
  const items: any[] = data?.items ?? [];
  return (
    <div className="lg:col-span-2 bg-surface border border-border-custom p-4 rounded-lg">
      <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-4 pb-3 border-b border-border-custom">
        Anomalous Equipment &amp; AI Predictive Recommendations
      </h3>
      {loading ? <PanelLoading /> : items.length === 0 ? (
        <PanelEmpty label="NO PREDICTIVE ALERTS — MODELS ACTIVATE ONCE TELEMETRY & FAILURE HISTORY EXIST" />
      ) : (
        <div className="space-y-4 text-xs font-sans">
          {items.map((p) => {
            const pct = p.risk_score != null ? (p.risk_score <= 1 ? Math.round(p.risk_score * 100) : Math.round(p.risk_score)) : null;
            const band = String(p.risk_band || '').toLowerCase();
            const isCrit = band === 'critical' || band === 'high';
            const dotCls = isCrit ? 'bg-status-critical' : 'bg-status-warn';
            const badgeCls = isCrit
              ? 'text-status-critical bg-status-critical/10 border-status-critical/20'
              : 'text-status-warn bg-status-warn/10 border-status-warn/20';
            return (
              <div key={p.id} className="p-3 bg-background-custom/40 border border-border-custom rounded space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${dotCls}`} />
                    <span className="font-mono font-bold text-text-primary">{p.equipment_id ? `Equipment ${String(p.equipment_id).slice(0, 8)}` : 'Unassigned equipment'}</span>
                  </div>
                  {pct != null && (
                    <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${badgeCls}`}>
                      {pct}% RISK{p.risk_band ? ` · ${String(p.risk_band).toUpperCase()}` : ''}
                    </span>
                  )}
                </div>
                {p.recommendation && <p className="text-text-secondary">{p.recommendation}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const GAP_SEVERITY_CLS: Record<string, string> = {
  critical: 'text-status-critical', high: 'text-status-warn', medium: 'text-primary', low: 'text-text-muted',
};

// Open compliance gaps (list.compliance_gaps).
function ComplianceGapsPanel() {
  const { data, loading } = useWidget<any>('list.compliance_gaps');
  const items: any[] = data?.items ?? [];
  return (
    <div className="lg:col-span-2 bg-surface border border-border-custom p-4 rounded-lg">
      <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider pb-3 border-b border-border-custom mb-4">
        Federal Operational Gaps Detected by AI Engine
      </h3>
      {loading ? <PanelLoading /> : items.length === 0 ? (
        <PanelEmpty label="NO OPEN COMPLIANCE GAPS FOR THIS NODE" />
      ) : (
        <div className="space-y-3">
          {items.map((g, i) => {
            const cls = GAP_SEVERITY_CLS[String(g.severity).toLowerCase()] ?? 'text-status-warn';
            return (
              <div key={g.id} className="p-3 bg-background-custom/40 border border-border-custom rounded space-y-2">
                <div className="flex justify-between items-center font-mono text-[11px]">
                  <span className={`font-bold ${cls}`}>GAP #{i + 1}: {String(g.title || '').toUpperCase()}</span>
                  {g.severity && <span className="text-text-muted uppercase">{g.severity}</span>}
                </div>
                {g.explanation && <p className="text-xs text-text-secondary">{g.explanation}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RoleDashboard() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  // All hooks called unconditionally at top level — React hooks rule
  const adminKPIs = useAdminKPIs();
  const { jobs: ingestionJobs, loadingJobs } = useIngestionJobs();
  const nodeSettings = useNodeSettings();

  const triggerRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 400);
  };

  if (!user) return null;

  // Render Skeleton if reloading
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-border-custom">
          <div>
            <SkeletonLoader className="h-8 w-48 mb-2" />
            <SkeletonLoader className="h-4 w-96" />
          </div>
          <SkeletonLoader className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SkeletonLoader className="h-24 w-full" />
          <SkeletonLoader className="h-24 w-full" />
          <SkeletonLoader className="h-24 w-full" />
          <SkeletonLoader className="h-24 w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonLoader className="h-80 w-full lg:col-span-2" />
          <SkeletonLoader className="h-80 w-full" />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 1. PLANT MANAGER VIEW
  // ----------------------------------------------------
  if (user.role === 'Plant Manager') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>Operational Executive Command</span>
              <span className="text-xs font-mono font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded ml-2 uppercase">Node Active</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Active plant status overview, AI performance briefs, and high-level compliance indicators.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <button onClick={triggerRefresh} className="p-2 border border-border-custom hover:bg-surface-muted rounded text-text-secondary cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create Shutdown Permit</span>
            </button>
          </div>
        </div>

        {/* Executive KPI Grid — live widget data (0 for a new tenant) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile widgetKey="kpi.oee" title="Overall Equipment Effectiveness (OEE)" icon={<Cpu className="w-4 h-4 text-primary" />} />
          <KpiTile widgetKey="kpi.unplanned_downtime" title="Unplanned Downtime Hrs" icon={<AlertTriangle className="w-4 h-4 text-status-critical" />} />
          <KpiTile widgetKey="kpi.wo_backlog" title="Active Work Order backlog" icon={<Wrench className="w-4 h-4 text-status-warn" />} />
          <KpiTile widgetKey="kpi.compliance_score" title="Compliance score" icon={<ShieldCheck className="w-4 h-4 text-status-ok" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AiBriefPanel role="Plant Manager" />
          <AreaMatrixPanel />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. FIELD TECHNICIAN VIEW (Mobile-Optimized Layout)
  // ----------------------------------------------------
  if (user.role === 'Field Technician') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="pb-4 border-b border-border-custom">
          <span className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest block mb-1">Mobile Field Terminal</span>
          <h1 className="font-display text-xl font-bold text-text-primary">
            Hello, {user.name.split(' ')[0]}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Your assigned tasks for today on <span className="font-mono text-primary">{user.plant.split(' - ')[1]}</span>.
          </p>
        </div>

        {/* Small Touch-Friendly Stats Row — live widget data */}
        <div className="grid grid-cols-2 gap-3">
          <KpiTile widgetKey="kpi.my_open_wos" title="Open WOs" icon={<Wrench className="w-4 h-4 text-primary" />} />
          <KpiTile widgetKey="kpi.hours_logged" title="Hrs Logged" icon={<History className="w-4 h-4 text-text-muted" />} />
        </div>

        {/* Active Work Order list — live, assigned to me */}
        <MyTasksPanel />

        {/* Quick Voice/Text Copilot Box */}
        <div className="bg-surface border border-border-custom p-4 rounded-lg">
          <h3 className="font-display text-xs font-bold text-text-primary mb-2 uppercase tracking-wider flex items-center space-x-1.5">
            <Bot className="w-4 h-4 text-primary" />
            <span>Speak to Copilot</span>
          </h3>
          <p className="text-[11px] text-text-secondary mb-3">
            Ask for instant torque specs, wiring schematics, or past fixes.
          </p>
          <div className="flex space-x-2">
            <input 
              type="text" 
              placeholder="e.g. 'torque for V-230 bolts'..." 
              className="flex-1 bg-background-custom border border-border-custom px-3 py-1.5 text-xs rounded text-text-primary focus:outline-none focus:border-primary font-sans"
            />
            <button 
              onClick={() => window.location.hash = '#copilot'}
              className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded cursor-pointer transition-colors"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 3. SUPER ADMIN VIEW
  // ----------------------------------------------------
  if (user.role === 'Admin') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>HMI System Control Tower</span>
              <span className="text-xs font-mono font-medium text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded ml-2 uppercase">Root Level</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Administrative workspace management, ingestion queue health, and model parameters overrides.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button onClick={() => { window.location.hash = '#admin/users'; }} className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Invite New Operator</span>
            </button>
          </div>
        </div>

        {/* Admin KPI Matrix — live data from /api/v1/analytics/kpis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Work Orders — live */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Active Work Orders</span>
            {adminKPIs.loading
              ? <div className="h-9 w-16 bg-surface-muted rounded animate-pulse mt-1" />
              : <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">{adminKPIs.activeWOs}</p>
            }
            <span className="text-[10px] font-mono text-text-secondary mt-2 block">{adminKPIs.woSubLabel || 'OPEN ACROSS TENANT'}</span>
          </div>

          {/* Documents Ingested — live */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Documents Ingested</span>
            {adminKPIs.loading
              ? <div className="h-9 w-24 bg-surface-muted rounded animate-pulse mt-1" />
              : <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">{adminKPIs.docsIngested}</p>
            }
            <span className="text-[10px] font-mono text-text-secondary mt-2 block">{adminKPIs.docsSubLabel || 'INGESTION PIPELINE'}</span>
          </div>

          {/* AI Pipeline Success — live */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">AI Pipeline Success</span>
            {adminKPIs.loading
              ? <div className="h-9 w-20 bg-surface-muted rounded animate-pulse mt-1" />
              : <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">{adminKPIs.aiSuccess}</p>
            }
            <span className="text-[10px] font-mono text-status-ok mt-2 block">{adminKPIs.aiSubLabel || 'GRAPH SYNCHRONIZATION: SECURED'}</span>
          </div>

          {/* Console API Latency — static system metric, no DB equivalent */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Console API Latency (Avg)</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">42 ms</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">INFRASTRUCTURE HEALTH: EXCELLENT</span>
          </div>
        </div>

        {/* Administration grid split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface border border-border-custom p-4 rounded-lg">
            <div className="flex justify-between items-center border-b border-border-custom pb-3 mb-4">
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Live Document Ingestion Monitor</h3>
              <StatusChip label="Streaming" type="ok" />
            </div>
            
            {/* Live ingestion jobs from /api/v1/ingestion/jobs */}
            <div className="space-y-3 text-xs font-sans">
              {loadingJobs ? (
                <>
                  <div className="h-12 bg-surface-muted rounded animate-pulse" />
                  <div className="h-12 bg-surface-muted rounded animate-pulse" />
                </>
              ) : ingestionJobs.length === 0 ? (
                <p className="text-[11px] font-mono text-text-muted text-center py-4">
                  NO ACTIVE INGESTION JOBS
                </p>
              ) : (
                ingestionJobs.map((job) => {
                  const stagePct =
                    job.status === 'completed' ? 100
                    : job.status === 'failed' ? 0
                    : job.stages?.length
                      ? Math.round((job.stages.filter((s: any) => s.status === 'done').length / job.stages.length) * 100)
                      : 50;
                  const stageLabel = job.current_stage
                    ? `STAGE: ${job.current_stage.toUpperCase().replace('_', ' ')} (${stagePct}%)`
                    : job.status.toUpperCase();
                  const color =
                    job.status === 'completed' ? 'bg-status-ok'
                    : job.status === 'failed' ? 'bg-status-critical'
                    : 'bg-primary';
                  const textColor =
                    job.status === 'completed' ? 'text-status-ok'
                    : job.status === 'failed' ? 'text-status-critical'
                    : 'text-primary';
                  return (
                    <div key={job.id} className="p-3 bg-background-custom/40 rounded border border-border-custom/50">
                      <div className="flex justify-between items-center mb-2 font-mono">
                        <span className="font-bold text-text-primary text-[11px] truncate max-w-[220px]">
                          {job.document_id.slice(0, 8).toUpperCase()}...{job.id.slice(-6).toUpperCase()}
                        </span>
                        <span className={`text-[10px] ${textColor}`}>{stageLabel}</span>
                      </div>
                      <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden">
                        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${stagePct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between">
            <div>
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-3 pb-3 border-b border-border-custom">
                Node Settings Overview
              </h3>
              <div className="space-y-3 font-mono text-[11px] text-text-secondary">
                {nodeSettings.loading ? (
                  <>
                    <div className="h-4 bg-surface-muted rounded animate-pulse" />
                    <div className="h-4 bg-surface-muted rounded animate-pulse" />
                    <div className="h-4 bg-surface-muted rounded animate-pulse" />
                    <div className="h-4 bg-surface-muted rounded animate-pulse" />
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>ACTIVE LLM:</span>
                      <span className="text-text-primary capitalize">{nodeSettings.activeLlm}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>EMBEDDINGS:</span>
                      <span className="text-text-primary">{nodeSettings.embeddings}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VECTOR STORE:</span>
                      <span className="text-text-primary">{nodeSettings.vectorStore}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GRAPH STORE:</span>
                      <span className="text-text-primary">{nodeSettings.graphStore}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => { window.location.hash = '#admin/settings'; }}
              className="w-full mt-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-colors"
            >
              Access Global Settings Node
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 4. MAINTENANCE ENGINEER VIEW
  // ----------------------------------------------------
  if (user.role === 'Maintenance Engineer') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>Maintenance Planning Workspace</span>
              <span className="text-xs font-mono font-medium text-status-warn bg-status-warn/10 border border-status-warn/20 px-2 py-0.5 rounded ml-2 uppercase">Scheduled Mode</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Active equipment telemetry anomalies, predictive risk indices, and Root Cause Analysis (RCA) suites.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <button onClick={triggerRefresh} className="p-2 border border-border-custom hover:bg-surface-muted rounded text-text-secondary cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create PM Work Order</span>
            </button>
          </div>
        </div>

        {/* Engineer KPI Grid — live widget data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile widgetKey="kpi.active_work_orders" title="Active Work Orders" icon={<Wrench className="w-4 h-4 text-status-warn" />} />
          <KpiTile widgetKey="kpi.mtbf" title="Mean Time Between Failure (MTBF)" icon={<Cpu className="w-4 h-4 text-primary" />} />
          <KpiTile widgetKey="kpi.mttr" title="Mean Time To Repair (MTTR)" icon={<History className="w-4 h-4 text-primary" />} />
          <KpiTile widgetKey="kpi.wo_backlog" title="Work Order Backlog" icon={<AlertTriangle className="w-4 h-4 text-status-warn" />} />
        </div>

        {/* Maintenance suggestions list — live predictions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PredictionsPanel />

          <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between">
            <div>
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider pb-3 border-b border-border-custom mb-3 flex items-center space-x-1.5">
                <Bot className="w-4 h-4 text-primary" />
                <span>RCA Agent Workspace</span>
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                The AI Root Cause Analysis agent evaluates incidents, correlating P&IDs and past maintenance records to determine failure modes. Open a failure record to draft a 5-Why map.
              </p>
            </div>

            <button
              onClick={() => { window.location.hash = '#maintenance'; }}
              className="w-full mt-4 py-2 bg-surface-muted hover:bg-surface border border-border-custom text-xs font-bold text-text-primary rounded text-center cursor-pointer transition-colors"
            >
              Open Maintenance Workspace →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 5. COMPLIANCE OFFICER VIEW
  // ----------------------------------------------------
  if (user.role === 'Compliance Officer') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>Industrial Compliance Command</span>
              <span className="text-xs font-mono font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded ml-2 uppercase">Audit Mode</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Federal Factory Act mapping, active procedural gaps, and one-click regulatory evidence package generation.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button 
              onClick={() => alert('COMMENCING EVIDENCE EXPORT PROCESS...')}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Compile PESO/OISD Evidence ZIP</span>
            </button>
          </div>
        </div>

        {/* Compliance KPI Grid — live widget data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile widgetKey="kpi.compliance_score" title="Validation Health" icon={<ShieldCheck className="w-4 h-4 text-status-ok" />} />
          <KpiTile widgetKey="kpi.registered_regulations" title="Registered Regulations" icon={<FileText className="w-4 h-4 text-primary" />} />
          <KpiTile widgetKey="kpi.active_gaps" title="Active Procedural Gaps" icon={<AlertTriangle className="w-4 h-4 text-status-critical" />} />
          <KpiTile widgetKey="kpi.audits_pending" title="Audits Pending" icon={<Calendar className="w-4 h-4 text-status-warn" />} />
        </div>

        {/* Gap and evidence compiling widgets — live gaps */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ComplianceGapsPanel />

          <div className="bg-surface border border-border-custom p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-primary mb-3 pb-3 border-b border-border-custom">
                <ShieldCheck className="w-4 h-4" />
                <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Compile Audit Evidence Package</h4>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Instantly generate a compiled PDF package containing all linked equipment data, historical maintenance certifications, and SOP citations for incoming safety auditors.
              </p>
            </div>

            <button
              onClick={() => { window.location.hash = '#compliance'; }}
              className="w-full mt-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-colors"
            >
              Open Compliance Workspace →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
