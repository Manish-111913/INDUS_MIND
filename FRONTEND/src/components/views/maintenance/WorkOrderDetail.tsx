/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Cpu, ShieldCheck, Sparkles, BookOpen, AlertTriangle, 
  ExternalLink, FileCheck, Check, Camera, Plus, Trash2, HelpCircle, 
  Clock, Paperclip, ChevronDown, ChevronUp, User, Lock, Activity, Eye
} from 'lucide-react';
import { WorkOrder, MOCK_AI_CONTEXTS, MOCK_LOOKUPS, SafetyItem, ProcedureStep, PartItem } from './mockMaintData';
import { StatusChip, ConfidenceBadge, Select } from '../../shared';

interface WorkOrderDetailProps {
  workOrder: WorkOrder;
  user: any;
  hasPermission: (p: string) => boolean;
  onBackToList: () => void;
  onUpdateWorkOrder: (updated: WorkOrder) => void;
}

export function WorkOrderDetail({
  workOrder,
  user,
  hasPermission,
  onBackToList,
  onUpdateWorkOrder
}: WorkOrderDetailProps) {
  // Collapsible cards state
  const [isPastWoOpen, setIsPastWoOpen] = useState(true);
  const [isSopOpen, setIsSopOpen] = useState(true);
  const [isFailModesOpen, setIsFailModesOpen] = useState(true);

  // Local state for interactive additions
  const [newPartNo, setNewPartNo] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newPartQty, setNewPartQty] = useState(1);
  const [newPartCost, setNewPartCost] = useState(10.00);

  // New attachment upload simulator state
  const [fileToUpload, setFileToUpload] = useState<string | null>(null);

  // Closure Form state
  const [failCode, setFailCode] = useState(workOrder.failureCode || '');
  const [rootCause, setRootCause] = useState(workOrder.rootCause || '');
  const [closureNotes, setClosureNotes] = useState(workOrder.closureNotes || '');
  const [actualHours, setActualHours] = useState(workOrder.actualHours || 1.0);

  // Load AI context
  const aiContext = MOCK_AI_CONTEXTS[workOrder.id] || { similarWos: [], sopSteps: [], failureModes: [] };

  // Safety Checklist checking
  const handleToggleSafety = (itemId: string) => {
    if (workOrder.status !== 'Open') return; // Cannot edit checklist once started
    const updatedChecklist = workOrder.safetyChecklist.map(item => 
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    onUpdateWorkOrder({
      ...workOrder,
      safetyChecklist: updatedChecklist
    });
  };

  const isSafetyAllChecked = workOrder.safetyChecklist.length === 0 || 
    workOrder.safetyChecklist.every(item => item.checked);

  // Procedure step checkoff
  const handleToggleProcedureStep = (stepId: string) => {
    if (workOrder.status !== 'In Progress') return; // Can only perform procedure when In Progress
    const updatedSteps = workOrder.steps.map(step => 
      step.id === stepId ? { ...step, checked: !step.checked } : step
    );
    onUpdateWorkOrder({
      ...workOrder,
      steps: updatedSteps,
      logs: [
        { date: '2026-07-12 12:05', user: user?.name || 'Technician', action: `Procedure step toggle on ${stepId}` },
        ...workOrder.logs
      ]
    });
  };

  const handleStepNoteChange = (stepId: string, note: string) => {
    const updatedSteps = workOrder.steps.map(step => 
      step.id === stepId ? { ...step, note } : step
    );
    onUpdateWorkOrder({
      ...workOrder,
      steps: updatedSteps
    });
  };

  // Mock Camera / Photo capture simulator
  const handleAttachMockPhoto = (stepId: string) => {
    const mockRefineryPhotos = [
      '/assets/sample-thermal.jpg',
      'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=600'
    ];
    // Pick a photo
    const randomPhoto = mockRefineryPhotos[Math.floor(Math.random() * mockRefineryPhotos.length)];
    const updatedSteps = workOrder.steps.map(step => 
      step.id === stepId ? { ...step, photo: randomPhoto } : step
    );
    onUpdateWorkOrder({
      ...workOrder,
      steps: updatedSteps,
      logs: [
        { date: '2026-07-12 12:10', user: user?.name || 'Technician', action: `Attached diagnostic capture to Step ${stepId}` },
        ...workOrder.logs
      ]
    });
  };

  // Add Part item
  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName || !newPartNo) return;
    const newItem: PartItem = {
      partNo: newPartNo,
      name: newPartName,
      qty: newPartQty,
      cost: newPartCost
    };
    onUpdateWorkOrder({
      ...workOrder,
      parts: [...workOrder.parts, newItem],
      logs: [
        { date: '2026-07-12 12:12', user: user?.name || 'User', action: `Added replacement part: ${newPartName}` },
        ...workOrder.logs
      ]
    });
    // Reset fields
    setNewPartNo('');
    setNewPartName('');
    setNewPartQty(1);
    setNewPartCost(10.00);
  };

  const handleRemovePart = (partNo: string) => {
    onUpdateWorkOrder({
      ...workOrder,
      parts: workOrder.parts.filter(p => p.partNo !== partNo)
    });
  };

  // File upload simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const newAttachment = {
        id: `att-${Date.now()}`,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        date: '2026-07-12'
      };
      onUpdateWorkOrder({
        ...workOrder,
        attachments: [...workOrder.attachments, newAttachment],
        logs: [
          { date: '2026-07-12 12:15', user: user?.name || 'User', action: `Uploaded file: ${file.name}` },
          ...workOrder.logs
        ]
      });
      alert(`File "${file.name}" uploaded successfully into refinery file store.`);
    }
  };

  // Workflow Action: Start Work Order
  const handleStartWorkOrder = () => {
    if (!isSafetyAllChecked) return;
    onUpdateWorkOrder({
      ...workOrder,
      status: 'In Progress',
      logs: [
        { date: '2026-07-12 12:20', user: user?.name || 'Technician', action: 'Safety checks approved. Work order transitioned to In Progress.' },
        ...workOrder.logs
      ]
    });
  };

  // Workflow Action: Submit for Review
  const handleCompleteWork = () => {
    onUpdateWorkOrder({
      ...workOrder,
      status: 'Review',
      logs: [
        { date: '2026-07-12 12:30', user: user?.name || 'Technician', action: 'Procedure checkoff complete. Swapping state to Review for closeout approval.' },
        ...workOrder.logs
      ]
    });
  };

  // Workflow Action: Close Work Order
  const handleCloseWorkOrder = () => {
    if (!hasPermission('wo.close')) {
      alert('Permission Denied: You do not have the required role privileges (wo.close) to sign off this work order.');
      return;
    }
    if (!failCode || !rootCause || !closureNotes) {
      alert('Validation Failed: Please fill in all Closure details (Failure Code, Root Cause, Closure Notes).');
      return;
    }
    onUpdateWorkOrder({
      ...workOrder,
      status: 'Closed',
      failureCode: failCode,
      rootCause: rootCause,
      closureNotes: closureNotes,
      actualHours: actualHours,
      logs: [
        { date: '2026-07-12 12:45', user: user?.name || 'Supervisor', action: `Work Order Closed. Failure code: ${failCode}. Root Cause: ${rootCause}` },
        ...workOrder.logs
      ]
    });
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- GO BACK HEADER ----------------- */}
      <div className="flex items-center justify-between border-b border-border-custom pb-4">
        <button 
          onClick={onBackToList}
          className="flex items-center space-x-2 text-xs font-mono font-bold text-text-secondary hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-primary" />
          <span>BACK TO WORK ORDERS MATRIX</span>
        </button>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="text-text-muted">CURRENT USER PRIVILEGES:</span>
          {hasPermission('wo.close') ? (
            <span className="text-status-ok font-semibold">SUPERVISOR SIGN-OFF ENABLED</span>
          ) : (
            <span className="text-status-warn font-semibold">TECHNICIAN CHECKLIST ONLY</span>
          )}
        </div>
      </div>

      {/* ----------------- WORK ORDER LIFECYCLE HEADER ----------------- */}
      <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between border-b border-border-custom pb-4 gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-xs font-bold text-white bg-surface-muted border border-border-custom px-2 py-0.5 rounded select-all">
                {workOrder.id}
              </span>
              <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                workOrder.priority === 'Critical' ? 'bg-status-critical/10 text-status-critical border border-status-critical/20' :
                workOrder.priority === 'High' ? 'bg-status-warn/10 text-status-warn border border-status-warn/20' :
                'bg-primary/10 text-primary border border-primary/20'
              }`}>
                {workOrder.priority.toUpperCase()} PRIORITY
              </span>
              <span className={`text-xs font-mono font-bold ${
                workOrder.sla === 'MET' ? 'text-status-ok' :
                workOrder.sla === 'WARN' ? 'text-status-warn' : 'text-status-critical'
              }`}>
                ● {workOrder.slaDetails}
              </span>
            </div>
            <h2 className="font-display text-base md:text-lg font-bold text-white mt-2 leading-tight">
              {workOrder.title}
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="text-[10px] font-mono text-text-muted uppercase">Assignee Crew Lead</span>
            <div className="flex items-center space-x-2">
              <span className="w-7 h-7 rounded-full bg-[#0E7C86]/20 text-primary font-bold text-xs flex items-center justify-center border border-[#0E7C86]/30">
                {workOrder.assignee.avatar}
              </span>
              <div className="text-right">
                <span className="block text-xs font-bold text-white font-sans">{workOrder.assignee.name}</span>
                <span className="block text-[10px] font-mono text-text-muted leading-tight">{workOrder.assignee.role}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Step Lifespan Stepper */}
        <div className="relative pt-4">
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-surface-muted -translate-y-1/2 z-0 rounded" />
          <div 
            className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 z-0 rounded transition-all duration-300" 
            style={{
              width: 
                workOrder.status === 'Open' ? '12%' :
                workOrder.status === 'In Progress' ? '50%' :
                workOrder.status === 'Review' ? '82%' : '100%'
            }}
          />

          <div className="relative z-10 grid grid-cols-4 text-center text-xs font-mono font-bold">
            {[
              { label: 'Open / Dispatched', statusVal: 'Open' },
              { label: 'In Progress', statusVal: 'In Progress' },
              { label: 'Supervisor Review', statusVal: 'Review' },
              { label: 'Closed / Archived', statusVal: 'Closed' }
            ].map((step, idx) => {
              const isActive = workOrder.status === step.statusVal;
              const isPast = 
                (workOrder.status === 'In Progress' && idx === 0) ||
                (workOrder.status === 'Review' && idx <= 1) ||
                (workOrder.status === 'Closed');

              return (
                <div key={step.statusVal} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                    isActive ? 'bg-primary text-white border-primary ring-4 ring-primary/20 scale-105' :
                    isPast ? 'bg-[#0E7C86]/20 text-primary border-primary/40' :
                    'bg-surface border-border-custom text-text-muted'
                  }`}>
                    {isPast && !isActive ? <Check className="w-4 h-4" /> : <span>{idx + 1}</span>}
                  </div>
                  <span className={`block mt-2 text-[10px] sm:text-xs truncate max-w-[80px] sm:max-w-[150px] ${isActive ? 'text-primary' : isPast ? 'text-text-primary' : 'text-text-muted'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ----------------- COLUMN DIVIDER ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: DETAIL FORM, CHECKLISTS, PROCEDURE, PARTS */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: Summary + Equipment Card */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-border-custom pb-2">
              Work Scope Summary & Equipment Link
            </h3>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              {workOrder.description}
            </p>

            {/* Equipment Card */}
            <div className="bg-[#12161A] p-4 rounded-lg border border-border-custom flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 text-primary rounded-full border border-primary/20">
                  <Cpu className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <span className="block text-[10px] font-mono text-text-muted uppercase">Linked Refinery Asset Tag</span>
                  <span className="block font-sans font-bold text-white text-xs">{workOrder.equipmentName}</span>
                  <span className="font-mono text-[10px] text-primary">{workOrder.equipmentId} • Criticality Level A</span>
                </div>
              </div>

              {/* Tag Action Link back to 360 Telemetry */}
              <button
                onClick={() => window.location.hash = `#equipment/${workOrder.equipmentId}`}
                className="px-3 py-1.5 bg-surface-muted hover:bg-surface border border-border-custom text-text-primary rounded font-mono text-[10px] font-bold cursor-pointer transition-colors flex items-center space-x-1.5 flex-shrink-0"
              >
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>Open Equipment 360° Telemetry</span>
                <ExternalLink className="w-3 h-3 text-text-muted" />
              </button>
            </div>
          </div>

          {/* Section 2: Safety & Permits Checklist */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-2">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-status-ok" />
                <span>Mandatory LOTO & Safety Controls</span>
              </h3>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                isSafetyAllChecked ? 'text-status-ok bg-status-ok/10' : 'text-status-warn bg-status-warn/10'
              }`}>
                {isSafetyAllChecked ? 'SAFETY CLEARED' : 'PENDING APPROVAL'}
              </span>
            </div>

            {workOrder.safetyChecklist.length === 0 ? (
              <p className="text-xs text-text-muted italic">No mandatory safety permits registered for this work order category.</p>
            ) : (
              <div className="space-y-2">
                {workOrder.safetyChecklist.map((item) => (
                  <label 
                    key={item.id}
                    className={`flex items-start space-x-3 p-3 rounded border transition-all cursor-pointer ${
                      item.checked 
                        ? 'bg-[#152B1E]/30 border-status-ok/30' 
                        : 'bg-background-custom/40 border-border-custom hover:bg-background-custom/80'
                    } ${workOrder.status !== 'Open' ? 'pointer-events-none opacity-80' : ''}`}
                  >
                    <input 
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggleSafety(item.id)}
                      className="mt-0.5 cursor-pointer accent-status-ok"
                      disabled={workOrder.status !== 'Open'}
                    />
                    <span className={`text-xs ${item.checked ? 'text-status-ok line-through' : 'text-text-primary'}`}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Workflow Button to start In Progress */}
            {workOrder.status === 'Open' && (
              <div className="pt-2">
                <button
                  disabled={!isSafetyAllChecked}
                  onClick={handleStartWorkOrder}
                  className="w-full py-2.5 bg-status-ok hover:bg-status-ok/90 text-white font-bold rounded text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Safety Checklist Confirmed — Start Work Order</span>
                </button>
                {!isSafetyAllChecked && (
                  <span className="block text-center text-[10px] text-status-warn mt-1.5 font-mono">
                    ▲ CHECK OFF ALL LOCK-OUT SAFETY ITEMS TO UNLOCK COMPLIANCE GATE
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Interactive Procedure Stepper */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-border-custom pb-2">
              Procedural Step-by-Step Tasklist
            </h3>

            {workOrder.steps.length === 0 ? (
              <p className="text-xs text-text-muted italic">No step-by-step checklist attached. Standard field SOP applies.</p>
            ) : (
              <div className="space-y-4">
                {workOrder.steps.map((step, idx) => (
                  <div 
                    key={step.id} 
                    className={`p-3 rounded border border-border-custom relative ${
                      step.checked ? 'bg-primary/5 border-primary/20' : 'bg-background-custom/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        <input 
                          type="checkbox"
                          checked={step.checked}
                          onChange={() => handleToggleProcedureStep(step.id)}
                          className="mt-0.5 cursor-pointer accent-primary"
                          disabled={workOrder.status !== 'In Progress'}
                        />
                        <div>
                          <strong className="text-white text-xs block">
                            Step {idx + 1}: {step.title}
                          </strong>
                          <span className="text-text-secondary text-[11px] leading-normal block mt-0.5">
                            {step.desc}
                          </span>
                        </div>
                      </div>

                      {/* Photo Attachment component */}
                      <div className="flex-shrink-0">
                        {step.photo ? (
                          <div className="relative w-12 h-12 rounded border border-border-custom overflow-hidden">
                            <img src={step.photo} alt="Calibration Attachment" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-[8px] font-mono font-bold text-white">RE-TAKE</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAttachMockPhoto(step.id)}
                            disabled={workOrder.status !== 'In Progress'}
                            className="p-2 bg-surface-muted hover:bg-surface border border-border-custom text-text-muted hover:text-white rounded transition-colors cursor-pointer disabled:opacity-40"
                            title="Attach Photo Diagnostics"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Step notes input */}
                    <div className="mt-2.5 pt-2 border-t border-border-custom/40 flex items-center gap-2">
                      <span className="text-[10px] font-mono text-text-muted">PROCEDURE NOTE:</span>
                      <input 
                        type="text"
                        placeholder="Write note or reading parameters..."
                        value={step.note}
                        onChange={(e) => handleStepNoteChange(step.id, e.target.value)}
                        className="bg-transparent border-none text-[10px] text-white focus:outline-none flex-1 placeholder-text-muted"
                        disabled={workOrder.status !== 'In Progress'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step Complete Sign-off button */}
            {workOrder.status === 'In Progress' && (
              <div className="pt-2">
                <button
                  onClick={handleCompleteWork}
                  className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1"
                >
                  <Check className="w-4 h-4" />
                  <span>Submit Work Order for Supervisor Closeout Approval</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 4: Parts & Labor Tables */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-border-custom pb-2">
              Replacement Parts & Labor Records
            </h3>

            {/* Parts table */}
            <div className="space-y-3">
              <span className="block text-[10px] font-mono text-text-muted uppercase font-bold">Replacement Parts List</span>
              <div className="border border-border-custom rounded overflow-hidden">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-surface-muted text-text-muted font-mono text-[9px] uppercase border-b border-border-custom">
                    <tr>
                      <th className="p-2">Part#</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2 text-right">Cost</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-custom/40 text-[11px]">
                    {workOrder.parts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-text-muted italic">No parts logged.</td>
                      </tr>
                    ) : (
                      workOrder.parts.map(part => (
                        <tr key={part.partNo}>
                          <td className="p-2 font-mono text-white select-all">{part.partNo}</td>
                          <td className="p-2 text-text-secondary">{part.name}</td>
                          <td className="p-2 text-text-secondary">{part.qty}</td>
                          <td className="p-2 text-right font-mono text-white">${(part.cost * part.qty).toFixed(2)}</td>
                          <td className="p-2 text-center">
                            {workOrder.status !== 'Closed' && (
                              <button 
                                onClick={() => handleRemovePart(part.partNo)}
                                className="text-text-muted hover:text-status-critical"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add Part Form */}
              {workOrder.status !== 'Closed' && (
                <form onSubmit={handleAddPart} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <input 
                    type="text" 
                    placeholder="Part#" 
                    value={newPartNo} 
                    onChange={e => setNewPartNo(e.target.value)} 
                    className="bg-background-custom border border-border-custom rounded px-2 py-1 focus:outline-none font-mono text-white text-[11px]"
                    required
                  />
                  <input 
                    type="text" 
                    placeholder="Name" 
                    value={newPartName} 
                    onChange={e => setNewPartName(e.target.value)} 
                    className="bg-background-custom border border-border-custom rounded px-2 py-1 focus:outline-none text-white text-[11px]"
                    required
                  />
                  <input 
                    type="number" 
                    placeholder="Qty" 
                    value={newPartQty} 
                    onChange={e => setNewPartQty(parseInt(e.target.value, 10) || 1)} 
                    className="bg-background-custom border border-border-custom rounded px-2 py-1 focus:outline-none text-white text-[11px]"
                    required
                  />
                  <button 
                    type="submit"
                    className="bg-primary hover:bg-primary-hover text-white rounded font-mono font-bold text-[10px] cursor-pointer flex items-center justify-center space-x-1 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD PART</span>
                  </button>
                </form>
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: AI CONTEXT COGNITIVE HUB, ATTACHMENTS, LOGS */}
        <div className="space-y-6">
          
          {/* ======================= AI CONTEXT COGNITIVE HUB ======================= */}
          <div className="bg-surface border border-[#0E7C86]/30 rounded-lg p-5 space-y-4 relative overflow-hidden shadow-lg shadow-[#0E7C86]/5">
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
              <Sparkles className="w-32 h-32 text-primary" />
            </div>

            <div className="flex items-center justify-between border-b border-border-custom pb-2">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  AI Context Panel
                </h3>
              </div>
              <span className="text-[9px] font-mono text-primary font-bold bg-[#0E7C86]/10 border border-[#0E7C86]/20 px-1.5 py-0.2 rounded">
                INDUSMIND-COGNITIVE: ACTIVE
              </span>
            </div>

            {/* Collapsible Card 1: Similar Past Work Orders */}
            <div className="border border-border-custom rounded overflow-hidden">
              <button 
                onClick={() => setIsPastWoOpen(!isPastWoOpen)}
                className="w-full p-2.5 bg-[#12161A] flex justify-between items-center text-left text-[11px] font-mono font-bold hover:bg-surface-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-text-secondary" />
                  <span>Similar past work orders</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <ConfidenceBadge confidence="High" />
                  {isPastWoOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>

              {isPastWoOpen && (
                <div className="p-3 bg-background-custom/30 divide-y divide-border-custom/30 text-[11px] space-y-2.5">
                  {aiContext.similarWos.length === 0 ? (
                    <p className="text-text-muted italic py-2">No historical repair profiles found matching this equipment tag.</p>
                  ) : (
                    aiContext.similarWos.map(past => (
                      <div key={past.id} className="pt-2.5 first:pt-0 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-primary font-bold">{past.id} • {past.title}</span>
                          <span className="text-status-ok font-bold">{past.confidence}% Match</span>
                        </div>
                        <p className="text-text-secondary leading-normal italic font-serif">
                          " {past.fixedBy} "
                        </p>
                        {/* Dynamic citation link to documents */}
                        <div className="flex justify-end pt-0.5">
                          <button 
                            onClick={() => window.location.hash = `#documents/${past.citationDocId}`}
                            className="text-[9px] font-mono text-primary hover:underline flex items-center space-x-1"
                          >
                            <span>Citation: {past.citation}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Collapsible Card 2: Relevant SOP steps */}
            <div className="border border-border-custom rounded overflow-hidden">
              <button 
                onClick={() => setIsSopOpen(!isSopOpen)}
                className="w-full p-2.5 bg-[#12161A] flex justify-between items-center text-left text-[11px] font-mono font-bold hover:bg-surface-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-text-secondary" />
                  <span>Relevant SOP steps</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <ConfidenceBadge confidence="High" />
                  {isSopOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>

              {isSopOpen && (
                <div className="p-3 bg-background-custom/30 text-[11px] space-y-2">
                  {aiContext.sopSteps.length === 0 ? (
                    <p className="text-text-muted italic py-2">No manual segments matching procedure guidelines.</p>
                  ) : (
                    aiContext.sopSteps.map((sop, sIdx) => (
                      <div key={sIdx} className="space-y-1">
                        <span className="font-mono text-white block font-bold">{sop.title}</span>
                        <p className="text-text-secondary leading-normal bg-black/40 p-2 rounded border border-border-custom font-mono text-[10px]">
                          {sop.excerpt}
                        </p>
                        <div className="flex justify-between items-center pt-1 text-[9px] font-mono">
                          <span className="text-text-muted">Confidence Index: {sop.confidence}%</span>
                          {/* Open document link */}
                          <button
                            onClick={() => window.location.hash = `#documents/${sop.docId}`}
                            className="text-primary hover:underline flex items-center space-x-0.5"
                          >
                            <span>Open {sop.docName}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Collapsible Card 3: Known failure modes */}
            <div className="border border-border-custom rounded overflow-hidden">
              <button 
                onClick={() => setIsFailModesOpen(!isFailModesOpen)}
                className="w-full p-2.5 bg-[#12161A] flex justify-between items-center text-left text-[11px] font-mono font-bold hover:bg-surface-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-text-secondary" />
                  <span>Known failure modes</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <ConfidenceBadge confidence="High" />
                  {isFailModesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>

              {isFailModesOpen && (
                <div className="p-3 bg-background-custom/30 text-[11px] space-y-3">
                  {aiContext.failureModes.length === 0 ? (
                    <p className="text-text-muted italic py-2">No statistical anomaly data recorded for this tag class.</p>
                  ) : (
                    aiContext.failureModes.map((fm, fIdx) => (
                      <div key={fIdx} className="space-y-1">
                        <div className="flex justify-between font-mono">
                          <span className="text-status-critical font-bold">{fm.mode}</span>
                          <span className="text-white font-bold">{fm.frequency}</span>
                        </div>
                        <p className="text-text-secondary leading-normal bg-surface-muted/30 p-2 rounded border border-border-custom text-[10px]">
                          💡 <strong className="text-white">Recommendation:</strong> {fm.recommendation}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ======================= CLOSURE SIGN-OFF FORM ======================= */}
          {workOrder.status === 'Review' && (
            <div className="bg-[#152B1E]/10 border border-status-ok/30 p-5 rounded-lg space-y-4 shadow">
              <div className="border-b border-status-ok/20 pb-2 flex items-center space-x-1.5">
                <FileCheck className="w-4 h-4 text-status-ok" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Supervisor sign-off & Closure
                </h3>
              </div>

              <div className="space-y-3 text-xs font-sans">
                <div>
                  <label className="block text-[10px] font-mono text-text-muted uppercase mb-1">Select Failure Code</label>
                  <Select
                    value={failCode}
                    onValueChange={(v) => setFailCode(v)}
                    placeholder="-- Choose Fail Code --"
                    options={MOCK_LOOKUPS.failureCodes.map(fc => ({ value: fc.code, label: `${fc.code} - ${fc.label}` }))}
                    className="w-full px-2.5 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-text-muted uppercase mb-1">Root Cause Quick Pick</label>
                  <Select
                    value={rootCause}
                    onValueChange={(v) => setRootCause(v)}
                    placeholder="-- Choose Root Cause --"
                    options={MOCK_LOOKUPS.rootCauses.map(rc => ({ value: rc.cause, label: `${rc.cause} - ${rc.desc}` }))}
                    className="w-full px-2.5 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-text-muted uppercase mb-1">Labor Hours</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={actualHours}
                    onChange={(e) => setActualHours(parseFloat(e.target.value) || 0)}
                    className="w-full bg-background-custom border border-border-custom rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-status-ok font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-text-muted uppercase mb-1">Final Closure & Sign-off Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Provide details on maintenance actions executed and system performance check..."
                    value={closureNotes}
                    onChange={(e) => setClosureNotes(e.target.value)}
                    className="w-full bg-background-custom border border-border-custom rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-status-ok text-xs"
                  />
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleCloseWorkOrder}
                    className="w-full py-2.5 bg-status-ok hover:bg-status-ok/90 text-white font-bold rounded text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow"
                  >
                    {hasPermission('wo.close') ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Sign & Close Work Order (Supervisor Close)</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Permission wo.close Required to Close</span>
                      </>
                    )}
                  </button>
                  {!hasPermission('wo.close') && (
                    <span className="block text-center text-[10px] text-status-critical mt-1 font-mono">
                      ▲ YOUR USER PRIVILEGES ARE GATED FROM FINAL LEGAL COMPLIANCE ARCHIVAL
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================= RECENT ACTIVITY TIMELINE ======================= */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-border-custom pb-2">
              Recent Activity Timeline
            </h3>

            <div className="relative border-l border-border-custom/50 pl-4 ml-2.5 space-y-4 text-xs">
              {workOrder.logs.map((log, idx) => (
                <div key={idx} className="relative">
                  {/* Point circle */}
                  <span className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background-custom" />
                  
                  <span className="block font-mono text-[10px] text-text-muted">{log.date}</span>
                  <p className="text-text-primary mt-0.5 leading-normal">
                    <strong className="text-white">{log.user}:</strong> {log.action}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ======================= ATTACHMENTS GRID ======================= */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-2">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Paperclip className="w-4 h-4 text-primary" />
                <span>Permits & Attachments</span>
              </h3>
              <span className="text-[10px] font-mono text-text-muted">{workOrder.attachments.length} Files</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {workOrder.attachments.length === 0 ? (
                <p className="text-xs text-text-muted italic py-1">No file attachments linked to this job record.</p>
              ) : (
                workOrder.attachments.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2.5 bg-background-custom/40 border border-border-custom rounded hover:bg-background-custom/80 transition-colors">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Eye className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="truncate">
                        <span className="block font-medium text-xs text-white truncate">{file.name}</span>
                        <span className="block text-[9px] text-text-muted font-mono">{file.size} • Uploaded {file.date}</span>
                      </div>
                    </div>
                    {/* View/Download link */}
                    <button 
                      onClick={() => window.location.hash = `#documents`}
                      className="text-text-secondary hover:text-primary p-1 cursor-pointer"
                      title="Open in Document Library"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick upload simulation */}
            {workOrder.status !== 'Closed' && (
              <label className="flex items-center justify-center p-3 border-2 border-dashed border-border-custom/40 hover:border-primary/50 rounded-lg cursor-pointer transition-colors bg-background-custom/20">
                <input 
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="text-center font-mono text-[10px] text-text-secondary">
                  <span>➕ UPLOAD PERMIT OR SPEC SHEETS</span>
                </div>
              </label>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
