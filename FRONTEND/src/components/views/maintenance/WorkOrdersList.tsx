/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Filter, Plus, Download, Wrench, Calendar as CalendarIcon, 
  List, Kanban as KanbanIcon, ArrowRight, Check, AlertTriangle, Clock, 
  ChevronRight, RefreshCw, Smartphone, Monitor, ChevronDown, CheckCircle2,
  Trash2, HelpCircle
} from 'lucide-react';
import { WorkOrder, MOCK_ASSIGNEES, MOCK_LOOKUPS } from './mockMaintData';
import { StatusChip, Select } from '../../shared';

interface WorkOrdersListProps {
  workOrders: WorkOrder[];
  user: any;
  hasPermission: (p: string) => boolean;
  onSelectWorkOrder: (id: string) => void;
  onUpdateWorkOrders: (updated: WorkOrder[]) => void;
  onAddWorkOrder: () => void;
}

export function WorkOrdersList({
  workOrders,
  user,
  hasPermission,
  onSelectWorkOrder,
  onUpdateWorkOrders,
  onAddWorkOrder
}: WorkOrdersListProps) {
  // Navigation & View States
  const [activeView, setActiveView] = useState<'table' | 'kanban' | 'calendar'>('table');
  const [isMobileSim, setIsMobileSim] = useState(() => user?.role === 'Field Technician');
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterEquipment, setFilterEquipment] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState('All');

  // Selection & Bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);

  // Drag State for Kanban
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Notification Banner State
  const [banner, setBanner] = useState<{ type: 'ok' | 'critical' | 'info'; text: string } | null>(null);

  const triggerBanner = (text: string, type: 'ok' | 'critical' | 'info' = 'info') => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  };

  // Helper to determine if a date is overdue
  const isOverdue = (dateStr: string, status: string) => {
    if (status === 'Closed') return false;
    const today = new Date('2026-07-12'); // Local simulation date
    const due = new Date(dateStr);
    return due < today;
  };

  // Filter Work Orders
  const filteredWOs = workOrders.filter(wo => {
    const matchesSearch = (wo.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (wo.id || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (wo.equipmentId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (wo.equipmentName || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'All' || wo.type === filterType;
    const matchesPriority = filterPriority === 'All' || wo.priority === filterPriority;
    const matchesStatus = filterStatus === 'All' || wo.status === filterStatus;
    const matchesEquipment = filterEquipment === 'All' || wo.equipmentId === filterEquipment;
    const matchesAssignee = filterAssignee === 'All' || wo.assignee.name === filterAssignee;

    return matchesSearch && matchesType && matchesPriority && matchesStatus && matchesEquipment && matchesAssignee;
  });

  // Table Selection Checkboxes
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredWOs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWOs.map(w => w.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Bulk Actions
  const handleBulkClose = () => {
    if (!hasPermission('wo.close')) {
      triggerBanner('Permission Denied: You do not have permissions to close work orders.', 'critical');
      return;
    }
    const updated = workOrders.map(wo => {
      if (selectedIds.includes(wo.id)) {
        return { 
          ...wo, 
          status: 'Closed' as const,
          logs: [
            { date: '2026-07-12 12:00', user: user?.name || 'System', action: 'Bulk closed work order' },
            ...wo.logs
          ]
        };
      }
      return wo;
    });
    onUpdateWorkOrders(updated);
    setSelectedIds([]);
    triggerBanner(`Bulk Action: Successfully closed ${selectedIds.length} work orders.`, 'ok');
  };

  const handleBulkAssign = (assigneeName: string) => {
    if (!hasPermission('wo.assign')) {
      triggerBanner('Permission Denied: Only supervisors or administrators can assign work orders.', 'critical');
      return;
    }
    const targetAssignee = MOCK_ASSIGNEES.find(a => a.name === assigneeName);
    if (!targetAssignee) return;

    const updated = workOrders.map(wo => {
      if (selectedIds.includes(wo.id)) {
        return { 
          ...wo, 
          assignee: targetAssignee,
          logs: [
            { date: '2026-07-12 12:00', user: user?.name || 'System', action: `Bulk assigned to ${assigneeName}` },
            ...wo.logs
          ]
        };
      }
      return wo;
    });
    onUpdateWorkOrders(updated);
    setSelectedIds([]);
    setIsBulkAssignOpen(false);
    triggerBanner(`Bulk Action: Assigned ${selectedIds.length} work orders to ${assigneeName}.`, 'ok');
  };

  const handleBulkExport = () => {
    const dataToExport = workOrders.filter(wo => selectedIds.includes(wo.id));
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dataToExport, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', 'indusmind_work_orders_export.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerBanner(`Export Triggered: Downloading JSON summary for ${selectedIds.length} items.`, 'ok');
  };

  // Swipe handlers for technician mobile cards
  const handleSwipeAction = (woId: string, action: 'start' | 'complete') => {
    const updated = workOrders.map(wo => {
      if (wo.id === woId) {
        if (action === 'start') {
          return {
            ...wo,
            status: 'In Progress' as const,
            logs: [
              { date: '2026-07-12 12:00', user: user?.name || 'Technician', action: 'Work order started via swipe interaction.' },
              ...wo.logs
            ]
          };
        } else {
          return {
            ...wo,
            status: 'Review' as const,
            logs: [
              { date: '2026-07-12 12:00', user: user?.name || 'Technician', action: 'Work completed. Submitted for review via swipe.' },
              ...wo.logs
            ]
          };
        }
      }
      return wo;
    });
    onUpdateWorkOrders(updated);
    triggerBanner(`Work Order ${woId} updated to ${action === 'start' ? 'In Progress' : 'Review'}.`, 'ok');
  };

  // Drag & drop logic for Kanban Board (standard HTML5)
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!hasPermission('wo.assign')) {
      e.preventDefault();
      triggerBanner('Permission Denied: Only supervisors or administrators can drag cards to assign/schedule.', 'critical');
      return;
    }
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: WorkOrder['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    const updated = workOrders.map(wo => {
      if (wo.id === id) {
        if (wo.status === targetStatus) return wo;
        return {
          ...wo,
          status: targetStatus,
          logs: [
            { date: '2026-07-12 12:00', user: user?.name || 'System', action: `Moved status to ${targetStatus} via Kanban board dragging.` },
            ...wo.logs
          ]
        };
      }
      return wo;
    });
    onUpdateWorkOrders(updated);
    setDraggedId(null);
    triggerBanner(`Moved ${id} to column ${targetStatus}.`, 'ok');
  };

  // Render priority edge styling
  const getPriorityStyle = (priority: WorkOrder['priority']) => {
    switch (priority) {
      case 'Critical': return { color: 'text-status-critical', bg: 'bg-status-critical/10', border: 'border-status-critical/20', bar: 'bg-status-critical' };
      case 'High': return { color: 'text-status-warn', bg: 'bg-status-warn/10', border: 'border-status-warn/20', bar: 'bg-status-warn' };
      case 'Medium': return { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', bar: 'bg-primary' };
      case 'Low': return { color: 'text-text-muted', bg: 'bg-surface-muted border-border-custom', border: 'border-border-custom', bar: 'bg-text-muted' };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ---------------- BANNERS ---------------- */}
      <AnimatePresence>
        {banner && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`p-3 rounded border text-xs font-mono flex items-center justify-between z-50 ${
              banner.type === 'ok' ? 'bg-[#1E251E] text-status-ok border-status-ok/30' :
              banner.type === 'critical' ? 'bg-[#251E1E] text-status-critical border-status-critical/30' :
              'bg-[#191D24] text-status-info border-status-info/30'
            }`}
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{banner.text}</span>
            </div>
            <button onClick={() => setBanner(null)} className="text-text-muted hover:text-white font-bold ml-4">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- HEADER ---------------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Wrench className="w-6 h-6 text-primary" />
            <span>Refinery Maintenance Hub</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Standard maintenance schedules, calibration workflows, and predictive failure work orders.
          </p>
        </div>

        {/* View Switchers */}
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          
          {/* Simulation Toggle */}
          <button
            onClick={() => setIsMobileSim(!isMobileSim)}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium flex items-center space-x-1 border transition-all cursor-pointer ${
              isMobileSim 
                ? 'bg-[#E5921E]/10 border-[#E5921E]/30 text-[#E5921E]' 
                : 'border-border-custom text-text-secondary hover:bg-surface-muted'
            }`}
            title="Toggle between PC Console & Tactile Technician Mobile view"
          >
            {isMobileSim ? <Smartphone className="w-3.5 h-3.5 animate-pulse" /> : <Monitor className="w-3.5 h-3.5" />}
            <span>{isMobileSim ? 'SIMULATOR: TECHNICIAN MOBILE' : 'SIMULATOR: REGULAR DESKTOP'}</span>
          </button>

          {!isMobileSim && (
            <div className="flex bg-surface-muted p-1 rounded border border-border-custom text-xs">
              <button
                onClick={() => setActiveView('table')}
                className={`p-1.5 rounded cursor-pointer transition-colors ${activeView === 'table' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'}`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveView('kanban')}
                className={`p-1.5 rounded cursor-pointer transition-colors ${activeView === 'kanban' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'}`}
                title="Kanban Board"
              >
                <KanbanIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveView('calendar')}
                className={`p-1.5 rounded cursor-pointer transition-colors ${activeView === 'calendar' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'}`}
                title="Schedules Calendar"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {hasPermission('wo.create') && (
            <button
              onClick={onAddWorkOrder}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>Create Work Order</span>
            </button>
          )}
        </div>
      </div>

      {/* ---------------- FILTERS & SEARCH (Desktop Only) ---------------- */}
      {!isMobileSim && (
        <div className="bg-surface border border-border-custom p-4 rounded-lg space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search by WO#, Title, Equipment tag or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-primary text-white"
              />
            </div>
            
            <div className="flex flex-wrap gap-2 text-xs">
              <Select
                value={filterType}
                onValueChange={(v) => setFilterType(v)}
                options={[
                  { value: 'All', label: 'All Types' },
                  ...MOCK_LOOKUPS.workOrderTypes.map(t => ({ value: t, label: t }))
                ]}
                className="px-2 py-1.5"
              />

              <Select
                value={filterPriority}
                onValueChange={(v) => setFilterPriority(v)}
                options={[
                  { value: 'All', label: 'All Priorities' },
                  ...MOCK_LOOKUPS.priorities.map(p => ({ value: p, label: p }))
                ]}
                className="px-2 py-1.5"
              />

              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v)}
                options={[
                  { value: 'All', label: 'All Statuses' },
                  ...MOCK_LOOKUPS.statuses.map(s => ({ value: s, label: s }))
                ]}
                className="px-2 py-1.5"
              />

              <Select
                value={filterEquipment}
                onValueChange={(v) => setFilterEquipment(v)}
                options={[
                  { value: 'All', label: 'All Tags' },
                  ...MOCK_LOOKUPS.equipmentTags.map(eq => ({ value: eq, label: eq }))
                ]}
                className="px-2 py-1.5 font-mono"
              />

              <Select
                value={filterAssignee}
                onValueChange={(v) => setFilterAssignee(v)}
                options={[
                  { value: 'All', label: 'All Crew' },
                  ...MOCK_ASSIGNEES.map(a => ({ value: a.name, label: a.name }))
                ]}
                className="px-2 py-1.5"
              />
            </div>
          </div>

          {/* BULK ACTIONS BAR */}
          {selectedIds.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2.5 flex items-center justify-between text-xs animate-fade-in">
              <div className="flex items-center space-x-2 text-primary font-mono font-bold">
                <Check className="w-4 h-4" />
                <span>{selectedIds.length} WORK ORDERS SELECTED</span>
              </div>
              
              <div className="flex items-center space-x-2 relative">
                {hasPermission('wo.assign') && (
                  <div className="relative">
                    <button
                      onClick={() => setIsBulkAssignOpen(!isBulkAssignOpen)}
                      className="px-2.5 py-1 bg-surface border border-border-custom rounded hover:border-primary cursor-pointer text-text-secondary transition-all flex items-center space-x-1 text-xs"
                    >
                      <span>Assign to crew</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {isBulkAssignOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsBulkAssignOpen(false)} />
                        <div className="absolute right-0 mt-1.5 w-48 rounded bg-surface border border-border-custom shadow-xl z-50 p-1 text-xs">
                          {MOCK_ASSIGNEES.map(assignee => (
                            <button
                              key={assignee.name}
                              onClick={() => handleBulkAssign(assignee.name)}
                              className="w-full text-left p-1.5 rounded hover:bg-primary/10 hover:text-primary cursor-pointer text-text-secondary flex items-center space-x-2"
                            >
                              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                                {assignee.avatar}
                              </span>
                              <span>{assignee.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {hasPermission('wo.close') && (
                  <button
                    onClick={handleBulkClose}
                    className="px-2.5 py-1 bg-[#152B1E] border border-status-ok/30 text-status-ok rounded hover:bg-[#1C3A29] cursor-pointer text-xs"
                  >
                    Bulk Close
                  </button>
                )}

                <button
                  onClick={handleBulkExport}
                  className="px-2.5 py-1 bg-surface border border-border-custom text-text-secondary rounded hover:border-primary cursor-pointer flex items-center space-x-1 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Bulk Export</span>
                </button>

                <button
                  onClick={() => setSelectedIds([])}
                  className="text-text-muted hover:text-white font-mono px-1"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- MAIN VIEWS ---------------- */}
      <AnimatePresence mode="wait">
        
        {/* ===================== SIMULATED MOBILE TECHNICIAN VIEW ===================== */}
        {isMobileSim ? (
          <motion.div
            key="mobile"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="max-w-md mx-auto bg-[#0C1013] border border-border-custom rounded-xl overflow-hidden shadow-2xl relative"
          >
            {/* Mock phone status bar */}
            <div className="bg-[#12161A] p-2 flex justify-between items-center text-[10px] text-text-muted font-mono border-b border-border-custom">
              <span>Refinery Sector A • Mobile Node</span>
              <div className="flex items-center space-x-2">
                <span>5G 📶</span>
                <span>🔋 94%</span>
              </div>
            </div>

            <div className="p-4 border-b border-border-custom bg-surface-muted/50 flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-white text-sm">My Work Orders — Today</h3>
                <p className="text-[10px] text-text-secondary">Assigned Lead: {user?.name || 'Arun Kumar'}</p>
              </div>
              <StatusChip label="Active Crew" type="ok" />
            </div>

            {/* Simulated Mobile Cards List */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto divide-y divide-border-custom/20">
              {filteredWOs.filter(wo => wo.assignee.name === (user?.name || 'Arun Kumar')).length === 0 ? (
                <div className="text-center py-12 text-text-secondary">
                  <Wrench className="w-8 h-8 text-text-muted mx-auto mb-2 animate-bounce" />
                  <p className="font-bold text-white text-xs">No active assignments today.</p>
                  <p className="text-[10px] text-text-muted mt-1">Excellent job! All task queues are currently clear.</p>
                </div>
              ) : (
                filteredWOs
                  .filter(wo => wo.assignee.name === (user?.name || 'Arun Kumar'))
                  .map(wo => {
                    const pStyles = getPriorityStyle(wo.priority);
                    return (
                      <div key={wo.id} className="pt-4 first:pt-0">
                        {/* Draggable/Swipable frame */}
                        <motion.div
                          drag="x"
                          dragConstraints={{ left: -120, right: 120 }}
                          onDragEnd={(e, info) => {
                            if (info.offset.x > 100 && wo.status === 'Open') {
                              handleSwipeAction(wo.id, 'start');
                            } else if (info.offset.x < -100 && wo.status === 'In Progress') {
                              // Complete trigger modal
                              if (window.confirm(`Mark work order ${wo.id} as complete and submit for review?`)) {
                                handleSwipeAction(wo.id, 'complete');
                              }
                            }
                          }}
                          className="bg-surface rounded-lg p-3 border border-border-custom shadow relative overflow-hidden z-10 cursor-pointer active:cursor-grabbing hover:border-primary transition-all"
                        >
                          {/* Left priority color bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${pStyles.bar}`} />

                          <div className="flex justify-between items-start mb-2 pl-2">
                            <span className="font-mono text-[10px] font-bold text-white bg-surface-muted px-1.5 py-0.5 rounded border border-border-custom select-all">
                              {wo.id}
                            </span>
                            <div className="flex items-center space-x-1">
                              {isOverdue(wo.dueDate, wo.status) && (
                                <span className="text-status-critical font-mono text-[9px] flex items-center space-x-0.5 font-bold uppercase">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Overdue</span>
                                </span>
                              )}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${pStyles.bg} ${pStyles.color}`}>
                                {wo.priority.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          <h4 
                            onClick={() => onSelectWorkOrder(wo.id)}
                            className="font-sans font-bold text-white text-xs pl-2 mb-2 line-clamp-2 hover:underline hover:text-primary"
                          >
                            {wo.title}
                          </h4>

                          <div className="pl-2 space-y-1.5 text-[10px] text-text-secondary font-mono">
                            <div className="flex justify-between">
                              <span>TAG:</span>
                              <span className="text-white bg-surface-muted px-1 rounded border border-border-custom">{wo.equipmentId}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>TYPE:</span>
                              <span className="text-white">{wo.type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>STATUS:</span>
                              <span className={`font-semibold ${
                                wo.status === 'Open' ? 'text-status-info' :
                                wo.status === 'In Progress' ? 'text-status-warn' :
                                wo.status === 'Closed' ? 'text-status-ok' : 'text-accent'
                              }`}>{wo.status.toUpperCase()}</span>
                            </div>
                          </div>

                          {/* Interactive click controls on card footer */}
                          <div className="mt-3 pt-2.5 border-t border-border-custom flex justify-between gap-1 pl-2">
                            {wo.status === 'Open' ? (
                              <button
                                onClick={() => handleSwipeAction(wo.id, 'start')}
                                className="w-full py-1 bg-status-warn/20 hover:bg-status-warn/40 text-status-warn border border-status-warn/30 text-[10px] font-mono font-bold rounded cursor-pointer transition-all flex items-center justify-center space-x-1"
                              >
                                <PlayIcon className="w-3 h-3" />
                                <span>TAP TO START</span>
                              </button>
                            ) : wo.status === 'In Progress' ? (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Mark work order ${wo.id} as complete and submit for review?`)) {
                                    handleSwipeAction(wo.id, 'complete');
                                  }
                                }}
                                className="w-full py-1 bg-status-ok/20 hover:bg-status-ok/40 text-status-ok border border-status-ok/30 text-[10px] font-mono font-bold rounded cursor-pointer transition-all flex items-center justify-center space-x-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>TAP TO COMPLETE</span>
                              </button>
                            ) : (
                              <div className="w-full text-center py-1 text-text-muted font-mono text-[9px]">
                                STAGE: {wo.status.toUpperCase()} (WAITING DISPATCHER)
                              </div>
                            )}
                          </div>
                        </motion.div>
                        
                        {/* Swipe indicator visual helpers under card */}
                        <div className="text-[9px] font-mono text-text-muted flex justify-between px-2 mt-1">
                          <span>👉 Swipe right to Start</span>
                          <span>👈 Swipe left to Complete</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="bg-[#12161A] p-3 text-center border-t border-border-custom text-[10px] font-mono text-text-muted">
              <span>Haptic Feedback Enabled • Tap ID for Detail Hub</span>
            </div>
          </motion.div>
        ) : (
          
          /* ===================== REGULAR DESKTOP ACTIVE VIEWS ===================== */
          <motion.div key={activeView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            
            {/* -------------------- VIEW 1: TABLE VIEW -------------------- */}
            {activeView === 'table' && (
              <div className="bg-surface border border-border-custom rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-surface-muted text-text-muted font-mono text-[10px] uppercase tracking-wider border-b border-border-custom">
                      <tr>
                        <th className="p-3 w-10">
                          <input 
                            type="checkbox"
                            checked={selectedIds.length === filteredWOs.length && filteredWOs.length > 0}
                            onChange={handleToggleSelectAll}
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="p-3 font-semibold">WO#</th>
                        <th className="p-3 font-semibold">Title</th>
                        <th className="p-3 font-semibold">Equipment ID</th>
                        <th className="p-3 font-semibold">Type</th>
                        <th className="p-3 font-semibold">Priority</th>
                        <th className="p-3 font-semibold">Assignee</th>
                        <th className="p-3 font-semibold">Due Date</th>
                        <th className="p-3 font-semibold">Status</th>
                        <th className="p-3 font-semibold text-right">SLA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-custom/40">
                      {filteredWOs.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-12 text-center text-text-secondary font-mono">
                            <Wrench className="w-10 h-10 text-text-muted mx-auto mb-3 animate-spin" style={{ animationDuration: '4s' }} />
                            <span>No matching Refinery Work Orders found. Try adjusting filters.</span>
                          </td>
                        </tr>
                      ) : (
                        filteredWOs.map((wo) => {
                          const pStyles = getPriorityStyle(wo.priority);
                          const isOver = isOverdue(wo.dueDate, wo.status);
                          return (
                            <tr 
                              key={wo.id} 
                              className={`hover:bg-surface-muted/30 transition-all ${selectedIds.includes(wo.id) ? 'bg-primary/5' : ''}`}
                            >
                              <td className="p-3">
                                <input 
                                  type="checkbox"
                                  checked={selectedIds.includes(wo.id)}
                                  onChange={() => handleToggleSelectRow(wo.id)}
                                  className="cursor-pointer"
                                />
                              </td>
                              <td className="p-3 font-mono text-white font-bold tracking-tight select-all">
                                <button 
                                  onClick={() => onSelectWorkOrder(wo.id)}
                                  className="hover:underline text-primary text-left cursor-pointer font-bold"
                                >
                                  {wo.id}
                                </button>
                              </td>
                              <td className="p-3 font-semibold text-white max-w-xs md:max-w-md">
                                <button 
                                  onClick={() => onSelectWorkOrder(wo.id)}
                                  className="hover:underline text-left cursor-pointer hover:text-primary block truncate font-sans text-xs"
                                >
                                  {wo.title}
                                </button>
                              </td>
                              <td className="p-3">
                                <span className="font-mono text-[10px] font-bold text-white bg-surface-muted px-1.5 py-0.5 rounded border border-border-custom select-all">
                                  {wo.equipmentId}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="text-[11px] text-text-secondary">{wo.type}</span>
                              </td>
                              <td className="p-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${pStyles.bg} ${pStyles.color}`}>
                                  {wo.priority.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center space-x-2">
                                  <span className="w-5 h-5 rounded-full bg-[#0E7C86]/20 text-primary font-bold text-[9px] flex items-center justify-center border border-[#0E7C86]/30">
                                    {wo.assignee.avatar}
                                  </span>
                                  <span className="text-text-secondary text-[11px] truncate max-w-[100px]" title={wo.assignee.name}>
                                    {wo.assignee.name.split(' ')[0]}
                                  </span>
                                </div>
                              </td>
                              <td className={`p-3 font-mono ${isOver ? 'text-status-critical font-semibold flex items-center space-x-1' : 'text-text-secondary'}`}>
                                {isOver && <AlertTriangle className="w-3.5 h-3.5 text-status-critical animate-pulse" />}
                                <span>{wo.dueDate}</span>
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                                  wo.status === 'Open' ? 'text-status-info bg-status-info/10' :
                                  wo.status === 'In Progress' ? 'text-status-warn bg-status-warn/10' :
                                  wo.status === 'On Hold' ? 'text-text-muted bg-surface-muted' :
                                  wo.status === 'Closed' ? 'text-status-ok bg-status-ok/10 border-status-ok/20' :
                                  'text-accent bg-accent/10'
                                }`}>
                                  {wo.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`text-[10px] font-bold font-mono ${
                                  wo.sla === 'MET' ? 'text-status-ok' :
                                  wo.sla === 'WARN' ? 'text-status-warn' : 'text-status-critical'
                                }`}>
                                  {wo.slaDetails.split(' ')[0]}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* -------------------- VIEW 2: KANBAN VIEW -------------------- */}
            {activeView === 'kanban' && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {(['Open', 'In Progress', 'On Hold', 'Review', 'Closed'] as const).map((colStatus) => {
                  const colOrders = filteredWOs.filter(w => w.status === colStatus);
                  
                  return (
                    <div 
                      key={colStatus}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, colStatus)}
                      className="bg-surface border border-border-custom rounded-lg p-3 min-h-[500px] flex flex-col space-y-3"
                    >
                      {/* Column Header */}
                      <div className="flex justify-between items-center pb-2 border-b border-border-custom font-mono">
                        <span className={`text-[10px] font-bold uppercase ${
                          colStatus === 'Open' ? 'text-status-info' :
                          colStatus === 'In Progress' ? 'text-status-warn' :
                          colStatus === 'Closed' ? 'text-status-ok' : 'text-accent'
                        }`}>
                          {colStatus}
                        </span>
                        <span className="text-[10px] bg-surface-muted px-2 py-0.5 rounded text-text-muted border border-border-custom/50 font-bold">
                          {colOrders.length}
                        </span>
                      </div>

                      {/* Column Cards */}
                      <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[500px]">
                        {colOrders.length === 0 ? (
                          <div className="text-center py-12 border-2 border-dashed border-border-custom/20 rounded-lg text-text-muted text-[10px] font-mono uppercase">
                            Drop files here
                          </div>
                        ) : (
                          colOrders.map(wo => {
                            const pStyles = getPriorityStyle(wo.priority);
                            return (
                              <div
                                key={wo.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, wo.id)}
                                className="bg-[#12161A] p-3 rounded border border-border-custom shadow hover:border-primary transition-all relative cursor-grab active:cursor-grabbing group"
                              >
                                {/* Left Priority Color Block */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${pStyles.bar}`} />

                                <div className="flex justify-between items-start mb-2 pl-1.5">
                                  <button 
                                    onClick={() => onSelectWorkOrder(wo.id)}
                                    className="font-mono text-[9px] font-bold text-primary hover:underline"
                                  >
                                    {wo.id}
                                  </button>
                                  <span className={`text-[8px] font-bold px-1.5 rounded font-mono ${pStyles.bg} ${pStyles.color}`}>
                                    {wo.priority.toUpperCase()}
                                  </span>
                                </div>

                                <h4 
                                  onClick={() => onSelectWorkOrder(wo.id)}
                                  className="text-xs font-semibold text-white mb-2 pl-1.5 hover:underline cursor-pointer leading-snug font-sans group-hover:text-primary transition-colors"
                                >
                                  {wo.title}
                                </h4>

                                <div className="pl-1.5 flex justify-between items-center mt-3 text-[10px] text-text-muted font-mono">
                                  <span className="bg-surface-muted px-1.5 py-0.5 rounded text-[9px] font-bold text-white border border-border-custom">
                                    {wo.equipmentId}
                                  </span>
                                  <div className="flex items-center space-x-1" title={wo.assignee.name}>
                                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[8px] font-bold flex items-center justify-center">
                                      {wo.assignee.avatar}
                                    </span>
                                    <span className="text-[9px]">{wo.assignee.name.split(' ')[0]}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* -------------------- VIEW 3: CALENDAR VIEW -------------------- */}
            {activeView === 'calendar' && (
              <div className="bg-surface border border-border-custom rounded-lg p-4">
                <div className="border-b border-border-custom pb-3 mb-4 flex justify-between items-center">
                  <h3 className="text-xs font-mono font-bold text-white uppercase">REFINERY SCHEDULE MATRIX — JULY 2026</h3>
                  <div className="flex space-x-3 text-[9px] font-mono text-text-secondary">
                    <span className="flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-critical" />
                      <span>Critical</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-warn" />
                      <span>High</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>Medium</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
                      <span>Low</span>
                    </span>
                  </div>
                </div>

                {/* Grid of days */}
                <div className="grid grid-cols-7 gap-2.5 text-center text-xs font-mono">
                  {/* Calendar Headers */}
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(h => (
                    <div key={h} className="text-text-muted font-bold py-1 text-[10px]">{h}</div>
                  ))}

                  {/* Empty offsets for July 2026 starting on Wednesday */}
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={`offset-${idx}`} className="bg-surface-muted/10 border border-border-custom/10 rounded-md min-h-[70px] opacity-20" />
                  ))}

                  {/* July days 1 to 31 */}
                  {Array.from({ length: 31 }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const dateStr = `2026-07-${dayNum.toString().padStart(2, '0')}`;
                    const dayOrders = filteredWOs.filter(wo => wo.dueDate === dateStr);

                    return (
                      <div 
                        key={dayNum} 
                        className={`border rounded-md min-h-[75px] p-1.5 flex flex-col justify-between text-left transition-all ${
                          dateStr === '2026-07-12' 
                            ? 'bg-primary/5 border-primary/50' 
                            : 'bg-background-custom/30 border-border-custom hover:border-primary/40'
                        }`}
                      >
                        <span className={`text-[10px] font-bold ${dateStr === '2026-07-12' ? 'text-primary' : 'text-text-muted'}`}>
                          {dayNum} {dateStr === '2026-07-12' && '• TODAY'}
                        </span>

                        {/* List of dots/indicators representing work orders */}
                        <div className="space-y-1 mt-1">
                          {dayOrders.map(wo => (
                            <button
                              key={wo.id}
                              onClick={() => onSelectWorkOrder(wo.id)}
                              className="w-full text-[9px] font-sans font-semibold text-white px-1 py-0.5 rounded truncate text-left border border-border-custom/50 bg-surface-muted/80 hover:border-primary block"
                              title={wo.title}
                            >
                              <span className={`w-1 h-1 inline-block rounded-full mr-1 ${
                                wo.priority === 'Critical' ? 'bg-status-critical' :
                                wo.priority === 'High' ? 'bg-status-warn' :
                                wo.priority === 'Medium' ? 'bg-primary' : 'bg-text-muted'
                              }`} />
                              {wo.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Mini components for local render
function PlayIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={props.className}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
