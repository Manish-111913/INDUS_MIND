/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  BarChart3, Calendar, FileText, Download, Mail, Check, Play,
  Plus, ArrowRight, Clock, ShieldAlert, Cpu, Network, RefreshCw,
  Search, Sliders, ChevronRight, BookmarkCheck, LayoutGrid, List
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { StatusChip } from '../../shared';

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
  const [reports] = useState<ReportDefinition[]>(MOCK_REPORTS);
  const [selectedReportId, setSelectedReportId] = useState<string>('rep-1');
  
  // Custom states matching report parameter values
  const [paramValues, setParamValues] = useState<Record<string, any>>({
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
  });

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

  const handleRunReport = () => {
    setIsRunningDiagnostic(true);
    setShowResults(false);
    setTimeout(() => {
      setIsRunningDiagnostic(false);
      setShowResults(true);
      showToast(`Diagnostic Report "${activeReport.name}" compiled successfully!`);
    }, 800);
  };

  const handleExport = (format: 'CSV' | 'PDF') => {
    showToast(`EXPORT SUCCESS: Mapped diagnostic rows for "${activeReport.name}" compiled and exported as ${format}!`);
  };

  const handleScheduleEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleEmail.trim()) {
      alert('Please provide a target email address.');
      return;
    }
    showToast(`SCHEDULED: Recurring ${scheduleFrequency} email digest of "${activeReport.name}" routed to ${scheduleEmail}!`);
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
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-2 pb-2.5 border-b border-border-custom">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span>Diagnostic Report Gallery</span>
            </h3>

            <div className="space-y-1.5">
              {reports.map((rep) => {
                const isSelected = selectedReportId === rep.id;
                return (
                  <button
                    key={rep.id}
                    onClick={() => {
                      setSelectedReportId(rep.id);
                      setShowResults(true);
                    }}
                    className={`w-full text-left p-3 rounded-lg border text-xs font-sans flex items-start justify-between cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-primary/10 border-primary text-white font-bold' 
                        : 'bg-background-custom/40 border-border-custom text-text-secondary hover:text-white'
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
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-2 pb-2.5 border-b border-border-custom">
              <Sliders className="w-4 h-4 text-primary" />
              <span>Report Parameter Thresholds</span>
            </h3>

            <div className="space-y-3 pt-1">
              {activeReport.parametersSchema.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wide">
                    {field.label}
                  </label>

                  {field.type === 'select' ? (
                    <select
                      value={paramValues[field.key] ?? field.defaultValue}
                      onChange={(e) => handleParamChange(field.key, e.target.value)}
                      className="w-full bg-background-custom border border-border-custom rounded p-2 text-xs text-text-primary focus:outline-none focus:border-primary cursor-pointer font-mono"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
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
                disabled={isRunningDiagnostic}
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
              <p className="font-mono text-sm text-white font-bold uppercase tracking-wider">Processing Dynamic Data Query</p>
              <p className="text-xs text-text-secondary mt-1">Traversing historical incident maps, telemetry aggregates, and compliance registries.</p>
            </div>
          ) : showResults && activeReport ? (
            <div className="space-y-6">
              
              {/* Chart visualization */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
                
                <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-primary tracking-wider uppercase">Active Visual Output</span>
                    <h2 className="font-display font-bold text-white text-base leading-snug">{activeReport.name}</h2>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => setIsScheduleOpen(true)}
                      className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-white hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      <span>SCHEDULE EMAIL</span>
                    </button>

                    <button
                      onClick={() => handleExport('PDF')}
                      className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-white hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-accent" />
                      <span>EXPORT PDF</span>
                    </button>

                    <button
                      onClick={() => handleExport('CSV')}
                      className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-white hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
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
                          dataKey={activeReport.id === 'rep-1' ? 'downtime' : 'hours'} 
                          name={activeReport.id === 'rep-1' ? 'Downtime Minutes' : 'MTBF Hours'} 
                          fill="#0E7C86" 
                          radius={[4, 4, 0, 0]} 
                        />
                        {activeReport.id === 'rep-2' && (
                          <Bar dataKey="target" name="Nominal Target" fill="#F5A524" opacity={0.6} radius={[4, 4, 0, 0]} />
                        )}
                      </BarChart>
                    ) : activeReport.chartType === 'area' ? (
                      <AreaChart data={activeReport.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222d36" />
                        <XAxis dataKey="name" stroke="#687b8d" fontSize={10} />
                        <YAxis stroke="#687b8d" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#13191d', borderColor: '#222d36', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Area type="monotone" dataKey="gaps" name="Open Gaps" stroke="#E5484D" fill="#E5484D" fillOpacity={0.1} strokeWidth={2} />
                        <Area type="monotone" dataKey="remediated" name="Remediated" stroke="#2E9E5B" fill="#2E9E5B" fillOpacity={0.05} strokeWidth={2} />
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
              <p className="font-semibold text-white">Diagnostics Awaiting Trigger</p>
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
                <h3 className="font-display font-semibold text-white text-sm">Schedule Report Email</h3>
              </div>
              <button 
                onClick={() => setIsScheduleOpen(false)} 
                className="p-1 text-text-muted hover:text-white rounded hover:bg-background-custom cursor-pointer"
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
                    className="w-full bg-background-custom border border-border-custom rounded p-2 text-xs text-white focus:outline-none focus:border-primary placeholder-text-muted font-sans"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wide">
                    Recurring Frequency
                  </label>
                  <select
                    value={scheduleFrequency}
                    onChange={(e) => setScheduleFrequency(e.target.value)}
                    className="w-full bg-background-custom border border-border-custom rounded p-2 text-xs text-text-primary focus:outline-none focus:border-primary cursor-pointer font-mono"
                  >
                    <option value="Daily">Daily Shift Transition Briefing</option>
                    <option value="Weekly">Weekly Friday Summary Digest</option>
                    <option value="Monthly">Monthly Operational Audit Wrap</option>
                  </select>
                </div>
              </div>

              <div className="p-3 border-t border-border-custom bg-surface-muted flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-3 py-1.5 border border-border-custom text-text-secondary rounded hover:text-white text-xs font-mono font-semibold cursor-pointer"
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
