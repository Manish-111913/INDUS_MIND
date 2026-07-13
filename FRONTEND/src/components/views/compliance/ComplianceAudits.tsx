/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Calendar, FileCheck, HelpCircle, ArrowRight, Download, Share2, 
  Layers, RefreshCw, CheckCircle, Shield, Plus, Clock, ExternalLink, Sparkles
} from 'lucide-react';
import { Audit, EvidencePackage, INITIAL_AUDITS, INITIAL_EVIDENCE_PACKAGES } from './mockComplianceData';
import { StatusChip, Select } from '../../shared';

interface ComplianceAuditsProps {
  audits: Audit[];
  evidencePackages: EvidencePackage[];
  onUpdateEvidencePackages: (updated: EvidencePackage[]) => void;
}

export function ComplianceAudits({
  audits = INITIAL_AUDITS,
  evidencePackages = INITIAL_EVIDENCE_PACKAGES,
  onUpdateEvidencePackages
}: ComplianceAuditsProps) {
  
  // Wizard states
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Form selections
  const [selectedRegSet, setSelectedRegSet] = useState('OISD-STD-118');
  const [selectedArea, setSelectedArea] = useState('Utility Block (Area C)');
  const [selectedDateRange, setSelectedDateRange] = useState('2026-04-01 to 2026-07-01');

  // Compilation live counter & text
  const [liveCounter, setLiveCounter] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');

  // Generated package placeholder
  const [latestPackage, setLatestPackage] = useState<EvidencePackage | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'In Progress': return 'bg-primary/10 text-primary border border-primary/20 animate-pulse';
      default: return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    }
  };

  // Launch Evidence Compilation Wizard
  const handleStartCompilation = () => {
    setIsWizardOpen(true);
    setWizardStep(1);
    setLiveCounter(0);
  };

  const handleRunCompilation = () => {
    setWizardStep(2);
    setLiveCounter(4);
    setLiveMessage('Scanning regulatory mapping schemas...');

    const subSteps = [
      { count: 12, msg: 'Matching active SOP structures (SOP-114)...' },
      { count: 21, msg: 'Retrieving physical equipment telemetry indices...' },
      { count: 34, msg: 'Collecting cited maintenance logs & work orders (WO-1029)...' },
      { count: 48, msg: 'Synthesizing LOTO authorization permitting proofs...' },
      { count: 52, msg: 'Hashing evidence bundle into compliance ledger...' }
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < subSteps.length) {
        setLiveCounter(subSteps[idx].count);
        setLiveMessage(subSteps[idx].msg);
        idx++;
      } else {
        clearInterval(interval);
        
        // Generate new package
        const newPkg: EvidencePackage = {
          id: `EV-${Date.now().toString().slice(-4)}`,
          name: `${selectedRegSet.split(' (')[0]} Audit Compliance Pack`,
          regulations: [selectedRegSet],
          plantArea: selectedArea,
          dateRange: selectedDateRange,
          itemCount: 52,
          coveragePercent: selectedRegSet === 'OISD-STD-118' ? 85 : 100, // ties to OISD gap story
          generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          downloadUrl: '#',
          shareLink: `https://indusmind.app/share/ev-${Math.random().toString(36).slice(2, 7)}`
        };

        // Prepend to history list
        onUpdateEvidencePackages([newPkg, ...evidencePackages]);
        setLatestPackage(newPkg);
        setWizardStep(3);
      }
    }, 1200);
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- COMPILATION WIZARD PANEL ----------------- */}
      {isWizardOpen ? (
        <div className="bg-surface border border-[#0E7C86]/30 bg-gradient-to-br from-[#0B0F12] to-[#13191D] p-6 rounded-xl space-y-6 relative overflow-hidden">
          <div 
            className="absolute inset-0 opacity-[0.02] pointer-events-none" 
            style={{
              backgroundImage: `linear-gradient(#0E7C86 1px, transparent 1px), linear-gradient(90deg, #0E7C86 1px, transparent 1px)`,
              backgroundSize: '20px 20px'
            }}
          />

          <div className="flex justify-between items-center border-b border-border-custom/50 pb-3">
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider flex items-center">
              <Sparkles className="w-4.5 h-4.5 text-primary mr-1.5 animate-pulse" /> Automatic Evidence Pack Compiler Wizard
            </h3>
            <button 
              onClick={() => {
                setIsWizardOpen(false);
                setWizardStep(1);
              }} 
              className="text-text-secondary hover:text-white font-mono text-xs cursor-pointer"
            >
              Close Wizard [ESC]
            </button>
          </div>

          {/* STEP 1: SCOPE SELECTOR */}
          {wizardStep === 1 && (
            <div className="max-w-xl mx-auto space-y-5">
              <div className="text-center space-y-1.5">
                <span className="text-[10px] font-mono text-primary uppercase font-bold tracking-widest bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full inline-block">Step 1 of 3: Scope Definings</span>
                <p className="text-xs text-text-secondary leading-relaxed">Specify target regulations, refinery areas, and dates. AI will compile all corresponding SOPs, work logs, and safety tags.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-mono text-text-muted uppercase">Regulatory Standard Set</label>
                  <Select
                    value={selectedRegSet}
                    onValueChange={(v) => setSelectedRegSet(v)}
                    className="w-full px-3 py-2 text-xs"
                    options={[
                      { value: 'OISD-STD-118', label: 'OISD-STD-118 (Firewater Protection)' },
                      { value: 'Factory Act Sec 21', label: 'Factory Act Sec 21 (Machinery Guards)' },
                      { value: 'PESO Valve Dir v5', label: 'PESO Valve Dir v5 (Overpressure)' },
                      { value: 'EPA Rule Sec 12', label: 'EPA Rule Sec 12 (Stack Emissions)' },
                    ]}
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-mono text-text-muted uppercase">Target Plant Area</label>
                  <Select
                    value={selectedArea}
                    onValueChange={(v) => setSelectedArea(v)}
                    className="w-full px-3 py-2 text-xs"
                    options={[
                      { value: 'Utility Block (Area C)', label: 'Utility Block (Area C)' },
                      { value: 'Crude Distillation (Area A)', label: 'Crude Distillation Unit (Area A)' },
                      { value: 'Hydrotreater (Area B)', label: 'Hydrotreater Unit (Area B)' },
                      { value: 'Tank Farm (Area D)', label: 'Tank Farm (Area D)' },
                    ]}
                  />
                </div>

                <div className="space-y-1.5 text-left md:col-span-2">
                  <label className="block text-[10px] font-mono text-text-muted uppercase">Assurance Date Range</label>
                  <Select
                    value={selectedDateRange}
                    onValueChange={(v) => setSelectedDateRange(v)}
                    className="w-full px-3 py-2 text-xs"
                    options={[
                      { value: '2026-04-01 to 2026-07-01', label: 'Q2 2026 (2026-04-01 to 2026-07-01)' },
                      { value: '2026-01-01 to 2026-07-01', label: 'Last 6 Months (2026-01-01 to 2026-07-01)' },
                      { value: '2025-07-01 to 2026-07-01', label: 'Full Year Audit Span' },
                    ]}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border-custom/30 flex justify-end">
                <button
                  onClick={handleRunCompilation}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded flex items-center space-x-1.5 cursor-pointer transition-all uppercase tracking-wider"
                >
                  <span>Compile Evidence Package</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: GENERATING PROGRESS METER */}
          {wizardStep === 2 && (
            <div className="max-w-md mx-auto text-center space-y-4 py-6">
              <span className="text-[10px] font-mono text-amber-500 uppercase font-bold tracking-widest bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full inline-block">Step 2 of 3: AI Gathering</span>
              
              <div className="space-y-2 pt-2">
                <p className="text-xs font-mono text-primary animate-pulse">{liveMessage}</p>
                <div className="w-full bg-surface-muted h-3 rounded-full overflow-hidden border border-border-custom p-[2px]">
                  <div className="bg-primary h-full transition-all duration-300 rounded-full" style={{ width: `${(liveCounter / 52) * 100}%` }} />
                </div>
              </div>

              <div className="p-3.5 bg-background-custom border border-border-custom rounded-lg font-mono text-[11px] text-[#F5A524] inline-block">
                LIVE COMPILING COUNTER: <strong className="text-text-primary text-xs">{liveCounter}</strong> CITED DOCUMENTS COLLECTED
              </div>
            </div>
          )}

          {/* STEP 3: COMPILATION READY & DOWNLOAD SCREEN */}
          {wizardStep === 3 && latestPackage && (
            <div className="max-w-xl mx-auto space-y-5 text-center">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full inline-block">
                <CheckCircle className="w-10 h-10 animate-pulse" />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold tracking-widest bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full inline-block">Step 3 of 3: Proof Package Ready</span>
                <h3 className="font-display text-md font-bold text-white uppercase tracking-wider mt-1">{latestPackage.name}</h3>
                <p className="text-xs text-text-secondary leading-relaxed max-w-sm mx-auto">AI compilation scanned and consolidated {latestPackage.itemCount} files of evidence into a secure signed folder.</p>
              </div>

              <div className="bg-background-custom border border-border-custom rounded-xl p-4 grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="border-r border-border-custom/50">
                  <span className="block text-text-muted text-[10px] uppercase">COVERAGE</span>
                  <span className="block font-bold text-emerald-400 text-sm mt-0.5">{latestPackage.coveragePercent}%</span>
                </div>
                <div className="border-r border-border-custom/50">
                  <span className="block text-text-muted text-[10px] uppercase">ITEMS CITATED</span>
                  <span className="block font-bold text-text-primary text-sm mt-0.5">{latestPackage.itemCount} Logs</span>
                </div>
                <div>
                  <span className="block text-text-muted text-[10px] uppercase">SECURITY HASH</span>
                  <span className="block font-bold text-primary text-[10px] mt-1 select-all truncate">#md5-82b1c</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-3">
                <button
                  onClick={() => alert('Downloading evidence-pack-immutable-OISD.zip (18.4 MB)...')}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold font-mono rounded flex items-center justify-center space-x-1.5 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF/ZIP (18.4MB)</span>
                </button>

                <button
                  onClick={() => alert(`Copied secure shareable URL: ${latestPackage.shareLink}`)}
                  className="px-5 py-2.5 bg-surface hover:bg-surface-muted text-text-primary rounded border border-border-custom text-xs font-mono font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all"
                >
                  <Share2 className="w-4 h-4 text-primary" />
                  <span>Copy Secure Share-with-Auditor Link</span>
                </button>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setIsWizardOpen(false);
                    setWizardStep(1);
                  }}
                  className="text-text-muted hover:text-white font-mono text-[10px] hover:underline cursor-pointer"
                >
                  Return to Audits Hub
                </button>
              </div>
            </div>
          )}

        </div>
      ) : (
        /* ----------------- STANDALONE ACTION BANNER ----------------- */
        <div className="p-5 bg-surface border border-primary/20 bg-gradient-to-r from-surface to-primary/5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-sm font-bold text-text-primary uppercase tracking-wider flex items-center">
              <Shield className="w-4.5 h-4.5 text-primary mr-1.5" /> Immutable Evidence Compiler
            </h3>
            <p className="text-xs text-text-secondary">Consolidate work orders, maintenance checklists, and active plant procedures to satisfy upcoming audits.</p>
          </div>

          <button
            onClick={handleStartCompilation}
            className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded flex items-center space-x-1.5 self-start md:self-center cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Proof Package Wizard</span>
          </button>
        </div>
      )}

      {/* ----------------- LOWER INDEX: AUDITS INDEX & BUNDLE INDEX ----------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left: Audits Calendar List - 7 Cols */}
        <div className="xl:col-span-7 bg-surface border border-border-custom rounded-xl p-5 space-y-4">
          <h3 className="font-display text-sm font-bold text-text-primary uppercase tracking-wider border-b border-border-custom/50 pb-2 flex items-center">
            <Calendar className="w-4 h-4 text-primary mr-1.5" /> Scheduled HSE Audits & Sweeps
          </h3>

          <div className="space-y-3">
            {audits.map((audit) => (
              <div 
                key={audit.id}
                className="p-3.5 bg-surface-muted/30 hover:bg-surface-muted/50 border border-border-custom hover:border-text-muted/30 rounded-lg flex items-center justify-between gap-4 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[9px] bg-background-custom border border-border-custom px-2 py-0.5 rounded text-text-muted uppercase">
                      {audit.date}
                    </span>
                    <span className={`text-[9px] font-mono px-1.5 rounded font-bold uppercase ${getStatusColor(audit.status)}`}>
                      {audit.status}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-text-primary leading-snug">{audit.title}</h4>
                  
                  <div className="grid grid-cols-2 gap-4 text-[10px] text-text-secondary font-mono">
                    <div>
                      <span>SCOPE: </span>
                      <strong className="text-primary">{audit.regulationSet}</strong>
                    </div>
                    <div>
                      <span>AUDITOR: </span>
                      <strong className="text-text-primary">{audit.auditor.split(' (')[0]}</strong>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedRegSet(audit.regulationSet);
                    setSelectedArea(audit.plantArea);
                    setIsWizardOpen(true);
                    setWizardStep(1);
                  }}
                  className="px-2.5 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/25 rounded text-[10px] font-mono font-bold cursor-pointer transition-all whitespace-nowrap"
                >
                  Match Pack
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Evidence Packages Generated History - 5 Cols */}
        <div className="xl:col-span-5 bg-surface border border-border-custom rounded-xl p-5 space-y-4">
          <h3 className="font-display text-sm font-bold text-text-primary uppercase tracking-wider border-b border-border-custom/50 pb-2 flex items-center">
            <Clock className="w-4 h-4 text-primary mr-1.5" /> Package Build History
          </h3>

          <div className="space-y-3">
            {evidencePackages.map((pkg) => (
              <div key={pkg.id} className="p-3 bg-background-custom/40 border border-border-custom/60 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-text-primary">{pkg.name}</h4>
                    <span className="font-mono text-[9px] text-text-muted">BUILT: {pkg.generatedAt}</span>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    {pkg.coveragePercent}% MAPPED
                  </span>
                </div>

                <div className="text-[10px] font-mono text-text-secondary space-y-0.5">
                  <div>
                    <span>Scope: </span>
                    <strong className="text-text-primary">{pkg.regulations.join(', ')}</strong>
                  </div>
                  <div>
                    <span>Region: </span>
                    <strong className="text-text-primary">{pkg.plantArea.split(' (')[0]}</strong>
                  </div>
                  <div>
                    <span>Consolidated: </span>
                    <strong className="text-text-primary">{pkg.itemCount} cited records</strong>
                  </div>
                </div>

                <div className="flex justify-between pt-1 border-t border-border-custom/40">
                  <button
                    onClick={() => alert('Downloading compiled pack (ZIP)...')}
                    className="text-[10px] font-mono text-primary hover:underline flex items-center"
                  >
                    <Download className="w-3 h-3 mr-1" /> PDF/ZIP
                  </button>

                  <button
                    onClick={() => alert(`Copied secure URL: ${pkg.shareLink}`)}
                    className="text-[10px] font-mono text-text-muted hover:text-text-primary flex items-center"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" /> Share link
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
