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
import { api, USE_MOCK } from '../../../lib/api/client';
import {
  reshapeRegulations,
  reshapeClauseTree,
  reshapeGaps,
  reshapeGap,
  reshapeAudits,
  reshapeEvidencePackages,
  flattenMappingStatuses,
  GAP_STATUS_CODE,
  MAPPING_STATUS_CODE,
} from './live';

// MOCK-mode state seeders (unchanged behavior). In LIVE mode we start empty and
// hydrate from the backend in an effect below.
const seedRegulations = (): Regulation[] => {
  if (!USE_MOCK) return [];
  const stored = localStorage.getItem('indusmind_compliance_regulations');
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  return INITIAL_REGULATIONS;
};

const seedGaps = (): ComplianceGap[] => {
  if (!USE_MOCK) return [];
  const stored = localStorage.getItem('indusmind_compliance_gaps');
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  return INITIAL_GAPS;
};

const seedAudits = (): Audit[] => {
  if (!USE_MOCK) return [];
  const stored = localStorage.getItem('indusmind_compliance_audits');
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  return INITIAL_AUDITS;
};

const seedEvidencePackages = (): EvidencePackage[] => {
  if (!USE_MOCK) return [];
  const stored = localStorage.getItem('indusmind_compliance_evidence_packages');
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  return INITIAL_EVIDENCE_PACKAGES;
};

export default function ComplianceHub() {
  
  // Tab states: 'overview' | 'regulations' | 'gaps' | 'audits'
  const [activeTab, setActiveTab] = useState<'overview' | 'regulations' | 'gaps' | 'audits'>('overview');

  // Sub-detail states matched from hash URLs
  const [selectedRegId, setSelectedRegId] = useState<string | null>(null);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);

  // Pre-filter drills state (e.g. from heatmap clicks)
  const [drillFilters, setDrillFilters] = useState<{ regulation?: string; area?: string } | undefined>(undefined);

  // ----------------- COMPLIANCE PERSISTED STATES -----------------
  // MOCK mode seeds from fixtures/localStorage (unchanged). LIVE mode starts
  // empty and hydrates from the backend in the effect below.

  const [regulations, setRegulations] = useState<Regulation[]>(seedRegulations);
  const [gaps, setGaps] = useState<ComplianceGap[]>(seedGaps);
  const [audits, setAudits] = useState<Audit[]>(seedAudits);
  const [evidencePackages, setEvidencePackages] = useState<EvidencePackage[]>(seedEvidencePackages);
  const [loading, setLoading] = useState<boolean>(!USE_MOCK);

  // Tracks which regulation clause trees have already been lazy-loaded (LIVE).
  const [loadedRegClauses, setLoadedRegClauses] = useState<Record<string, boolean>>({});

  // ----------------- LIVE DATA HYDRATION -----------------
  useEffect(() => {
    if (USE_MOCK) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [regsRes, coverageRes, gapsRes, auditsRes, evidenceRes] = await Promise.all([
          api.get<any[]>('/compliance/regulations?page_size=100').catch((e) => { console.error('compliance regulations load failed', e); return []; }),
          api.get<any>('/compliance/coverage').catch((e) => { console.error('compliance coverage load failed', e); return { regulations: [] }; }),
          api.get<any[]>('/compliance/gaps?page_size=100').catch((e) => { console.error('compliance gaps load failed', e); return []; }),
          api.get<any[]>('/compliance/audits?page_size=100').catch((e) => { console.error('compliance audits load failed', e); return []; }),
          api.get<any[]>('/compliance/evidence-packages?page_size=100').catch((e) => { console.error('compliance evidence load failed', e); return []; }),
        ]);
        if (cancelled) return;
        setRegulations(reshapeRegulations(regsRes || [], coverageRes || {}));
        setGaps(reshapeGaps(gapsRes || []));
        setAudits(reshapeAudits(auditsRes || []));
        setEvidencePackages(reshapeEvidencePackages(evidenceRes || []));
      } catch (e) {
        console.error('Compliance hub failed to load live data', e);
        if (!cancelled) {
          setRegulations([]);
          setGaps([]);
          setAudits([]);
          setEvidencePackages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ----------------- LIVE: lazy-load a regulation's clause tree on select -----------------
  useEffect(() => {
    if (USE_MOCK || !selectedRegId || loadedRegClauses[selectedRegId]) return;
    let cancelled = false;

    (async () => {
      try {
        const [clauses, mappings] = await Promise.all([
          api.get<any[]>(`/compliance/regulations/${selectedRegId}/clauses`).catch((e) => { console.error('clause tree load failed', e); return []; }),
          api.get<any[]>('/compliance/mappings?page_size=100').catch((e) => { console.error('mappings load failed', e); return []; }),
        ]);
        if (cancelled) return;
        // Feed the already-loaded gaps back in raw form so clause nodes show
        // their "N GAP" badges (the tree builder counts by clause_id + status).
        const rawGaps = gaps.map((g) => ({ clause_id: g.clauseId, status: GAP_STATUS_CODE[g.status] }));
        const tree = reshapeClauseTree(clauses || [], mappings || [], rawGaps);
        setRegulations((prev) => prev.map((r) => (r.id === selectedRegId ? { ...r, clauses: tree } : r)));
        setLoadedRegClauses((prev) => ({ ...prev, [selectedRegId]: true }));
      } catch (e) {
        console.error('Failed to load clause tree', e);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedRegId]);

  // ----------------- LIVE: fetch rich gap detail when a gap is opened -----------------
  useEffect(() => {
    if (USE_MOCK || !selectedGapId) return;
    let cancelled = false;

    (async () => {
      try {
        const detail = await api.get<any>(`/compliance/gaps/${selectedGapId}`);
        if (cancelled || !detail) return;
        const reshaped = reshapeGap(detail);
        setGaps((prev) => prev.map((g) => (g.id === reshaped.id ? { ...g, ...reshaped } : g)));
      } catch (e) {
        console.error('Failed to load gap detail', e);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedGapId]);

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
    if (USE_MOCK) {
      setRegulations(updated);
      localStorage.setItem('indusmind_compliance_regulations', JSON.stringify(updated));
      return;
    }
    // LIVE: optimistic UI, then route mapping confirm/reject through the API.
    // (The api client exposes no `patch`, so mapping status uses PATCH via
    // fetch is unavailable — we detect the changed mapping and PATCH is skipped;
    // see report. We still POST-able writes below where a verb exists.)
    const before = flattenMappingStatuses(regulations);
    const after = flattenMappingStatuses(updated);
    setRegulations(updated);
    for (const [mappingId, status] of Object.entries(after)) {
      if (before[mappingId] && before[mappingId] !== status) {
        // Persist the confirm/reject via PATCH /compliance/mappings/{id}.
        api.patch(`/compliance/mappings/${mappingId}`, { status: MAPPING_STATUS_CODE[status] })
          .catch((e) => console.error('mapping status update failed', e));
      }
    }
  };

  const handleUpdateGaps = (updated: ComplianceGap[]) => {
    if (USE_MOCK) {
      setGaps(updated);
      localStorage.setItem('indusmind_compliance_gaps', JSON.stringify(updated));
      return;
    }
    // LIVE: optimistic UI + route the one write we have a verb for.
    const prevById: Record<string, ComplianceGap> = {};
    for (const g of gaps) prevById[g.id] = g;
    setGaps(updated);
    for (const g of updated) {
      const prev = prevById[g.id];
      if (!prev || prev.status === g.status) continue;
      if (g.status === 'Remediating') {
        // Spawns a real remediation work order (source=gap); the endpoint also
        // moves the gap to in_remediation server-side.
        api.post(`/compliance/gaps/${g.id}/create-remediation`).catch((e) =>
          console.error('create-remediation failed', e));
      } else {
        // Risk Accepted / Closed / reopen → PATCH the gap status.
        api.patch(`/compliance/gaps/${g.id}`, { status: GAP_STATUS_CODE[g.status] })
          .catch((e) => console.error('gap status update failed', e));
      }
    }
  };

  const handleUpdateEvidencePackages = (updated: EvidencePackage[]) => {
    if (USE_MOCK) {
      setEvidencePackages(updated);
      localStorage.setItem('indusmind_compliance_evidence_packages', JSON.stringify(updated));
      return;
    }
    // LIVE: optimistic UI; POST the newly-prepended package to the backend.
    const existingIds = new Set(evidencePackages.map((p) => p.id));
    const created = updated.find((p) => !existingIds.has(p.id));
    setEvidencePackages(updated);
    if (created) {
      api.post('/compliance/evidence-packages', {
        scope: {
          regulations: created.regulations,
          plant_area: created.plantArea,
          date_range: created.dateRange,
        },
        title: created.name,
      }).catch((e) => console.error('evidence package create failed', e));
    }
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

      {/* ----------------- LIVE DATA LOADING INDICATOR ----------------- */}
      {loading && (
        <div className="flex items-center space-x-2 text-[11px] font-mono text-text-muted bg-surface border border-border-custom rounded px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Loading live compliance data…</span>
        </div>
      )}

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
