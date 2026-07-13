/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, Cpu, Network, Wrench, ShieldAlert, Check, Plus, 
  ArrowRight, Sparkles, Filter, ExternalLink, RefreshCw, 
  CheckCircle, AlertTriangle, Info, Users, MapPin, Share2, 
  TrendingUp, Compass, Bookmark, BookmarkCheck, ArrowLeft, Bell
} from 'lucide-react';
import { StatusChip, ConfidenceBadge, SkeletonLoader, Select } from '../../shared';

export interface Lesson {
  id: string;
  title: string;
  shortDesc: string;
  narrative: string;
  preventiveAction: string;
  area: string;
  equipment: string[];
  confidence: number;
  evidenceCount: number;
  downtimeCost: string;
  status: 'Candidate' | 'Published';
  sourceIncidents: { id: string; name: string; plant: string; date: string; link: string }[];
  externalReferences: { title: string; source: string; link: string }[];
  isSubscribed?: boolean;
}

const INITIAL_LESSONS: Lesson[] = [
  {
    id: 'LL-2041',
    title: 'Mechanical Seal Failures Cluster Post-Monsoon Startups',
    shortDesc: 'Mechanical seal failures cluster within 2 weeks of monsoon-season startups — 7 incidents across 3 plants, ₹42L downtime cost.',
    narrative: 'Following heavy downpours, high ambient humidity causes minor condensation in the external buffer fluid lines. During startup sequences, this particulate-heavy moisture is pulled directly into the seal flush chamber, raising mechanical resistance, causing micro-friction, and shattering the carbon/silicon face within 14 days.',
    preventiveAction: 'Purge buffer lines and execute a clean flushing cycle with demineralized water for at least 30 minutes prior to monsoonal cold startup. Install moisture-absorbing silica breathers on buffer reservoirs.',
    area: 'Crude Block',
    equipment: ['P-101A', 'P-101B'],
    confidence: 94,
    evidenceCount: 7,
    downtimeCost: '₹42L',
    status: 'Published',
    sourceIncidents: [
      { id: 'INC-991', name: 'Feed Pump Seal Rupture', plant: 'Reliance Jamnagar Refinery - Sector A', date: '2025-06-18', link: '#documents' },
      { id: 'INC-822', name: 'Refinery Sector B Main Seal Shatter', plant: 'Reliance Jamnagar Refinery - Sector B', date: '2025-07-02', link: '#documents' },
      { id: 'INC-714', name: 'Deepwater Feed Pump Seal Fracture', plant: 'KG-D6 Deepwater Gas Field Terminal', date: '2025-08-11', link: '#documents' }
    ],
    externalReferences: [
      { title: 'API Standard 682: Pumps - Shaft Sealing Systems', source: 'American Petroleum Institute', link: 'https://www.api.org' },
      { title: 'OEM Flowserve Mechanical Seal Manual - Section 4', source: 'Flowserve Corp', link: '#documents' }
    ],
    isSubscribed: true
  },
  {
    id: 'LL-2042',
    title: 'Impeller Cavitation Under Low Net Positive Suction Head',
    shortDesc: 'Impeller cavitation spikes during light-end cracking runs when suction pressure drops below 1.2 Bar — ₹18L overhaul cost.',
    narrative: 'During shifts in crude composition containing lighter hydrocarbon fractions, the flashing point decreases. When the suction head pressure is maintained at standard nominal limits of 1.2 Bar, localized gas vapor lock pockets form in the impeller eye. This causes high-velocity micro-implosions, pitting the impeller vanes and causing massive vibration deviation.',
    preventiveAction: 'Update DCS flow guidelines to dynamically throttle the discharge bypass control valve when crude light-ends exceed 18% mole fraction, keeping suction head above 1.5 Bar.',
    area: 'Cat Cracker',
    equipment: ['P-101A', 'P-103'],
    confidence: 87,
    evidenceCount: 4,
    downtimeCost: '₹18L',
    status: 'Published',
    sourceIncidents: [
      { id: 'INC-911', name: 'Fractionator Feed Pump Cavitation', plant: 'Hazira Petrochemicals Complex - Unit 4', date: '2025-10-14', link: '#documents' },
      { id: 'INC-612', name: 'Primary Impeller Pitting Incident', plant: 'Reliance Jamnagar Refinery - Sector A', date: '2026-01-20', link: '#documents' }
    ],
    externalReferences: [
      { title: 'Hydraulic Institute Standard 9.6.1: NPSH Margin', source: 'Hydraulic Institute', link: 'https://pumps.org' }
    ],
    isSubscribed: false
  },
  {
    id: 'LL-2043',
    title: 'Stator Core Thermal Overheating on Reciprocating Compressors',
    shortDesc: 'Stator core insulation degradation accelerates when ambient temperature exceeds 42°C paired with continuous load cycles >90%.',
    narrative: 'During peak summer months, standard ventilation louvers fail to dump thermal energy from large compressor enclosures. Combined with continuous peak loading on Compressor C-302B, winding temperatures reach 138°C, cracking the mica-resin insulation and risking high-voltage short-to-ground faults.',
    preventiveAction: 'Deploy auxiliary active mechanical ventilation units inside Compressor Enclosure Block C when ambient temps exceed 38°C. Set winding temperature safety trip-points to 130°C in DCS.',
    area: 'Utilities block',
    equipment: ['C-302B'],
    confidence: 91,
    evidenceCount: 3,
    downtimeCost: '₹35L',
    status: 'Candidate',
    sourceIncidents: [
      { id: 'INC-551', name: 'Compressor Stator Winding Short', plant: 'Reliance Jamnagar Refinery - Sector A', date: '2025-05-12', link: '#documents' }
    ],
    externalReferences: [
      { title: 'IEEE Std 43-2013: Testing Insulation Resistance', source: 'IEEE Power & Energy Society', link: 'https://ieee.org' }
    ],
    isSubscribed: false
  },
  {
    id: 'LL-2044',
    title: 'Vapor-Lock in High-Pressure Condensate Line Traps',
    shortDesc: 'Steam vapor-locks form inside secondary high-capacity trap manifolds, raising backpressure and risking downstream line rupture.',
    narrative: 'AI inspection analysis detected high frequency thermal back-flow in the secondary utility steam traps. Steam traps fail to vent correctly when temperature differentials fall below 15°C, resulting in local liquid water buildup and severe hydraulic hammer forces on restart cycles.',
    preventiveAction: 'Replace standard bimetallic disc traps with dual-orifice thermo-dynamic traps on the main 40-bar header line. Run automatic bi-weekly steam trap diagnostics.',
    area: 'Utilities block',
    equipment: ['V-230', 'V-235'],
    confidence: 82,
    evidenceCount: 2,
    downtimeCost: '₹12L',
    status: 'Candidate',
    sourceIncidents: [
      { id: 'INC-410', name: 'Steam Header Hydraulic Hammer', plant: 'Hazira Petrochemicals Complex - Unit 4', date: '2026-02-15', link: '#documents' }
    ],
    externalReferences: [],
    isSubscribed: false
  }
];

export function LessonsLearnedHub() {
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const stored = localStorage.getItem('indusmind_lessons_learned');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // fallback
      }
    }
    return INITIAL_LESSONS;
  });

  const [activeTab, setActiveTab] = useState<'all' | 'published' | 'candidate'>('all');
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [selectedEquip, setSelectedEquip] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Routing and Details state
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  // Modals state
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [activeGraphLesson, setActiveGraphLesson] = useState<Lesson | null>(null);
  const [isPushOpen, setIsPushOpen] = useState(false);
  const [activePushLesson, setActivePushLesson] = useState<Lesson | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'warning' | 'info'>('success');

  // Trigger Toast Notification helper
  const showToast = (msg: string, type: 'success' | 'warning' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  // Sync state to LocalStorage
  const saveLessons = (newLessons: Lesson[]) => {
    setLessons(newLessons);
    localStorage.setItem('indusmind_lessons_learned', JSON.stringify(newLessons));
  };

  // Parse routing parameters from hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#lessons-learned/')) {
        const id = hash.replace('#lessons-learned/', '');
        setSelectedLessonId(id);
      } else {
        setSelectedLessonId(null);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleToggleSubscribe = (id: string) => {
    const updated = lessons.map(l => {
      if (l.id === id) {
        const state = !l.isSubscribed;
        showToast(
          state 
            ? `Subscribed to alerts for "${l.title}"` 
            : `Unsubscribed from alerts for "${l.title}"`,
          'info'
        );
        return { ...l, isSubscribed: state };
      }
      return l;
    });
    saveLessons(updated);
  };

  const handlePublishLesson = (id: string) => {
    const updated = lessons.map(l => {
      if (l.id === id) {
        showToast(`Pattern "${l.title}" successfully Published & synchronized with Global Lessons Learned repository!`, 'success');
        return { ...l, status: 'Published' as const };
      }
      return l;
    });
    saveLessons(updated);
  };

  const handlePushWarning = () => {
    if (selectedTeams.length === 0) {
      showToast('Select at least one engineering or field team to dispatch warning.', 'warning');
      return;
    }
    showToast(`SUCCESS: Safety Warning dispatched to [${selectedTeams.join(', ')}] regarding "${activePushLesson?.title}"!`, 'success');
    
    // Add warning notification to mock notification list
    const mainNotifsKey = 'indusmind_live_notifications';
    const stored = localStorage.getItem(mainNotifsKey);
    let currentNotifs = [];
    if (stored) {
      try { currentNotifs = JSON.parse(stored); } catch (e) {}
    }
    const newNotif = {
      id: 'notif-' + Date.now(),
      title: 'PUSHED SAFETY WARNING',
      desc: `Warning dispatched regarding: ${activePushLesson?.shortDesc}`,
      type: 'critical',
      time: 'Just now',
      isRead: false,
      timestamp: Date.now()
    };
    localStorage.setItem(mainNotifsKey, JSON.stringify([newNotif, ...currentNotifs]));
    window.dispatchEvent(new Event('indusmind_notification_update'));

    setIsPushOpen(false);
    setSelectedTeams([]);
    setActivePushLesson(null);
  };

  // Compute filters list
  const uniqueAreas = ['all', ...Array.from(new Set(lessons.map(l => l.area)))];
  const uniqueEquip = ['all', ...Array.from(new Set(lessons.flatMap(l => l.equipment)))];

  // Filter lessons
  const filteredLessons = lessons.filter(l => {
    if (activeTab === 'published' && l.status !== 'Published') return false;
    if (activeTab === 'candidate' && l.status !== 'Candidate') return false;
    if (selectedArea !== 'all' && l.area !== selectedArea) return false;
    if (selectedEquip !== 'all' && !l.equipment.includes(selectedEquip)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (l.title || '').toLowerCase().includes(q) || 
             (l.shortDesc || '').toLowerCase().includes(q) || 
             (l.narrative || '').toLowerCase().includes(q) ||
             (l.id || '').toLowerCase().includes(q);
    }
    return true;
  });

  const activeLesson = lessons.find(l => l.id === selectedLessonId);

  return (
    <div className="space-y-6" id="lessons-learned-hub">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-lg border shadow-xl flex items-center space-x-3 max-w-md animate-bounce ${
          toastType === 'success' ? 'bg-status-ok/10 text-status-ok border-status-ok/30' :
          toastType === 'warning' ? 'bg-status-warn/10 text-status-warn border-status-warn/30' :
          'bg-status-info/10 text-status-info border-status-info/30'
        }`}>
          {toastType === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> :
           toastType === 'warning' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> :
           <Info className="w-5 h-5 flex-shrink-0" />}
          <span className="text-xs font-mono font-semibold">{toastMessage}</span>
        </div>
      )}

      {selectedLessonId && activeLesson ? (
        /* ==================== DETAIL VIEW PAGE ==================== */
        <div className="space-y-6">
          <button 
            onClick={() => { window.location.hash = '#lessons-learned'; }}
            className="flex items-center space-x-2 text-xs font-mono text-text-secondary hover:text-white cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>BACK TO PATTERNS INDEX</span>
          </button>

          <div className="bg-surface border border-border-custom rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary" />
            
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-border-custom pb-4 mb-6">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                    {activeLesson.id}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    activeLesson.status === 'Published' 
                      ? 'bg-status-ok/10 text-status-ok border border-status-ok/20' 
                      : 'bg-status-warn/10 text-status-warn border border-status-warn/20'
                  }`}>
                    {activeLesson.status.toUpperCase()}
                  </span>
                  <ConfidenceBadge confidence={activeLesson.confidence} />
                </div>
                <h1 className="font-display text-xl md:text-2xl font-bold text-white tracking-tight">
                  {activeLesson.title}
                </h1>
                <p className="text-xs text-text-secondary mt-1 flex items-center space-x-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>Area: <span className="text-white font-semibold font-mono">{activeLesson.area}</span></span>
                  <span>•</span>
                  <span>Downtime Leakage Cost: <span className="text-status-critical font-bold font-mono">{activeLesson.downtimeCost}</span></span>
                </p>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0 self-start">
                <button
                  onClick={() => handleToggleSubscribe(activeLesson.id)}
                  className={`p-2 rounded border cursor-pointer transition-all flex items-center space-x-2 text-xs font-mono ${
                    activeLesson.isSubscribed
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                      : 'border-border-custom text-text-secondary hover:text-white hover:bg-surface-muted'
                  }`}
                  title="Subscribe to alerts on similar failure patterns"
                >
                  {activeLesson.isSubscribed ? <BookmarkCheck className="w-4 h-4 text-white" /> : <Bookmark className="w-4 h-4" />}
                  <span>{activeLesson.isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}</span>
                </button>

                {activeLesson.status === 'Candidate' && (
                  <button
                    onClick={() => handlePublishLesson(activeLesson.id)}
                    className="px-3 py-2 rounded bg-status-ok text-white hover:bg-status-ok/90 text-xs font-mono font-bold cursor-pointer transition-colors"
                  >
                    PUBLISH PATTERN
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left & Middle Column: Narrative & Preventive Action */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-background-custom/40 border border-border-custom rounded-lg p-5">
                  <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                    <Compass className="w-4 h-4 text-primary" />
                    <span>Analytical Synthesis & Narrative</span>
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed font-sans whitespace-pre-wrap">
                    {activeLesson.narrative}
                  </p>
                </div>

                <div className="bg-status-ok/5 border border-status-ok/20 rounded-lg p-5">
                  <h3 className="text-xs font-mono font-bold text-status-ok uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                    <Check className="w-4 h-4 text-status-ok" />
                    <span>Recommended Preventive Action</span>
                  </h3>
                  <p className="text-sm text-text-primary leading-relaxed font-sans whitespace-pre-wrap">
                    {activeLesson.preventiveAction}
                  </p>
                </div>

                {/* Source Incidents List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-mono font-bold text-text-muted uppercase tracking-wider">
                    Source Incident Citations ({activeLesson.sourceIncidents.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeLesson.sourceIncidents.map((inc) => (
                      <div key={inc.id} className="p-3 bg-surface border border-border-custom rounded hover:border-primary/40 transition-colors flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-mono font-bold text-primary">{inc.id}</span>
                            <span className="text-[10px] font-mono text-text-muted">{inc.date}</span>
                          </div>
                          <span className="font-semibold text-xs text-white block truncate mb-1">{inc.name}</span>
                          <p className="text-[10px] text-text-secondary truncate">{inc.plant}</p>
                        </div>
                        <a 
                          href={inc.link}
                          className="text-[10px] text-primary hover:underline font-mono font-semibold flex items-center space-x-1 mt-2 self-start"
                        >
                          <span>Review Ingested Docs</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Column: Metadata, Related Equipment, External Refs */}
              <div className="space-y-6">
                
                {/* Related Equipment */}
                <div className="bg-surface border border-border-custom rounded-lg p-4 space-y-3">
                  <span className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
                    Impacted Machinery Tags
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeLesson.equipment.map((tag) => (
                      <div key={tag} className="flex items-center space-x-1.5 px-2 py-1 bg-surface-muted border border-border-custom rounded text-xs font-mono text-white">
                        <Cpu className="w-3.5 h-3.5 text-accent" />
                        <span>{tag}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setActiveGraphLesson(activeLesson);
                      setIsGraphOpen(true);
                    }}
                    className="w-full py-2 bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 text-xs font-mono font-bold cursor-pointer transition-colors flex items-center justify-center space-x-2"
                  >
                    <Network className="w-4 h-4" />
                    <span>VIEW EVIDENCE GRAPH</span>
                  </button>
                </div>

                {/* External Standards & Documents */}
                <div className="bg-surface border border-border-custom rounded-lg p-4 space-y-3">
                  <span className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
                    Associated OEM & Standards
                  </span>
                  {activeLesson.externalReferences.length === 0 ? (
                    <p className="text-[11px] text-text-muted font-mono">No external publications linked.</p>
                  ) : (
                    <div className="divide-y divide-border-custom/40">
                      {activeLesson.externalReferences.map((ref) => (
                        <div key={ref.title} className="py-2.5 first:pt-0 last:pb-0">
                          <span className="block font-semibold text-xs text-white truncate leading-snug">{ref.title}</span>
                          <span className="block text-[10px] text-text-secondary font-mono mt-0.5">{ref.source}</span>
                          <a 
                            href={ref.link} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center space-x-1 text-[10px] text-primary hover:underline font-mono font-semibold mt-1"
                          >
                            <span>Read Standard</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-surface border border-border-custom rounded-lg p-4 text-center">
                  <span className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2">
                    Dispatch Alert Profile
                  </span>
                  <button
                    onClick={() => {
                      setActivePushLesson(activeLesson);
                      setIsPushOpen(true);
                    }}
                    className="w-full py-2 bg-status-critical/10 text-status-critical border border-status-critical/20 rounded hover:bg-status-critical/20 text-xs font-mono font-bold cursor-pointer transition-colors flex items-center justify-center space-x-2"
                  >
                    <Bell className="w-4 h-4 text-status-critical" />
                    <span>PUSH WARNING TO TEAMS</span>
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      ) : (
        /* ==================== INDEX FEED VIEW ==================== */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4 gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
                <Compass className="w-6.5 h-6.5 text-primary animate-pulse" />
                <span>Lessons Learned Engine</span>
              </h1>
              <p className="text-xs text-text-secondary mt-1">
                Cross-correlate localized machine anomalies across refinery nodes to construct high-confidence preventative maintenance directives.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-surface p-1 rounded border border-border-custom text-xs self-start">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'all' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'
                }`}
              >
                All Patterns ({lessons.length})
              </button>
              <button
                onClick={() => setActiveTab('published')}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'published' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'
                }`}
              >
                Published ({lessons.filter(l => l.status === 'Published').length})
              </button>
              <button
                onClick={() => setActiveTab('candidate')}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'candidate' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'
                }`}
              >
                Candidates ({lessons.filter(l => l.status === 'Candidate').length})
              </button>
            </div>
          </div>

          {/* Search and Dropdowns Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <input
                type="text"
                placeholder="Search across failure narratives or equipment tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-border-custom rounded p-2.5 pl-9 text-xs text-text-primary focus:outline-none focus:border-primary placeholder-text-muted"
              />
              <Filter className="w-4 h-4 text-text-muted absolute left-3 top-3" />
            </div>

            <div>
              <Select
                value={selectedArea}
                onValueChange={(v) => setSelectedArea(v)}
                options={[
                  { value: 'all', label: '-- All Refinery Blocks --' },
                  ...uniqueAreas.filter(a => a !== 'all').map((a) => ({ value: a, label: a })),
                ]}
                className="w-full p-2.5 text-xs capitalize font-mono"
              />
            </div>

            <div>
              <Select
                value={selectedEquip}
                onValueChange={(v) => setSelectedEquip(v)}
                options={[
                  { value: 'all', label: '-- All Machine Tags --' },
                  ...uniqueEquip.filter(eq => eq !== 'all').map((eq) => ({ value: eq, label: eq })),
                ]}
                className="w-full p-2.5 text-xs font-mono"
              />
            </div>
          </div>

          {/* Patterns Feed List */}
          {filteredLessons.length === 0 ? (
            <div className="bg-surface border border-border-custom rounded-xl p-12 text-center">
              <Compass className="w-10 h-10 text-text-muted mx-auto mb-3 animate-pulse" />
              <p className="font-semibold text-white">No Failure Patterns Matched</p>
              <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
                No archived lessons found matching your active filter configuration.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredLessons.map((l) => (
                <div 
                  key={l.id} 
                  className="bg-surface border border-border-custom rounded-xl p-5 relative overflow-hidden hover:border-primary/50 transition-all shadow-md group"
                >
                  {/* Subtle Accent side bar */}
                  <div className={`absolute top-0 bottom-0 left-0 w-1 ${
                    l.status === 'Published' ? 'bg-primary' : 'bg-status-warn'
                  }`} />

                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                          {l.id}
                        </span>
                        <span className={`text-[9px] font-mono font-bold px-1 rounded ${
                          l.status === 'Published' 
                            ? 'bg-status-ok/10 text-status-ok border border-status-ok/15' 
                            : 'bg-status-warn/10 text-status-warn border border-status-warn/15'
                        }`}>
                          {l.status.toUpperCase()}
                        </span>
                        <span className="text-[11px] font-mono text-text-muted flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          <span className="text-text-secondary">{l.area}</span>
                        </span>
                        <span>•</span>
                        <span className="text-[10px] text-text-muted font-mono">
                          Evidence: <span className="font-bold text-white">{l.evidenceCount} Incident Records</span>
                        </span>
                        <span>•</span>
                        <span className="text-[10px] text-text-muted font-mono">
                          Downtime cost: <span className="font-bold text-status-critical">{l.downtimeCost}</span>
                        </span>
                      </div>

                      <h3 
                        onClick={() => { window.location.hash = `#lessons-learned/${l.id}`; }}
                        className="font-display font-bold text-white text-base hover:text-primary transition-colors cursor-pointer"
                      >
                        {l.title}
                      </h3>

                      <p className="text-xs text-text-secondary leading-relaxed">
                        {l.shortDesc}
                      </p>

                      <div className="flex items-center space-x-2 pt-2 flex-wrap gap-y-2">
                        {l.equipment.map((eq) => (
                          <span key={eq} className="flex items-center space-x-1 px-2 py-0.5 bg-surface-muted/60 border border-border-custom rounded font-mono text-[10px] text-text-primary">
                            <Cpu className="w-3 h-3 text-accent" />
                            <span>{eq}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center md:flex-col justify-end gap-2 md:self-stretch md:justify-between flex-shrink-0">
                      <ConfidenceBadge confidence={l.confidence} />
                      
                      <div className="flex items-center space-x-2 md:pt-4">
                        <button
                          onClick={() => {
                            setActiveGraphLesson(l);
                            setIsGraphOpen(true);
                          }}
                          className="p-1.5 rounded border border-border-custom hover:border-primary hover:bg-primary/10 text-text-secondary hover:text-primary cursor-pointer transition-all"
                          title="View evidence connection map"
                        >
                          <Network className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setActivePushLesson(l);
                            setIsPushOpen(true);
                          }}
                          className="p-1.5 rounded border border-border-custom hover:border-status-critical hover:bg-status-critical/10 text-text-secondary hover:text-status-critical cursor-pointer transition-all"
                          title="Push safety warning alert to field teams"
                        >
                          <Bell className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => { window.location.hash = `#lessons-learned/${l.id}`; }}
                          className="p-1.5 rounded bg-primary/10 text-primary hover:bg-primary text-white transition-all cursor-pointer"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== GRAPH VIEW DIALOG ==================== */}
      {isGraphOpen && activeGraphLesson && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="fixed inset-0" onClick={() => setIsGraphOpen(false)} />
          <div className="bg-surface border border-border-custom w-full max-w-2xl rounded-xl shadow-2xl relative z-10 overflow-hidden font-sans">
            
            <div className="p-4 border-b border-border-custom flex justify-between items-center bg-surface-muted">
              <div>
                <span className="font-mono text-[10px] text-primary font-bold">CROSS-PLANT EVIDENCE GRAPH</span>
                <h3 className="font-display font-semibold text-white text-sm">{activeGraphLesson.title}</h3>
              </div>
              <button 
                onClick={() => setIsGraphOpen(false)} 
                className="p-1 text-text-muted hover:text-white rounded hover:bg-background-custom cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col items-center justify-center bg-background-custom/40">
              {/* SVG Relationship Graph */}
              <div className="w-full h-80 border border-border-custom bg-black/60 rounded-xl relative overflow-hidden flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {/* Central Node links to equipment nodes */}
                  <line x1="50%" y1="50%" x2="20%" y2="25%" stroke="#0E7C86" strokeWidth="2" strokeDasharray="4 4" />
                  <line x1="50%" y1="50%" x2="80%" y2="25%" stroke="#0E7C86" strokeWidth="2" strokeDasharray="4 4" />
                  
                  {/* Central Node links to Incident nodes */}
                  <line x1="50%" y1="50%" x2="20%" y2="75%" stroke="#E5484D" strokeWidth="1.5" />
                  <line x1="50%" y1="50%" x2="50%" y2="80%" stroke="#E5484D" strokeWidth="1.5" />
                  <line x1="50%" y1="50%" x2="80%" y2="75%" stroke="#E5484D" strokeWidth="1.5" />
                </svg>

                {/* Nodes rendering */}
                {/* Central Failure Node */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-primary p-3 rounded-xl shadow-lg text-center max-w-[140px] z-10">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-1">
                    <AlertTriangle className="w-4 h-4 text-primary" />
                  </div>
                  <span className="block font-mono text-[9px] text-primary font-bold">{activeGraphLesson.id}</span>
                  <span className="block text-[9px] text-text-secondary leading-tight truncate font-semibold">Seal Failure Mode</span>
                </div>

                {/* Equipment tag 1 */}
                <div className="absolute top-[15%] left-[10%] bg-surface border border-accent/40 p-2 rounded-lg text-center min-w-[90px] z-10">
                  <Cpu className="w-3.5 h-3.5 text-accent mx-auto mb-0.5" />
                  <span className="block font-mono text-[10px] text-white font-bold">{activeGraphLesson.equipment[0] || 'P-101A'}</span>
                  <span className="block text-[8px] text-text-muted">Primary Unit</span>
                </div>

                {/* Equipment tag 2 */}
                <div className="absolute top-[15%] right-[10%] bg-surface border border-accent/40 p-2 rounded-lg text-center min-w-[90px] z-10">
                  <Cpu className="w-3.5 h-3.5 text-accent mx-auto mb-0.5" />
                  <span className="block font-mono text-[10px] text-white font-bold">{activeGraphLesson.equipment[1] || 'P-101B'}</span>
                  <span className="block text-[8px] text-text-muted">Backup Unit</span>
                </div>

                {/* Incident Node 1 */}
                <div className="absolute bottom-[20%] left-[10%] bg-surface border border-status-critical/30 p-2 rounded-lg text-center min-w-[100px] z-10">
                  <span className="block font-mono text-[9px] text-status-critical font-bold">INC-991</span>
                  <span className="block text-[8px] text-text-secondary truncate">Sector A Fail</span>
                  <span className="block text-[8px] text-text-muted">Reliance Jamnagar</span>
                </div>

                {/* Incident Node 2 */}
                <div className="absolute bottom-[10%] left-[42%] bg-surface border border-status-critical/30 p-2 rounded-lg text-center min-w-[100px] z-10">
                  <span className="block font-mono text-[9px] text-status-critical font-bold">INC-822</span>
                  <span className="block text-[8px] text-text-secondary truncate">Sector B Fracture</span>
                  <span className="block text-[8px] text-text-muted">Reliance Hazira</span>
                </div>

                {/* Incident Node 3 */}
                <div className="absolute bottom-[20%] right-[10%] bg-surface border border-status-critical/30 p-2 rounded-lg text-center min-w-[100px] z-10">
                  <span className="block font-mono text-[9px] text-status-critical font-bold">INC-714</span>
                  <span className="block text-[8px] text-text-secondary truncate">KGD-6 Marine Lock</span>
                  <span className="block text-[8px] text-text-muted">KG-D6 Deepwater</span>
                </div>

              </div>

              <div className="mt-4 text-xs text-text-secondary leading-relaxed bg-surface border border-border-custom p-3.5 rounded-lg w-full">
                <span className="block font-semibold text-white font-mono mb-1 text-[11px] uppercase tracking-wider">Pattern Proof of Concept</span>
                AI Core crossed <span className="text-white font-bold">{activeGraphLesson.evidenceCount} historic incident documents</span> and correlated them semantically with active OEM shaft tolerance limits to isolate this failure vector.
              </div>
            </div>

            <div className="p-3 border-t border-border-custom bg-surface-muted text-right">
              <button 
                onClick={() => setIsGraphOpen(false)} 
                className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-semibold cursor-pointer"
              >
                DISMISS SYSTEM GRAPH
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ==================== PUSH WARNING DIALOG ==================== */}
      {isPushOpen && activePushLesson && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="fixed inset-0" onClick={() => setIsPushOpen(false)} />
          <div className="bg-surface border border-border-custom w-full max-w-md rounded-xl shadow-2xl relative z-10 overflow-hidden font-sans">
            
            <div className="p-4 border-b border-border-custom bg-surface-muted flex justify-between items-center">
              <div>
                <span className="font-mono text-[10px] text-status-critical font-bold">CROSS-PLANT WARNING SYSTEM</span>
                <h3 className="font-display font-semibold text-white text-sm">Push Warning Notice</h3>
              </div>
              <button 
                onClick={() => setIsPushOpen(false)} 
                className="p-1 text-text-muted hover:text-white rounded hover:bg-background-custom cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 bg-status-critical/10 border border-status-critical/20 rounded-lg space-y-1 text-xs">
                <span className="font-bold text-status-critical block font-mono">DANGER EXTRAPOLATION WARNING</span>
                <p className="text-text-secondary leading-relaxed font-sans">{activePushLesson.shortDesc}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
                  Target Field Teams & Control Rooms
                </label>
                
                <div className="grid grid-cols-1 gap-1.5">
                  {['Sector A Operations Crew', 'Sector B Field Technicians', 'Hazira Control Room Delta', 'KG-D6 Deepwater Safety Officers'].map((team) => {
                    const isSelected = selectedTeams.includes(team);
                    return (
                      <button
                        key={team}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTeams(selectedTeams.filter(t => t !== team));
                          } else {
                            setSelectedTeams([...selectedTeams, team]);
                          }
                        }}
                        className={`w-full text-left p-2.5 rounded border text-xs font-semibold font-sans flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-status-critical/15 border-status-critical text-white'
                            : 'bg-background-custom/40 border-border-custom text-text-secondary hover:border-text-muted'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Users className={`w-4 h-4 ${isSelected ? 'text-status-critical' : 'text-text-muted'}`} />
                          <span>{team}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-status-critical" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-border-custom bg-surface-muted flex justify-between items-center">
              <span className="text-[10px] font-mono text-text-muted">AI Guard active</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => setIsPushOpen(false)}
                  className="px-3 py-1.5 border border-border-custom text-text-secondary rounded hover:text-white text-xs font-mono font-semibold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={handlePushWarning}
                  className="px-4 py-1.5 bg-status-critical hover:bg-status-critical/90 text-white rounded text-xs font-mono font-bold cursor-pointer transition-colors"
                >
                  DISPATCH TOAST WARNING
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
