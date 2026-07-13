/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  GitBranch, 
  CheckCircle, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  BookOpen, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Wrench,
  Sparkles,
  Info,
  CheckCircle2,
  X
} from 'lucide-react';
import { FailureRecord, RcaCase, MOCK_RCA_CASES, MOCK_ASSIGNEES, WorkOrder, Assignee } from './mockMaintData';

interface RcaWorkspaceProps {
  failure: FailureRecord;
  onBack: () => void;
  onUpdateFailure: (updated: FailureRecord) => void;
  onAddWorkOrder: (newWo: WorkOrder) => void;
}

export function RcaWorkspace({ failure, onBack, onUpdateFailure, onAddWorkOrder }: RcaWorkspaceProps) {
  // Load or initialize RCA Case
  const [rcaCase, setRcaCase] = useState<RcaCase>(() => {
    const existing = MOCK_RCA_CASES[failure.id];
    if (existing) return JSON.parse(JSON.stringify(existing)); // Deep copy
    
    // Fallback stub for other failures
    return {
      failureId: failure.id,
      rankedCauses: [
        {
          cause: `Default Cause for ${failure.failureMode}`,
          confidence: 75,
          evidence: [
            { source: 'System Log', text: `Anomaly triggered on ${failure.equipmentName}` }
          ]
        }
      ],
      whys: [
        `Why did ${failure.equipmentName} fail? - Because of excessive stress.`,
        `Why did it experience excessive stress? - Because operating limits were briefly exceeded.`,
        `Why were limits exceeded? - Pending operator review.`,
        `Why did limits drift? - Pending instrumentation check.`,
        `Why was drift undetected? - Calibration frequency issue.`
      ],
      fishbone: {
        manpower: ['Awaiting crew assignment notes'],
        machinery: ['Awaiting vibration probe readings'],
        materials: ['Awaiting stress analysis on housing'],
        methods: ['SOP threshold drift check'],
        measurement: ['Telemetry resolution limits'],
        environment: ['Ambient operating heat fatigue']
      },
      correctiveActions: [
        { id: 'ca-stub-1', action: `Conduct full inspection on ${failure.equipmentId}`, assignee: 'Arun Kumar' }
      ]
    };
  });

  const [expandedCauses, setExpandedCauses] = useState<Record<number, boolean>>({ 0: true });
  const [editableWhys, setEditableWhys] = useState<string[]>(rcaCase.whys);
  const [fishboneData, setFishboneData] = useState(rcaCase.fishbone);
  const [activeFishboneCat, setActiveFishboneCat] = useState<keyof typeof rcaCase.fishbone>('machinery');
  const [newFishboneItem, setNewFishboneItem] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState(rcaCase.correctiveActions);
  
  // Create / Convert states
  const [woSuccessToast, setWoSuccessToast] = useState<{ msg: string; link: string } | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [isPublishedBanner, setIsPublishedBanner] = useState(failure.rcaStatus === 'Published');

  // Sync state if failure id changes
  useEffect(() => {
    setEditableWhys(rcaCase.whys);
    setFishboneData(rcaCase.fishbone);
    setCorrectiveActions(rcaCase.correctiveActions);
  }, [rcaCase]);

  // Handle saving inline 5-why rungs
  const handleWhyChange = (index: number, val: string) => {
    const updated = [...editableWhys];
    updated[index] = val;
    setEditableWhys(updated);
    
    // Persist to local state
    setRcaCase(prev => ({
      ...prev,
      whys: updated
    }));
  };

  // Toggle Cause Evidence Expansion
  const toggleCauseExpand = (idx: number) => {
    setExpandedCauses(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Interactive Fishbone Items Edit
  const handleAddFishboneItem = () => {
    if (!newFishboneItem.trim()) return;
    const catItems = [...fishboneData[activeFishboneCat]];
    catItems.push(newFishboneItem.trim());
    
    const updatedFish = {
      ...fishboneData,
      [activeFishboneCat]: catItems
    };
    setFishboneData(updatedFish);
    setNewFishboneItem('');

    setRcaCase(prev => ({
      ...prev,
      fishbone: updatedFish
    }));
  };

  const handleRemoveFishboneItem = (idx: number) => {
    const catItems = fishboneData[activeFishboneCat].filter((_, i) => i !== idx);
    const updatedFish = {
      ...fishboneData,
      [activeFishboneCat]: catItems
    };
    setFishboneData(updatedFish);

    setRcaCase(prev => ({
      ...prev,
      fishbone: updatedFish
    }));
  };

  // Convert corrective action into a live Work Order stub
  const handleConvertToWorkOrder = (actionId: string, actionText: string, assigneeName: string) => {
    const matchedAssignee = MOCK_ASSIGNEES.find(a => a.name === assigneeName) || MOCK_ASSIGNEES[0];
    const newWoId = `WO-${Math.floor(100000 + Math.random() * 900000)}`;

    const newWo: WorkOrder = {
      id: newWoId,
      title: `RCA Corrective: ${actionText.slice(0, 60)}...`,
      equipmentId: failure.equipmentId,
      equipmentName: failure.equipmentName,
      type: 'CM',
      priority: 'High',
      assignee: matchedAssignee,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days out
      status: 'Open',
      sla: 'MET',
      slaDetails: 'SLA MET (Direct RCA Dispatch)',
      description: `RCA Corrective Action spawned from Failure ${failure.id} (RCA Study). Required action: ${actionText}`,
      safetyChecklist: [
        { id: 'ca-s1', text: 'Apply standard isolated LOTO before conducting corrective action.', checked: false }
      ],
      steps: [
        { id: 'ca-step1', title: 'Execute Corrective Modification', desc: actionText, checked: false, note: '', photo: null }
      ],
      parts: [],
      labor: [],
      attachments: [],
      logs: [
        { date: '2026-07-12 12:00', user: 'System Copilot', action: `Spawned dynamically from RCA Study ${failure.id}` }
      ]
    };

    onAddWorkOrder(newWo);

    // Update state to lock corrective action with the new WO reference
    const updatedActions = correctiveActions.map(act => {
      if (act.id === actionId) {
        return { ...act, createdWoId: newWoId };
      }
      return act;
    });
    setCorrectiveActions(updatedActions);
    
    setRcaCase(prev => ({
      ...prev,
      correctiveActions: updatedActions
    }));

    // Trigger Success Toast
    setWoSuccessToast({
      msg: `Created corrective Work Order ${newWoId} assigned to ${assigneeName}.`,
      link: `#maintenance/${newWoId}`
    });

    setTimeout(() => {
      setWoSuccessToast(null);
    }, 8000);
  };

  // Publish RCA flow
  const handlePublishRca = () => {
    // Mark status in failure record
    const updatedFailure: FailureRecord = {
      ...failure,
      rcaStatus: 'Published'
    };
    onUpdateFailure(updatedFailure);
    setIsPublishedBanner(true);
    setPublishConfirmOpen(false);

    // Render alert banner
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 animate-fade-in relative">

      {/* WO GENERATION FLOATING SUCCESS TOAST */}
      {woSuccessToast && (
        <div className="fixed bottom-6 right-6 bg-[#13191D] border-2 border-primary rounded-lg p-4 shadow-2xl z-50 flex items-start space-x-3 max-w-sm animate-bounce">
          <div className="p-1 rounded bg-primary/20 text-primary mt-0.5">
            <Wrench className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <strong className="text-white text-xs block font-display">Work Order Dispatch Successful</strong>
            <p className="text-text-secondary text-[11px] leading-relaxed">{woSuccessToast.msg}</p>
            <a 
              href={woSuccessToast.link}
              className="text-primary hover:underline font-mono text-[10px] font-bold inline-block pt-1"
            >
              Configure Dispatch Specs →
            </a>
          </div>
          <button onClick={() => setWoSuccessToast(null)} className="text-text-muted hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-custom pb-4">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="p-1.5 rounded border border-border-custom bg-surface-muted hover:bg-surface text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2 font-mono text-[10px] uppercase text-text-secondary">
              <span>Failure Log</span>
              <span>/</span>
              <span className="text-primary font-bold">{failure.id}</span>
              <span>/</span>
              <span>RCA Workspace</span>
            </div>
            <h1 className="font-display text-xl font-bold text-text-primary tracking-tight mt-1">
              AI-Augmented Root Cause Workspace
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-center">
          {isPublishedBanner ? (
            <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold rounded flex items-center space-x-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>RCA PUBLISHED</span>
            </span>
          ) : (
            <>
              <span className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono font-bold rounded">
                DRAFT INVESTIGATION
              </span>
              <button
                onClick={() => setPublishConfirmOpen(true)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold rounded transition-colors shadow-lg cursor-pointer"
              >
                Publish RCA Study
              </button>
            </>
          )}
        </div>
      </div>

      {/* PUBLISHED SUCCESS BANNER */}
      {isPublishedBanner && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-surface to-surface border-l-4 border-emerald-500 p-4 rounded-r-lg flex items-start space-x-3.5 shadow-md">
          <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-400 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-wide block">
              ✔ Added to Lessons Learned candidates
            </span>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-3xl">
              This root-cause fault pathway and fishbone breakdown have been integrated into IndusMind's neural graph store. 
              Subsequent maintenance logs for equipment <strong>{failure.equipmentId}</strong> will leverage this RCA index for predictive telemetry suggestions.
            </p>
          </div>
        </div>
      )}

      {/* TOP GRID: SUMMARY + TIMELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Incident Summary Card */}
        <div className="lg:col-span-2 bg-surface border border-border-custom rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border-custom pb-3">
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Incident Context Summary
            </h3>
            <span className="text-[10px] font-mono text-text-muted">
              LOCKOUT TIMESTAMP: {failure.date}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-background-custom/40 border border-border-custom/40 p-3 rounded">
              <span className="text-[10px] font-mono text-text-muted block uppercase">Asset Tag</span>
              <span className="text-xs font-bold text-text-primary mt-1 block">{failure.equipmentId}</span>
            </div>
            <div className="bg-background-custom/40 border border-border-custom/40 p-3 rounded">
              <span className="text-[10px] font-mono text-text-muted block uppercase">Asset Class</span>
              <span className="text-xs font-bold text-text-primary mt-1 block truncate">{failure.equipmentName}</span>
            </div>
            <div className="bg-background-custom/40 border border-border-custom/40 p-3 rounded">
              <span className="text-[10px] font-mono text-text-muted block uppercase">Downtime Outage</span>
              <span className="text-xs font-bold text-red-400 mt-1 block">{failure.downtimeMinutes} minutes</span>
            </div>
            <div className="bg-background-custom/40 border border-border-custom/40 p-3 rounded">
              <span className="text-[10px] font-mono text-text-muted block uppercase">Outage Severity</span>
              <span className="text-xs font-bold text-text-primary mt-1 block">{failure.severity}</span>
            </div>
          </div>

          <div className="space-y-1.5 bg-background-custom/30 p-3.5 rounded border border-border-custom/30">
            <span className="font-mono text-[9px] text-accent font-bold uppercase block tracking-wider">Diagnostic Synopsis</span>
            <p className="text-xs text-text-secondary leading-relaxed">
              {failure.incidentSummary}
            </p>
          </div>
        </div>

        {/* Vertical Event Timeline */}
        <div className="bg-surface border border-border-custom rounded-lg p-5 flex flex-col">
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider border-b border-border-custom pb-3 mb-4">
            Incident Event Timeline
          </h3>
          
          <div className="flex-1 relative pl-6 border-l border-border-custom/60 space-y-5 py-1 text-xs">
            {failure.timeline && failure.timeline.map((event, idx) => (
              <div key={idx} className="relative">
                {/* Timeline Bullet */}
                <span className={`absolute -left-[30px] top-0.5 w-3 h-3 rounded-full border-2 border-surface flex items-center justify-center ${
                  event.status === 'error' ? 'bg-red-500 ring-2 ring-red-500/20' :
                  event.status === 'warn' ? 'bg-amber-500 ring-2 ring-amber-500/20' :
                  'bg-primary ring-2 ring-primary/20'
                }`} />

                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] font-bold text-text-primary bg-background-custom/80 px-1.5 py-0.2 border border-border-custom rounded">
                      {event.time}
                    </span>
                    <span className={`text-[9px] font-mono font-bold uppercase ${
                      event.status === 'error' ? 'text-red-400' :
                      event.status === 'warn' ? 'text-amber-400' :
                      'text-primary'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                  <p className="text-text-secondary leading-normal text-[11px] pt-1">
                    {event.event}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MIDDLE CONTAINER: AI ANALYSIS, EDITABLE 5-WHY & INTERACTIVE FISHBONE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COMPONENT: AI ROOT CAUSE ANALYSIS CITATIONS PANEL */}
        <div className="bg-surface border border-border-custom rounded-lg p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border-custom pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
                  AI Probable Causes (Neural Graph)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-accent">CONFIDENCE SORTED</span>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              We match real-time thermal telemetry transients and past work histories to cross-reference similar signatures inside our PDF corpus databases.
            </p>

            <div className="space-y-3">
              {rcaCase.rankedCauses.map((item, idx) => {
                const isExpanded = !!expandedCauses[idx];
                return (
                  <div key={idx} className="border border-border-custom bg-background-custom/30 rounded-lg overflow-hidden">
                    
                    {/* Header bar / Title */}
                    <div 
                      onClick={() => toggleCauseExpand(idx)}
                      className="p-3 bg-background-custom/50 flex items-center justify-between cursor-pointer hover:bg-background-custom/70 transition-colors select-none"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] font-bold text-text-primary">RANK {idx + 1}</span>
                          <span className="font-sans font-bold text-text-primary text-xs">{item.cause}</span>
                        </div>
                        {/* Confidence indicator line */}
                        <div className="flex items-center space-x-2 pt-1">
                          <div className="flex-1 h-1.5 bg-surface-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${idx === 0 ? 'bg-primary' : 'bg-amber-500'}`}
                              style={{ width: `${item.confidence}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-text-secondary font-bold">{item.confidence}% MATCH</span>
                        </div>
                      </div>
                      <div className="text-text-muted pl-4">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expandable Citations & Deep Linking */}
                    {isExpanded && (
                      <div className="p-3 border-t border-border-custom bg-surface-muted/10 divide-y divide-border-custom/40 space-y-2 text-xs">
                        <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                          Supporting Corpus Evidence & Manual Citations
                        </span>
                        
                        <div className="space-y-2 pt-2">
                          {item.evidence.map((ev, evIdx) => (
                            <div key={evIdx} className="bg-background-custom/20 border border-border-custom/30 p-2.5 rounded leading-relaxed text-[11px]">
                              <div className="flex items-center justify-between font-mono text-[10px] text-text-muted pb-1 mb-1 border-b border-border-custom/20">
                                <span className="flex items-center space-x-1 font-semibold">
                                  <BookOpen className="w-3 h-3 text-primary" />
                                  <span>{ev.source}</span>
                                </span>
                                {ev.link && (
                                  <a 
                                    href={ev.link}
                                    className="text-primary hover:underline flex items-center space-x-0.5 text-[9px] cursor-pointer"
                                  >
                                    <span>Deep Link</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                              <p className="text-text-secondary font-sans italic">
                                "{ev.text}"
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-surface-muted/30 border border-border-custom rounded text-[11px] leading-relaxed text-text-secondary mt-4">
            <span className="text-text-primary font-bold block mb-0.5">ℹ Corpus Connection Info</span>
            Corpus citations deep-link to indexed plant manuals and regulatory files (SOP-REF-112). Verification logs are mapped securely inside the Knowledge Graph.
          </div>
        </div>

        {/* RIGHT COMPONENT: EDITABLE 5-WHY LADDER */}
        <div className="bg-surface border border-border-custom rounded-lg p-5 flex flex-col">
          <div className="border-b border-border-custom pb-3 mb-4 flex items-center justify-between">
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              AI 5-Why Causality Ladder (Editable)
            </h3>
            <span className="text-[10px] font-mono text-primary font-bold">CLICK TO EDIT ANY RUNG</span>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed mb-4">
            IndusMind parses physical anomalies into a sequential chain of root faults. Click inside any rung to tune or overwrite causal explanations.
          </p>

          <div className="flex-1 space-y-3 font-mono">
            {editableWhys.map((rung, idx) => {
              const [question, answer] = rung.split('? - ');
              return (
                <div key={idx} className="p-2.5 border border-border-custom rounded-lg bg-background-custom/40 hover:bg-background-custom/60 transition-colors flex flex-col space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-text-muted font-bold">WHY RUNG {idx + 1}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                  
                  <div className="font-bold text-text-primary py-0.5">
                    {question}?
                  </div>

                  <div className="relative pt-1 flex items-start space-x-1.5">
                    <span className="text-accent text-[11px] font-bold mt-1">Ans:</span>
                    <textarea
                      rows={2}
                      value={answer || ''}
                      onChange={(e) => {
                        const newAns = e.target.value;
                        handleWhyChange(idx, `${question}? - ${newAns}`);
                      }}
                      className="w-full bg-transparent border-b border-transparent focus:border-primary focus:outline-none text-text-secondary font-sans text-xs resize-none py-0.5 leading-normal"
                      placeholder="Type custom causal analysis details here..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FISHBONE (ISHIKAWA) DYNAMIC COMPONENT */}
      <div className="bg-surface border border-border-custom rounded-lg p-5 space-y-6">
        <div className="border-b border-border-custom pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Interactive Fishbone (Ishikawa) Diagram
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Select any root category node on the left to add, edit, or clean up fishbone items. Changes update the SVG in real-time.
            </p>
          </div>

          <div className="flex bg-background-custom border border-border-custom p-0.5 rounded text-[11px] font-mono">
            {(['machinery', 'materials', 'manpower', 'methods', 'measurement', 'environment'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveFishboneCat(cat)}
                className={`px-2 py-1 rounded transition-colors cursor-pointer capitalize ${
                  activeFishboneCat === cat ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Active Category Editor Form */}
          <div className="bg-background-custom/40 border border-border-custom rounded-lg p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-border-custom/60 font-mono text-xs">
                <span className="font-bold text-text-primary uppercase tracking-wider">Editing: {activeFishboneCat}</span>
                <span className="text-[10px] text-text-muted">{fishboneData[activeFishboneCat].length} items</span>
              </div>

              {/* Items List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {fishboneData[activeFishboneCat].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-surface border border-border-custom/50 text-xs text-text-secondary hover:text-text-primary group">
                    <span className="truncate pr-2 font-sans">{item}</span>
                    <button 
                      onClick={() => handleRemoveFishboneItem(idx)}
                      className="text-text-muted hover:text-red-400 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Remove Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {fishboneData[activeFishboneCat].length === 0 && (
                  <p className="text-[11px] text-text-muted font-mono italic text-center py-4">No items listed. Add one below.</p>
                )}
              </div>
            </div>

            {/* Add Item Form */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">Add Custom Cause</span>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder={`E.g., Clogged vent nozzle...`}
                  value={newFishboneItem}
                  onChange={(e) => setNewFishboneItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFishboneItem()}
                  className="flex-1 bg-surface border border-border-custom rounded px-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder-text-muted text-text-primary font-sans"
                />
                <button
                  onClick={handleAddFishboneItem}
                  className="px-3 bg-primary hover:bg-primary-hover text-white rounded cursor-pointer transition-colors flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Fishbone SVG Render */}
          <div className="lg:col-span-2 bg-[#13191D] border border-border-custom rounded-lg p-4 flex items-center justify-center">
            <svg viewBox="0 0 600 320" className="w-full h-auto max-w-xl text-text-secondary">
              
              {/* Main horizontal spine */}
              <line x1="40" y1="160" x2="520" y2="160" stroke="#0E7C86" strokeWidth={3} strokeDasharray="none" />
              
              {/* Fish head on the right */}
              <polygon points="520,135 565,160 520,185" fill="#0E7C86" />
              <text x="532" y="152" fill="#13191D" fontWeight="bold" fontFamily="monospace" fontSize="10">FAIL</text>
              <text x="530" y="165" fill="#13191D" fontWeight="bold" fontFamily="sans-serif" fontSize="10" textAnchor="start">
                {failure.id}
              </text>

              {/* Diagonal rib lines & text labels */}

              {/* Top Row: Ribs & Categories */}
              {/* Category 1: Machinery (x=150) */}
              <line x1="150" y1="160" x2="220" y2="50" stroke="#6B7280" strokeWidth={1.5} />
              <text 
                x="225" y="45" 
                fill={activeFishboneCat === 'machinery' ? '#0E7C86' : '#9CA3AF'} 
                fontWeight="bold" fontSize="10" fontFamily="monospace"
                onClick={() => setActiveFishboneCat('machinery')}
                className="cursor-pointer hover:underline uppercase"
              >
                Machinery
              </text>
              {/* Draw top machinery items */}
              {fishboneData.machinery.slice(0, 2).map((item, i) => (
                <g key={i}>
                  <line x1={170 + i * 20} y1={120 - i * 30} x2={220 + i * 20} y2={120 - i * 30} stroke="#374151" strokeWidth={1} />
                  <text x={175 + i * 20} y={115 - i * 30} fill="#9CA3AF" fontSize="8" fontFamily="sans-serif" width="100">
                    {item.slice(0, 16)}...
                  </text>
                </g>
              ))}

              {/* Category 2: Materials (x=270) */}
              <line x1="270" y1="160" x2="340" y2="50" stroke="#6B7280" strokeWidth={1.5} />
              <text 
                x="345" y="45" 
                fill={activeFishboneCat === 'materials' ? '#0E7C86' : '#9CA3AF'} 
                fontWeight="bold" fontSize="10" fontFamily="monospace"
                onClick={() => setActiveFishboneCat('materials')}
                className="cursor-pointer hover:underline uppercase"
              >
                Materials
              </text>
              {/* Materials items */}
              {fishboneData.materials.slice(0, 2).map((item, i) => (
                <g key={i}>
                  <line x1={290 + i * 20} y1={120 - i * 30} x2={340 + i * 20} y2={120 - i * 30} stroke="#374151" strokeWidth={1} />
                  <text x={295 + i * 20} y={115 - i * 30} fill="#9CA3AF" fontSize="8" fontFamily="sans-serif">
                    {item.slice(0, 16)}...
                  </text>
                </g>
              ))}

              {/* Category 3: Manpower (x=390) */}
              <line x1="390" y1="160" x2="460" y2="50" stroke="#6B7280" strokeWidth={1.5} />
              <text 
                x="465" y="45" 
                fill={activeFishboneCat === 'manpower' ? '#0E7C86' : '#9CA3AF'} 
                fontWeight="bold" fontSize="10" fontFamily="monospace"
                onClick={() => setActiveFishboneCat('manpower')}
                className="cursor-pointer hover:underline uppercase"
              >
                Manpower
              </text>
              {/* Manpower items */}
              {fishboneData.manpower.slice(0, 2).map((item, i) => (
                <g key={i}>
                  <line x1={410 + i * 20} y1={120 - i * 30} x2={460 + i * 20} y2={120 - i * 30} stroke="#374151" strokeWidth={1} />
                  <text x={415 + i * 20} y={115 - i * 30} fill="#9CA3AF" fontSize="8" fontFamily="sans-serif">
                    {item.slice(0, 16)}...
                  </text>
                </g>
              ))}


              {/* Bottom Row: Ribs & Categories */}
              {/* Category 4: Methods (x=150) */}
              <line x1="150" y1="160" x2="220" y2="270" stroke="#6B7280" strokeWidth={1.5} />
              <text 
                x="225" y="280" 
                fill={activeFishboneCat === 'methods' ? '#0E7C86' : '#9CA3AF'} 
                fontWeight="bold" fontSize="10" fontFamily="monospace"
                onClick={() => setActiveFishboneCat('methods')}
                className="cursor-pointer hover:underline uppercase"
              >
                Methods
              </text>
              {/* Methods items */}
              {fishboneData.methods.slice(0, 2).map((item, i) => (
                <g key={i}>
                  <line x1={170 + i * 20} y1={200 + i * 30} x2={220 + i * 20} y2={200 + i * 30} stroke="#374151" strokeWidth={1} />
                  <text x={175 + i * 20} y={195 + i * 30} fill="#9CA3AF" fontSize="8" fontFamily="sans-serif">
                    {item.slice(0, 16)}...
                  </text>
                </g>
              ))}

              {/* Category 5: Measurement (x=270) */}
              <line x1="270" y1="160" x2="340" y2="270" stroke="#6B7280" strokeWidth={1.5} />
              <text 
                x="345" y="280" 
                fill={activeFishboneCat === 'measurement' ? '#0E7C86' : '#9CA3AF'} 
                fontWeight="bold" fontSize="10" fontFamily="monospace"
                onClick={() => setActiveFishboneCat('measurement')}
                className="cursor-pointer hover:underline uppercase"
              >
                Measurement
              </text>
              {/* Measurement items */}
              {fishboneData.measurement.slice(0, 2).map((item, i) => (
                <g key={i}>
                  <line x1={290 + i * 20} y1={200 + i * 30} x2={340 + i * 20} y2={200 + i * 30} stroke="#374151" strokeWidth={1} />
                  <text x={295 + i * 20} y={195 + i * 30} fill="#9CA3AF" fontSize="8" fontFamily="sans-serif">
                    {item.slice(0, 16)}...
                  </text>
                </g>
              ))}

              {/* Category 6: Environment (x=390) */}
              <line x1="390" y1="160" x2="460" y2="270" stroke="#6B7280" strokeWidth={1.5} />
              <text 
                x="465" y="280" 
                fill={activeFishboneCat === 'environment' ? '#0E7C86' : '#9CA3AF'} 
                fontWeight="bold" fontSize="10" fontFamily="monospace"
                onClick={() => setActiveFishboneCat('environment')}
                className="cursor-pointer hover:underline uppercase"
              >
                Environment
              </text>
              {/* Environment items */}
              {fishboneData.environment.slice(0, 2).map((item, i) => (
                <g key={i}>
                  <line x1={410 + i * 20} y1={200 + i * 30} x2={460 + i * 20} y2={200 + i * 30} stroke="#374151" strokeWidth={1} />
                  <text x={415 + i * 20} y={195 + i * 30} fill="#9CA3AF" fontSize="8" fontFamily="sans-serif">
                    {item.slice(0, 16)}...
                  </text>
                </g>
              ))}

            </svg>
          </div>

        </div>
      </div>

      {/* BOTTOM CORRECTIVE ACTIONS LIST */}
      <div className="bg-surface border border-border-custom rounded-lg p-5 space-y-4">
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider border-b border-border-custom pb-3 mb-2">
          Required Corrective Mitigation Actions
        </h3>
        
        <p className="text-xs text-text-secondary leading-relaxed">
          Specify exact mechanical alterations or procedural updates. Each corrective action can be instantiated directly into a **Work Order Stub** dispatched into our operations workflow.
        </p>

        <div className="divide-y divide-border-custom/40">
          {correctiveActions.map((item, idx) => (
            <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[9px] font-bold text-text-primary bg-surface-muted border border-border-custom px-1.5 py-0.2 rounded">
                    ACTION #{idx + 1}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted">ASSIGNED: {item.assignee}</span>
                </div>
                <p className="text-xs text-text-secondary font-sans leading-relaxed pt-1 max-w-3xl">
                  {item.action}
                </p>
              </div>

              <div className="flex-shrink-0 self-start sm:self-center">
                {item.createdWoId ? (
                  <a 
                    href={`#maintenance/${item.createdWoId}`}
                    className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono text-[10px] font-bold flex items-center space-x-1 hover:bg-emerald-500/20 transition-all cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Dispatched ({item.createdWoId})</span>
                  </a>
                ) : (
                  <button
                    onClick={() => handleConvertToWorkOrder(item.id, item.action, item.assignee)}
                    className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded font-mono text-[10px] font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Convert to WO Stub</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CONFIRM PUBLISH DIALOG MODAL */}
      {publishConfirmOpen && (
        <div className="fixed inset-0 bg-[#0B0F12]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border-custom max-w-md w-full rounded-lg p-5 space-y-4 shadow-2xl font-sans text-xs">
            
            <div className="flex items-center space-x-2 text-emerald-400 font-mono text-[11px] font-bold uppercase pb-2 border-b border-border-custom">
              <Sparkles className="w-4 h-4" />
              <span>Confirm Audit Publication</span>
            </div>

            <p className="text-text-secondary leading-relaxed">
              Are you sure you want to lock and publish the Root Cause Analysis (RCA) for failure <strong>{failure.id}</strong>?
            </p>

            <ul className="list-disc pl-4 text-[11px] text-text-muted space-y-1">
              <li>Changes to the 5-Why and Fishbone structures will freeze.</li>
              <li>SOP-REF-112 parameters are automatically aligned with learnings.</li>
              <li>Added to Lessons Learned Neural Candidates list.</li>
            </ul>

            <div className="flex justify-end space-x-2 pt-2 border-t border-border-custom">
              <button
                onClick={() => setPublishConfirmOpen(false)}
                className="px-3 py-1.5 border border-border-custom rounded hover:bg-surface-muted text-text-secondary transition-all cursor-pointer font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handlePublishRca}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold rounded transition-colors cursor-pointer"
              >
                Confirm & Publish
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
