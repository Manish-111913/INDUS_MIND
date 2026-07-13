/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  AlertTriangle, ArrowLeft, User, Calendar, ShieldAlert, Sparkles, 
  Wrench, FileText, Check, Plus, UserPlus, FileCheck, History, Info
} from 'lucide-react';
import { ComplianceGap, EvidenceRecord } from './mockComplianceData';
import { StatusChip, ConfidenceBadge, Select } from '../../shared';

interface ComplianceGapsProps {
  gaps: ComplianceGap[];
  selectedGapId: string | null;
  onSelectGap: (id: string | null) => void;
  onUpdateGaps: (updated: ComplianceGap[]) => void;
  onAddWorkOrder: (newWo: any) => void;
  initialFilters?: { regulation?: string; area?: string };
}

export function ComplianceGaps({
  gaps,
  selectedGapId,
  onSelectGap,
  onUpdateGaps,
  onAddWorkOrder,
  initialFilters
}: ComplianceGapsProps) {
  
  // Filtering state
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Interactive Action states inside Gap detail
  const [isAcceptingRisk, setIsAcceptingRisk] = useState(false);
  const [riskJustification, setRiskJustification] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [remediationSuccess, setRemediationSuccess] = useState<string | null>(null);

  const activeGap = gaps.find(g => g.id === selectedGapId);

  // Apply filters to gaps list
  const filteredGaps = gaps.filter(gap => {
    // Initial pre-filter drilldowns
    if (initialFilters?.regulation && !gap.clauseCode.includes(initialFilters.regulation)) {
      return false;
    }
    // Severity and Status
    if (severityFilter !== 'All' && gap.severity !== severityFilter) return false;
    if (statusFilter !== 'All' && gap.status !== statusFilter) return false;
    return true;
  });

  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case 'Critical': return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'High': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'Medium': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  // 1. ACTION: Create Remediation Task (→ Work Order stub in real list)
  const handleCreateRemediation = () => {
    if (!activeGap) return;

    const newWoId = `WO-REM-${Date.now().toString().slice(-4)}`;
    
    // Construct actual Work Order conforming to maintenance systems
    const newWo = {
      id: newWoId,
      title: `COMPLIANCE REMEDIATION: ${activeGap.clauseCode} Verification`,
      equipmentId: activeGap.affectedEquipmentId,
      equipmentName: activeGap.affectedEquipment,
      type: 'PM',
      priority: activeGap.severity === 'Critical' ? 'Critical' : 'High',
      assignee: { name: activeGap.owner.split(' (')[0], role: 'Field Technician', avatarUrl: null },
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Open',
      sla: 'MET',
      slaDetails: 'Compliance Priority Fast-Track',
      description: `Dispatched by Compliance Suite to close gap ${activeGap.id}.\nClause Requirement:\n"${activeGap.clauseText}"`,
      safetyChecklist: [
        { id: 'rem-s1', text: 'Apply standard safety lock-out/tag-out guidelines before run.', checked: false },
        { id: 'rem-s2', text: 'Confirm fire suppression systems are auxiliary aligned.', checked: false }
      ],
      steps: [
        { id: 'rem-step1', title: 'Verify Flange Valves', desc: 'Verify interlocked pressure lines.', checked: false, note: '', photo: null },
        { id: 'rem-step2', title: 'Run Full Pressure Test', desc: 'Perform continuous run for 60 minutes and log head pressure.', checked: false, note: '', photo: null }
      ],
      parts: [],
      labor: [],
      attachments: [],
      logs: [
        { date: '2026-07-12 12:00', user: 'AI Compliance Dispatcher', action: `Dispatched remediation work order ${newWoId}` }
      ]
    };

    onAddWorkOrder(newWo);

    // Update gap status
    const updatedGaps = gaps.map(g => {
      if (g.id === activeGap.id) {
        return {
          ...g,
          status: 'Remediating' as const,
          history: [
            {
              id: `h-rem-${Date.now()}`,
              date: '2026-07-12 12:30',
              user: 'System Operator',
              action: 'Dispatched Work Order',
              comment: `Created remediation task ${newWoId} under standby maintenance queues.`
            },
            ...g.history
          ]
        };
      }
      return g;
    });

    onUpdateGaps(updatedGaps);
    setRemediationSuccess(`Remediation job created successfully! Dispatching work order ${newWoId} to maintenance dashboard.`);
    setTimeout(() => setRemediationSuccess(null), 8000);
  };

  // 2. ACTION: Accept Risk
  const handleAcceptRiskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGap || !riskJustification.trim()) return;

    const updatedGaps = gaps.map(g => {
      if (g.id === activeGap.id) {
        return {
          ...g,
          status: 'Risk Accepted' as const,
          riskJustification: riskJustification,
          history: [
            {
              id: `h-risk-${Date.now()}`,
              date: '2026-07-12 12:30',
              user: 'Plant Manager',
              action: 'Accepted Operational Risk',
              comment: riskJustification
            },
            ...g.history
          ]
        };
      }
      return g;
    });

    onUpdateGaps(updatedGaps);
    setIsAcceptingRisk(false);
    setRiskJustification('');
  };

  // 3. ACTION: Assign Owner
  const handleAssignOwnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGap || !selectedOwner.trim()) return;

    const updatedGaps = gaps.map(g => {
      if (g.id === activeGap.id) {
        return {
          ...g,
          owner: selectedOwner,
          history: [
            {
              id: `h-own-${Date.now()}`,
              date: '2026-07-12 12:30',
              user: 'Operator',
              action: 'Assigned Gap Owner',
              comment: `Assigned responsibility directly to ${selectedOwner}.`
            },
            ...g.history
          ]
        };
      }
      return g;
    });

    onUpdateGaps(updatedGaps);
    setIsAssigning(false);
    setSelectedOwner('');
  };

  // Custom highlights for OISD-118 Clause 6.4 pump gap
  const renderHighlightedRequirement = (text: string, gapId: string) => {
    if (gapId === 'GAP-OISD-118-01') {
      return (
        <p className="leading-relaxed">
          All main firewater pumps and standby diesel utility booster systems must undergo full mechanical run and pressure test verification at <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1 py-0.5 rounded font-semibold">quarterly intervals (every 90 days)</span> to ensure immediate start-up compliance in emergency conditions. Weekly auxiliary functional crank checks are mandatory.
        </p>
      );
    }
    if (gapId === 'GAP-FACT-21-01') {
      return (
        <p className="leading-relaxed">
          All rotating shafts and coupling housings must feature <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded font-semibold">visible caution warning plates</span> indicating hazard level and physical entrapment risks.
        </p>
      );
    }
    return <p className="leading-relaxed">{text}</p>;
  };

  const renderHighlightedSop = (text: string, gapId: string) => {
    if (gapId === 'GAP-OISD-118-01') {
      return (
        <p className="leading-relaxed">
          Section 4.2.1 Pump Maintenance: The firewater booster pumps (FW-P1) shall be run for diagnostic checks at <span className="bg-amber-500/25 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded font-semibold">semi-annual intervals</span> to verify impeller integrity and lubrication status. Record oil viscosity in Section 5.
        </p>
      );
    }
    if (gapId === 'GAP-FACT-21-01') {
      return (
        <p className="leading-relaxed">
          Section 1.2: General fencing shield guards must be verified visually every shift. Ensure safety latches are secure. <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1 py-0.5 rounded font-semibold">(OMITS: Any decal or warning sticker checks)</span>.
        </p>
      );
    }
    return <p className="leading-relaxed">{text}</p>;
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- SELECTION HEADER ----------------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {selectedGapId && (
            <button 
              onClick={() => {
                onSelectGap(null);
                setRemediationSuccess(null);
              }}
              className="p-1.5 bg-surface hover:bg-surface-muted text-text-secondary hover:text-text-primary rounded border border-border-custom cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary uppercase tracking-wider flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <span>{selectedGapId ? `Deficiency Workspace: ${activeGap?.id}` : 'Compliance Deficiency Gaps'}</span>
            </h2>
            {initialFilters?.regulation && (
              <p className="text-[10px] font-mono text-primary uppercase mt-0.5">FILTERED BY CELL: {initialFilters.regulation} @ {initialFilters.area}</p>
            )}
          </div>
        </div>

        {!selectedGapId && (
          <div className="flex space-x-2">
            {/* Filter by severity */}
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v)}
              className="px-2.5 py-1.5 text-xs font-mono"
              options={[
                { value: 'All', label: 'All Severities' },
                { value: 'Critical', label: 'Critical' },
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' },
              ]}
            />

            {/* Filter by status */}
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v)}
              className="px-2.5 py-1.5 text-xs font-mono"
              options={[
                { value: 'All', label: 'All Statuses' },
                { value: 'Open', label: 'Open' },
                { value: 'Remediating', label: 'Remediating' },
                { value: 'Risk Accepted', label: 'Risk Accepted' },
                { value: 'Closed', label: 'Closed' },
              ]}
            />
          </div>
        )}
      </div>

      {/* ----------------- FEEDBACK TOASTS ----------------- */}
      {remediationSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs flex items-center space-x-2">
          <Check className="w-4 h-4 flex-shrink-0 animate-bounce" />
          <p>{remediationSuccess}</p>
        </div>
      )}

      {/* ----------------- NO SELECTED GAP: REGISTRY TABLE ----------------- */}
      {!selectedGapId ? (
        <div className="bg-surface border border-border-custom rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border-custom bg-surface-muted/30 font-mono text-[10px] text-text-muted uppercase tracking-wider">
            Detected Physical and Procedural Gaps Index ({filteredGaps.length})
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] text-text-muted uppercase font-mono">
                  <th className="p-4">Gap ID</th>
                  <th className="p-4">Clause Standard</th>
                  <th className="p-4">Deficiency Description</th>
                  <th className="p-4">Severity</th>
                  <th className="p-4">Affected Equipment / SOP</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/50 text-text-secondary">
                {filteredGaps.map((gap) => (
                  <tr key={gap.id} className="hover:bg-background-custom/30 transition-colors">
                    <td className="p-4 font-mono font-bold text-text-primary">{gap.id}</td>
                    <td className="p-4 font-mono font-semibold text-primary">{gap.clauseCode}</td>
                    <td className="p-4 max-w-xs truncate" title={gap.description}>
                      {gap.description}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${getSeverityStyle(gap.severity)}`}>
                        {gap.severity}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-text-primary">{gap.affectedEquipment}</div>
                      <div className="text-[10px] text-text-muted font-mono mt-0.5">{gap.affectedProcedure}</div>
                    </td>
                    <td className="p-4 font-mono text-text-muted">{gap.due}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                        gap.status === 'Open' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        gap.status === 'Remediating' ? 'bg-primary/10 text-primary border border-primary/20 animate-pulse' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {gap.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => onSelectGap(gap.id)}
                        className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded border border-red-500/20 text-[11px] font-mono font-bold cursor-pointer transition-all"
                      >
                        Compare Workspace
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredGaps.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-text-muted font-mono text-xs">
                      No active compliance gaps found matching filter keys.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ----------------- COMPREHENSIVE THREE-PANE SIDE-BY-SIDE SIDEWALK ----------------- */
        activeGap && (
          <div className="space-y-6">
            
            {/* AI Explanation & Diagnostic Summary Card */}
            <div className="bg-surface border border-primary/30 bg-gradient-to-br from-[#0B0F12] to-[#13191D] p-5 rounded-xl space-y-3 relative overflow-hidden">
              <div 
                className="absolute inset-0 opacity-[0.02] pointer-events-none" 
                style={{
                  backgroundImage: `linear-gradient(#0E7C86 1px, transparent 1px), linear-gradient(90deg, #0E7C86 1px, transparent 1px)`,
                  backgroundSize: '20px 20px'
                }}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-text-muted uppercase flex items-center">
                  <Sparkles className="w-3.5 h-3.5 text-primary mr-1 animate-pulse" /> AI Compliance Gap Diagnostic
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-text-muted">LLM Matching Confidence:</span>
                  <ConfidenceBadge confidence={94} />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wide">
                  Double Alignment Mismatch Flagged
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  "{activeGap.aiExplanation}"
                </p>
              </div>

              {/* General Gap Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border-custom/50 text-xs font-mono">
                <div>
                  <span className="block text-text-muted text-[10px] uppercase">GAP OWNER</span>
                  <span className="block font-bold text-white mt-0.5">{activeGap.owner}</span>
                </div>
                <div>
                  <span className="block text-text-muted text-[10px] uppercase">RESOLUTION DUE</span>
                  <span className="block font-bold text-white mt-0.5">{activeGap.due}</span>
                </div>
                <div>
                  <span className="block text-text-muted text-[10px] uppercase">SEVERITY LEVEL</span>
                  <span className={`block font-bold mt-0.5 ${activeGap.severity === 'Critical' ? 'text-red-400' : 'text-amber-400'}`}>{activeGap.severity}</span>
                </div>
                <div>
                  <span className="block text-text-muted text-[10px] uppercase">GAP STATUS</span>
                  <span className="block font-bold text-primary mt-0.5 uppercase">{activeGap.status}</span>
                </div>
              </div>
            </div>

            {/* THREE-PANE SIDE-BY-SIDE INTERFACE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Pane: Requirement */}
              <div className="bg-surface border border-border-custom rounded-xl p-4 flex flex-col justify-between h-[380px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                    <span className="font-mono text-[10px] text-text-muted uppercase flex items-center">
                      <FileText className="w-3.5 h-3.5 text-primary mr-1" /> Left Pane: Requirement
                    </span>
                    <span className="font-mono text-[9px] text-[#0E7C86] font-bold">FEDERAL RULE</span>
                  </div>
                  
                  <div className="space-y-1.5">
                    <span className="font-mono text-[11px] font-bold text-primary block">{activeGap.clauseCode}</span>
                    <div className="text-xs text-text-primary bg-background-custom border border-border-custom p-3.5 rounded-lg h-[240px] overflow-y-auto font-sans">
                      {renderHighlightedRequirement(activeGap.clauseText, activeGap.id)}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-text-muted uppercase pt-2 text-center border-t border-border-custom/30">
                  Target threshold mapping rule
                </div>
              </div>

              {/* Middle Pane: Current Procedure */}
              <div className="bg-surface border border-border-custom rounded-xl p-4 flex flex-col justify-between h-[380px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                    <span className="font-mono text-[10px] text-text-muted uppercase flex items-center">
                      <Wrench className="w-3.5 h-3.5 text-[#F5A524] mr-1" /> Middle Pane: Current SOP
                    </span>
                    <span className="font-mono text-[9px] text-[#F5A524] font-bold">MISALIGNED</span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="font-mono text-[11px] font-bold text-[#F5A524] block">{activeGap.affectedProcedureCode}</span>
                    <div className="text-xs text-text-primary bg-background-custom border border-border-custom p-3.5 rounded-lg h-[240px] overflow-y-auto font-sans">
                      {renderHighlightedSop(activeGap.sopExcerpt, activeGap.id)}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-text-muted uppercase pt-2 text-center border-t border-border-custom/30">
                  SOP-114 specifies semi-annual
                </div>
              </div>

              {/* Right Pane: Evidence Records */}
              <div className="bg-surface border border-border-custom rounded-xl p-4 flex flex-col justify-between h-[380px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                    <span className="font-mono text-[10px] text-text-muted uppercase flex items-center">
                      <FileCheck className="w-3.5 h-3.5 text-red-500 mr-1" /> Right Pane: Evidence Logs
                    </span>
                    <span className="font-mono text-[9px] text-red-500 font-bold">147 DAYS OVERDUE</span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="font-mono text-[11px] font-bold text-red-400 block">{activeGap.affectedEquipmentId} Ledger Records</span>
                    
                    <div className="bg-background-custom border border-border-custom rounded-lg p-2.5 h-[240px] overflow-y-auto space-y-2">
                      {activeGap.evidenceRecords.map(rec => (
                        <div key={rec.id} className="p-2 bg-surface border border-border-custom/50 rounded text-[11px] space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-text-primary font-mono">{rec.id}</span>
                            <span className="font-mono text-text-muted text-[9px]">{rec.date}</span>
                          </div>
                          <p className="text-text-secondary font-sans leading-tight">{rec.details}</p>
                          <div className="flex justify-end">
                            <span className={`text-[8px] font-mono font-bold px-1 rounded ${
                              rec.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {rec.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-text-muted uppercase pt-2 text-center border-t border-border-custom/30">
                  Deficiency in both SOP and practice
                </div>
              </div>

            </div>

            {/* ACTION FOOTER PANE */}
            <div className="bg-surface border border-border-custom rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                
                {/* 1. Action: Create Remediation */}
                <button
                  onClick={handleCreateRemediation}
                  disabled={activeGap.status === 'Remediating'}
                  className={`px-4 py-2 rounded font-mono text-[11px] font-bold flex items-center space-x-2 cursor-pointer transition-all ${
                    activeGap.status === 'Remediating' 
                      ? 'bg-primary/20 text-text-muted border border-border-custom cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary-hover text-white shadow-lg'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>{activeGap.status === 'Remediating' ? 'Remediation dispatched' : 'Dispatch Remediation Work Order'}</span>
                </button>

                {/* 2. Action: Assign Owner Toggle */}
                <button
                  onClick={() => {
                    setIsAssigning(!isAssigning);
                    setIsAcceptingRisk(false);
                  }}
                  className="px-4 py-2 bg-surface hover:bg-surface-muted text-text-primary rounded border border-border-custom font-mono text-[11px] font-bold flex items-center space-x-2 cursor-pointer transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign Owner</span>
                </button>

                {/* 3. Action: Accept Risk Toggle */}
                <button
                  onClick={() => {
                    setIsAcceptingRisk(!isAcceptingRisk);
                    setIsAssigning(false);
                  }}
                  className="px-4 py-2 bg-surface hover:bg-red-500/15 hover:text-red-400 text-text-secondary rounded border border-border-custom font-mono text-[11px] font-bold flex items-center space-x-2 cursor-pointer transition-all"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Accept Risk</span>
                </button>

              </div>

              <div className="text-[11px] text-text-muted font-mono uppercase">
                CRITICAL LOTO DIRECTIVE ALIGNMENT
              </div>
            </div>

            {/* INTERACTIVE FORM POPUPS FOR ACTIONS */}
            {isAssigning && (
              <form onSubmit={handleAssignOwnerSubmit} className="bg-surface border border-border-custom p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Assign Gap Ownership</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="e.g. Priya Sharma (HSE Lead)" 
                    value={selectedOwner}
                    onChange={(e) => setSelectedOwner(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-background-custom border border-border-custom rounded text-xs text-text-primary focus:outline-none"
                    required
                  />
                  <button type="submit" className="px-3 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-bold cursor-pointer transition-colors">
                    Save Owner
                  </button>
                </div>
              </form>
            )}

            {isAcceptingRisk && (
              <form onSubmit={handleAcceptRiskSubmit} className="bg-surface border border-border-custom p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider text-red-400">Formal Risk Acceptance Sign-off</h4>
                <p className="text-[10px] text-text-secondary">Justification is cryptographically locked into operational audit logs.</p>
                <div className="space-y-2">
                  <textarea 
                    rows={2}
                    placeholder="Specify physical risk containment justification (e.g., 'Auxiliary pressure lines verified on 12-hour shifts. Run scheduled during August block overhaul.')" 
                    value={riskJustification}
                    onChange={(e) => setRiskJustification(e.target.value)}
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded text-xs text-text-primary focus:outline-none font-sans"
                    required
                  />
                  <div className="flex justify-end space-x-2">
                    <button type="button" onClick={() => setIsAcceptingRisk(false)} className="px-3 py-1.5 bg-surface hover:bg-surface-muted text-text-secondary rounded text-xs font-mono font-bold cursor-pointer">
                      Cancel
                    </button>
                    <button type="submit" className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-mono font-bold cursor-pointer transition-colors">
                      Authorize Risk Acceptance
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* HISTORY AUDIT TIMELINE */}
            <div className="bg-surface border border-border-custom rounded-xl p-4 space-y-4">
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider flex items-center border-b border-border-custom/50 pb-2">
                <History className="w-4 h-4 text-primary mr-1" /> Audit Trail & History Timeline
              </h3>

              <div className="relative border-l border-border-custom/60 ml-2.5 pl-4 space-y-4 text-xs">
                {activeGap.history.map(item => (
                  <div key={item.id} className="relative">
                    {/* Bullet marker */}
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background-custom" />
                    
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-text-primary">{item.action}</span>
                        <span className="font-mono text-[9px] text-text-muted">{item.date}</span>
                        <span className="text-text-muted text-[10px] font-mono">• by {item.user}</span>
                      </div>
                      {item.comment && (
                        <p className="text-text-secondary leading-relaxed font-sans">{item.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )
      )}

    </div>
  );
}
