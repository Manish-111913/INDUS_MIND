/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3, Calendar, FileText, Download, Mail, Check, Play,
  Plus, ArrowRight, Clock, ShieldAlert, Cpu, Network, RefreshCw,
  Search, Sliders, ChevronRight, BookmarkCheck, LayoutGrid, List
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { StatusChip, Select } from '../../shared';
import { api, USE_MOCK } from '../../../lib/api/client';

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: 'Operations' | 'Maintenance' | 'Compliance' | 'Knowledge';
  parametersSchema: {
    key: string;
    label: string;
    type: 'select' | 'date' | 'number';
    options?: string[];
    defaultValue: string | number;
  }[];
  chartType: 'bar' | 'line' | 'pie' | 'area';
  chartData: any[];
  tableHeaders: string[];
  tableRows: any[][];
  // LIVE-only: set when a report is sourced from the backend so rendering can
  // use a generic `{name,value}` chart series instead of the mock's fixed keys.
  live?: boolean;
  xKey?: string;
  yKey?: string;
  yLabel?: string;
}

// ---------------------------------------------------------------------------
// LIVE mappers: translate backend analytics shapes → the ReportDefinition UI
// model. Only used when USE_MOCK is false; MOCK mode never touches these.
//   GET /analytics/reports item  → { id, key, name, description, category,
//        params_schema[], chart_config{type,x,y}, required_permission }
//   POST /analytics/reports/{id}/run → { report{id,key,name}, columns[],
//        rows[{col:val}], row_count, charts{type,x,y}, params }
// ---------------------------------------------------------------------------
function mapCategory(c?: string): ReportDefinition['category'] {
  switch ((c || '').toLowerCase()) {
    case 'maintenance': return 'Maintenance';
    case 'compliance': return 'Compliance';
    case 'knowledge': return 'Knowledge';
    case 'operations': return 'Operations';
    default: return 'Operations';
  }
}

function mapParam(spec: any): ReportDefinition['parametersSchema'][number] {
  const t = String(spec?.type ?? '').toLowerCase();
  let type: 'select' | 'date' | 'number' = 'number';
  if (Array.isArray(spec?.options) && spec.options.length) type = 'select';
  else if (t === 'date') type = 'date';
  else if (t === 'int' || t === 'float' || t === 'number') type = 'number';
  else if (Array.isArray(spec?.options)) type = 'select';
  return {
    key: String(spec?.name ?? ''),
    label: String(spec?.label ?? spec?.name ?? ''),
    type,
    options: Array.isArray(spec?.options) ? spec.options.map(String) : undefined,
    defaultValue: spec?.default ?? '',
  };
}

function chartTypeOf(cc: any, fallback: ReportDefinition['chartType']): ReportDefinition['chartType'] {
  const t = cc?.type;
  return t === 'bar' || t === 'line' || t === 'pie' || t === 'area' ? t : fallback;
}

// A gallery entry (definition only — no data until a run is issued).
function mapReportDef(r: any): ReportDefinition {
  const cc = r?.chart_config || {};
  return {
    id: String(r?.id ?? ''),
    name: String(r?.name ?? r?.key ?? 'Report'),
    description: String(r?.description ?? ''),
    category: mapCategory(r?.category),
    parametersSchema: Array.isArray(r?.params_schema) ? r.params_schema.map(mapParam) : [],
    chartType: chartTypeOf(cc, 'bar'),
    chartData: [],
    tableHeaders: [],
    tableRows: [],
    live: true,
    xKey: cc?.x,
    yKey: cc?.y,
    yLabel: cc?.y ? String(cc.y) : 'Value',
  };
}

// Merge a run-result payload into an existing (gallery) definition.
function applyRun(def: ReportDefinition, res: any): ReportDefinition {
  const cols: string[] = Array.isArray(res?.columns) ? res.columns.map(String) : [];
  const rows: any[] = Array.isArray(res?.rows) ? res.rows : [];
  const cc = res?.charts || {};
  const xKey = cc?.x ?? def.xKey;
  const yKey = cc?.y ?? def.yKey;
  const isTable = cc?.type === 'table' || !xKey || !yKey;
  const chartData = isTable
    ? []
    : rows.map((row) => ({ name: String(row?.[xKey] ?? ''), value: Number(row?.[yKey] ?? 0) }));
  return {
    ...def,
    chartType: chartTypeOf(cc, def.chartType),
    xKey,
    yKey,
    yLabel: yKey ? String(yKey) : def.yLabel,
    chartData,
    tableHeaders: cols,
    tableRows: rows.map((row) => cols.map((c) => row?.[c])),
  };
}

const MOCK_REPORTS: ReportDefinition[] = [
  {
    id: 'rep-1',
    name: 'Downtime by Area',
    description: 'Tracks cumulative unplanned downtime minutes across distinct plant refinery blocks.',
    category: 'Operations',
    parametersSchema: [
      { key: 'area', label: 'Refinery Block Area', type: 'select', options: ['all', 'Crude Block', 'Cat Cracker', 'Utilities block'], defaultValue: 'all' },
      { key: 'startDate', label: 'Start Date', type: 'date', defaultValue: '2026-06-01' },
      { key: 'endDate', label: 'End Date', type: 'date', defaultValue: '2026-07-01' },
      { key: 'minDowntime', label: 'Min Downtime (mins)', type: 'number', defaultValue: 100 }
    ],
    chartType: 'bar',
    chartData: [
      { name: 'Crude Block', downtime: 840, color: '#0E7C86' },
      { name: 'Cat Cracker', downtime: 380, color: '#F5A524' },
      { name: 'Utilities block', downtime: 1210, color: '#E5484D' },
      { name: 'Storage Block', downtime: 180, color: '#2E9E5B' }
    ],
    tableHeaders: ['Block Area', 'Total Incidents', 'Primary Driver', 'Downtime (Mins)', 'Downtime Cost'],
    tableRows: [
      ['Utilities block', '4', 'Insulation degradation', '1210', '₹35L'],
      ['Crude Block', '7', 'Mechanical seal post-monsoon', '840', '₹42L'],
      ['Cat Cracker', '2', 'Impeller eye cavitation', '380', '₹18L'],
      ['Storage Block', '1', 'Flange weeping leakage', '180', '₹6L']
    ]
  },
  {
    id: 'rep-2',
    name: 'MTBF by Equipment Class',
    description: 'Displays the Mean Time Between Failures (MTBF) metric in hours, categorized by machinery class.',
    category: 'Maintenance',
    parametersSchema: [
      { key: 'class', label: 'Equipment Machinery Class', type: 'select', options: ['all', 'Centrifugal Pumps', 'Reciprocating Compressors', 'Valves'], defaultValue: 'all' },
      { key: 'minMtbf', label: 'Min MTBF Alert Limit', type: 'number', defaultValue: 200 }
    ],
    chartType: 'bar',
    chartData: [
      { name: 'Centrifugal Pumps', hours: 342, target: 400 },
      { name: 'Reciprocating Compressors', hours: 218, target: 300 },
      { name: 'Gate Valves', hours: 840, target: 600 },
      { name: 'Booster Boilers', hours: 1440, target: 1200 }
    ],
    tableHeaders: ['Machinery Class', 'Active Inventory', 'Target MTBF (Hrs)', 'Logged MTBF (Hrs)', 'Overhaul backlogs'],
    tableRows: [
      ['Centrifugal Pumps', '42 units', '400', '342', '6 open WOs'],
      ['Reciprocating Compressors', '12 units', '300', '218', '2 open WOs'],
      ['Gate Valves', '118 units', '600', '840', '1 open WO'],
      ['Booster Boilers', '4 units', '1200', '1440', '0 open WOs']
    ]
  },
  {
    id: 'rep-3',
    name: 'Compliance Gap Aging',
    description: 'Chronicles federal regulatory compliance gaps divided by lifecycle aging groups (days open).',
    category: 'Compliance',
    parametersSchema: [
      { key: 'severity', label: 'Severity filter', type: 'select', options: ['all', 'Critical', 'High', 'Medium', 'Low'], defaultValue: 'all' },
      { key: 'regulatoryBody', label: 'Regulatory Authority', type: 'select', options: ['all', 'OISD', 'PESO', 'Factory Act'], defaultValue: 'all' }
    ],
    chartType: 'area',
    chartData: [
      { name: '0-30 Days', gaps: 14, remediated: 12 },
      { name: '31-60 Days', gaps: 8, remediated: 10 },
      { name: '61-90 Days', gaps: 5, remediated: 4 },
      { name: '90+ Days', gaps: 2, remediated: 1 }
    ],
    tableHeaders: ['Aging Bracket', 'Total Active Gaps', 'Aged Risks Accepted', 'Aged Gaps Remediating', 'Breach Severity'],
    tableRows: [
      ['0-30 Days Open', '14', '2', '12', 'Medium'],
      ['31-60 Days Open', '8', '3', '5', 'High'],
      ['61-90 Days Open', '5', '4', '1', 'High / Critical'],
      ['90+ Days Open', '2', '2', '0', 'Critical']
    ]
  },
  {
    id: 'rep-4',
    name: 'Knowledge Coverage Metrics',
    description: 'Tracks the portion of ingested refinery data successfully resolved into mapped vector coordinates.',
    category: 'Knowledge',
    parametersSchema: [
      { key: 'docType', label: 'Source Document Type', type: 'select', options: ['all', 'OEM Manual', 'SOP Guidelines', 'Regulatory Standard'], defaultValue: 'all' },
      { key: 'minConfidence', label: 'Min Parser Confidence', type: 'number', defaultValue: 85 }
    ],
    chartType: 'pie',
    chartData: [
      { name: 'Mapped Entities', value: 68, color: '#0E7C86' },
      { name: 'Raw Ingested Text', value: 24, color: '#F5A524' },
      { name: 'Unmapped Clauses', value: 8, color: '#E5484D' }
    ],
    tableHeaders: ['Knowledge Segment', 'Segment Corpus Volume', 'Graph Embedding Level', 'Resolution Accuracy', 'Awaiting Action'],
    tableRows: [
      ['Mapped Entities', '4,110 tags', '98.2%', '99.8%', '0 files'],
      ['Raw Ingested Text', '1,240 blocks', '64.5%', '92.1%', '412 files'],
      ['Unmapped Clauses', '320 lines', '12.4%', '88.2%', '42 gaps']
    ]
  }
];

export function AnalyticsHub() {
  // MOCK: keep the baked fixtures + hardcoded defaults. LIVE: start empty and
  // hydrate the gallery from GET /analytics/reports on mount.
  const [reports, setReports] = useState<ReportDefinition[]>(USE_MOCK ? MOCK_REPORTS : []);
  const [selectedReportId, setSelectedReportId] = useState<string>(USE_MOCK ? 'rep-1' : '');

  // Custom states matching report parameter values
  const [paramValues, setParamValues] = useState<Record<string, any>>(USE_MOCK ? {
    area: 'all',
    startDate: '2026-06-01',
    endDate: '2026-07-01',
    minDowntime: 100,
    class: 'all',
    minMtbf: 200,
    severity: 'all',
    regulatoryBody: 'all',
    docType: 'all',
    minConfidence: 85
  } : {});

  // Schedule modal state
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState('Weekly');

  // Diagnostic states
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => { setToastMessage(null); }, 4000);
  };

  const handleParamChange = (key: string, value: any) => {
    setParamValues({
      ...paramValues,
      [key]: value
    });
  };

  const activeReport = reports.find(r => r.id === selectedReportId) || reports[0];

  // LIVE: run a report definition and fold its rows/series into the gallery
  // entry so the existing chart/table components render the returned data.
  const runLive = async (def: ReportDefinition, params: Record<string, any>) => {
    setIsRunningDiagnostic(true);
    setShowResults(false);
    try {
      const res: any = await api.post(`/analytics/reports/${def.id}/run`, { params: params ?? {} });
      const payload = res?.data ?? res ?? {};
      const updated = applyRun(def, payload);
      setReports(prev => prev.map(r => (r.id === def.id ? updated : r)));
    } catch (e) {
      // A brand-new tenant with no data still resolves to empty charts/tables.
      setReports(prev => prev.map(r => (r.id === def.id
        ? { ...def, chartData: [], tableHeaders: [], tableRows: [] }
        : r)));
    } finally {
      setIsRunningDiagnostic(false);
      setShowResults(true);
    }
  };

  // LIVE: populate the report gallery on mount; auto-run the first report.
  useEffect(() => {
    if (USE_MOCK) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.get('/analytics/reports');
        const list = res?.data ?? res?.items ?? res ?? [];
        const mapped: ReportDefinition[] = (Array.isArray(list) ? list : []).map(mapReportDef);
        if (cancelled) return;
        setReports(mapped);
        if (mapped.length) {
          setSelectedReportId(mapped[0].id);
          runLive(mapped[0], {});
        }
      } catch (e) {
        if (!cancelled) setReports([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectReport = (rep: ReportDefinition) => {
    setSelectedReportId(rep.id);
    setShowResults(true);
    if (!USE_MOCK) runLive(rep, paramValues);
  };

  const handleRunReport = () => {
    if (!activeReport) return;
    if (!USE_MOCK) {
      runLive(activeReport, paramValues).then(() => {
        showToast(`Diagnostic Report "${activeReport.name}" compiled successfully!`);
      });
      return;
    }
    setIsRunningDiagnostic(true);
    setShowResults(false);
    setTimeout(() => {
      setIsRunningDiagnostic(false);
      setShowResults(true);
      showToast(`Diagnostic Report "${activeReport.name}" compiled successfully!`);
    }, 800);
  };

  const handleExport = async (format: 'CSV' | 'PDF') => {
    if (!activeReport) return;
    if (USE_MOCK) {
      showToast(`EXPORT SUCCESS: Mapped diagnostic rows for "${activeReport.name}" compiled and exported as ${format}!`);
      return;
    }
    try {
      const res: any = await api.post(`/analytics/reports/${activeReport.id}/export`, {
        format: format.toLowerCase(),
        params: paramValues,
      });
      const payload = res?.data ?? res ?? {};
      const url = payload?.download_url;
      if (url) window.open(url, '_blank');
      showToast(`EXPORT SUCCESS: "${activeReport.name}" exported as ${format}!`);
    } catch (e) {
      showToast(`Export failed for "${activeReport.name}".`);
    }
  };

  const handleScheduleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleEmail.trim()) {
      alert('Please provide a target email address.');
      return;
    }
    if (!USE_MOCK && activeReport) {
      const cronMap: Record<string, string> = {
        Daily: '0 6 * * *',
        Weekly: '0 0 * * 1',
        Monthly: '0 0 1 * *',
      };
      try {
        await api.post(`/analytics/reports/${activeReport.id}/schedule`, {
          cron: cronMap[scheduleFrequency] ?? '0 0 * * 1',
          recipients: [scheduleEmail.trim()],
          params: paramValues,
          format: 'pdf',
        });
      } catch (err) {
        showToast(`Failed to schedule "${activeReport.name}".`);
        setIsScheduleOpen(false);
        setScheduleEmail('');
        return;
      }
    }
    showToast(`SCHEDULED: Recurring ${scheduleFrequency} email digest of "${activeReport?.name ?? 'report'}" routed to ${scheduleEmail}!`);
    setIsScheduleOpen(false);
    setScheduleEmail('');
  };

  // Color arrays for pie charts
  const PIE_COLORS = ['#0E7C86', '#F5A524', '#E5484D', '#2E9E5B'];

  return (
    <div className="space-y-6" id="analytics-suite-workspace">
      
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-lg bg-status-ok/10 text-status-ok border border-status-ok/30 shadow-xl flex items-center space-x-3 max-w-md animate-bounce font-mono text-xs font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Grid: Left is list of reports + parameters; Right is chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Report Gallery & Parameter form */}
        <div className="space-y-6">
          
          {/* Report Selector Gallery */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider flex items-center space-x-2 pb-2.5 border-b border-border-custom">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span>Diagnostic Report Gallery</span>
            </h3>

            <div className="space-y-1.5">
              {reports.length === 0 && (
                <p className="text-[11px] text-text-muted font-sans py-4 text-center">
                  No report definitions available for this tenant yet.
                </p>
              )}
              {reports.map((rep) => {
                const isSelected = selectedReportId === rep.id;
                return (
                  <button
                    key={rep.id}
                    onClick={() => handleSelectReport(rep)}
                    className={`w-full text-left p-3 rounded-lg border text-xs font-sans flex items-start justify-between cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-primary/10 border-primary text-text-primary font-bold'
                        : 'bg-background-custom/40 border-border-custom text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className="block font-semibold">{rep.name}</span>
                      <span className="block text-[10px] text-text-muted font-normal font-sans line-clamp-1">{rep.description}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 transition-transform ${isSelected ? 'translate-x-1 text-primary' : 'text-text-muted'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Parameters Form */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold text-text-primary uppercase tracking-wider flex items-center space-x-2 pb-2.5 border-b border-border-custom">
              <Sliders className="w-4 h-4 text-primary" />
              <span>Report Parameter Thresholds</span>
            </h3>

            <div className="space-y-3 pt-1">
              {(activeReport?.parametersSchema ?? []).map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wide">
                    {field.label}
                  </label>

                  {field.type === 'select' ? (
                    <Select
                      value={String(paramValues[field.key] ?? field.defaultValue)}
                      onValueChange={(v) => handleParamChange(field.key, v)}
                      options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
                      className="w-full p-2 text-xs font-mono"
                    />
                  ) : field.type === 'date' ? (
                    <input
                      type="date"
                      value={paramValues[field.key] ?? field.defaultValue}
                      onChange={(e) => handleParamChange(field.key, e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded p-2 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                    />
                  ) : (
                    <input
                      type="number"
                      value={paramValues[field.key] ?? field.defaultValue}
                      onChange={(e) => handleParamChange(field.key, parseInt(e.target.value, 10))}
                      className="w-full bg-background-custom border border-border-custom rounded p-2 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                    />
                  )}
                </div>
              ))}

              <button
                onClick={handleRunReport}
                disabled={isRunningDiagnostic || !activeReport}
                className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white rounded text-xs font-mono font-bold cursor-pointer transition-colors flex items-center justify-center space-x-2 mt-4"
              >
                {isRunningDiagnostic ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>TRAVERSING DATA...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>RUN DIAGNOSTIC REPORT</span>
                  </>
                )}
              </button>

            </div>
          </div>

        </div>

        {/* Right Column (2/3 width on large): Chart + DataTable result outputs */}
        <div className="lg:col-span-2 space-y-6">
          
          {isRunningDiagnostic ? (
            <div className="bg-surface border border-border-custom rounded-xl p-24 text-center">
              <RefreshCw className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <p className="font-mono text-sm text-text-primary font-bold uppercase tracking-wider">Processing Dynamic Data Query</p>
              <p className="text-xs text-text-secondary mt-1">Traversing historical incident maps, telemetry aggregates, and compliance registries.</p>
            </div>
          ) : showResults && activeReport ? (
            <div className="space-y-6">
              
              {/* Chart visualization */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
                
                <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-primary tracking-wider uppercase">Active Visual Output</span>
                    <h2 className="font-display font-bold text-text-primary text-base leading-snug">{activeReport.name}</h2>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => setIsScheduleOpen(true)}
                      className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      <span>SCHEDULE EMAIL</span>
                    </button>

                    <button
                      onClick={() => handleExport('PDF')}
                      className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-accent" />
                      <span>EXPORT PDF</span>
                    </button>

                    <button
                      onClick={() => handleExport('CSV')}
                      className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-status-ok" />
                      <span>EXPORT CSV</span>
                    </button>
                  </div>
                </div>

                {/* Render Recharts based on type */}
                <div className="h-80 w-full bg-background-custom/30 rounded-lg border border-border-custom/40 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    {activeReport.chartType === 'bar' ? (
                      <BarChart data={activeReport.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222d36" />
                        <XAxis dataKey="name" stroke="#687b8d" fontSize={10} />
                        <YAxis stroke="#687b8d" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar
                          dataKey={activeReport.live ? 'value' : (activeReport.id === 'rep-1' ? 'downtime' : 'hours')}
                          name={activeReport.live ? (activeReport.yLabel || 'Value') : (activeReport.id === 'rep-1' ? 'Downtime Minutes' : 'MTBF Hours')}
                          fill="#0E7C86"
                          radius={[4, 4, 0, 0]}
                        />
                        {!activeReport.live && activeReport.id === 'rep-2' && (
                          <Bar dataKey="target" name="Nominal Target" fill="#F5A524" opacity={0.6} radius={[4, 4, 0, 0]} />
                        )}
                      </BarChart>
                    ) : activeReport.chartType === 'line' ? (
                      <LineChart data={activeReport.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222d36" />
                        <XAxis dataKey="name" stroke="#687b8d" fontSize={10} />
                        <YAxis stroke="#687b8d" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="value" name={activeReport.yLabel || 'Value'} stroke="#0E7C86" strokeWidth={2} dot={false} />
                      </LineChart>
                    ) : activeReport.chartType === 'area' ? (
                      <AreaChart data={activeReport.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222d36" />
                        <XAxis dataKey="name" stroke="#687b8d" fontSize={10} />
                        <YAxis stroke="#687b8d" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {activeReport.live ? (
                          <Area type="monotone" dataKey="value" name={activeReport.yLabel || 'Value'} stroke="#0E7C86" fill="#0E7C86" fillOpacity={0.1} strokeWidth={2} />
                        ) : (
                          <>
                            <Area type="monotone" dataKey="gaps" name="Open Gaps" stroke="#E5484D" fill="#E5484D" fillOpacity={0.1} strokeWidth={2} />
                            <Area type="monotone" dataKey="remediated" name="Remediated" stroke="#2E9E5B" fill="#2E9E5B" fillOpacity={0.05} strokeWidth={2} />
                          </>
                        )}
                      </AreaChart>
                    ) : (
                      <PieChart>
                        <Pie
                          data={activeReport.chartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={90}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {activeReport.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    )}
                  </ResponsiveContainer>
                </div>

              </div>

              {/* Data Table Results */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-3">
                <span className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">Tabular Output Records</span>
                
                <div className="bg-background-custom/30 rounded-lg border border-border-custom/40 overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse font-sans">
                    <thead>
                      <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] text-text-muted uppercase font-mono">
                        {activeReport.tableHeaders.map((h) => (
                          <th key={h} className="p-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-custom/30 text-text-secondary">
                      {activeReport.tableRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-background-custom/30 transition-colors">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-3 font-medium text-text-primary first:font-mono first:text-accent">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-surface border border-border-custom rounded-xl p-24 text-center">
              <BarChart3 className="w-12 h-12 text-text-muted mx-auto mb-2 animate-pulse" />
              <p className="font-semibold text-text-primary">Diagnostics Awaiting Trigger</p>
              <p className="text-xs text-text-secondary mt-1">Select report schema parameters on the left and compile diagnostic results.</p>
            </div>
          )}

        </div>

      </div>

      {/* ==================== SCHEDULE REPORT EMAIL DIALOG ==================== */}
      {isScheduleOpen && activeReport && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="fixed inset-0" onClick={() => setIsScheduleOpen(false)} />
          <div className="bg-surface border border-border-custom w-full max-w-md rounded-xl shadow-2xl relative z-10 overflow-hidden font-sans">
            
            <div className="p-4 border-b border-border-custom bg-surface-muted flex justify-between items-center">
              <div>
                <span className="font-mono text-[10px] text-primary font-bold">DIGEST SCHEDULING INTERACTION</span>
                <h3 className="font-display font-semibold text-text-primary text-sm">Schedule Report Email</h3>
              </div>
              <button 
                onClick={() => setIsScheduleOpen(false)} 
                className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-background-custom cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleEmail}>
              <div className="p-5 space-y-4">
                <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-lg text-xs space-y-1">
                  <span className="font-bold text-primary block font-mono">AUTOMATED DIGEST AGENT</span>
                  <p className="text-text-secondary leading-relaxed">System will compile "{activeReport.name}" parameters and deliver a structured PDF briefing immediately upon cycle trigger.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wide">
                    Recipient Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="Enter engineering email (e.g. priya@indusmind.io)..."
                    value={scheduleEmail}
                    onChange={(e) => setScheduleEmail(e.target.value)}
                    required
                    className="w-full bg-background-custom border border-border-custom rounded p-2 text-xs text-text-primary focus:outline-none focus:border-primary placeholder-text-muted font-sans"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wide">
                    Recurring Frequency
                  </label>
                  <Select
                    value={scheduleFrequency}
                    onValueChange={(v) => setScheduleFrequency(v)}
                    options={[
                      { value: 'Daily', label: 'Daily Shift Transition Briefing' },
                      { value: 'Weekly', label: 'Weekly Friday Summary Digest' },
                      { value: 'Monthly', label: 'Monthly Operational Audit Wrap' },
                    ]}
                    className="w-full p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="p-3 border-t border-border-custom bg-surface-muted flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-3 py-1.5 border border-border-custom text-text-secondary rounded hover:text-text-primary text-xs font-mono font-semibold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-bold cursor-pointer transition-colors"
                >
                  SCHEDULE TRANSMISSION
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
