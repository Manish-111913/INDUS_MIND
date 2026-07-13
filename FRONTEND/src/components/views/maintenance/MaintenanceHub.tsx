/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { 
  INITIAL_WORK_ORDERS, 
  WorkOrder, 
  MOCK_ASSIGNEES,
  FailureRecord,
  RiskPrediction,
  ScheduledPm,
  INITIAL_FAILURES,
  MOCK_PREDICTIONS,
  INITIAL_SCHEDULED_PMS
} from './mockMaintData';
import { WorkOrdersList } from './WorkOrdersList';
import { WorkOrderDetail } from './WorkOrderDetail';
import { FailuresRegistry } from './FailuresRegistry';
import { RcaWorkspace } from './RcaWorkspace';
import { RiskPredictions } from './RiskPredictions';
import { PmScheduling } from './PmScheduling';
import { SparePartsModule } from './SparePartsModule';
import { ShiftLogbookModule } from './ShiftLogbookModule';
import { StatusChip, Select } from '../../shared';
import { Layers, HelpCircle, Wrench, AlertTriangle, TrendingUp, Calendar, UserCheck } from 'lucide-react';

export function MaintenanceHub() {
  const { user, hasPermission } = useAuthStore();
  
  // Tab selector state: 'wos' | 'failures' | 'predictions' | 'schedule' | 'parts' | 'shift_logs'
  const [activeTab, setActiveTab] = useState<'wos' | 'failures' | 'predictions' | 'schedule' | 'parts' | 'shift_logs'>('wos');

  // Interactive Acting Role simulation toggle
  // Allows testing Technician role (compact mobile swipe cards) vs Planner role (full desktop Gantt & rescheduling)
  const [actingRole, setActingRole] = useState<'Planner' | 'Technician'>(() => {
    return user?.role === 'Field Technician' ? 'Technician' : 'Planner';
  });

  // Track the active work order ID from the URL hash
  const [activeWorkOrderId, setActiveWorkOrderId] = useState<string | null>(null);
  
  // Track active failure ID for RCA drilldowns
  const [activeFailureId, setActiveFailureId] = useState<string | null>(null);

  // 1. STATE: Work Orders List
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => {
    const stored = localStorage.getItem('indusmind_work_orders');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_WORK_ORDERS;
  });

  // 2. STATE: Failures Record List
  const [failures, setFailures] = useState<FailureRecord[]>(() => {
    const stored = localStorage.getItem('indusmind_failures');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_FAILURES;
  });

  // 3. STATE: Predictions list
  const [predictions, setPredictions] = useState<RiskPrediction[]>(() => {
    const stored = localStorage.getItem('indusmind_predictions');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return MOCK_PREDICTIONS;
  });

  // 4. STATE: Schedule list
  const [schedule, setSchedule] = useState<ScheduledPm[]>(() => {
    const stored = localStorage.getItem('indusmind_schedule');
    if (stored) {
      try { return JSON.parse(stored); } catch (e) {}
    }
    return INITIAL_SCHEDULED_PMS;
  });

  // SUB-ROUTING SYNC via window location hashes
  useEffect(() => {
    const parseHashRoute = () => {
      const hash = window.location.hash || '';
      
      // RCA drilldown route: e.g. #maintenance/failures/F-2026-01/rca
      if (hash.startsWith('#maintenance/failures/') && hash.endsWith('/rca')) {
        const parts = hash.split('/');
        const failId = parts[2];
        setActiveFailureId(failId);
        setActiveTab('failures');
        setActiveWorkOrderId(null);
        return;
      }
      
      if (hash === '#maintenance/failures') {
        setActiveTab('failures');
        setActiveFailureId(null);
        setActiveWorkOrderId(null);
        return;
      }
      
      if (hash === '#maintenance/predictions') {
        setActiveTab('predictions');
        setActiveFailureId(null);
        setActiveWorkOrderId(null);
        return;
      }
      
      if (hash === '#maintenance/schedule') {
        setActiveTab('schedule');
        setActiveFailureId(null);
        setActiveWorkOrderId(null);
        return;
      }

      if (hash === '#maintenance/parts') {
        setActiveTab('parts');
        setActiveFailureId(null);
        setActiveWorkOrderId(null);
        return;
      }

      if (hash === '#maintenance/shift_logs') {
        setActiveTab('shift_logs');
        setActiveFailureId(null);
        setActiveWorkOrderId(null);
        return;
      }

      // Work order detail route: e.g. #maintenance/WO-2041
      if (hash.startsWith('#maintenance/')) {
        const parts = hash.split('/');
        if (parts.length > 1 && parts[1] && !['failures', 'predictions', 'schedule', 'parts', 'shift_logs'].includes(parts[1])) {
          setActiveWorkOrderId(parts[1]);
          setActiveTab('wos');
          setActiveFailureId(null);
          return;
        }
      }

      // Default fallback
      setActiveTab('wos');
      setActiveWorkOrderId(null);
      setActiveFailureId(null);
    };

    parseHashRoute();
    window.addEventListener('hashchange', parseHashRoute);
    return () => window.removeEventListener('hashchange', parseHashRoute);
  }, []);

  // PERSISTENCE WRAPPER SYNC

  const handleUpdateWorkOrders = (updated: WorkOrder[]) => {
    setWorkOrders(updated);
    localStorage.setItem('indusmind_work_orders', JSON.stringify(updated));
  };

  const handleUpdateSingleWorkOrder = (updatedWo: WorkOrder) => {
    const updatedList = workOrders.map(wo => wo.id === updatedWo.id ? updatedWo : wo);
    handleUpdateWorkOrders(updatedList);
  };

  const handleAddWorkOrderDirect = (newWo: WorkOrder) => {
    handleUpdateWorkOrders([newWo, ...workOrders]);
  };

  const handleUpdateFailures = (updated: FailureRecord[]) => {
    setFailures(updated);
    localStorage.setItem('indusmind_failures', JSON.stringify(updated));
  };

  const handleUpdateSingleFailure = (updatedFail: FailureRecord) => {
    const updatedList = failures.map(f => f.id === updatedFail.id ? updatedFail : f);
    handleUpdateFailures(updatedList);
  };

  const handleUpdatePredictions = (updated: RiskPrediction[]) => {
    setPredictions(updated);
    localStorage.setItem('indusmind_predictions', JSON.stringify(updated));
  };

  const handleUpdateSchedule = (updated: ScheduledPm[]) => {
    setSchedule(updated);
    localStorage.setItem('indusmind_schedule', JSON.stringify(updated));
  };

  // Helper to add a manual Work Order from the Registry button
  const handleAddWorkOrderManual = () => {
    const newId = `WO-${2041 + workOrders.length}`;
    const newWo: WorkOrder = {
      id: newId,
      title: 'New Scheduled Calibration and Valve Seal Tune',
      equipmentId: 'P-101',
      equipmentName: 'Centrifugal Crude Feed Pump',
      type: 'PM',
      priority: 'Medium',
      assignee: MOCK_ASSIGNEES[0],
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Open',
      sla: 'MET',
      slaDetails: 'SLA MET (New Job)',
      description: 'Conduct scheduled preventive tune-up and verify valve seal tightness.',
      safetyChecklist: [
        { id: 'ns1', text: 'Apply appropriate safety LOTO guidelines before opening manifold.', checked: false }
      ],
      steps: [
        { id: 'nstep1', title: 'Verify Flange Alignment', desc: 'Ensure flange is straight and check for thread erosion.', checked: false, note: '', photo: null }
      ],
      parts: [],
      labor: [],
      attachments: [],
      logs: [
        { date: '2026-07-12 12:00', user: user?.name || 'Supervisor', action: 'Created new manual work order' }
      ]
    };

    handleUpdateWorkOrders([newWo, ...workOrders]);
    window.location.hash = `#maintenance/${newId}`;
  };

  // Start RCA callback
  const handleStartRca = (failureId: string) => {
    window.location.hash = `#maintenance/failures/${failureId}/rca`;
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- SUB-TABS NAVIGATION & ROLE CONTROLLER ----------------- */}
      {!activeWorkOrderId && !activeFailureId && (
        <div className="border-b border-border-custom pb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
              <Wrench className="w-6 h-6 text-primary" />
              <span>Operations & Maintenance Command Centre</span>
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Analyze physical risk probability models, optimize team workloads, and execute LOTO check sheets.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center">
            
            {/* Demo Actor Role Selector */}
            <div className="flex items-center space-x-1.5 bg-surface border border-border-custom px-2.5 py-1.5 rounded text-xs font-mono">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-text-muted">ACTING ROLE:</span>
              <Select
                value={actingRole}
                onValueChange={(v) => setActingRole(v as 'Planner' | 'Technician')}
                options={[
                  { value: 'Planner', label: 'Planner (Gantt, Bulk Actions, Desk View)' },
                  { value: 'Technician', label: "Technician (Today's Card Swipe Deck)" }
                ]}
                className="pr-4 font-bold text-[11px]"
                aria-label="Acting role"
              />
            </div>

            {/* Modular Tab Switchers */}
            <div className="flex bg-surface p-1 rounded border border-border-custom text-xs">
              <button
                onClick={() => {
                  setActiveTab('wos');
                  window.location.hash = '#maintenance';
                }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'wos' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Work Orders
              </button>

              <button
                onClick={() => {
                  setActiveTab('failures');
                  window.location.hash = '#maintenance/failures';
                }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'failures' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Failures & RCA
              </button>

              <button
                onClick={() => {
                  setActiveTab('predictions');
                  window.location.hash = '#maintenance/predictions';
                }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'predictions' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Risk Predictions
              </button>

              <button
                onClick={() => {
                  setActiveTab('schedule');
                  window.location.hash = '#maintenance/schedule';
                }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'schedule' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                PM Scheduling
              </button>

              <button
                onClick={() => {
                  setActiveTab('parts');
                  window.location.hash = '#maintenance/parts';
                }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'parts' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Spare Parts
              </button>

              <button
                onClick={() => {
                  setActiveTab('shift_logs');
                  window.location.hash = '#maintenance/shift_logs';
                }}
                className={`px-3 py-1.5 font-mono text-[10px] rounded cursor-pointer transition-colors uppercase ${
                  activeTab === 'shift_logs' ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Shift Logbook
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ----------------- CORE MODULE ROUTING ROUTER ----------------- */}

      {/* 1. TAB: WORK ORDERS REGISTER */}
      {activeTab === 'wos' && (
        activeWorkOrderId ? (
          (() => {
            const currentWo = workOrders.find(wo => wo.id === activeWorkOrderId);
            if (!currentWo) {
              return (
                <div className="text-center py-12 bg-surface border border-border-custom rounded-lg space-y-4">
                  <p className="text-sm text-text-secondary font-mono">Work Order {activeWorkOrderId} not found in database.</p>
                  <button 
                    onClick={() => window.location.hash = '#maintenance'}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-all"
                  >
                    Return to Registry
                  </button>
                </div>
              );
            }
            return (
              <WorkOrderDetail
                workOrder={currentWo}
                user={{ ...user, role: actingRole === 'Technician' ? 'Field Technician' : 'Admin' }}
                hasPermission={(p) => actingRole === 'Planner'}
                onBackToList={() => window.location.hash = '#maintenance'}
                onUpdateWorkOrder={handleUpdateSingleWorkOrder}
              />
            );
          })()
        ) : (
          <WorkOrdersList
            workOrders={workOrders}
            user={{ ...user, role: actingRole === 'Technician' ? 'Field Technician' : 'Admin' }}
            hasPermission={(p) => actingRole === 'Planner'}
            onSelectWorkOrder={(id) => window.location.hash = `#maintenance/${id}`}
            onUpdateWorkOrders={handleUpdateWorkOrders}
            onAddWorkOrder={handleAddWorkOrderManual}
          />
        )
      )}

      {/* 2. TAB: FAILURES REGISTRY & RCA WORKSPACE DRIP */}
      {activeTab === 'failures' && (
        activeFailureId ? (
          (() => {
            const currentFailure = failures.find(f => f.id === activeFailureId);
            if (!currentFailure) {
              return (
                <div className="text-center py-12 bg-surface border border-border-custom rounded-lg space-y-4">
                  <p className="text-sm text-text-secondary font-mono">Failure case {activeFailureId} not found in database.</p>
                  <button 
                    onClick={() => window.location.hash = '#maintenance/failures'}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-all"
                  >
                    Return to Failures
                  </button>
                </div>
              );
            }
            return (
              <RcaWorkspace
                failure={currentFailure}
                onBack={() => window.location.hash = '#maintenance/failures'}
                onUpdateFailure={handleUpdateSingleFailure}
                onAddWorkOrder={handleAddWorkOrderDirect}
              />
            );
          })()
        ) : (
          <FailuresRegistry
            failures={failures}
            onStartRca={handleStartRca}
          />
        )
      )}

      {/* 3. TAB: RISK PREDICTIONS */}
      {activeTab === 'predictions' && (
        <RiskPredictions
          predictions={predictions}
          onUpdatePredictions={handleUpdatePredictions}
          onAddWorkOrder={handleAddWorkOrderDirect}
        />
      )}

      {/* 4. TAB: PM SCHEDULING (CALENDAR & GANTT) */}
      {activeTab === 'schedule' && (
        <PmScheduling
          schedule={schedule}
          onUpdateSchedule={handleUpdateSchedule}
          userRole={actingRole}
        />
      )}

      {/* 5. TAB: SPARE PARTS INVENTORY (S12) */}
      {activeTab === 'parts' && (
        <SparePartsModule />
      )}

      {/* 6. TAB: SHIFT LOGBOOK (S13) */}
      {activeTab === 'shift_logs' && (
        <ShiftLogbookModule />
      )}

    </div>
  );
}
