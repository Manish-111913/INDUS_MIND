/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldAlert, FileText, Bell, Calendar, Layers, ShieldCheck } from 'lucide-react';
import { 
  INITIAL_REGULATIONS, 
  INITIAL_GAPS, 
  INITIAL_AUDITS, 
  INITIAL_EVIDENCE_PACKAGES,
  Regulation,
  ComplianceGap,
  Audit,
  EvidencePackage
} from './mockComplianceData';
import { ComplianceOverview } from './ComplianceOverview';
import { ComplianceRegulations } from './ComplianceRegulations';
import { ComplianceGaps } from './ComplianceGaps';
import { ComplianceAudits } from './ComplianceAudits';

export default function ComplianceHub() {
  
  // Tab states: 'overview' | 'regulations' | 'gaps' | 'audits'
  const [activeTab, setActiveTab] = useState<'overview' | 'regulations' | 'gaps' | 'audits'>('overview');

  // Sub-detail states matched from hash URLs
  const [selectedRegId, setSelectedRegId] = useState<string | null>(null);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);

  // Pre-filter drills state (e.g. from heatmap clicks)
  const [drillFilters, setDrillFilters] = useState<{ regulation?: string; area?: string } | undefined>(undefined);

  // ----------------- COMPLIANCE PERSISTED STATES -----------------
  
  // 1. Regulations
  const [regulations, setRegulations] = useState<Regulation[]>(() => {
    const stored = localStorage.getItem('indusmind_compliance_regulations');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_REGULATIONS;
  });

  // 2. Gaps
  const [gaps, setGaps] = useState<ComplianceGap[]>(() => {
    const stored = localStorage.getItem('indusmind_compliance_gaps');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_GAPS;
  });

  // 3. Audits
  const [audits, setAudits] = useState<Audit[]>(() => {
    const stored = localStorage.getItem('indusmind_compliance_audits');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_AUDITS;
  });

  // 4. Evidence Packages
  const [evidencePackages, setEvidencePackages] = useState<EvidencePackage[]>(() => {
    const stored = localStorage.getItem('indusmind_compliance_evidence_packages');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_EVIDENCE_PACKAGES;
  });

  // ----------------- SUB-ROUTING SYNC via hashchange -----------------
  useEffect(() => {
    const parseHashRoute = () => {
      const hash = window.location.hash || '';

      // 1. Gaps routing: e.g. #compliance/gaps/GAP-OISD-118-01
      if (hash.startsWith('#compliance/gaps/')) {
        const parts = hash.split('/');
        const gapId = parts[2];
        setSelectedGapId(gapId);
        setActiveTab('gaps');
        setSelectedRegId(null);
        return;
      }

      if (hash === '#compliance/gaps') {
        setActiveTab('gaps');
        setSelectedGapId(null);
        setSelectedRegId(null);
        return;
      }

      // 2. Regulations routing: e.g. #compliance/regulations/REG-OISD-118
      if (hash.startsWith('#compliance/regulations/')) {
        const parts = hash.split('/');
        const regId = parts[2];
        setSelectedRegId(regId);
        setActiveTab('regulations');
        setSelectedGapId(null);
        return;
      }

      if (hash === '#compliance/regulations') {
        setActiveTab('regulations');
        setSelectedRegId(null);
        setSelectedGapId(null);
        return;
      }

      // 3. Audits / Evidence routing
      if (hash === '#compliance/audits' || hash === '#compliance/evidence') {
        setActiveTab('audits');
        setSelectedGapId(null);
        setSelectedRegId(null);
        return;
      }

      // 4. Fallback Overview
      setActiveTab('overview');
      setSelectedGapId(null);
      setSelectedRegId(null);
    };

    parseHashRoute();
    window.addEventListener('hashchange', parseHashRoute);
    return () => window.removeEventListener('hashchange', parseHashRoute);
  }, []);

  // ----------------- STATE MODIFIERS WITH SYNC -----------------

  const handleUpdateRegulations = (updated: Regulation[]) => {
    setRegulations(updated);
    localStorage.setItem('indusmind_compliance_regulations', JSON.stringify(updated));
  };

  const handleUpdateGaps = (updated: ComplianceGap[]) => {
    setGaps(updated);
    localStorage.setItem('indusmind_compliance_gaps', JSON.stringify(updated));
  };

  const handleUpdateEvidencePackages = (updated: EvidencePackage[]) => {
    setEvidencePackages(updated);
    localStorage.setItem('indusmind_compliance_evidence_packages', JSON.stringify(updated));
  };

  // Cross-module callback: bridges remediation tasks to MaintenanceHub core state
  const handleAddRemediationWorkOrder = (newWo: any) => {
    // Read current work orders from main maintenance localStorage
    const mainMaintKey = 'indusmind_work_orders';
    const storedWos = localStorage.getItem(mainMaintKey);
    let currentWos = [];
    if (storedWos) {
      try {
        currentWos = JSON.parse(storedWos);
      } catch (e) {}
    }
    
    // Add new work order
    const updatedWos = [newWo, ...currentWos];
    localStorage.setItem(mainMaintKey, JSON.stringify(updatedWos));
  };

  // Heatmap click drill-down pre-filtering handler
  const handleHeatmapDrilldown = (filterReg?: string, filterArea?: string) => {
    if (filterReg || filterArea) {
      setDrillFilters({ regulation: filterReg, area: filterArea });
    } else {
      setDrillFilters(undefined);
    }
    window.location.hash = '#compliance/gaps';
  };

  // Count active compliance gaps of each level for real-time overview metrics
  const getGapsSeverityCount = () => {
    return {
      total: gaps.length,
      critical: gaps.filter(g => g.severity === 'Critical').length,
      high: gaps.filter(g => g.severity === 'High').length,
      medium: gaps.filter(g => g.severity === 'Medium').length,
      low: gaps.filter(g => g.severity === 'Low').length,
    };
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- SUB-TABS NAVIGATION HEADER ----------------- */}
      {!selectedGapId && !selectedRegId && (
        <div className="border-b border-border-custom pb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <ShieldCheck className="w-6.5 h-6.5 text-primary animate-pulse" />
              <span>Federal Compliance & Verification Command</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Cross-examine federal OISD firewater rules, map machinery enclosures, and compile cryptographically signed compliance audit books.
            </p>
          </div>

          {/* Tab Switchers */}
          <div className="flex bg-surface p-1 rounded border border-border-custom text-xs self-start">
            <button
              onClick={() => {
                setActiveTab('overview');
                setDrillFilters(undefined);
                window.location.hash = '#compliance';
              }}
              className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                activeTab === 'overview' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => {
                setActiveTab('regulations');
                window.location.hash = '#compliance/regulations';
              }}
              className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                activeTab === 'regulations' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Regulations
            </button>

            <button
              onClick={() => {
                setActiveTab('gaps');
                window.location.hash = '#compliance/gaps';
              }}
              className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                activeTab === 'gaps' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Gaps & compare ({gaps.length})
            </button>

            <button
              onClick={() => {
                setActiveTab('audits');
                window.location.hash = '#compliance/audits';
              }}
              className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                activeTab === 'audits' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Audits & Evidence
            </button>
          </div>
        </div>
      )}

      {/* ----------------- RENDER RELEVANT ACTIVE VIEW TAB ----------------- */}

      {activeTab === 'overview' && (
        <ComplianceOverview
          onNavigateToGaps={handleHeatmapDrilldown}
          onNavigateToRegulations={(regId) => {
            window.location.hash = regId ? `#compliance/regulations/${regId}` : '#compliance/regulations';
          }}
          onNavigateToAudits={() => {
            window.location.hash = '#compliance/audits';
          }}
          gapsCount={getGapsSeverityCount()}
        />
      )}

      {activeTab === 'regulations' && (
        <ComplianceRegulations
          regulations={regulations}
          selectedRegId={selectedRegId}
          onSelectReg={(id) => {
            window.location.hash = id ? `#compliance/regulations/${id}` : '#compliance/regulations';
          }}
          onUpdateRegulations={handleUpdateRegulations}
        />
      )}

      {activeTab === 'gaps' && (
        <ComplianceGaps
          gaps={gaps}
          selectedGapId={selectedGapId}
          onSelectGap={(id) => {
            window.location.hash = id ? `#compliance/gaps/${id}` : '#compliance/gaps';
          }}
          onUpdateGaps={handleUpdateGaps}
          onAddWorkOrder={handleAddRemediationWorkOrder}
          initialFilters={drillFilters}
        />
      )}

      {activeTab === 'audits' && (
        <ComplianceAudits
          audits={audits}
          evidencePackages={evidencePackages}
          onUpdateEvidencePackages={handleUpdateEvidencePackages}
        />
      )}

    </div>
  );
}
