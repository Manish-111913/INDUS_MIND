/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  SlidersHorizontal, 
  Check, 
  Clock, 
  Trash2, 
  ExternalLink,
  Wrench,
  CheckCircle,
  HelpCircle,
  X,
  ShieldCheck
} from 'lucide-react';
import { RiskPrediction, MOCK_PREDICTIONS, MOCK_ASSIGNEES, WorkOrder } from './mockMaintData';

interface RiskPredictionsProps {
  predictions: RiskPrediction[];
  onUpdatePredictions: (updated: RiskPrediction[]) => void;
  onAddWorkOrder: (newWo: WorkOrder) => void;
}

export function RiskPredictions({ predictions, onUpdatePredictions, onAddWorkOrder }: RiskPredictionsProps) {
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');

  // Interactive overlay states
  const [activeSnoozeId, setActiveSnoozeId] = useState<string | null>(null);
  const [activeDismissId, setActiveDismissId] = useState<string | null>(null);
  const [selectedDismissReason, setSelectedDismissReason] = useState('False Positive / Noise');
  const [woSuccessToast, setWoSuccessToast] = useState<{ msg: string; link: string } | null>(null);

  // Filtered predictions
  const filteredPredictions = useMemo(() => {
    return predictions.filter(pred => {
      // Risk Band filter logic
      let riskMatch = true;
      if (riskFilter !== 'ALL') {
        if (riskFilter === 'Critical' && pred.riskScore < 80) riskMatch = false;
        if (riskFilter === 'High' && (pred.riskScore < 60 || pred.riskScore >= 80)) riskMatch = false;
        if (riskFilter === 'Medium' && (pred.riskScore < 40 || pred.riskScore >= 60)) riskMatch = false;
        if (riskFilter === 'Low' && pred.riskScore >= 40) riskMatch = false;
      }

      // Area filter logic
      let areaMatch = true;
      if (areaFilter !== 'ALL') {
        areaMatch = pred.area === areaFilter;
      }

      return riskMatch && areaMatch;
    });
  }, [predictions, riskFilter, areaFilter]);

  // Extract unique areas for the filter dropdown
  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    predictions.forEach(p => areas.add(p.area));
    return Array.from(areas);
  }, [predictions]);

  // Determine colors based on Risk Score
  const getRiskColors = (score: number) => {
    if (score >= 80) return { stroke: '#EF4444', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'CRITICAL' };
    if (score >= 60) return { stroke: '#F5A524', text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'HIGH' };
    if (score >= 40) return { stroke: '#EAB308', text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'MEDIUM' };
    return { stroke: '#0E7C86', text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', label: 'LOW' };
  };

  // 1. ACCEPT DRIVER -> Spawn new Work Order Stub
  const handleAcceptPrediction = (pred: RiskPrediction) => {
    const newWoId = `WO-${Math.floor(100000 + Math.random() * 900000)}`;
    const matchedAssignee = MOCK_ASSIGNEES[0]; // Default to first technician

    const newWo: WorkOrder = {
      id: newWoId,
      title: `AI PREDICTIVE: PM calibration on ${pred.equipmentId}`,
      equipmentId: pred.equipmentId,
      equipmentName: pred.equipmentName,
      type: 'Predictive',
      priority: pred.riskScore >= 80 ? 'Critical' : (pred.riskScore >= 60 ? 'High' : 'Medium'),
      assignee: matchedAssignee,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days out
      status: 'Open',
      sla: 'MET',
      slaDetails: 'SLA MET (AI Predicted Event Window)',
      description: `Automated predictive work order spawned from Risk Analysis ${pred.id}. Recommended Action: ${pred.recommendedAction}`,
      safetyChecklist: [
        { id: 'pr-s1', text: 'Apply appropriate safety boundaries and notify area manager.', checked: false }
      ],
      steps: [
        { id: 'pr-step1', title: 'Verify Telemetry Driver Anomalies', desc: pred.drivers.map(d => d.text).join(', '), checked: false, note: '', photo: null },
        { id: 'pr-step2', title: 'Execute Recommended PM Correction', desc: pred.recommendedAction, checked: false, note: '', photo: null }
      ],
      parts: [],
      labor: [],
      attachments: [],
      logs: [
        { date: '2026-07-12 12:00', user: 'AI Copilot Engine', action: 'Accepted risk model prediction and generated work order' }
      ]
    };

    onAddWorkOrder(newWo);

    // Update prediction status to Accepted
    const updated = predictions.map(p => {
      if (p.id === pred.id) {
        return { ...p, status: 'accepted' as const };
      }
      return p;
    });
    onUpdatePredictions(updated);

    // Toast
    setWoSuccessToast({
      msg: `Predictive WO ${newWoId} has been successfully registered and assigned to ${matchedAssignee.name}.`,
      link: `#maintenance/${newWoId}`
    });

    setTimeout(() => {
      setWoSuccessToast(null);
    }, 8000);
  };

  // 2. SNOOZE ACTION
  const handleSnooze = (id: string, days: number) => {
    const updated = predictions.map(p => {
      if (p.id === id) {
        const snoozeDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return { ...p, status: 'snoozed' as const, snoozeUntil: snoozeDate };
      }
      return p;
    });
    onUpdatePredictions(updated);
    setActiveSnoozeId(null);
  };

  // 3. DISMISS ACTION
  const handleDismiss = (id: string) => {
    const updated = predictions.map(p => {
      if (p.id === id) {
        return { ...p, status: 'dismissed' as const, dismissReason: selectedDismissReason };
      }
      return p;
    });
    onUpdatePredictions(updated);
    setActiveDismissId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in relative">

      {/* FLOATING SUCCESS TOAST */}
      {woSuccessToast && (
        <div className="fixed bottom-6 right-6 bg-[#13191D] border-2 border-primary rounded-lg p-4 shadow-2xl z-50 flex items-start space-x-3 max-w-sm animate-bounce">
          <div className="p-1 rounded bg-primary/20 text-primary mt-0.5">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <strong className="text-white text-xs block font-display font-bold">Predictive Dispatch Approved</strong>
            <p className="text-text-secondary text-[11px] leading-relaxed">{woSuccessToast.msg}</p>
            <a 
              href={woSuccessToast.link}
              className="text-primary hover:underline font-mono text-[10px] font-bold inline-block pt-1"
            >
              Access Predictive WO Dispatch Details →
            </a>
          </div>
          <button onClick={() => setWoSuccessToast(null)} className="text-text-muted hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-surface border border-border-custom rounded-lg p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span>AI Model Risk Classifiers</span>
          </h3>
          <p className="text-[11px] text-text-secondary">
            Continuous acoustic vibration and seal temperature sensors mapping probability distributions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {/* Risk Band Select */}
          <div className="flex items-center space-x-1.5 bg-background-custom border border-border-custom px-2.5 py-1.5 rounded text-xs font-mono">
            <span className="text-text-muted">RISK:</span>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-text-secondary pr-4 font-bold text-[11px]"
            >
              <option value="ALL">All Bands</option>
              <option value="Critical">Critical (≥80%)</option>
              <option value="High">High (60-79%)</option>
              <option value="Medium">Medium (40-59%)</option>
              <option value="Low">Low (&lt;40%)</option>
            </select>
          </div>

          {/* Area Select */}
          <div className="flex items-center space-x-1.5 bg-background-custom border border-border-custom px-2.5 py-1.5 rounded text-xs font-mono">
            <span className="text-text-muted">AREA:</span>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-text-secondary pr-4 font-bold text-[11px]"
            >
              <option value="ALL">All Areas</option>
              {uniqueAreas.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* RISK RANKED BENTO GRID CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredPredictions.map((pred) => {
          const colors = getRiskColors(pred.riskScore);
          
          // SVG Circular Ring details
          const radius = 34;
          const strokeWidth = 5.5;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (pred.riskScore / 100) * circumference;

          return (
            <div 
              key={pred.id} 
              className={`bg-surface border rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-xl transition-all relative overflow-hidden ${
                pred.status !== 'active' ? 'opacity-50 grayscale bg-surface/80 border-border-custom' : `hover:border-primary/50 ${colors.border}`
              }`}
            >
              {/* Background gradient grid glow for high risks */}
              {pred.status === 'active' && pred.riskScore >= 80 && (
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.03] via-transparent to-transparent pointer-events-none" />
              )}

              {/* Status overlays if accepted/snoozed/dismissed */}
              {pred.status !== 'active' && (
                <div className="absolute inset-0 bg-background-custom/30 backdrop-blur-[0.5px] z-10 flex items-center justify-center font-mono text-[11px] font-bold">
                  {pred.status === 'accepted' && (
                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded uppercase flex items-center space-x-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>DISPATCHED / ACCEPTED</span>
                    </span>
                  )}
                  {pred.status === 'snoozed' && (
                    <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded uppercase flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>SNOOZED UNTIL {pred.snoozeUntil}</span>
                    </span>
                  )}
                  {pred.status === 'dismissed' && (
                    <span className="px-3 py-1 bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded uppercase flex items-center space-x-1">
                      <X className="w-3.5 h-3.5" />
                      <span>DISMISSED: {pred.dismissReason}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Top Row: Info & Radial Progress Ring */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] font-bold text-white bg-background-custom border border-border-custom px-1.5 py-0.2 rounded uppercase">
                      {pred.id}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">
                      {pred.area}
                    </span>
                  </div>
                  
                  <h3 className="font-display text-sm font-bold text-white mt-2">
                    {pred.equipmentName}
                  </h3>
                  <p className="font-mono text-[11px] text-text-secondary">
                    TAG ID: <span className="text-white font-bold select-all">{pred.equipmentId}</span>
                  </p>
                </div>

                {/* Big Circular Ring for Risk Score */}
                <div className="relative flex items-center justify-center flex-shrink-0 ml-4">
                  <svg className="w-20 h-20 transform -rotate-90">
                    {/* Background track */}
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      fill="transparent"
                      stroke="#1F2937"
                      strokeWidth={strokeWidth}
                    />
                    {/* Active radial path */}
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      fill="transparent"
                      stroke={colors.stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-1000"
                    />
                  </svg>
                  {/* Inside Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
                    <span className={`text-[15px] font-bold text-white`}>{pred.riskScore}%</span>
                    <span className="text-[7px] text-text-muted font-bold tracking-widest uppercase">RISK</span>
                  </div>
                </div>
              </div>

              {/* Prediction details */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-text-muted">PREDICTED FAILURE MODE:</span>
                  <span className="text-white font-bold">{pred.predictedFailureMode}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-text-muted">PROBABLE FAILURE WINDOW:</span>
                  <span className="text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-1.5 py-0.2 rounded">
                    {pred.predictionWindow}
                  </span>
                </div>
              </div>

              {/* Drivers list */}
              <div className="p-3 bg-background-custom/40 rounded-lg border border-border-custom/50 space-y-2">
                <span className="font-mono text-[9px] text-accent font-bold uppercase tracking-wider block">
                  ▲ Telemetry Driver Triggers (Corpus Mapped)
                </span>
                <ul className="space-y-1.5 text-xs text-text-secondary font-sans list-none">
                  {pred.drivers.map((drv, dIdx) => (
                    <li key={dIdx} className="flex items-start space-x-1.5 text-[11px] leading-relaxed">
                      <span className="text-primary mt-1">•</span>
                      <div className="flex-1">
                        <span>{drv.text} </span>
                        {drv.link && (
                          <a 
                            href={drv.link}
                            className="text-primary hover:underline inline-flex items-center space-x-0.5 font-mono text-[9px] font-bold"
                          >
                            <span>[Source]</span>
                            <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended actions */}
              <div className="p-3 bg-surface-muted/40 border-l-2 border-primary rounded-r text-xs">
                <strong className="text-white block font-mono text-[9px] uppercase text-text-muted">RECOMMENDED MITIGATION</strong>
                <p className="text-text-secondary mt-1 font-sans text-[11px] leading-normal">
                  {pred.recommendedAction}
                </p>
              </div>

              {/* Action buttons footer */}
              {pred.status === 'active' && (
                <div className="flex items-center justify-between pt-4 border-t border-border-custom gap-2">
                  <div className="flex space-x-1.5">
                    
                    {/* Snooze Toggle */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setActiveDismissId(null);
                          setActiveSnoozeId(activeSnoozeId === pred.id ? null : pred.id);
                        }}
                        className="px-2.5 py-1.5 text-[11px] font-mono border border-border-custom rounded hover:bg-surface-muted text-text-secondary cursor-pointer transition-all"
                      >
                        Snooze
                      </button>

                      {activeSnoozeId === pred.id && (
                        <div className="absolute left-0 bottom-full mb-1 bg-surface border border-border-custom rounded shadow-2xl p-1 z-30 flex flex-col w-28 font-mono text-[10px]">
                          <button onClick={() => handleSnooze(pred.id, 1)} className="p-1.5 rounded text-left hover:bg-primary/10 hover:text-primary cursor-pointer">Snooze 24h</button>
                          <button onClick={() => handleSnooze(pred.id, 3)} className="p-1.5 rounded text-left hover:bg-primary/10 hover:text-primary cursor-pointer">Snooze 3d</button>
                          <button onClick={() => handleSnooze(pred.id, 7)} className="p-1.5 rounded text-left hover:bg-primary/10 hover:text-primary cursor-pointer">Snooze 7d</button>
                        </div>
                      )}
                    </div>

                    {/* Dismiss Toggle */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setActiveSnoozeId(null);
                          setActiveDismissId(activeDismissId === pred.id ? null : pred.id);
                        }}
                        className="px-2.5 py-1.5 text-[11px] font-mono border border-border-custom rounded hover:bg-surface-muted text-text-secondary cursor-pointer transition-all"
                      >
                        Dismiss
                      </button>

                      {activeDismissId === pred.id && (
                        <div className="absolute left-0 bottom-full mb-1 bg-surface border border-border-custom rounded shadow-2xl p-2.5 z-30 flex flex-col w-48 font-mono text-[10px] space-y-2">
                          <span className="text-[8px] text-text-muted font-bold uppercase tracking-wider block">REASON:</span>
                          <select
                            value={selectedDismissReason}
                            onChange={(e) => setSelectedDismissReason(e.target.value)}
                            className="bg-background-custom border border-border-custom p-1 rounded text-[10px] text-text-secondary focus:outline-none"
                          >
                            <option value="False Positive / Instrument Noise">False Positive / Noise</option>
                            <option value="Already Repaired / Checked">Already Repaired</option>
                            <option value="Planned turnaround shutdown cover">Planned Turnaround</option>
                            <option value="Operational Risk Accepted">Risk Accepted</option>
                          </select>
                          <button 
                            onClick={() => handleDismiss(pred.id)}
                            className="w-full py-1 bg-status-critical/10 hover:bg-status-critical/20 text-status-critical rounded font-bold border border-status-critical/20 cursor-pointer"
                          >
                            Apply Dismissal
                          </button>
                        </div>
                      )}

                    </div>

                  </div>

                  <button
                    onClick={() => handleAcceptPrediction(pred)}
                    className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-[11px] font-mono font-bold rounded transition-colors shadow-lg shadow-primary/10 cursor-pointer flex items-center space-x-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Accept & Dispatch</span>
                  </button>
                </div>
              )}

            </div>
          );
        })}
      </div>

    </div>
  );
}
