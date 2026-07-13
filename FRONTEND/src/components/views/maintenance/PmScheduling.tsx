/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle, 
  Sparkles, 
  UserCheck, 
  ShieldAlert, 
  CheckCircle,
  Clock,
  ArrowRight,
  Info,
  X
} from 'lucide-react';
import { ScheduledPm, INITIAL_SCHEDULED_PMS } from './mockMaintData';

interface PmSchedulingProps {
  schedule: ScheduledPm[];
  onUpdateSchedule: (updated: ScheduledPm[]) => void;
  userRole: string; // "Planner" or "Technician"
}

export function PmScheduling({ schedule, onUpdateSchedule, userRole }: PmSchedulingProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'gantt'>('calendar');
  const [currentMonth, setCurrentMonth] = useState('July 2026');
  const [selectedEvent, setSelectedEvent] = useState<ScheduledPm | null>(null);
  
  // Interactive Scheduling & AI Modals
  const [optimizationOpen, setOptimizationOpen] = useState(false);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationApplied, setOptimizationApplied] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Generate Calendar Days for July 2026
  // July 2026 starts on a Wednesday. So 3 leading offset days, 31 days in July.
  const calendarDays = useMemo(() => {
    const days = [];
    const year = 2026;
    const month = 6; // July (0-indexed)
    
    // Offset leading days (Sunday-Tuesday)
    for (let i = 28; i <= 30; i++) {
      days.push({ dayNum: i, monthOffset: -1, dateStr: `2026-06-${i}` });
    }
    
    // July days
    for (let i = 1; i <= 31; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      days.push({ dayNum: i, monthOffset: 0, dateStr: `2026-07-${dayStr}` });
    }

    // Offset trailing days
    for (let i = 1; i <= 8; i++) {
      days.push({ dayNum: i, monthOffset: 1, dateStr: `2026-08-0${i}` });
    }

    return days;
  }, []);

  // Map events to specific calendar days
  const eventsByDay = useMemo(() => {
    const map: Record<string, ScheduledPm[]> = {};
    schedule.forEach(event => {
      if (!map[event.date]) {
        map[event.date] = [];
      }
      map[event.date].push(event);
    });
    return map;
  }, [schedule]);

  // Priority Chip Colors
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'High': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Medium': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  // Crew lane grouping for Gantt View
  const ganttLanes = useMemo(() => {
    const lanes: Record<string, ScheduledPm[]> = {
      'Mechanical Crew': [],
      'Electrical Crew': [],
      'Vibration Techs': [],
      'Instrumentation': []
    };
    schedule.forEach(event => {
      if (lanes[event.crew]) {
        lanes[event.crew].push(event);
      } else {
        lanes['Mechanical Crew'].push(event); // fallback
      }
    });
    return lanes;
  }, [schedule]);

  // Handle Drag-to-Reschedule Permission & Conflict validation
  const handleRescheduleEvent = (pmId: string, newDate: string) => {
    // 1. Role Permission Gate
    if (userRole !== 'Planner') {
      setWarningToast(`Permission Denied: Standard role [${userRole}] cannot re-route or alter operational planning schedules. Authorization requires Planner credentials.`);
      setTimeout(() => setWarningToast(null), 7000);
      return;
    }

    // 2. Conflict Warnings Evaluation
    const matchedPm = schedule.find(p => p.id === pmId);
    if (!matchedPm) return;

    // Simulate conflicts on weekends or double bookings
    const parsedDate = new Date(newDate);
    const dayOfWeek = parsedDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Check if mechanical crew has > 2 events already scheduled on that day
    const alreadyScheduled = schedule.filter(p => p.date === newDate && p.crew === matchedPm.crew && p.id !== pmId);
    const hasCrewOverload = alreadyScheduled.length >= 1;

    let warningText = '';
    if (isWeekend) {
      warningText = `⚠️ Safety Overlap Warning: Scheduled work on ${newDate} occurs over standard maintenance weekend shutdown. Requires active overtime permits.`;
    } else if (hasCrewOverload) {
      warningText = `⚠️ Resource Conflict: ${matchedPm.crew} has multiple peak alignments on ${newDate}. Proceeding generates telemetry workload warning.`;
    }

    if (warningText) {
      setWarningToast(warningText);
      setTimeout(() => setWarningToast(null), 8000);
    }

    // Update Schedule State
    const updated = schedule.map(p => {
      if (p.id === pmId) {
        return { ...p, date: newDate };
      }
      return p;
    });
    onUpdateSchedule(updated);

    // Update local selected event date preview
    if (selectedEvent && selectedEvent.id === pmId) {
      setSelectedEvent({ ...selectedEvent, date: newDate });
    }

    setSuccessToast(`Successfully rescheduled ${pmId} to ${newDate}.`);
    setTimeout(() => setSuccessToast(null), 5000);
  };

  // AI Scheduling Optimization Run
  const handleTriggerAiOptimization = () => {
    setOptimizationLoading(true);
    setTimeout(() => {
      setOptimizationLoading(false);
      setOptimizationApplied(true);
      
      // Perform resource leveling by spreading out overlapping PMs
      // E.g., re-distributing mechanical events on July 14th/15th
      const optimizedSchedule = schedule.map(pm => {
        if (pm.id === 'PM-2940') return { ...pm, date: '2026-07-16' }; // Move to level resource load
        if (pm.id === 'PM-1029') return { ...pm, date: '2026-07-21' }; // Move to avoid duplicate isolation outages
        return pm;
      });
      
      onUpdateSchedule(optimizedSchedule);
      
      setSuccessToast("Neural engine leveled crew allocations and consolidated duplicate LOTO windows successfully.");
      setTimeout(() => setSuccessToast(null), 8000);
    }, 2200);
  };

  return (
    <div className="space-y-6 animate-fade-in relative">

      {/* FLOATING ACTION NOTIFICATIONS */}
      {warningToast && (
        <div className="fixed bottom-6 right-6 bg-[#181111] border border-red-500/30 rounded-lg p-4 shadow-2xl z-50 flex items-start space-x-3 max-w-sm">
          <div className="p-1 rounded bg-red-500/10 text-red-400 mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <strong className="text-white text-xs block font-display">Planning Lock Constraint</strong>
            <p className="text-red-300 text-[11px] leading-relaxed">{warningToast}</p>
          </div>
          <button onClick={() => setWarningToast(null)} className="text-text-muted hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUCCESS TOAST */}
      {successToast && (
        <div className="fixed bottom-6 right-6 bg-[#111814] border border-emerald-500/30 rounded-lg p-4 shadow-2xl z-50 flex items-start space-x-3 max-w-sm">
          <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 mt-0.5">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <strong className="text-white text-xs block font-display">Schedule Updated</strong>
            <p className="text-emerald-300 text-[11px] leading-relaxed">{successToast}</p>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-text-muted hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP CONTROLS & AI AUTO LEVEL */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-custom pb-4">
        
        {/* Toggle Mode Buttons */}
        <div className="flex bg-background-custom border border-border-custom p-0.5 rounded text-xs font-mono self-start">
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'calendar' ? 'bg-primary text-white font-bold shadow' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Month Grid</span>
          </button>
          
          <button
            onClick={() => setViewMode('gantt')}
            className={`px-3 py-1.5 rounded transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'gantt' ? 'bg-primary text-white font-bold shadow' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Gantt Resource Lanes</span>
          </button>
        </div>

        {/* AI Optimize Trigger */}
        <button
          onClick={() => setOptimizationOpen(true)}
          className="px-4 py-2 bg-gradient-to-r from-primary to-accent hover:from-primary-hover hover:to-accent-hover text-white text-xs font-mono font-bold rounded shadow-lg shadow-primary/10 flex items-center space-x-2 cursor-pointer self-start md:self-center"
        >
          <Sparkles className="w-4 h-4 text-white animate-pulse" />
          <span>Optimize Schedule (AI)</span>
        </button>

      </div>

      {/* MAIN VIEW CONTROLLER */}
      {viewMode === 'calendar' ? (
        
        /* MONTH CALENDAR VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* 31-Day Month Grid */}
          <div className="lg:col-span-3 bg-surface border border-border-custom rounded-lg p-4 space-y-4">
            
            {/* Month Header Nav */}
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-text-primary text-base">
                {currentMonth}
              </h2>
              <div className="flex items-center space-x-1">
                <button className="p-1 border border-border-custom bg-surface-muted hover:bg-surface rounded text-text-secondary hover:text-text-primary cursor-pointer">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="p-1 border border-border-custom bg-surface-muted hover:bg-surface rounded text-text-secondary hover:text-text-primary cursor-pointer">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays indicator */}
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px] text-text-muted font-bold uppercase tracking-wider pb-1">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Grid days */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day, dIdx) => {
                const dayEvents = eventsByDay[day.dateStr] || [];
                const isCurrentMonth = day.monthOffset === 0;

                return (
                  <div 
                    key={dIdx} 
                    className={`min-h-24 bg-[#111619] border border-border-custom/50 rounded p-1.5 flex flex-col justify-between transition-colors ${
                      isCurrentMonth ? '' : 'opacity-25'
                    } hover:bg-surface-muted/30`}
                  >
                    <span className={`font-mono text-[10px] font-bold ${
                      isCurrentMonth ? 'text-text-secondary' : 'text-text-muted'
                    }`}>
                      {day.dayNum}
                    </span>

                    {/* Day events pills stack */}
                    <div className="space-y-1 mt-1 flex-1 flex flex-col justify-end">
                      {dayEvents.map(event => (
                        <div
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className="px-1.5 py-0.5 rounded bg-surface border border-border-custom text-[9px] font-mono font-medium text-text-primary hover:border-primary/50 cursor-pointer truncate max-w-full"
                          title={event.title}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${
                            event.priority === 'Critical' ? 'bg-red-400 animate-pulse' :
                            event.priority === 'High' ? 'bg-amber-400' : 'bg-primary'
                          }`} />
                          <span>{event.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* SIDEBAR DETAILED DRILLDOWN & EDIT ACTION */}
          <div className="bg-surface border border-border-custom rounded-lg p-5 flex flex-col justify-between space-y-4">
            {selectedEvent ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border-custom pb-3">
                  <span className="font-mono text-xs font-bold text-text-primary bg-background-custom border border-border-custom px-2 py-0.5 rounded">
                    {selectedEvent.id}
                  </span>
                  <button 
                    onClick={() => setSelectedEvent(null)}
                    className="text-text-muted hover:text-text-primary p-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1">
                  <h3 className="font-display font-bold text-text-primary text-sm">{selectedEvent.title}</h3>
                  <p className="text-[11px] text-text-muted font-mono">{selectedEvent.equipmentId} ({selectedEvent.equipmentName})</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono border-b border-border-custom/30 py-1">
                    <span className="text-text-muted">CREW LANE:</span>
                    <span className="text-text-primary font-bold">{selectedEvent.crew}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono border-b border-border-custom/30 py-1">
                    <span className="text-text-muted">EST TIME:</span>
                    <span className="text-text-primary font-bold">{selectedEvent.estimatedHours} Hours</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono border-b border-border-custom/30 py-1">
                    <span className="text-text-muted">SLA STATUS:</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] border font-bold ${
                      selectedEvent.priority === 'Critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {selectedEvent.priority}
                    </span>
                  </div>
                </div>

                {/* Inline Drag-to-Reschedule Date Field */}
                <div className="p-3 bg-background-custom/40 border border-border-custom rounded-lg space-y-3">
                  <span className="font-mono text-[9px] text-accent font-bold uppercase tracking-wider block">
                    Reschedule Operation (Planner Gate)
                  </span>
                  
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={rescheduleDate || selectedEvent.date}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full bg-surface border border-border-custom rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                    />
                    
                    <button
                      onClick={() => handleRescheduleEvent(selectedEvent.id, rescheduleDate || selectedEvent.date)}
                      className="w-full py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 font-mono text-[10px] font-bold rounded cursor-pointer transition-all"
                    >
                      Apply Re-route Date
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-text-muted space-y-2 font-mono text-[11px]">
                <CalendarIcon className="w-8 h-8 text-text-muted/60" />
                <p>Select any PM order on the calendar grid to configure planning limits.</p>
              </div>
            )}

            <div className="p-3 bg-surface-muted/40 border border-border-custom rounded text-[10px] leading-relaxed text-text-secondary">
              <span className="text-text-primary font-bold block mb-0.5 font-mono uppercase text-[9px]">💡 Current Role context</span>
              Planner permissions: <strong className="text-text-primary">{userRole}</strong>.
              (Technicians are blocked from re-routing operational milestones).
            </div>
          </div>

        </div>

      ) : (

        /* GANTT LANE VIEW */
        <div className="bg-surface border border-border-custom rounded-lg p-5 space-y-6">
          <div className="flex items-center justify-between border-b border-border-custom pb-3">
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Operational Crew Load Allocations (Gantt lanes)
            </h3>
            <span className="text-[10px] font-mono text-text-muted">JULY 12 - JULY 20, 2026</span>
          </div>

          <div className="space-y-4">
            {Object.entries(ganttLanes).map(([crewName, pms]) => (
              <div key={crewName} className="grid grid-cols-1 md:grid-cols-4 border-b border-border-custom/40 pb-4 gap-4 items-center">
                
                {/* Lane Header */}
                <div className="md:col-span-1">
                  <span className="font-mono text-xs font-bold text-text-primary block">
                    {crewName}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono mt-0.5 block">
                    {pms.length} Active Assignments
                  </span>
                </div>

                {/* Lane Schedule timeline (Visual Representation) */}
                <div className="md:col-span-3 bg-background-custom/40 rounded-lg p-3 min-h-16 flex items-center space-x-3 overflow-x-auto">
                  {pms.map(pm => (
                    <div
                      key={pm.id}
                      onClick={() => setSelectedEvent(pm)}
                      className="flex-shrink-0 p-2.5 bg-surface border border-border-custom rounded-lg w-52 hover:border-primary transition-all cursor-pointer space-y-1 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] font-bold text-text-primary uppercase">{pm.id}</span>
                        <span className={`px-1 rounded text-[8px] font-mono font-bold ${getPriorityStyle(pm.priority)}`}>
                          {pm.priority}
                        </span>
                      </div>
                      
                      <p className="text-[10px] text-text-secondary truncate font-sans font-medium" title={pm.title}>
                        {pm.title}
                      </p>

                      <div className="flex items-center justify-between text-[8px] font-mono text-text-muted pt-1">
                        <span>DATE: {pm.date}</span>
                        <span>{pm.estimatedHours}H</span>
                      </div>
                    </div>
                  ))}
                  {pms.length === 0 && (
                    <span className="text-[10px] font-mono text-text-muted italic py-2">No maintenance load allocated to this crew.</span>
                  )}
                </div>

              </div>
            ))}
          </div>
        </div>

      )}

      {/* AI OPTIMIZATION POPUP MODAL */}
      {optimizationOpen && (
        <div className="fixed inset-0 bg-[#0B0F12]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border-custom max-w-lg w-full rounded-lg p-5 space-y-4 shadow-2xl font-sans text-xs">
            
            <div className="flex items-center justify-between border-b border-border-custom pb-3">
              <div className="flex items-center space-x-2 text-primary font-mono text-[11px] font-bold uppercase">
                <Sparkles className="w-4 h-4" />
                <span>AI Scheduling Load Leveler</span>
              </div>
              <button 
                onClick={() => setOptimizationOpen(false)}
                className="text-text-muted hover:text-text-primary p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-text-secondary leading-relaxed">
              IndusMind's scheduling engine analyzes crew loads, active safety permits, and component redundancies to align preventative outages.
            </p>

            {/* AI Optimization reasoning points */}
            <div className="p-3 bg-background-custom border border-border-custom rounded-lg space-y-2.5">
              <span className="font-mono text-[9px] text-accent font-bold uppercase tracking-wider block">
                Suggested Neural Adjustments
              </span>
              
              <ul className="space-y-2 text-xs text-text-secondary leading-relaxed list-none">
                <li className="flex items-start space-x-2">
                  <span className="text-primary mt-1">•</span>
                  <span>
                    <strong>Level Crew Assignments</strong>: Reschedule <code>PM-2940</code> from July 14th to July 16th to distribute mechanical load off the peak 18-hour day.
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-primary mt-1">•</span>
                  <span>
                    <strong>Outage Consolidation</strong>: Reschedule <code>PM-1029</code> on C-3 compressor system to July 21st to overlap with the scheduled predictive replacement. This eliminates duplicate LOTO isolation downtime.
                  </span>
                </li>
              </ul>
            </div>

            {/* Before / After comparisons metrics */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-3 bg-surface-muted/40 border border-border-custom rounded">
                <span className="text-[10px] font-mono text-text-muted block uppercase">Current Peaks</span>
                <span className="text-sm font-bold text-red-400 mt-1 block">18.5 hrs (July 14)</span>
                <span className="text-[9px] font-mono text-text-muted mt-0.5 block">2 crew overlap warnings</span>
              </div>
              <div className="p-3 bg-primary/5 border border-primary/20 rounded">
                <span className="text-[10px] font-mono text-text-muted block uppercase">Optimized Peaks</span>
                <span className="text-sm font-bold text-emerald-400 mt-1 block">12.0 hrs max limit</span>
                <span className="text-[9px] font-mono text-text-muted mt-0.5 block">0 conflicts (Leveled load)</span>
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex justify-end space-x-2 pt-3 border-t border-border-custom">
              <button
                onClick={() => setOptimizationOpen(false)}
                className="px-3 py-1.5 border border-border-custom rounded hover:bg-surface-muted text-text-secondary transition-all cursor-pointer font-mono text-[10px]"
              >
                Close
              </button>
              
              <button
                disabled={optimizationLoading || optimizationApplied}
                onClick={handleTriggerAiOptimization}
                className={`px-4 py-1.5 font-mono font-bold text-[10px] rounded transition-colors cursor-pointer flex items-center space-x-1 ${
                  optimizationApplied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-primary hover:bg-primary-hover text-white'
                }`}
              >
                {optimizationLoading ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing constraints...</span>
                  </>
                ) : optimizationApplied ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Optimization Applied</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply AI Optimization</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
