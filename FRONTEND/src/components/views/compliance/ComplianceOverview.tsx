/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ShieldCheck, AlertTriangle, Calendar, Award, CheckCircle, 
  ArrowUpRight, Clock, Bell, ArrowRight, Activity, Filter, RefreshCw
} from 'lucide-react';
import { 
  GAP_TREND_DATA, 
  HEATMAP_DATA, 
  REGULATORY_ALERTS, 
  HeatmapCell, 
  RegulatoryAlert 
} from './mockComplianceData';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  Tooltip, CartesianGrid, Legend 
} from 'recharts';
import { StatusChip } from '../../shared';

interface ComplianceOverviewProps {
  onNavigateToGaps: (filterReg?: string, filterArea?: string) => void;
  onNavigateToRegulations: (regId?: string) => void;
  onNavigateToAudits: () => void;
  gapsCount: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export function ComplianceOverview({
  onNavigateToGaps,
  onNavigateToRegulations,
  onNavigateToAudits,
  gapsCount
}: ComplianceOverviewProps) {
  const [alerts, setAlerts] = useState<RegulatoryAlert[]>(REGULATORY_ALERTS);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Acknowledge alert helper
  const handleAcknowledgeAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'Acknowledged' } : a));
  };

  // Distinct areas and regulations for heatmap structure
  const areas = [
    'Crude Distillation (Area A)',
    'Hydrotreater (Area B)',
    'Utility Block (Area C)',
    'Tank Farm (Area D)'
  ];

  const regulations = [
    { id: 'REG-OISD-118', code: 'OISD-118', title: 'OISD-STD-118' },
    { id: 'REG-FACT-21', code: 'Factory Act', title: 'Factory Act Sec 21' },
    { id: 'REG-PESO-05', code: 'PESO Valve', title: 'PESO Valve Dir v5' },
    { id: 'REG-ENV-SRU', code: 'EPA Rule', title: 'EPA Rule Sec 12' },
    { id: 'REG-ISO-50001', code: 'ISO 50001', title: 'ISO 50001' }
  ];

  const getHeatmapColor = (percent: number, gaps: number) => {
    if (gaps > 0) {
      if (percent < 60) return 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30';
      return 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30';
    }
    if (percent === 100) return 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    return 'bg-teal-500/10 hover:bg-teal-500/20 text-[#0E7C86] border-[#0E7C86]/30';
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- KPI CARDS GRID ----------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Compliance Rating Card */}
        <div className="bg-surface border border-border-custom p-4 rounded-xl flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-2 z-10">
            <span className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">Overall Compliance Score</span>
            <div className="flex items-baseline space-x-1">
              <span className="text-3xl font-display font-bold text-white">88.5%</span>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center">
                +1.2% this Q
              </span>
            </div>
            <span className="block text-[10px] text-text-secondary">85% minimum required target</span>
          </div>
          <div className="p-3 bg-emerald-500/5 text-emerald-400 rounded-lg group-hover:bg-emerald-500/10 transition-colors">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Active Compliance Gaps */}
        <div className="bg-surface border border-border-custom p-4 rounded-xl flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">Active Regulatory Gaps</span>
            <div className="text-3xl font-display font-bold text-white">{gapsCount.total}</div>
            <div className="flex gap-2 text-[9px] font-mono">
              <span className="text-red-500 font-bold">{gapsCount.critical} Crit</span>
              <span className="text-amber-500 font-bold">{gapsCount.high + gapsCount.medium} High/Med</span>
              <span className="text-blue-400 font-bold">{gapsCount.low} Low</span>
            </div>
          </div>
          <div className="p-3 bg-red-500/5 text-red-400 rounded-lg group-hover:bg-red-500/10 transition-colors cursor-pointer" onClick={() => onNavigateToGaps()}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Audits Next 30 Days */}
        <div className="bg-surface border border-border-custom p-4 rounded-xl flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-2 z-10">
            <span className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">Audits (Next 30 Days)</span>
            <div className="text-3xl font-display font-bold text-white">2</div>
            <span className="block text-[10px] text-text-secondary flex items-center">
              <Clock className="w-3 h-3 mr-1 text-amber-500" /> Next: OISD Audit July 25
            </span>
          </div>
          <div className="p-3 bg-primary/5 text-primary rounded-lg group-hover:bg-primary/10 transition-colors cursor-pointer" onClick={onNavigateToAudits}>
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* Expiring Certifications */}
        <div className="bg-surface border border-border-custom p-4 rounded-xl flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-2 z-10">
            <span className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">Expiring Certificates</span>
            <div className="text-3xl font-display font-bold text-white">3</div>
            <span className="block text-[10px] text-text-secondary">PESO valve certificate requires calibration</span>
          </div>
          <div className="p-3 bg-[#F5A524]/5 text-[#F5A524] rounded-lg group-hover:bg-[#F5A524]/10 transition-colors">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Overdue Remediations */}
        <div className="bg-surface border border-border-custom p-4 rounded-xl flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-2 z-10">
            <span className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">Overdue Remediations</span>
            <div className="text-3xl font-display font-bold text-white">1</div>
            <span className="block text-[10px] text-red-500 font-mono font-bold flex items-center">
              FW-P1 testing (147d overdue)
            </span>
          </div>
          <div className="p-3 bg-rose-500/5 text-rose-400 rounded-lg group-hover:bg-rose-500/10 transition-colors cursor-pointer" onClick={() => onNavigateToGaps()}>
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* ----------------- CORE SECTION: HEATMAP & TREND CHART ----------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Heatmap Grid - 7 Columns equivalent */}
        <div className="xl:col-span-7 bg-surface border border-border-custom rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-border-custom/50 pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">Regulation × Plant Area Coverage Heatmap</h3>
              <p className="text-[11px] text-text-secondary mt-0.5">Cells show mapped compliance coverage % and current gaps. Click cell to filter gaps.</p>
            </div>
            <div className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30 mr-1 inline-block"></span> 100%</span>
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-teal-500/20 border border-teal-500/30 mr-1 inline-block"></span> Mapped</span>
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/30 mr-1 inline-block"></span> Warnings</span>
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/20 border border-red-500/30 mr-1 inline-block"></span> Gaps</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              {/* Grid Header */}
              <div className="grid grid-cols-5 gap-2 border-b border-border-custom/30 pb-2 mb-2">
                <div className="text-[10px] font-mono text-text-muted uppercase">Regulation Standard</div>
                {areas.map(area => (
                  <div key={area} className="text-[10px] font-mono text-text-muted uppercase text-center truncate" title={area}>
                    {area.split(' (')[0]}
                  </div>
                ))}
              </div>

              {/* Grid Rows */}
              <div className="space-y-2">
                {regulations.map(reg => (
                  <div key={reg.id} className="grid grid-cols-5 gap-2 items-center">
                    {/* Regulation Label */}
                    <div 
                      onClick={() => onNavigateToRegulations(reg.id)}
                      className="text-xs text-white font-mono hover:text-primary hover:underline cursor-pointer font-semibold truncate"
                      title={reg.title}
                    >
                      {reg.code}
                    </div>

                    {/* Area Cells */}
                    {areas.map(area => {
                      const cell = HEATMAP_DATA.find(
                        c => c.regulationId === reg.id && c.area === area
                      ) || { coveragePercent: 0, gapsCount: 0 };

                      return (
                        <div
                          key={area}
                          onClick={() => {
                            // Drill down to gaps view filtered
                            onNavigateToGaps(reg.code, area);
                          }}
                          className={`p-3.5 rounded border text-center cursor-pointer transition-all ${getHeatmapColor(cell.coveragePercent, cell.gapsCount)}`}
                        >
                          <div className="text-xs font-bold font-mono">{cell.coveragePercent}%</div>
                          {cell.gapsCount > 0 && (
                            <div className="text-[9px] font-mono font-bold px-1.5 py-0.5 mt-1 bg-red-500 text-white rounded inline-block animate-pulse">
                              {cell.gapsCount} GAP
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Gap Trend Chart - 5 Columns equivalent */}
        <div className="xl:col-span-5 bg-surface border border-border-custom rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">Gap Velocity & Trend Analysis</h3>
            <p className="text-[11px] text-text-secondary mt-0.5">Historical tracking of regulatory gaps opened, resolved, and active backlog.</p>
          </div>

          <div className="h-[200px] w-full text-xs font-sans">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={GAP_TREND_DATA} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262D33" />
                <XAxis dataKey="month" stroke="#6F8394" tickLine={false} />
                <YAxis stroke="#6F8394" tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#13191D', border: '1px solid #262D33', borderRadius: '6px' }}
                  labelStyle={{ color: '#F1F5F9', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                <Line 
                  type="monotone" 
                  dataKey="totalActiveGaps" 
                  name="Active Backlog" 
                  stroke="#0E7C86" 
                  strokeWidth={2.5} 
                  activeDot={{ r: 6 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="gapsOpened" 
                  name="Opened" 
                  stroke="#EF4444" 
                  strokeWidth={1.5} 
                  strokeDasharray="4 4"
                />
                <Line 
                  type="monotone" 
                  dataKey="gapsClosed" 
                  name="Closed" 
                  stroke="#10B981" 
                  strokeWidth={1.5} 
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ----------------- LOWER GRID: ALERTS FEED & QUICK LINKS ----------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Regulatory alerts feed - 8 Columns */}
        <div className="xl:col-span-8 bg-surface border border-border-custom rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-border-custom/50 pb-3">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-primary animate-bounce" />
              <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">Regulatory Change Alerts Feed</h3>
            </div>
            <span className="text-[10px] font-mono text-text-muted bg-surface-muted border border-border-custom px-2 py-0.5 rounded">
              3 ACTIONS REQUIRED
            </span>
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div 
                key={alert.id}
                className={`p-3.5 rounded-lg border transition-all ${
                  selectedAlertId === alert.id 
                    ? 'bg-primary/5 border-primary/40' 
                    : alert.status === 'New' 
                      ? 'bg-surface-muted/30 border-[#0E7C86]/30 hover:border-[#0E7C86]/50'
                      : 'bg-surface-muted/10 border-border-custom hover:border-text-muted/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] text-text-muted bg-background-custom border border-border-custom px-2 py-0.5 rounded uppercase">
                      {alert.date}
                    </span>
                    <span className="text-[10px] font-mono text-primary font-semibold truncate max-w-[200px]" title={alert.source}>
                      {alert.source.split(' (')[0]}
                    </span>
                    {alert.severity === 'High' && (
                      <span className="text-[9px] bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 rounded font-bold font-mono">CRITICAL SHIFT</span>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {alert.status === 'New' && (
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    )}
                    <span className={`text-[10px] font-mono ${alert.status === 'Acknowledged' ? 'text-text-muted' : 'text-primary font-bold'}`}>
                      {alert.status}
                    </span>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-white mt-1.5 hover:text-primary cursor-pointer flex items-center justify-between" onClick={() => setSelectedAlertId(selectedAlertId === alert.id ? null : alert.id)}>
                  <span>{alert.title}</span>
                  <span className="text-[10px] font-mono text-text-muted font-normal hover:underline ml-2">
                    {selectedAlertId === alert.id ? 'Collapse' : 'Review Impact →'}
                  </span>
                </h4>

                {selectedAlertId === alert.id && (
                  <div className="mt-3 pt-3 border-t border-border-custom/50 text-xs text-text-secondary space-y-3">
                    <p className="leading-relaxed">{alert.description}</p>
                    
                    <div className="bg-background-custom border border-border-custom p-2.5 rounded font-mono text-[11px] space-y-2">
                      <div className="text-white font-bold uppercase flex items-center text-[10px]">
                        <Activity className="w-3.5 h-3.5 mr-1 text-primary" /> AI Impact Assessment:
                      </div>
                      {alert.id === 'AL-2' ? (
                        <p className="text-[#F5A524]">
                          "CRITICAL IMPACT: Standby Diesel Firewater Pump FW-P1 is currently tested semi-annually under SOP-114. This new rule strictly mandates 90-day comprehensive tests. SOP-114 and FW-P1 maintenance cycles are now instantly non-compliant."
                        </p>
                      ) : alert.id === 'AL-1' ? (
                        <p className="text-emerald-400">
                          "COMPLIANT: Current Stack Analyzer GD-301 records 24-hr averages of 124 ppmv. Stack operations comply with new 150 ppmv baseline. Continual oversight advised."
                        </p>
                      ) : (
                        <p className="text-text-muted">
                          "Action review needed on Column C-3 and downstream pressure safety valve interlocks."
                        </p>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      {alert.id === 'AL-2' ? (
                        <button
                          onClick={() => onNavigateToGaps('OISD-118')}
                          className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded font-mono text-[10px] font-bold cursor-pointer"
                        >
                          View Open OISD-118 Gap
                        </button>
                      ) : (
                        <div />
                      )}

                      {alert.status !== 'Acknowledged' && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          className="px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded font-mono text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          Acknowledge & Sync Schema
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links & Scope overview - 4 Columns */}
        <div className="xl:col-span-4 bg-surface border border-border-custom rounded-xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider border-b border-border-custom/50 pb-2">Compliance Links</h3>
            
            <div className="space-y-2.5 text-xs">
              <div 
                onClick={() => onNavigateToRegulations()}
                className="p-3 bg-surface-muted/30 border border-border-custom hover:border-primary/50 rounded-lg cursor-pointer flex justify-between items-center group transition-all"
              >
                <div>
                  <h4 className="font-bold text-white group-hover:text-primary">Regulation Standards</h4>
                  <p className="text-[10px] text-text-secondary mt-0.5">5 Enforced baseline frameworks</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
              </div>

              <div 
                onClick={() => onNavigateToGaps()}
                className="p-3 bg-surface-muted/30 border border-border-custom hover:border-primary/50 rounded-lg cursor-pointer flex justify-between items-center group transition-all"
              >
                <div>
                  <h4 className="font-bold text-white group-hover:text-primary">Gaps & Deficiencies</h4>
                  <p className="text-[10px] text-text-secondary mt-0.5">4 Active gaps require remediation</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
              </div>

              <div 
                onClick={onNavigateToAudits}
                className="p-3 bg-surface-muted/30 border border-border-custom hover:border-primary/50 rounded-lg cursor-pointer flex justify-between items-center group transition-all"
              >
                <div>
                  <h4 className="font-bold text-white group-hover:text-primary">Audits & Evidence Packs</h4>
                  <p className="text-[10px] text-text-secondary mt-0.5">Generate immutable proof files</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
              </div>
            </div>
          </div>

          <div className="mt-5 p-3.5 bg-primary/5 border border-primary/10 rounded-lg text-xs space-y-1.5">
            <h4 className="font-bold text-white flex items-center">
              <ShieldCheck className="w-4 h-4 text-primary mr-1" /> Active Baselines
            </h4>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Your schemas are verified daily against standard federal safety rules. Gaps are synchronized into active work orders under the main maintenance registry.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
