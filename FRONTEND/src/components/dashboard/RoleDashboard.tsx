/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuthStore } from '../../stores/authStore';
import { StatusChip, ConfidenceBadge, SkeletonLoader } from '../shared';
import { Bot, Wrench, AlertTriangle, ShieldCheck, Cpu, Users, History, FileText, Calendar, Plus, RefreshCw, Sparkles, Download, CheckCircle, ArrowRight, Check, Play, X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../../lib/api/client';

function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('indusmind_onboarding_dismissed') === 'true';
  });
  const [loadingSeed, setLoadingSeed] = useState(false);
  const [seedStep, setSeedStep] = useState('');
  
  // Dynamic step statuses based on real local state
  const [steps, setSteps] = useState({
    equipmentAdded: false,
    documentsUploaded: false,
    teamInvited: false,
    firstCopilotQuestion: false
  });

  const checkMilestones = () => {
    const seedSeeded = localStorage.getItem('indusmind_effective_settings') && 
      JSON.parse(localStorage.getItem('indusmind_effective_settings') || '{}').demoSeeded;

    // 1. Equipment added
    const equipmentAdded = localStorage.getItem('indusmind_onboarding_equipment_added') === 'true' || !!seedSeeded;
    // 2. Documents uploaded
    const documentsUploaded = localStorage.getItem('indusmind_onboarding_documents_uploaded') === 'true' || !!seedSeeded;
    // 3. Team invited
    const teamInvited = localStorage.getItem('indusmind_onboarding_team_invited') === 'true' || !!seedSeeded;
    // 4. First copilot question
    const firstCopilotQuestion = localStorage.getItem('indusmind_onboarding_copilot_queried') === 'true' || !!seedSeeded;

    setSteps({
      equipmentAdded,
      documentsUploaded,
      teamInvited,
      firstCopilotQuestion
    });
  };

  useEffect(() => {
    checkMilestones();
    // Listen to localstorage changes or custom trigger events if any
    const interval = setInterval(checkMilestones, 1500);
    return () => clearInterval(interval);
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('indusmind_onboarding_dismissed', 'true');
    setDismissed(true);
  };

  const handleLoadSampleData = async () => {
    setLoadingSeed(true);
    setSeedStep('Establishing connection to master DB ledger...');
    try {
      await new Promise(r => setTimeout(r, 800));
      setSeedStep('Ingesting OISD compliance clauses & standards...');
      await new Promise(r => setTimeout(r, 600));
      setSeedStep('Indexing piping and instrumentation schematics (P&ID)...');
      await new Promise(r => setTimeout(r, 600));
      setSeedStep('Seeding equipment nodes & live telemetry loops...');
      
      // Hit the real seed endpoint in mock client
      await api.post('/admin/seed-demo');
      
      setSeedStep('Compiling semantic knowledge graph...');
      await new Promise(r => setTimeout(r, 500));
      
      // Update local storage states
      localStorage.setItem('indusmind_onboarding_equipment_added', 'true');
      localStorage.setItem('indusmind_onboarding_documents_uploaded', 'true');
      localStorage.setItem('indusmind_onboarding_team_invited', 'true');
      localStorage.setItem('indusmind_onboarding_copilot_queried', 'true');
      
      checkMilestones();
      setSeedStep('Seeding complete! Reloading...');
      await new Promise(r => setTimeout(r, 400));
      window.location.reload();
    } catch (err) {
      console.error(err);
      setSeedStep('Seeding failed. Try again.');
    } finally {
      setLoadingSeed(false);
    }
  };

  const handleStartTour = () => {
    window.dispatchEvent(new CustomEvent('indusmind-start-tour'));
  };

  const completedCount = Object.values(steps).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / 4) * 100);

  return (
    <div className="bg-surface border border-primary/25 rounded-xl p-5 shadow-lg relative overflow-hidden bg-gradient-to-r from-surface to-primary/5 text-left font-sans animate-fade-in mb-6">
      {/* Background decoration */}
      <div className="absolute -right-16 -top-16 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
      
      <button 
        onClick={handleDismiss} 
        className="absolute top-4 right-4 text-text-muted hover:text-text-primary cursor-pointer transition-colors p-1 rounded hover:bg-surface-muted"
        title="Dismiss Onboarding Checklist"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 flex-1 text-left">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            <h3 className="font-display font-bold text-sm text-text-primary uppercase tracking-wider text-left">
              Operator Ingestion & System Readiness Checklist
            </h3>
            <span className="text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded uppercase">
              {completedCount} / 4 COMPLETED
            </span>
          </div>
          <p className="text-xs text-text-secondary max-w-2xl leading-relaxed text-left">
            Complete the operational milestones below to fully provision this refinery node. You can load simulated industrial plant data to instantly populate and test the live telemetry monitoring views.
          </p>

          {/* Progress bar */}
          <div className="space-y-1 max-w-md">
            <div className="flex justify-between text-[10px] font-mono text-text-muted uppercase">
              <span>Node Provisioning Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border-custom/30">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
          <button
            onClick={handleStartTour}
            className="px-3.5 py-2 border border-border-custom hover:bg-surface-muted text-text-primary rounded font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 text-primary" />
            <span>LAUNCH GUIDED SYSTEM TOUR</span>
          </button>
          
          <button
            disabled={loadingSeed}
            onClick={handleLoadSampleData}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {loadingSeed ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span className="animate-pulse">SEEDING...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-white" />
                <span>LOAD SIMULATED PLANT DATA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {loadingSeed && (
        <div className="mt-4 p-3 bg-primary/5 rounded border border-primary/20 flex items-center space-x-2 animate-pulse text-[11px] font-mono text-primary">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{seedStep}</span>
        </div>
      )}

      {/* Grid of steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border-custom/40">
        {/* Milestone 1 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.equipmentAdded ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.equipmentAdded ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.equipmentAdded ? 'text-status-ok' : 'text-text-muted'
            }`}>
              1. Equipment Tag Schema
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Add your first piece of plant equipment or sensor node.
            </p>
          </div>
        </div>

        {/* Milestone 2 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.documentsUploaded ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.documentsUploaded ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.documentsUploaded ? 'text-status-ok' : 'text-text-muted'
            }`}>
              2. SOP & Document Ingestion
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Index plant standard operating procedures or regulations.
            </p>
          </div>
        </div>

        {/* Milestone 3 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.teamInvited ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.teamInvited ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.teamInvited ? 'text-status-ok' : 'text-text-muted'
            }`}>
              3. Operational Team Invited
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Invite an engineer, lead operator, or auditor to this node.
            </p>
          </div>
        </div>

        {/* Milestone 4 */}
        <div className={`p-3.5 rounded-xl border transition-all text-left flex items-start space-x-3 bg-background-custom/30 ${
          steps.firstCopilotQuestion ? 'border-status-ok/30' : 'border-border-custom hover:border-border-custom/80'
        }`}>
          <div className={`p-1 rounded-full mt-0.5 flex-shrink-0 ${
            steps.firstCopilotQuestion ? 'bg-status-ok/10 text-status-ok' : 'bg-surface-muted text-text-muted border border-border-custom'
          }`}>
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 text-xs">
            <span className={`font-mono text-[10px] font-bold block uppercase text-left ${
              steps.firstCopilotQuestion ? 'text-status-ok' : 'text-text-muted'
            }`}>
              4. AI Verification Dry Run
            </span>
            <p className="text-text-secondary leading-snug text-[11px] text-left">
              Query our Copilot agent on plant specifications or torque guidelines.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoleDashboard() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const triggerRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 400);
  };

  if (!user) return null;

  // Render Skeleton if reloading
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-border-custom">
          <div>
            <SkeletonLoader className="h-8 w-48 mb-2" />
            <SkeletonLoader className="h-4 w-96" />
          </div>
          <SkeletonLoader className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SkeletonLoader className="h-24 w-full" />
          <SkeletonLoader className="h-24 w-full" />
          <SkeletonLoader className="h-24 w-full" />
          <SkeletonLoader className="h-24 w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonLoader className="h-80 w-full lg:col-span-2" />
          <SkeletonLoader className="h-80 w-full" />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 1. PLANT MANAGER VIEW
  // ----------------------------------------------------
  if (user.role === 'Plant Manager') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>Operational Executive Command</span>
              <span className="text-xs font-mono font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded ml-2 uppercase">Node Active</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Active plant status overview, AI performance briefs, and high-level compliance indicators.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <button onClick={triggerRefresh} className="p-2 border border-border-custom hover:bg-surface-muted rounded text-text-secondary cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create Shutdown Permit</span>
            </button>
          </div>
        </div>

        {/* Executive KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface border border-border-custom p-4 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-start mb-2 text-text-secondary">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Overall Equipment Effectiveness (OEE)</span>
              <Cpu className="w-4 h-4 text-primary" />
            </div>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight">84.6%</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] font-mono text-status-ok">▲ +1.2% VS LST SHIFT</span>
              <StatusChip label="Normal" type="ok" />
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-start mb-2 text-text-secondary">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Unplanned Downtime Hrs</span>
              <AlertTriangle className="w-4 h-4 text-status-critical" />
            </div>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight">14.8 hrs</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] font-mono text-status-critical">▼ +3.4 hrs COLD STARTS</span>
              <StatusChip label="Critical" type="critical" />
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-start mb-2 text-text-secondary">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Active Work Order backlog</span>
              <Wrench className="w-4 h-4 text-status-warn" />
            </div>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight">24 WOs</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] font-mono text-text-muted">6 HIGH PRIORITY OPEN</span>
              <StatusChip label="Warning" type="warn" />
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg relative overflow-hidden">
            <div className="flex justify-between items-start mb-2 text-text-secondary">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Compliance score</span>
              <ShieldCheck className="w-4 h-4 text-status-ok" />
            </div>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight">98.2%</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] font-mono text-text-muted">3 GAPS DETECTED</span>
              <StatusChip label="Secured" type="ok" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* DAILY AI OPERATIONAL BRIEF - Highlighting Amber Accent */}
          <div className="lg:col-span-2 bg-ai-soft/40 border border-ai-soft-border p-5 rounded-lg relative">
            <div className="absolute top-3 right-3">
              <Sparkles className="w-5 h-5 text-ai animate-pulse" />
            </div>
            
            <div className="flex items-center space-x-2 mb-4">
              <Bot className="w-5 h-5 text-ai" />
              <h3 className="font-display text-sm font-semibold text-ai uppercase tracking-wider">
                Daily AI Operational Synthesis
              </h3>
            </div>

            <div className="space-y-4 font-sans text-xs">
              <div className="p-3 bg-surface border-l-2 border-ai rounded-r space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-text-primary text-[11px] uppercase">Anomaly Warning: Compressor Station 4</span>
                  <ConfidenceBadge confidence="High" />
                </div>
                <p className="text-text-secondary leading-relaxed">
                  Vibration sensors on <span className="font-mono text-ai bg-ai-soft/50 px-1 rounded">COMP-302B</span> have breached nominal limits (7.2 mm/s vs 5.0 mm/s target). Lessons Learned model matches this pattern with the June 2025 stator coil breakdown. Recommended inspection within 48 hours to avert unplanned outage.
                </p>
                <div className="flex space-x-2 pt-1">
                  <button className="text-[10px] font-mono text-ai hover:underline flex items-center cursor-pointer">
                    View Correlated Incident Report [INC-991] →
                  </button>
                </div>
              </div>

              <div className="p-3 bg-surface-muted border-l-2 border-status-critical/50 rounded-r space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-text-primary text-[11px] uppercase">Regulatory Non-Compliance Risk</span>
                  <ConfidenceBadge confidence={98} />
                </div>
                <p className="text-text-secondary leading-relaxed">
                  Firewater pump weekly validation records are overdue by 4 shifts in Area REF-A. This breaches <span className="font-mono text-text-primary bg-background-custom px-1 rounded">OISD-STD-118 Clause 6.4</span>. Audit risk has increased by 14%.
                </p>
                <div className="flex space-x-2 pt-1">
                  <button className="text-[10px] font-mono text-primary hover:underline flex items-center cursor-pointer">
                    Instruct Maintenance Lead to Execute Test →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Plant Health & Status Matrix */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-border-custom pb-3 mb-4">
                <h3 className="font-display text-sm font-bold text-text-primary uppercase tracking-wider">Area Status Matrix</h3>
                <span className="text-[10px] font-mono text-text-muted">4 ACTIVE LABELS</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-ok" />
                    <span className="font-medium text-text-primary">REF-A (Crude Unit)</span>
                  </div>
                  <span className="font-mono font-bold text-status-ok">98% HEALTH</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-warn" />
                    <span className="font-medium text-text-primary">REF-B (Catalytic Cracker)</span>
                  </div>
                  <span className="font-mono font-bold text-status-warn">72% HEALTH</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-critical" />
                    <span className="font-medium text-text-primary">UTILITIES (Water/Steam)</span>
                  </div>
                  <span className="font-mono font-bold text-status-critical">46% HEALTH</span>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border-custom mt-4">
              <button className="w-full py-2 bg-surface-muted hover:bg-surface border border-border-custom text-xs font-semibold text-text-primary rounded text-center cursor-pointer transition-colors">
                Open Detailed 360° Plant Heatmap
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. FIELD TECHNICIAN VIEW (Mobile-Optimized Layout)
  // ----------------------------------------------------
  if (user.role === 'Field Technician') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="pb-4 border-b border-border-custom">
          <span className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest block mb-1">Mobile Field Terminal</span>
          <h1 className="font-display text-xl font-bold text-text-primary">
            Hello, {user.name.split(' ')[0]}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Your assigned tasks for today on <span className="font-mono text-primary">{user.plant.split(' - ')[1]}</span>.
          </p>
        </div>

        {/* Small Touch-Friendly Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface border border-border-custom p-3 rounded-lg text-center">
            <span className="text-[9px] font-mono text-text-muted block uppercase">Open WOs</span>
            <span className="text-xl font-bold text-text-primary font-display">2</span>
          </div>
          <div className="bg-surface border border-border-custom p-3 rounded-lg text-center bg-primary/5 border-primary/20">
            <span className="text-[9px] font-mono text-primary block uppercase">Due Shift</span>
            <span className="text-xl font-bold text-primary font-display">1</span>
          </div>
          <div className="bg-surface border border-border-custom p-3 rounded-lg text-center">
            <span className="text-[9px] font-mono text-text-muted block uppercase">Hrs Logged</span>
            <span className="text-xl font-bold text-text-primary font-display">6.5</span>
          </div>
        </div>

        {/* Swipeable/Clickable Safety Briefing Card */}
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-lg">
          <div className="flex items-center space-x-2 text-status-ok mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Dynamic Safety Briefing</span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Wear vapor respirator at <strong className="text-text-primary">REF-A (Crude Block)</strong> today. Low-pressure nitrogen flushing is active near Valve <span className="font-mono bg-surface-muted px-1 rounded text-text-primary">V-230</span>. Verify bypass line pressure remains at 0 BAR before starting calibration.
          </p>
        </div>

        {/* Active Work Order Stepper list */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono font-bold text-text-muted uppercase tracking-wider">
            Today's Assigned Tasks (Touch to Open)
          </h3>

          <div 
            onClick={() => alert('Launching mobile interactive step-by-step WO-2041 panel.')}
            className="p-4 bg-surface border-l-4 border-status-critical bg-surface-muted/30 hover:bg-surface-muted rounded-r-lg border border-y-border-custom border-r-border-custom transition-all cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs font-bold text-text-primary">WO-2041</span>
              <span className="text-[9px] font-mono font-bold bg-status-critical/10 text-status-critical border border-status-critical/20 px-1.5 py-0.5 rounded">
                CRITICAL DUE 17:00
              </span>
            </div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">
              Calibrate Pressure Gauge PG-104 on Feed Pump P-101A
            </h4>
            <div className="flex items-center space-x-3 text-[10px] font-mono text-text-secondary mt-3">
              <span className="flex items-center"><Cpu className="w-3.5 h-3.5 mr-1" /> P-101A</span>
              <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" /> 4 Steps Left</span>
            </div>
          </div>

          <div 
            onClick={() => alert('Launching mobile interactive step-by-step WO-1984 panel.')}
            className="p-4 bg-surface border-l-4 border-status-warn bg-surface-muted/30 hover:bg-surface-muted rounded-r-lg border border-y-border-custom border-r-border-custom transition-all cursor-pointer opacity-70"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs font-bold text-text-primary">WO-1984</span>
              <span className="text-[9px] font-mono font-bold bg-status-warn/10 text-status-warn border border-status-warn/20 px-1.5 py-0.5 rounded">
                NORMAL DUE TOMORROW
              </span>
            </div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">
              Lubricate Rotating Stator Bearings on Sludge Pump P-101B
            </h4>
            <div className="flex items-center space-x-3 text-[10px] font-mono text-text-secondary mt-3">
              <span className="flex items-center"><Cpu className="w-3.5 h-3.5 mr-1" /> P-101B</span>
              <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" /> 7 Steps Left</span>
            </div>
          </div>
        </div>

        {/* Quick Voice/Text Copilot Box */}
        <div className="bg-surface border border-border-custom p-4 rounded-lg">
          <h3 className="font-display text-xs font-bold text-text-primary mb-2 uppercase tracking-wider flex items-center space-x-1.5">
            <Bot className="w-4 h-4 text-primary" />
            <span>Speak to Copilot</span>
          </h3>
          <p className="text-[11px] text-text-secondary mb-3">
            Ask for instant torque specs, wiring schematics, or past fixes.
          </p>
          <div className="flex space-x-2">
            <input 
              type="text" 
              placeholder="e.g. 'torque for V-230 bolts'..." 
              className="flex-1 bg-background-custom border border-border-custom px-3 py-1.5 text-xs rounded text-text-primary focus:outline-none focus:border-primary font-sans"
            />
            <button 
              onClick={() => window.location.hash = '#copilot'}
              className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded cursor-pointer transition-colors"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 3. SUPER ADMIN VIEW
  // ----------------------------------------------------
  if (user.role === 'Admin') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>HMI System Control Tower</span>
              <span className="text-xs font-mono font-medium text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded ml-2 uppercase">Root Level</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Administrative workspace management, ingestion queue health, and model parameters overrides.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button onClick={() => { window.location.hash = '#admin/users'; }} className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Invite New Operator</span>
            </button>
          </div>
        </div>

        {/* Admin KPI Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Active Console Connections</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">5 / 12</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">● 5 OPERATIONS WORKSTATIONS ONLINE</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Documents Ingested (24h)</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">412 files</p>
            <span className="text-[10px] font-mono text-text-secondary mt-2 block">OCR EXTRACT: 12,941 ENTITIES</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">AI Pipeline Success %</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">99.8%</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">GRAPH SYNCHRONIZATION: SECURED</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Console API Latency (Avg)</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">42 ms</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">INFRASTRUCTURE HEALTH: EXCELLENT</span>
          </div>
        </div>

        {/* Administration grid split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface border border-border-custom p-4 rounded-lg">
            <div className="flex justify-between items-center border-b border-border-custom pb-3 mb-4">
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Live Document Ingestion Monitor</h3>
              <StatusChip label="Streaming" type="ok" />
            </div>
            
            {/* mock pipelines */}
            <div className="space-y-4 text-xs font-sans">
              <div className="p-3 bg-background-custom/40 rounded border border-border-custom/50">
                <div className="flex justify-between items-center mb-2 font-mono">
                  <span className="font-bold text-text-primary text-[11px] truncate max-w-[240px]">PID-992-SECTOR-A-REFINERY.DWG.PDF</span>
                  <span className="text-[10px] text-primary">STAGE: ENTITY EXTRACT (82%)</span>
                </div>
                <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '82%' }} />
                </div>
              </div>

              <div className="p-3 bg-background-custom/40 rounded border border-border-custom/50">
                <div className="flex justify-between items-center mb-2 font-mono">
                  <span className="font-bold text-text-primary text-[11px] truncate max-w-[240px]">SOP-CRUDE-SHUTDOWN-PROCEDURE.DOCX</span>
                  <span className="text-[10px] text-status-ok">STAGE: COMPLETED (100%)</span>
                </div>
                <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden">
                  <div className="bg-status-ok h-full rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between">
            <div>
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-3 pb-3 border-b border-border-custom">
                Node Settings Overview
              </h3>
              <div className="space-y-3 font-mono text-[11px] text-text-secondary">
                <div className="flex justify-between">
                  <span>ACTIVE LLM:</span>
                  <span className="text-text-primary">Gemini 1.5 Pro</span>
                </div>
                <div className="flex justify-between">
                  <span>EMBEDDINGS:</span>
                  <span className="text-text-primary">bge-large-en-v1.5</span>
                </div>
                <div className="flex justify-between">
                  <span>VECTOR STORE:</span>
                  <span className="text-text-primary">Postgres pgvector</span>
                </div>
                <div className="flex justify-between">
                  <span>GRAPH STORE:</span>
                  <span className="text-text-primary">Neo4j Community</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => { window.location.hash = '#admin/settings'; }}
              className="w-full mt-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-colors"
            >
              Access Global Settings Node
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 4. MAINTENANCE ENGINEER VIEW
  // ----------------------------------------------------
  if (user.role === 'Maintenance Engineer') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>Maintenance Planning Workspace</span>
              <span className="text-xs font-mono font-medium text-status-warn bg-status-warn/10 border border-status-warn/20 px-2 py-0.5 rounded ml-2 uppercase">Scheduled Mode</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Active equipment telemetry anomalies, predictive risk indices, and Root Cause Analysis (RCA) suites.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <button onClick={triggerRefresh} className="p-2 border border-border-custom hover:bg-surface-muted rounded text-text-secondary cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create PM Work Order</span>
            </button>
          </div>
        </div>

        {/* Engineer KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Active Work Orders</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">48</p>
            <span className="text-[10px] font-mono text-status-warn mt-2 block">12 HIGH PRIORITY OPEN</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Mean Time Between Failure (MTBF)</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">342 hrs</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">▲ +14% OVER 30D PERIOD</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Mean Time To Repair (MTTR)</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">2.1 hrs</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">▼ -20m OPTIMISED BY CO-PILOT</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Active backlog duration</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">120 hrs</p>
            <span className="text-[10px] font-mono text-status-warn mt-2 block">6 PM TASKS DELAYED</span>
          </div>
        </div>

        {/* Maintenance suggestions list */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface border border-border-custom p-4 rounded-lg">
            <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-4 pb-3 border-b border-border-custom">
              Anomalous Equipment & AI Predictive Recommendations
            </h3>
            
            <div className="space-y-4 text-xs font-sans">
              <div className="p-3 bg-background-custom/40 border border-border-custom rounded space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-status-critical" />
                    <span className="font-mono font-bold text-text-primary">COMP-302B (Reciprocating Compressor)</span>
                  </div>
                  <span className="text-status-critical font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-status-critical/10 border border-status-critical/20">
                    94% RISK OF OUTAGE
                  </span>
                </div>
                <p className="text-text-secondary">
                  Telemetry logs register periodic high fluid-discharge friction coefficient on secondary piston rings. Lessons Learned correlates this signature with 3 historical seal failures (MT-2022, MT-2024, MT-2025).
                </p>
                <div className="flex justify-between items-center pt-2 border-t border-border-custom/50 mt-1">
                  <span className="font-mono text-[10px] text-text-muted">EXPECTED FAILURE WINDOW: 48 HOURS</span>
                  <button 
                    onClick={() => alert('Work Order auto-generated for COMP-302B replacement.')}
                    className="px-2.5 py-1 bg-primary hover:bg-primary-hover text-white rounded font-mono text-[10px] font-semibold cursor-pointer"
                  >
                    Accept Recommendation & Dispatch Tech →
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between">
            <div>
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider pb-3 border-b border-border-custom mb-3 flex items-center space-x-1.5">
                <Bot className="w-4 h-4 text-primary" />
                <span>RCA Agent Workspace</span>
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                The AI Root Cause Analysis agent evaluates incidents, correlating P&IDs and past maintenance records to determine failure modes.
              </p>
              <div className="bg-background-custom p-3 rounded border border-border-custom space-y-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-text-muted">TARGET: P-101A STALL</span>
                  <span className="text-status-ok">92% CONFIDENCE</span>
                </div>
                <p className="text-[11px] font-mono text-text-primary leading-snug">
                  CAUSAL PATHWAY: Recirculation valve blockages → suction cavity starvation → hydraulic cavitation of secondary impeller.
                </p>
              </div>
            </div>

            <button
              onClick={() => alert('RCA Generator triggered.')}
              className="w-full mt-4 py-2 bg-surface-muted hover:bg-surface border border-border-custom text-xs font-bold text-text-primary rounded text-center cursor-pointer transition-colors"
            >
              Draft Root Cause Analysis Map [5-Why]
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 5. COMPLIANCE OFFICER VIEW
  // ----------------------------------------------------
  if (user.role === 'Compliance Officer') {
    return (
      <div className="space-y-6">
        <OnboardingChecklist />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <span>Industrial Compliance Command</span>
              <span className="text-xs font-mono font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded ml-2 uppercase">Audit Mode</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Federal Factory Act mapping, active procedural gaps, and one-click regulatory evidence package generation.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button 
              onClick={() => alert('COMMENCING EVIDENCE EXPORT PROCESS...')}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm cursor-pointer flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Compile PESO/OISD Evidence ZIP</span>
            </button>
          </div>
        </div>

        {/* Compliance KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Validation Health</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">98.2%</p>
            <span className="text-[10px] font-mono text-status-ok mt-2 block">● COMPLETED OVERALL COMPLIANCE</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Registered Regulations</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">14 sets</p>
            <span className="text-[10px] font-mono text-text-secondary mt-2 block">1,240 CLAUSES GOVERNING</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">Active Procedural Gaps</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">3 gaps</p>
            <span className="text-[10px] font-mono text-status-critical mt-2 block">1 HIGH RISK GAP IN REF-A</span>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-text-muted block uppercase">PESO Audits Pending</span>
            <p className="text-3xl font-display font-bold text-text-primary leading-tight mt-1">1 due</p>
            <span className="text-[10px] font-mono text-status-warn mt-2 block">AUDIT WINDOW OPENS IN 21 DAYS</span>
          </div>
        </div>

        {/* Gap and evidence compiling widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface border border-border-custom p-4 rounded-lg">
            <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider pb-3 border-b border-border-custom mb-4">
              Federal Operational Gaps Detected by AI Engine
            </h3>
            
            <div className="space-y-3">
              <div className="p-3 bg-background-custom/40 border border-border-custom rounded space-y-2">
                <div className="flex justify-between items-center font-mono text-[11px]">
                  <span className="font-bold text-status-critical">GAP #1: OVERDUE PRESSURE CHECKS</span>
                  <span className="text-text-muted">DETECTION: 12 HOURS AGO</span>
                </div>
                <p className="text-xs text-text-secondary">
                  <strong className="text-text-primary">OISD-STD-118 Clause 6.4:</strong> Weekly validation checks of fuel booster pumps are overdue on sector REF-A. Current maintenance procedure lacks an explicit logging instruction link.
                </p>
                <div className="flex justify-end pt-1">
                  <button 
                    onClick={() => alert('Remediation Work Order dispatched to PRIYA SHARMA.')}
                    className="text-[10px] font-mono text-primary hover:underline cursor-pointer"
                  >
                    Generate Remediation Action WO →
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-primary mb-3 pb-3 border-b border-border-custom">
                <ShieldCheck className="w-4 h-4" />
                <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">Compile Audit Evidence Package</h4>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Instantly generate a compiled PDF package containing all linked equipment data, historical maintenance certifications, and SOP citations for incoming safety auditors.
              </p>
              
              <div className="space-y-2 text-[10px] font-mono text-text-muted bg-background-custom/60 p-3 rounded border border-border-custom">
                <div>REGULATION: OISD-STD-118</div>
                <div>SCOPE: RELIANCE JAMNAGER REF-A</div>
                <div>DOCUMENTS CITED: 14</div>
                <div>CERTIFICATIONS LINKED: 4</div>
              </div>
            </div>

            <button 
              onClick={() => alert('Evidence package successfully compiled. PDF generated [EVIDENCE-OISD-118.pdf].')}
              className="w-full mt-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-colors"
            >
              Generate Evidence Package PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
