/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, Wrench, ShieldCheck, Layers, Bot, X, ChevronRight, ChevronDown, 
  Search, Sparkles, Filter, ExternalLink, AlertTriangle, CheckCircle2, 
  Activity, Info, FileText, Camera, QrCode, HelpCircle, Check, ArrowRight,
  History as HistoryIcon, Plus, FileCheck, Network, ArrowUpRight, Loader2, Download
} from 'lucide-react';
import { StatusChip, ConfidenceBadge, SkeletonLoader, Select } from '../../shared';
import { useAuthStore } from '../../../stores/authStore';
import { api } from '../../../lib/api/client';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceArea, ReferenceLine 
} from 'recharts';
import { 
  mockEquipmentAssets, 
  mockEquipmentTree, 
  EquipmentAsset, 
  TreeNode, 
  EventLog, 
  ClauseStatus,
  ScheduledWo
} from './mockEquipmentData';

// Custom mini sparkline component drawing SVG lines
function Sparkline({ data, color = '#0E7C86' }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const width = 120;
  const height = 30;
  const padding = 2;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
      {/* Draw end point dot */}
      {data.length > 0 && (
        <circle
          cx={padding + (width - padding * 2)}
          cy={padding + (1 - (data[data.length - 1] - min) / range) * (height - padding * 2)}
          r="3"
          fill={color}
          className="animate-ping"
        />
      )}
    </svg>
  );
}

export function Equipment360() {
  // Hash Routing Parser
  const [currentHash, setCurrentHash] = useState(() => window.location.hash);
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Extract equipment ID from hash e.g., #equipment/P-101
  const hashParts = currentHash.split('/');
  const activeId = hashParts.length > 1 ? hashParts[1] : null;

  // ------------------------------------------------------------
  // REGISTRY STATES
  // ------------------------------------------------------------
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({
    'plant-1': true,
    'area-1': true,
  });
  const [treeLoading, setTreeLoading] = useState<Record<string, boolean>>({});
  const [treeLoaded, setTreeLoaded] = useState<Record<string, boolean>>({
    'plant-1': true,
    'area-1': true,
  });
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState<string | null>(null);

  // DataTable Filters
  const [filterArea, setFilterArea] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterCriticality, setFilterCriticality] = useState<string>('All');
  const [filterHealthBand, setFilterHealthBand] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // Search input
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mobile QR Scanner Simulation
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrScanStep, setQrScanStep] = useState<'idle' | 'opening' | 'scanning' | 'success'>('idle');
  const [scannedTag, setScannedTag] = useState<string | null>(null);

  // QR label export states (N2)
  const [isExportingLabels, setIsExportingLabels] = useState(false);
  const handleExportQrLabels = async () => {
    setIsExportingLabels(true);
    try {
      const res = await api.post<any>('/equipment/labels');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const dataPayload = res?.data || res;
      alert(`QR Code labels sheet compiled successfully!\nJob ID: ${dataPayload?.jobId}\nRedirecting to secure PDF download envelope: ${dataPayload?.downloadUrl}`);
    } catch (err) {
      console.error('Failed to export QR labels:', err);
    } finally {
      setIsExportingLabels(false);
    }
  };

  // ------------------------------------------------------------
  // 360° PORTAL STATES
  // ------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Dynamic Modals / Action States
  const [showCreateWoModal, setShowCreateWoModal] = useState(false);
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  
  // Work Order Creation state
  const [woTitle, setWoTitle] = useState('');
  const [woPriority, setWoPriority] = useState<'High' | 'Critical' | 'Medium' | 'Low'>('High');
  const [woSop, setWoSop] = useState('Standard Calibration Protocol');
  const [createdWos, setCreatedWos] = useState<Record<string, ScheduledWo[]>>({});
  const [woSuccessToast, setWoSuccessToast] = useState<string | null>(null);

  // Report Issue state
  const [issueDesc, setIssueDesc] = useState('');
  const [issueSeverity, setIssueSeverity] = useState('Moderate');
  const [reportedIssuesCount, setReportedIssuesCount] = useState<Record<string, number>>({});
  const [issueSuccessToast, setIssueSuccessToast] = useState<string | null>(null);

  // Predictive recommendation feedback states
  const [dispatchedPredictions, setDispatchedPredictions] = useState<Record<string, 'accepted' | 'dismissed' | null>>({});

  // Timeline Event filters
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'work_order' | 'failure' | 'inspection' | 'document'>('all');

  // ------------------------------------------------------------
  // LAZY LOADING TREE MECHANISM
  // ------------------------------------------------------------
  const handleTreeNodeClick = (nodeId: string, node: TreeNode) => {
    // If leaf node (equipment), navigate to 360 page
    if (node.type === 'equipment' && node.equipmentId) {
      window.location.hash = `#equipment/${node.equipmentId}`;
      return;
    }

    // Set selected node to filter the data table
    setSelectedTreeNodeId(nodeId);

    // Toggle expand
    if (treeExpanded[nodeId]) {
      setTreeExpanded(prev => ({ ...prev, [nodeId]: false }));
    } else {
      // Lazy load simulation
      if (!treeLoaded[nodeId]) {
        setTreeLoading(prev => ({ ...prev, [nodeId]: true }));
        setTimeout(() => {
          setTreeLoading(prev => ({ ...prev, [nodeId]: false }));
          setTreeLoaded(prev => ({ ...prev, [nodeId]: true }));
          setTreeExpanded(prev => ({ ...prev, [nodeId]: true }));
        }, 400);
      } else {
        setTreeExpanded(prev => ({ ...prev, [nodeId]: true }));
      }
    }
  };

  // ------------------------------------------------------------
  // DATA FILTERING LOGIC
  // ------------------------------------------------------------
  const activeAsset = mockEquipmentAssets.find(a => a.id === activeId);

  const getFilteredAssets = () => {
    let list = mockEquipmentAssets;

    // 1. Hierarchy Filter (Tree node selection)
    if (selectedTreeNodeId) {
      const selectedNode = mockEquipmentTree[selectedTreeNodeId];
      if (selectedNode) {
        if (selectedNode.type === 'plant') {
          // No filtering, shows all
        } else if (selectedNode.type === 'area') {
          list = list.filter(a => a.area === selectedNode.label);
        } else if (selectedNode.type === 'unit') {
          list = list.filter(a => a.unit === selectedNode.label);
        }
      }
    }

    // 2. Text Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(a => 
        (a.tag || '').toLowerCase().includes(query) || 
        (a.name || '').toLowerCase().includes(query) ||
        (a.type || '').toLowerCase().includes(query)
      );
    }

    // 3. Dropdown Filters
    if (filterArea !== 'All') {
      list = list.filter(a => a.area === filterArea);
    }
    if (filterType !== 'All') {
      list = list.filter(a => a.type === filterType);
    }
    if (filterCriticality !== 'All') {
      list = list.filter(a => a.criticality === filterCriticality);
    }
    if (filterStatus !== 'All') {
      list = list.filter(a => a.status === filterStatus);
    }
    if (filterHealthBand !== 'All') {
      if (filterHealthBand === 'Good') {
        list = list.filter(a => a.health >= 80);
      } else if (filterHealthBand === 'Fair') {
        list = list.filter(a => a.health >= 50 && a.health < 80);
      } else if (filterHealthBand === 'Poor') {
        list = list.filter(a => a.health < 50);
      }
    }

    return list;
  };

  const filteredAssets = getFilteredAssets();

  // Reset registry filters
  const resetFilters = () => {
    setFilterArea('All');
    setFilterType('All');
    setFilterCriticality('All');
    setFilterHealthBand('All');
    setFilterStatus('All');
    setSelectedTreeNodeId(null);
    setSearchQuery('');
  };

  // ------------------------------------------------------------
  // ACTION DISPATCHERS & SIMULATORS
  // ------------------------------------------------------------
  // Trigger Work Order Creation
  const handleCreateWoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAsset || !woTitle.trim()) return;

    const newWo: ScheduledWo = {
      id: `WO-${Math.floor(2000 + Math.random() * 500)}`,
      title: woTitle,
      schedule: 'Scheduled (Just Dispatched)',
      priority: woPriority,
      status: 'Approved'
    };

    setCreatedWos(prev => ({
      ...prev,
      [activeAsset.id]: [newWo, ...(prev[activeAsset.id] || [])]
    }));

    setWoTitle('');
    setShowCreateWoModal(false);
    
    // Trigger animated toast notification
    setWoSuccessToast(`Work order ${newWo.id} successfully generated and committed to maintenance backlog.`);
    setTimeout(() => {
      setWoSuccessToast(null);
    }, 4500);
  };

  // Trigger Report Issue
  const handleReportIssueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAsset || !issueDesc.trim()) return;

    setReportedIssuesCount(prev => ({
      ...prev,
      [activeAsset.id]: (prev[activeAsset.id] || 0) + 1
    }));

    setIssueDesc('');
    setShowReportIssueModal(false);

    setIssueSuccessToast(`Issue successfully reported. Flagged with severity level [${issueSeverity}]. Safety coordinator notified.`);
    setTimeout(() => {
      setIssueSuccessToast(null);
    }, 4500);
  };

  // Trigger Prediction Actions (Accept / Dismiss)
  const handlePredictionAction = (action: 'accepted' | 'dismissed') => {
    if (!activeAsset) return;

    setDispatchedPredictions(prev => ({
      ...prev,
      [activeAsset.id]: action
    }));

    if (action === 'accepted') {
      const generatedWoId = `WO-DISP-${Math.floor(2200 + Math.random() * 100)}`;
      const generatedWo: ScheduledWo = {
        id: generatedWoId,
        title: `AI Recommended: ${activeAsset.predictions.recommendedAction.title}`,
        schedule: 'Immediate Action Scheduled',
        priority: activeAsset.predictions.riskScore > 80 ? 'Critical' : 'High',
        status: 'In Progress'
      };

      setCreatedWos(prev => ({
        ...prev,
        [activeAsset.id]: [generatedWo, ...(prev[activeAsset.id] || [])]
      }));

      setWoSuccessToast(`AI Recommendation Accepted! Backlog generated: ${generatedWoId}.`);
      setTimeout(() => {
        setWoSuccessToast(null);
      }, 5000);
    }
  };

  // Simulate mobile QR scan triggers
  const handleMobileQrTrigger = () => {
    setIsQrScannerOpen(true);
    setQrScanStep('opening');
    setTimeout(() => {
      setQrScanStep('scanning');
    }, 800);
  };

  const handleQrSelectScanMock = (id: string) => {
    setQrScanStep('success');
    setScannedTag(id);
    setTimeout(() => {
      setIsQrScannerOpen(false);
      setQrScanStep('idle');
      setScannedTag(null);
      window.location.hash = `#equipment/${id}`;
    }, 1200);
  };

  // Get active asset's full scheduled WOs including newly created ones
  const getAssetScheduledWos = (asset: EquipmentAsset) => {
    const defaultWos = asset.scheduledWos;
    const addedWos = createdWos[asset.id] || [];
    return [...addedWos, ...defaultWos];
  };

  // ------------------------------------------------------------
  // RENDER METHOD 1: 360° PORTAL DETAIL VIEW
  // ------------------------------------------------------------
  if (activeId && activeAsset) {
    const totalWosCount = getAssetScheduledWos(activeAsset).length;
    const issueCount = reportedIssuesCount[activeAsset.id] || 0;

    // Filter events based on selected filter
    const filteredEvents = activeAsset.history.filter(evt => {
      if (timelineFilter === 'all') return true;
      return evt.type === timelineFilter;
    });

    // Circular gauge calculations
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (activeAsset.health / 100) * circumference;

    const healthColorClass = activeAsset.health >= 80 
      ? 'text-status-ok' 
      : activeAsset.health >= 50 
        ? 'text-status-warn' 
        : 'text-status-critical';

    return (
      <div className="space-y-6 font-sans">
        
        {/* Toast notifications */}
        {woSuccessToast && (
          <div className="fixed top-16 right-4 z-50 p-4 bg-status-ok/10 border-l-4 border-status-ok bg-surface shadow-2xl rounded-r-lg max-w-md animate-in slide-in-from-top duration-300">
            <div className="flex items-start space-x-3 text-xs">
              <CheckCircle2 className="w-5 h-5 text-status-ok flex-shrink-0" />
              <div>
                <span className="font-mono font-bold text-text-primary uppercase tracking-wider block mb-0.5">BACKLOG DISPATCH SUCCESS</span>
                <p className="text-text-secondary leading-relaxed">{woSuccessToast}</p>
              </div>
            </div>
          </div>
        )}

        {woSuccessToast === null && issueSuccessToast && (
          <div className="fixed top-16 right-4 z-50 p-4 bg-status-info/10 border-l-4 border-status-info bg-surface shadow-2xl rounded-r-lg max-w-md animate-in slide-in-from-top duration-300">
            <div className="flex items-start space-x-3 text-xs">
              <Info className="w-5 h-5 text-status-info flex-shrink-0" />
              <div>
                <span className="font-mono font-bold text-text-primary uppercase tracking-wider block mb-0.5">SAFETY SIGNAL REPORTED</span>
                <p className="text-text-secondary leading-relaxed">{issueSuccessToast}</p>
              </div>
            </div>
          </div>
        )}

        {/* Header Section with Condensed mobile layout */}
        <div className="bg-surface border border-border-custom rounded-lg p-4 md:p-6 shadow-sm relative overflow-hidden">
          
          {/* Subtle grid background */}
          <div 
            className="absolute inset-0 opacity-[0.02] pointer-events-none" 
            style={{
              backgroundImage: `linear-gradient(#0E7C86 1px, transparent 1px), linear-gradient(90deg, #0E7C86 1px, transparent 1px)`,
              backgroundSize: '20px 20px'
            }}
          />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between relative z-10 gap-6">
            
            {/* Left side: Tag, Title, Photo Placeholder */}
            <div className="flex items-start space-x-4">
              
              {/* Photo placeholder / customized class icon */}
              <div className="w-16 h-16 md:w-20 md:h-20 bg-background-custom border border-border-custom rounded-lg flex flex-col items-center justify-center text-text-muted flex-shrink-0 relative overflow-hidden group">
                <Cpu className="w-8 h-8 text-primary/40 group-hover:text-primary transition-colors" />
                <span className="text-[8px] font-mono tracking-widest text-text-muted mt-1 uppercase">
                  {activeAsset.type}
                </span>
                <div className="absolute inset-x-0 bottom-0 bg-primary/10 py-0.5 text-center border-t border-border-custom/30">
                  <span className="text-[8px] font-mono text-primary font-bold">PHOTO</span>
                </div>
              </div>

              {/* Tag, Name, Location */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-text-primary bg-background-custom border border-border-custom px-2.5 py-0.5 rounded select-all shadow-sm">
                    {activeAsset.tag}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                    activeAsset.criticality === 'A' 
                      ? 'bg-status-critical/10 text-status-critical border border-status-critical/20' 
                      : activeAsset.criticality === 'B'
                        ? 'bg-status-warn/10 text-status-warn border border-status-warn/20'
                        : 'bg-surface-muted/60 text-text-secondary border border-border-custom'
                  }`}>
                    CRITICALITY {activeAsset.criticality}
                  </span>
                  <StatusChip label={activeAsset.status} type={activeAsset.status} />
                </div>
                
                <h2 className="font-display text-lg md:text-xl font-bold text-text-primary leading-tight">
                  {activeAsset.name}
                </h2>
                
                <p className="text-xs text-text-muted font-mono flex items-center space-x-2">
                  <span>{activeAsset.plant.split(' - ')[1]}</span>
                  <span>•</span>
                  <span>{activeAsset.area}</span>
                  <span>•</span>
                  <span>{activeAsset.unit}</span>
                </p>
              </div>

            </div>

            {/* Right side: Animated health gauge */}
            <div className="flex items-center space-x-4 bg-background-custom/40 border border-border-custom/50 p-3 rounded-lg flex-shrink-0 self-start md:self-auto">
              
              {/* Circular progress SVG */}
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  {/* Track */}
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="transparent"
                    stroke="#1E293B"
                    strokeWidth="6"
                  />
                  {/* Active gauge */}
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className={`transition-all duration-1000 ease-out ${healthColorClass}`}
                  />
                </svg>
                
                {/* Numeric label in center */}
                <div className="absolute flex flex-col items-center">
                  <span className="text-sm font-mono font-bold text-text-primary leading-none">
                    {activeAsset.health}%
                  </span>
                  <span className="text-[7px] font-mono text-text-muted mt-0.5 uppercase tracking-tighter">
                    Health
                  </span>
                </div>
              </div>

              {/* Status and maintenance recap */}
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-text-muted block uppercase">Diagnostics Status</span>
                <span className={`text-xs font-bold block ${healthColorClass} uppercase`}>
                  {activeAsset.health >= 80 ? 'Optimal Performance' : activeAsset.health >= 50 ? 'Maintenance Flagged' : 'Critical Outage Risk'}
                </span>
                <span className="text-[10px] font-mono text-text-secondary block">
                  Last Maint: {activeAsset.lastMaint}
                </span>
              </div>

            </div>

          </div>

          {/* Sticky action bar */}
          <div className="mt-5 pt-4 border-t border-border-custom/50 flex flex-wrap gap-2.5 items-center justify-between relative z-10">
            
            <div className="flex items-center space-x-2 text-[10px] font-mono text-text-muted">
              <span>WO PENDING: <strong className="text-text-primary">{totalWosCount}</strong></span>
              <span>•</span>
              <span>ISSUES DISPATCHED: <strong className="text-text-primary">{issueCount}</strong></span>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto mt-2 sm:mt-0">
              <button 
                onClick={() => setShowCreateWoModal(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded cursor-pointer transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Work Order</span>
              </button>
              
              <button 
                onClick={() => window.location.hash = `#copilot?scope=equipment:${activeAsset.tag}`}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 bg-surface-muted hover:bg-surface border border-border-custom text-text-primary text-xs font-semibold rounded cursor-pointer transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span>Ask Copilot</span>
              </button>

              <button 
                onClick={() => setShowReportIssueModal(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 bg-status-critical/10 hover:bg-status-critical/20 border border-status-critical/30 text-status-critical text-xs font-semibold rounded cursor-pointer transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Report Issue</span>
              </button>
            </div>

          </div>

        </div>

        {/* Back Link and Navigation */}
        <div className="flex justify-between items-center bg-surface-muted/30 px-3 py-2 rounded-lg border border-border-custom/40">
          <button 
            onClick={() => window.location.hash = '#equipment'}
            className="inline-flex items-center space-x-1 text-xs text-primary hover:underline font-mono"
          >
            <span>← Return to Equipment Registry list</span>
          </button>
          
          <span className="text-[10px] font-mono text-text-muted">
            Viewing: {activeAsset.tag}
          </span>
        </div>

        {/* Horizontal scrollable tabs wrapper for mobile */}
        <div className="border-b border-border-custom overflow-x-auto no-scrollbar scroll-smooth flex">
          <div className="flex space-x-2 pb-px">
            {[
              { id: 'overview', label: 'Overview & Spec' },
              { id: 'history', label: 'Unified History' },
              { id: 'documents', label: 'Documents Mapped' },
              { id: 'maintenance', label: 'Maintenance Backlog' },
              { id: 'compliance', label: 'Compliance Audit' },
              { id: 'graph', label: 'Relationship Graph' },
              { id: 'rca', label: 'RCA & AI Predictions' },
              { id: 'condition', label: 'Equipment Condition' },
            ].map((tab) => {
              const isTabActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-xs font-mono font-medium border-b-2 whitespace-nowrap cursor-pointer transition-all ${
                    isTabActive 
                      ? 'border-primary text-primary font-bold bg-primary/5' 
                      : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-custom/50'
                  }`}
                >
                  {tab.label.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------
            TAB CONTENT: OVERVIEW
            ------------------------------------------------------------ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            
            {/* Spec Cards column */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Spec list layout */}
              <div className="bg-surface border border-border-custom p-5 rounded-lg">
                <div className="flex items-center space-x-2 border-b border-border-custom pb-3 mb-4">
                  <Cpu className="w-4 h-4 text-primary" />
                  <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                    Equipment Specification Sheet (OEM Verified)
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {activeAsset.specs.map((spec, i) => (
                    <div key={i} className="p-3 bg-background-custom border border-border-custom/50 rounded-md">
                      <span className="text-[10px] font-mono text-text-muted block uppercase">
                        {spec.label}
                      </span>
                      <p className="text-sm font-semibold text-text-primary font-mono mt-1">
                        {spec.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Metrics Row with sparklines */}
              <div className="bg-surface border border-border-custom p-5 rounded-lg">
                <div className="flex items-center space-x-2 border-b border-border-custom pb-3 mb-4">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                    Asset Operational Health Telemetry
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* MTBF */}
                  <div className="p-3 bg-background-custom border border-border-custom/50 rounded-md flex flex-col justify-between h-28">
                    <div>
                      <span className="text-[9px] font-mono text-text-muted block uppercase">Mean Time Between Failure</span>
                      <p className="text-xl font-bold text-text-primary mt-1 font-mono">{activeAsset.metrics.mtbf}</p>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-mono text-status-ok">▲ NOMINAL</span>
                      <Sparkline data={activeAsset.metrics.mtbfSparkline} color="#0E7C86" />
                    </div>
                  </div>

                  {/* MTTR */}
                  <div className="p-3 bg-background-custom border border-border-custom/50 rounded-md flex flex-col justify-between h-28">
                    <div>
                      <span className="text-[9px] font-mono text-text-muted block uppercase">Mean Time To Repair</span>
                      <p className="text-xl font-bold text-text-primary mt-1 font-mono">{activeAsset.metrics.mttr}</p>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-mono text-status-ok">▼ DECREASING</span>
                      <Sparkline data={activeAsset.metrics.mttrSparkline} color="#F5A524" />
                    </div>
                  </div>

                  {/* Availability */}
                  <div className="p-3 bg-background-custom border border-border-custom/50 rounded-md flex flex-col justify-between h-28">
                    <div>
                      <span className="text-[9px] font-mono text-text-muted block uppercase">Availability Rate</span>
                      <p className="text-xl font-bold text-text-primary mt-1 font-mono">{activeAsset.metrics.availability}</p>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-mono text-status-ok">▲ 99.5% TARGET</span>
                      <Sparkline data={activeAsset.metrics.availSparkline} color="#10B981" />
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* AI Health Summary Card */}
            <div className="bg-surface border border-[#0E7C86]/30 bg-gradient-to-br from-[#0B0F12] to-[#13191D] p-5 rounded-lg flex flex-col justify-between h-fit space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-border-custom pb-2.5">
                  <div className="flex items-center space-x-1.5 text-primary">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span className="font-display text-xs font-bold uppercase tracking-wider text-white">AI Health Summary</span>
                  </div>
                  <ConfidenceBadge confidence={activeAsset.aiSummary.confidence} />
                </div>

                <p className="text-xs text-text-secondary leading-relaxed font-sans">
                  {activeAsset.aiSummary.text}
                </p>

                <div className="space-y-2 pt-3 border-t border-border-custom/40">
                  <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
                    Telemetry & Procedural Evidence Links:
                  </span>
                  
                  {activeAsset.aiSummary.evidenceLinks.map((link, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        window.location.hash = link.route;
                      }}
                      className="w-full p-2 bg-background-custom hover:bg-surface-muted/40 border border-border-custom/60 rounded text-left flex items-center justify-between text-xs text-text-primary transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="truncate">{link.label}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-primary/5 rounded border border-primary/20 text-[10px] font-mono text-text-secondary">
                <span>REFINERY ENGINE SUGGESTION: </span>
                <span className="text-text-primary">
                  This health insight syncs automatically with the Knowledge Graph. Ask Copilot for targeted advice.
                </span>
              </div>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------
            TAB CONTENT: HISTORY TIMELINE
            ------------------------------------------------------------ */}
        {activeTab === 'history' && (
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-6 animate-in fade-in duration-300">
            
            {/* Timeline header and filters */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-custom pb-3.5 gap-4">
              <div className="flex items-center space-x-2">
                <HistoryIcon className="w-4 h-4 text-primary" />
                <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                  Asset Unified Event History Ledger
                </h3>
              </div>

              {/* Event type filters */}
              <div className="flex flex-wrap gap-1.5 bg-background-custom p-1 rounded border border-border-custom/50 text-[10px]">
                {[
                  { id: 'all', label: 'All Events' },
                  { id: 'work_order', label: 'Work Orders' },
                  { id: 'failure', label: 'Failures' },
                  { id: 'inspection', label: 'Inspections' },
                  { id: 'document', label: 'Documents' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setTimelineFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded font-mono uppercase cursor-pointer transition-colors ${
                      timelineFilter === f.id 
                        ? 'bg-primary text-white font-bold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actual timeline list */}
            {filteredEvents.length > 0 ? (
              <div className="relative border-l border-border-custom pl-6 ml-3 space-y-6">
                {filteredEvents.map((evt) => {
                  
                  // Style configurations based on event type
                  let typeIcon = <Wrench className="w-4 h-4" />;
                  let typeBadgeClass = 'bg-primary/15 text-primary border-primary/20';
                  
                  if (evt.type === 'failure') {
                    typeIcon = <AlertTriangle className="w-4 h-4" />;
                    typeBadgeClass = 'bg-status-critical/15 text-status-critical border-status-critical/20';
                  } else if (evt.type === 'inspection') {
                    typeIcon = <Search className="w-4 h-4" />;
                    typeBadgeClass = 'bg-status-info/15 text-status-info border-status-info/20';
                  } else if (evt.type === 'document') {
                    typeIcon = <FileText className="w-4 h-4" />;
                    typeBadgeClass = 'bg-status-warn/15 text-status-warn border-status-warn/20';
                  }

                  return (
                    <div key={evt.id} className="relative group">
                      
                      {/* Timeline dot */}
                      <span className={`absolute -left-10 top-0.5 w-8 h-8 rounded-full flex items-center justify-center border bg-[#0B0F12] transition-transform group-hover:scale-110 shadow-md ${
                        evt.type === 'failure' ? 'border-status-critical text-status-critical' :
                        evt.type === 'work_order' ? 'border-primary text-primary' :
                        evt.type === 'inspection' ? 'border-status-info text-status-info' : 'border-status-warn text-status-warn'
                      }`}>
                        {typeIcon}
                      </span>

                      {/* Content Card */}
                      <div className="p-4 bg-background-custom/40 border border-border-custom/50 hover:border-border-custom rounded-lg transition-all space-y-2 max-w-3xl">
                        
                        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-text-muted">{evt.date}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] border font-bold uppercase ${typeBadgeClass}`}>
                              {evt.type.replace('_', ' ')}
                            </span>
                          </div>
                          
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            evt.status === 'Completed' || evt.status === 'Pass' || evt.status === 'Resolved'
                              ? 'bg-status-ok/10 text-status-ok border border-status-ok/20'
                              : 'bg-status-critical/10 text-status-critical border border-status-critical/20'
                          }`}>
                            {evt.status.toUpperCase()}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                          {evt.title}
                        </h4>

                        <p className="text-xs text-text-secondary leading-relaxed">
                          {evt.desc}
                        </p>

                        <div className="pt-1.5 flex justify-end">
                          <button
                            onClick={() => window.location.hash = evt.link}
                            className="inline-flex items-center space-x-1 font-mono text-[10px] text-primary hover:underline cursor-pointer"
                          >
                            <span>Inspect Event Node</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </div>

                      </div>

                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-text-muted">
                <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse" />
                <p className="font-mono text-xs uppercase">No historical events match the filter</p>
              </div>
            )}

          </div>
        )}

        {/* ------------------------------------------------------------
            TAB CONTENT: DOCUMENTS
            ------------------------------------------------------------ */}
        {activeTab === 'documents' && (
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center space-x-2 border-b border-border-custom pb-3 mb-4">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                Corpus Auto-Linked Artifacts
              </h3>
            </div>

            <p className="text-xs text-text-secondary leading-normal max-w-xl">
              The following files have been auto-linked to <strong>{activeAsset.tag}</strong> using the refinery layout parsing parser, which matches tag indices, OEM schemas, and cross-references.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {activeAsset.documents.map((doc) => (
                <div key={doc.id} className="p-4 bg-background-custom/40 border border-border-custom/60 hover:border-primary/40 rounded-lg flex flex-col justify-between transition-all group">
                  <div className="space-y-3">
                    
                    <div className="flex justify-between items-start">
                      <div className="p-2 rounded bg-primary/10 text-primary border border-primary/20">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono text-text-muted uppercase">
                        {doc.size}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors truncate" title={doc.name}>
                        {doc.name}
                      </h4>
                      <p className="text-[10px] font-mono text-text-secondary uppercase mt-0.5">
                        {doc.type}
                      </p>
                    </div>

                    <div className="p-2 bg-surface-muted/40 rounded border border-border-custom/50 text-[10px] font-mono text-text-secondary">
                      <span className="text-text-muted block uppercase text-[8px] tracking-widest">Auto-Link Reason:</span>
                      <span className="text-text-primary font-semibold capitalize">{doc.reason}</span>
                    </div>

                  </div>

                  <div className="pt-4 border-t border-border-custom/30 mt-4 flex justify-end">
                    <button 
                      onClick={() => window.location.hash = '#documents'}
                      className="inline-flex items-center space-x-1 font-mono text-[10px] text-primary hover:underline cursor-pointer"
                    >
                      <span>Open in Document Vault</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------
            TAB CONTENT: MAINTENANCE BACKLOG
            ------------------------------------------------------------ */}
        {activeTab === 'maintenance' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            
            {/* WOs Mini Table Column */}
            <div className="lg:col-span-2 bg-surface border border-border-custom p-5 rounded-lg space-y-4">
              <div className="flex items-center justify-between border-b border-border-custom pb-3 mb-2">
                <div className="flex items-center space-x-2">
                  <Wrench className="w-4 h-4 text-primary" />
                  <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                    Assigned Backlog & Running Tasks
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-text-muted">
                  {totalWosCount} OPEN TASKS
                </span>
              </div>

              {getAssetScheduledWos(activeAsset).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans border-collapse">
                    <thead>
                      <tr className="bg-surface-muted/30 border-b border-border-custom/50 text-[10px] text-text-muted uppercase font-mono">
                        <th className="p-2.5">Task ID</th>
                        <th className="p-2.5">Description Title</th>
                        <th className="p-2.5">Schedule</th>
                        <th className="p-2.5">Priority</th>
                        <th className="p-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-custom/30 text-text-secondary">
                      {getAssetScheduledWos(activeAsset).map((wo) => (
                        <tr key={wo.id} className="hover:bg-background-custom/30 transition-colors">
                          <td className="p-2.5 font-mono text-text-primary font-semibold">
                            {wo.id}
                          </td>
                          <td className="p-2.5 font-sans text-text-primary font-medium">
                            {wo.title}
                          </td>
                          <td className="p-2.5 font-mono text-text-secondary">
                            {wo.schedule}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 font-mono text-[9px] font-bold rounded border ${
                              wo.priority === 'Critical' ? 'bg-status-critical/15 text-status-critical border-status-critical/20' :
                              wo.priority === 'High' ? 'bg-status-warn/15 text-status-warn border-status-warn/20' :
                              'bg-surface-muted text-text-secondary border-border-custom'
                            }`}>
                              {wo.priority.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono border font-bold ${
                              wo.status === 'In Progress' ? 'bg-status-warn/10 text-status-warn border-status-warn/20' :
                              wo.status === 'Approved' ? 'bg-primary/10 text-primary border-primary/20' :
                              wo.status === 'Overdue' ? 'bg-status-critical/10 text-status-critical border-status-critical/20 animate-pulse' :
                              'bg-status-ok/10 text-status-ok border border-status-ok/20'
                            }`}>
                              {wo.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-text-muted bg-background-custom/20 border border-dashed border-border-custom rounded-lg">
                  <CheckCircle2 className="w-8 h-8 text-status-ok mx-auto mb-2 opacity-50" />
                  <p className="font-mono text-xs uppercase text-status-ok font-bold">Backlog completely cleared</p>
                  <p className="text-[11px] text-text-secondary mt-1">
                    No active maintenance tickets associated with this asset.
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowCreateWoModal(true)}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-all"
                >
                  Create Work Order Backlog Ticket
                </button>
              </div>

            </div>

            {/* MTBF/MTTR comparison charts */}
            <div className="bg-surface border border-border-custom p-5 rounded-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center space-x-2 border-b border-border-custom pb-3 mb-4">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                    Backlog Performance Benchmarking
                  </h3>
                </div>

                <div className="space-y-4 text-xs font-sans">
                  
                  {/* MTBF Gauge */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-mono text-[10px] text-text-secondary">
                      <span>MTBF (Refinery Baseline)</span>
                      <span>Target: 300 hrs</span>
                    </div>
                    
                    <div className="h-6 bg-background-custom border border-border-custom rounded overflow-hidden flex relative items-center px-2">
                      {/* Performance Bar */}
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-[#0E7C86]/30 border-r border-[#0E7C86]" 
                        style={{ width: `${Math.min(100, (parseInt(activeAsset.metrics.mtbf) / 300) * 100)}%` }}
                      />
                      <span className="relative font-mono font-bold text-text-primary z-10">
                        Asset MTBF: {activeAsset.metrics.mtbf}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-status-ok block text-right">
                      {parseInt(activeAsset.metrics.mtbf) > 300 ? '▲ EXCEEDS REFINERY STANDARD' : '▼ LOWER THAN AVERAGE'}
                    </span>
                  </div>

                  {/* MTTR Gauge */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-mono text-[10px] text-text-secondary">
                      <span>MTTR (Resolution Target)</span>
                      <span>Target: 3.0 hrs</span>
                    </div>
                    
                    <div className="h-6 bg-background-custom border border-border-custom rounded overflow-hidden flex relative items-center px-2">
                      {/* MTTR Bar - shorter is better */}
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-status-warn/10 border-r border-status-warn" 
                        style={{ width: `${Math.min(100, (parseFloat(activeAsset.metrics.mttr) / 3.0) * 100)}%` }}
                      />
                      <span className="relative font-mono font-bold text-text-primary z-10">
                        Asset MTTR: {activeAsset.metrics.mttr}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-status-ok block text-right">
                      {parseFloat(activeAsset.metrics.mttr) < 3.0 ? '▲ SHORTER REPAIR DURATION (EFFICIENT)' : '▼ OUT OF SLA'}
                    </span>
                  </div>

                </div>
              </div>

              <div className="p-3 bg-surface-muted/30 rounded border border-border-custom/50 text-[10px] text-text-muted font-mono leading-relaxed">
                MTBF/MTTR ratings are auto-generated from active and archived operations work orders since deployment.
              </div>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------
            TAB CONTENT: COMPLIANCE
            ------------------------------------------------------------ */}
        {activeTab === 'compliance' && (
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center space-x-2 border-b border-border-custom pb-3 mb-4">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                Regulatory Standards Governing Asset
              </h3>
            </div>

            <p className="text-xs text-text-secondary leading-normal max-w-xl">
              Compliance audits map federal guidelines (e.g. OISD-STD-118, Factory Acts, PESO directives) to active maintenance checklists on this equipment.
            </p>

            <div className="space-y-3 pt-2">
              {activeAsset.clauses.map((clause, i) => (
                <div key={i} className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  clause.status === 'compliant' ? 'bg-status-ok/5 border-status-ok/30' :
                  clause.status === 'gap' ? 'bg-status-critical/5 border-status-critical/30 animate-pulse' :
                  'bg-surface-muted/20 border-border-custom'
                }`}>
                  <div className="space-y-1">
                    <span className="font-mono text-xs font-bold text-text-primary block uppercase tracking-wide">
                      {clause.code}
                    </span>
                    <p className="text-xs text-text-secondary leading-relaxed font-sans max-w-2xl">
                      {clause.title}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <span className={`inline-flex items-center px-3 py-1 rounded text-xs font-mono font-bold border ${
                      clause.status === 'compliant' ? 'bg-status-ok/20 text-status-ok border-status-ok/30' :
                      clause.status === 'gap' ? 'bg-status-critical/20 text-status-critical border-status-critical/30' :
                      'bg-background-custom text-text-muted border-border-custom'
                    }`}>
                      {clause.status === 'compliant' ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          <span>COMPLIANT</span>
                        </>
                      ) : clause.status === 'gap' ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 mr-1.5 animate-bounce" />
                          <span>GAP DETECTED</span>
                        </>
                      ) : (
                        <>
                          <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
                          <span>UNMAPPED</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-border-custom/40 mt-4 flex justify-between">
              <button 
                onClick={() => window.location.hash = '#compliance'}
                className="px-4 py-2 bg-surface-muted hover:bg-surface border border-border-custom text-text-primary text-xs font-semibold rounded cursor-pointer transition-colors"
              >
                Open Compliance Hub
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------
            TAB CONTENT: RELATIONSHIP GRAPH
            ------------------------------------------------------------ */}
        {activeTab === 'graph' && (
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-border-custom pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Network className="w-4 h-4 text-primary" />
                <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                  Relationship Graph [Ego-Network Model]
                </h3>
              </div>
              <span className="text-[10px] font-mono text-primary">NEO4J LIVE CONNECTED</span>
            </div>

            <p className="text-xs text-text-secondary max-w-xl">
              This panel displays direct (1-degree depth) linkages mapped dynamically between <strong>{activeAsset.tag}</strong> and other nodes inside the Neo4j schema.
            </p>

            {/* Interactive ego-network model canvas mock */}
            <div className="p-8 bg-background-custom border border-border-custom/50 rounded-xl relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
              
              {/* Holographic grid */}
              <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                style={{
                  backgroundImage: `radial-gradient(#0E7C86 1px, transparent 1px)`,
                  backgroundSize: '16px 16px'
                }}
              />

              {/* Core Ego-Graph Node Layout using absolute positioning/CSS */}
              <div className="relative w-full max-w-lg h-56 flex items-center justify-center z-10 mt-4">
                
                {/* Center Node: Ego Equipment */}
                <div className="absolute w-28 h-20 bg-primary/20 border-2 border-primary text-text-primary p-2 rounded-lg text-center flex flex-col justify-center items-center shadow-lg shadow-primary/10 z-20 scale-105">
                  <span className="text-[8px] font-mono text-primary font-bold uppercase tracking-wider">CENTER ASSET</span>
                  <span className="font-mono text-xs font-extrabold">{activeAsset.tag}</span>
                  <span className="text-[9px] font-sans text-text-secondary truncate w-full">{activeAsset.name.split(' ')[0]}</span>
                </div>

                {/* Satellite Connected Nodes */}
                {activeAsset.relationships.map((rel, idx) => {
                  // Distribute positions in circle
                  const angle = (idx / activeAsset.relationships.length) * 2 * Math.PI;
                  const radiusDistance = 140; // Pixels
                  const x = Math.cos(angle) * radiusDistance;
                  const y = Math.sin(angle) * radiusDistance;

                  let borderStyle = 'border-border-custom/80 bg-surface-muted/60 text-text-primary';
                  if (rel.type === 'Regulation') borderStyle = 'border-status-warn/50 bg-status-warn/5 text-status-warn';
                  if (rel.type === 'Document') borderStyle = 'border-primary/40 bg-primary/5 text-text-primary';

                  return (
                    <React.Fragment key={rel.id}>
                      {/* Connection Line */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                        <line
                          x1="50%"
                          y1="50%"
                          x2={`calc(50% + ${x}px)`}
                          y2={`calc(50% + ${y}px)`}
                          stroke="#1E293B"
                          strokeWidth="1.5"
                          strokeDasharray="4,4"
                        />
                        {/* Label in middle of line */}
                        <text
                          x={`calc(50% + ${x / 2}px)`}
                          y={`calc(50% + ${y / 2}px)`}
                          fill="#0E7C86"
                          fontSize="7"
                          fontFamily="monospace"
                          textAnchor="middle"
                          className="bg-black/80 px-1 rounded font-bold"
                        >
                          {rel.rel.toUpperCase()}
                        </text>
                      </svg>

                      {/* Node Circle Box */}
                      <div 
                        className={`absolute w-32 p-2 rounded-md border text-center transition-all hover:scale-105 hover:bg-background-custom cursor-pointer text-[10px] shadow-sm font-sans ${borderStyle}`}
                        style={{
                          transform: `translate(${x}px, ${y}px)`
                        }}
                      >
                        <span className="text-[7px] font-mono uppercase block text-text-muted mb-0.5">
                          {rel.type}
                        </span>
                        <strong className="block font-mono text-[10px] truncate">{rel.id}</strong>
                        <span className="block text-[8px] text-text-muted truncate mt-0.5">{rel.label}</span>
                      </div>
                    </React.Fragment>
                  );
                })}

              </div>

            </div>

            <div className="pt-4 border-t border-border-custom/40 mt-4 flex justify-between">
              <span className="text-[10px] font-mono text-text-muted">
                COGNITIVE DISCOVERY DEPTH: 1-DEGREE
              </span>
              <button 
                onClick={() => window.location.hash = '#knowledge-graph'}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded cursor-pointer transition-colors inline-flex items-center space-x-1.5"
              >
                <span>Open in Knowledge Graph Explorer</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------
            TAB CONTENT: RCA & PREDICTIONS
            ------------------------------------------------------------ */}
        {activeTab === 'rca' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            
            {/* Left/Middle Column: Predictions Card */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
                <div className="flex items-center justify-between border-b border-border-custom pb-3 mb-2">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                      Latest AI Predictive Outage Recommendation
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-primary font-bold">PIPELINE: ACTIVE</span>
                </div>

                {/* Prediction Risk Score Card */}
                <div className="p-4 bg-background-custom/60 border border-border-custom/50 rounded-lg space-y-4">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-text-muted uppercase">Computed Risk Index</span>
                      <div className="flex items-baseline space-x-2">
                        <span className={`text-4xl font-mono font-black ${
                          activeAsset.predictions.riskScore > 80 ? 'text-status-critical' :
                          activeAsset.predictions.riskScore > 50 ? 'text-status-warn' : 'text-status-ok'
                        }`}>
                          {activeAsset.predictions.riskScore}%
                        </span>
                        <span className="text-xs font-semibold text-text-primary uppercase font-mono">Outage Risk</span>
                      </div>
                    </div>

                    <div className="space-y-1 sm:text-right">
                      <span className="text-[10px] font-mono text-text-muted uppercase">Predicted Impairment Mode</span>
                      <span className="block text-xs font-bold text-text-primary font-mono uppercase bg-surface-muted px-2.5 py-1 rounded border border-border-custom">
                        {activeAsset.predictions.predictedMode}
                      </span>
                    </div>
                  </div>

                  {/* Primary Drivers List */}
                  <div className="space-y-2 pt-2 border-t border-border-custom/40">
                    <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
                      Telemetry Anomaly Drivers (Root-Cause Seeds):
                    </span>
                    <ul className="space-y-1.5 text-xs text-text-secondary list-disc pl-4">
                      {activeAsset.predictions.drivers.map((drv, i) => (
                        <li key={i} className="leading-relaxed">
                          {drv}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommended Action & Decisions Accept/Dismiss */}
                  <div className="p-4 bg-primary/5 rounded border border-primary/20 space-y-3 mt-4">
                    <div className="flex items-center space-x-1.5 text-primary">
                      <Bot className="w-4 h-4" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Recommended AI Mitigation Action</span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <strong className="text-text-primary block">
                        {activeAsset.predictions.recommendedAction.title}
                      </strong>
                      <p className="text-text-secondary leading-relaxed">
                        {activeAsset.predictions.recommendedAction.desc}
                      </p>
                    </div>

                    {/* Interactive Accept / Dismiss buttons */}
                    <div className="pt-2 flex justify-end space-x-2">
                      {dispatchedPredictions[activeAsset.id] ? (
                        <div className="text-[10px] font-mono text-status-ok font-bold bg-status-ok/10 border border-status-ok/20 px-3 py-1.5 rounded uppercase flex items-center space-x-1.5 animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {dispatchedPredictions[activeAsset.id] === 'accepted' 
                              ? 'Recommendation Dispatched to Backlog!' 
                              : 'Recommendation Dismissed & Logged'}
                          </span>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handlePredictionAction('dismissed')}
                            className="px-3 py-1.5 bg-background-custom hover:bg-surface-muted/60 border border-border-custom rounded font-mono text-[10px] font-bold text-text-secondary cursor-pointer transition-colors"
                          >
                            Dismiss Recommendation
                          </button>
                          <button
                            onClick={() => handlePredictionAction('accepted')}
                            className="px-4 py-1.5 bg-status-ok hover:bg-status-ok/90 text-white rounded font-mono text-[10px] font-bold cursor-pointer transition-all flex items-center space-x-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Accept & Generate WO Backlog</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </div>

            {/* Right Column: Past RCA Summaries */}
            <div className="bg-surface border border-border-custom p-5 rounded-lg flex flex-col justify-between space-y-4 h-fit">
              <div className="space-y-3">
                <div className="flex items-center space-x-2 border-b border-border-custom pb-3 mb-2">
                  <HistoryIcon className="w-4 h-4 text-primary" />
                  <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                    Historical Root-Cause Analyses
                  </h3>
                </div>

                {activeAsset.pastRca.length > 0 ? (
                  <div className="space-y-4">
                    {activeAsset.pastRca.map((rca, idx) => (
                      <div key={idx} className="p-3 bg-background-custom/40 border border-border-custom/50 rounded-lg space-y-2 text-xs">
                        <div className="flex justify-between items-center font-mono text-[10px] text-text-muted">
                          <span>{rca.date}</span>
                          <span className="text-primary font-bold uppercase">RCA SUMMARY</span>
                        </div>
                        <h4 className="font-bold text-text-primary leading-tight">
                          {rca.title}
                        </h4>
                        <div className="space-y-1 leading-normal font-sans text-text-secondary">
                          <p>
                            <strong className="text-[10px] text-text-muted uppercase block">Root Cause Seed:</strong> 
                            {rca.rootCause}
                          </p>
                          <p className="pt-1 border-t border-border-custom/20 mt-1">
                            <strong className="text-[10px] text-status-ok uppercase block">Corrective Countermeasure:</strong> 
                            {rca.actionTaken}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-text-muted">
                    <CheckCircle2 className="w-8 h-8 text-status-ok mx-auto mb-2 opacity-50" />
                    <p className="font-mono text-[10px] uppercase">No previous failures on record</p>
                    <p className="text-[11px] text-text-secondary mt-1">
                      No structural incident reports requiring regulatory 5-Why root-cause investigation.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-surface-muted/30 rounded border border-border-custom/50 text-[10px] text-text-muted font-mono leading-relaxed">
                RCA summaries document human feedback loops verifying AI-generated fault trees following physical failure events.
              </div>
            </div>

          </div>
        )}

        {activeTab === 'condition' && (
          <EquipmentConditionTab equipmentId={activeAsset.id} />
        )}

        {/* ------------------------------------------------------------
            MODAL DIALOG: CREATE WORK ORDER BACKLOG TICKET
            ------------------------------------------------------------ */}
        {showCreateWoModal && (
          <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
            <div className="fixed inset-0" onClick={() => setShowCreateWoModal(false)} />
            
            <div className="bg-surface border border-border-custom w-full max-w-md rounded-xl shadow-2xl relative z-10 overflow-hidden font-sans">
              
              <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                <div className="flex items-center space-x-2 text-primary">
                  <Wrench className="w-4 h-4" />
                  <span className="font-mono font-bold text-xs uppercase text-text-primary">Dispatch Backlog Work Order</span>
                </div>
                <button 
                  onClick={() => setShowCreateWoModal(false)} 
                  className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateWoSubmit} className="p-5 space-y-4 text-xs">
                
                <div className="p-3 bg-primary/5 rounded border border-primary/20 font-mono text-[10px] text-text-secondary">
                  TARGET ASSET: <strong className="text-text-primary">{activeAsset.tag}</strong> ({activeAsset.name})
                </div>

                <div className="space-y-1.5">
                  <label className="block font-mono text-[10px] text-text-secondary uppercase">
                    Work Order Title / Scope Description *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Calibrate pressure gauge or align sealing rings"
                    value={woTitle}
                    onChange={(e) => setWoTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom focus:border-primary/50 rounded text-text-primary text-xs focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block font-mono text-[10px] text-text-secondary uppercase">
                      Urgency Priority Level
                    </label>
                    <Select
                      value={woPriority}
                      onValueChange={(v) => setWoPriority(v as any)}
                      className="w-full px-3 py-2 text-xs"
                      options={[
                        { value: 'Critical', label: 'Critical (Immediate Outage Risk)' },
                        { value: 'High', label: 'High Priority' },
                        { value: 'Medium', label: 'Medium Priority' },
                        { value: 'Low', label: 'Low / General' },
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-mono text-[10px] text-text-secondary uppercase">
                      Linked SOP / Safety Guide
                    </label>
                    <Select
                      value={woSop}
                      onValueChange={(v) => setWoSop(v)}
                      className="w-full px-3 py-2 text-xs"
                      options={[
                        { value: 'Standard Calibration Protocol', label: 'SOP-REF-112 (Pumps Calibration)' },
                        { value: 'SOP-GCU-COMP-99', label: 'SOP-GCU-99 (Gas Safety)' },
                        { value: 'General Mechanical Alignment Standard', label: 'Gen-Mech Alignment' },
                      ]}
                    />
                  </div>
                </div>

                <div className="p-3 bg-surface-muted/50 border border-border-custom/50 rounded font-sans text-text-secondary leading-relaxed space-y-1">
                  <span className="font-mono text-[9px] text-status-warn font-bold block uppercase">
                    ⚠ Safety Isolation Required (LOTO)
                  </span>
                  <p className="text-[10px]">
                    Submitting this form dispatches a real-time notification to control-room supervisor operators to authorize lock-out / tag-out safety permits.
                  </p>
                </div>

                <div className="pt-4 border-t border-border-custom flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateWoModal(false)}
                    className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-[10px] text-text-secondary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded font-mono text-[10px] font-bold cursor-pointer"
                  >
                    Commit Backlog Dispatch
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

        {/* ------------------------------------------------------------
            MODAL DIALOG: REPORT ISSUE
            ------------------------------------------------------------ */}
        {showReportIssueModal && (
          <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
            <div className="fixed inset-0" onClick={() => setShowReportIssueModal(false)} />
            
            <div className="bg-surface border border-border-custom w-full max-w-md rounded-xl shadow-2xl relative z-10 overflow-hidden font-sans">
              
              <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                <div className="flex items-center space-x-2 text-status-critical">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-mono font-bold text-xs uppercase text-text-primary">Report Safety or Mechanical Issue</span>
                </div>
                <button 
                  onClick={() => setShowReportIssueModal(false)} 
                  className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleReportIssueSubmit} className="p-5 space-y-4 text-xs">
                
                <div className="p-3 bg-status-critical/5 rounded border border-status-critical/20 font-mono text-[10px] text-text-secondary">
                  TARGET EQUIPMENT: <strong className="text-text-primary">{activeAsset.tag}</strong>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-mono text-[10px] text-text-secondary uppercase">
                    Description of Anomaly / Issue Observed *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe specific vibration spikes, oil weepages, unusual heat indices, or safety signage damage..."
                    value={issueDesc}
                    onChange={(e) => setIssueDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom focus:border-status-critical/40 rounded text-text-primary text-xs focus:outline-none font-sans"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-mono text-[10px] text-text-secondary uppercase">
                    Severity Level
                  </label>
                  <Select
                    value={issueSeverity}
                    onValueChange={(v) => setIssueSeverity(v)}
                    className="w-full px-3 py-2 text-xs"
                    options={[
                      { value: 'Severe', label: 'Severe Outage (Bypass tripped or leaking)' },
                      { value: 'Moderate', label: 'Moderate Deviation (Thermal/Vibration alarm)' },
                      { value: 'Low', label: 'Low / Aesthetic (Warning placard scratched)' },
                    ]}
                  />
                </div>

                <div className="p-3 bg-surface-muted/50 border border-border-custom/50 rounded font-sans text-text-secondary leading-normal">
                  <span className="font-mono text-[9px] text-status-critical font-bold block uppercase mb-1">
                    🔒 IMMUTABLE LEDGER RECORDING
                  </span>
                  <p className="text-[10px]">
                    This safety dispatch will immediately append a safety-warning node directly on the Knowledge Graph.
                  </p>
                </div>

                <div className="pt-4 border-t border-border-custom flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowReportIssueModal(false)}
                    className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-[10px] text-text-secondary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-status-critical text-white rounded font-mono text-[10px] font-bold cursor-pointer hover:bg-status-critical/90"
                  >
                    Transmit Safety Warning
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

      </div>
    );
  }

  // ------------------------------------------------------------
  // RENDER METHOD 2: EQUIPMENT REGISTRY LIST & HIERARCHY TREE
  // ------------------------------------------------------------
  return (
    <div className="space-y-6 font-sans">
      
      {/* Page header title & description */}
      <div className="border-b border-border-custom pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2.5">
            <Cpu className="w-6 h-6 text-primary" />
            <span>Industrial Equipment Registry & 360° Portal</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1 max-w-3xl leading-relaxed">
            Query live machinery specifications, map OCR-linked compliance standards, evaluate AI outage predictions, and navigate directly to asset 360° diagnostics.
          </p>
        </div>

        {/* Scan & Generate QR Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportQrLabels}
            disabled={isExportingLabels}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary text-xs font-bold rounded cursor-pointer transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {isExportingLabels ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Download className="w-4 h-4 text-primary" />
            )}
            <span>{isExportingLabels ? 'Compiling PDF...' : 'Export QR Labels'}</span>
          </button>
          <button
            onClick={handleMobileQrTrigger}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-colors shadow shadow-primary/10 min-h-[44px]"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan QR Tag</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[550px] items-start">
        
        {/* LEFT COLUMN: Lazy-Loaded Hierarchy Tree */}
        <div className="lg:col-span-1 bg-surface border border-border-custom rounded-lg p-4 font-mono text-xs">
          
          <div className="border-b border-border-custom pb-3 mb-4 flex items-center justify-between">
            <span className="font-bold text-text-primary uppercase tracking-wider text-[11px]">
              Plant Hierarchy Tree
            </span>
            <span className="text-[9px] text-text-muted">LAZY LOADED</span>
          </div>

          {/* Root Plant Node */}
          <div className="space-y-2 select-none">
            {Object.values(mockEquipmentTree).filter(n => n.type === 'plant').map((plantNode) => (
              <div key={plantNode.id} className="space-y-1.5">
                
                {/* Node Line Header */}
                <div 
                  onClick={() => handleTreeNodeClick(plantNode.id, plantNode)}
                  className={`flex items-center space-x-1.5 p-1.5 rounded cursor-pointer transition-colors hover:bg-surface-muted/60 ${
                    selectedTreeNodeId === plantNode.id ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-text-primary'
                  }`}
                >
                  <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${treeExpanded[plantNode.id] ? '' : '-rotate-90'}`} />
                  <Network className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="truncate font-bold tracking-tight text-[11px] uppercase">
                    {plantNode.label.split(' - ')[0]}
                  </span>
                </div>

                {/* Plant Children (Areas) */}
                {treeExpanded[plantNode.id] && plantNode.childrenIds && (
                  <div className="pl-4 border-l border-border-custom/50 ml-3 space-y-1.5 mt-1">
                    {plantNode.childrenIds.map(areaId => {
                      const areaNode = mockEquipmentTree[areaId];
                      if (!areaNode) return null;

                      return (
                        <div key={areaId} className="space-y-1.5">
                          
                          {/* Area Header */}
                          <div 
                            onClick={() => handleTreeNodeClick(areaId, areaNode)}
                            className={`flex items-center space-x-1.5 p-1.5 rounded cursor-pointer transition-colors hover:bg-surface-muted/60 ${
                              selectedTreeNodeId === areaId ? 'bg-primary/10 text-primary border-l-2 border-primary font-bold' : 'text-text-secondary'
                            }`}
                          >
                            {treeLoading[areaId] ? (
                              <Loader2 className="w-3 h-3 text-primary animate-spin" />
                            ) : (
                              <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-200 ${treeExpanded[areaId] ? '' : '-rotate-90'}`} />
                            )}
                            <span className="truncate font-sans font-medium text-xs">
                              {areaNode.label}
                            </span>
                          </div>

                          {/* Area Children (Units) */}
                          {treeExpanded[areaId] && areaNode.childrenIds && (
                            <div className="pl-4 border-l border-border-custom/50 ml-2 space-y-1.5 mt-1">
                              {areaNode.childrenIds.map(unitId => {
                                const unitNode = mockEquipmentTree[unitId];
                                if (!unitNode) return null;

                                return (
                                  <div key={unitId} className="space-y-1">
                                    
                                    {/* Unit Header */}
                                    <div 
                                      onClick={() => handleTreeNodeClick(unitId, unitNode)}
                                      className={`flex items-center space-x-1 p-1 rounded cursor-pointer transition-colors hover:bg-surface-muted/55 ${
                                        selectedTreeNodeId === unitId ? 'bg-primary/10 text-primary border-l-2 border-primary font-bold' : 'text-text-muted'
                                      }`}
                                    >
                                      {treeLoading[unitId] ? (
                                        <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                      ) : (
                                        <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-200 ${treeExpanded[unitId] ? '' : '-rotate-90'}`} />
                                      )}
                                      <span className="truncate font-sans text-xs">
                                        {unitNode.label}
                                      </span>
                                    </div>

                                    {/* Unit Children (Equipment Leaves) */}
                                    {treeExpanded[unitId] && unitNode.childrenIds && (
                                      <div className="pl-3 border-l border-border-custom/30 ml-2.5 space-y-1 mt-1">
                                        {unitNode.childrenIds.map(equipId => {
                                          const equipNode = mockEquipmentTree[equipId];
                                          if (!equipNode) return null;

                                          return (
                                            <div 
                                              key={equipId}
                                              onClick={() => handleTreeNodeClick(equipId, equipNode)}
                                              className="flex items-center space-x-1.5 p-1 rounded hover:text-primary transition-colors cursor-pointer text-text-muted"
                                            >
                                              <Cpu className="w-3 h-3 text-text-muted" />
                                              <span className="truncate font-mono text-[10px] hover:underline">
                                                {equipNode.label}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                  </div>
                                );
                              })}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            ))}
          </div>

          <div className="mt-8 p-3 bg-background-custom/40 rounded border border-border-custom/50 font-sans text-[11px] text-text-secondary leading-normal">
            <span className="font-mono text-[9px] text-text-muted block uppercase font-bold tracking-wider mb-1">
              Instructions
            </span>
            Click on plant nodes to toggle sub-divisions. Selecting any branch filters the machinery data table instantly.
          </div>

        </div>

        {/* RIGHT COLUMN: Advanced Filtered DataTable */}
        <div className="lg:col-span-3 bg-surface border border-border-custom rounded-lg p-4 md:p-5 space-y-4">
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-3.5 gap-4">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
                Asset Specifications Database
              </span>
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.2 rounded font-mono font-bold">
                {filteredAssets.length} MACHINES MATCHED
              </span>
            </div>

            {/* Clear Filters Button */}
            {(filterArea !== 'All' || filterType !== 'All' || filterCriticality !== 'All' || filterHealthBand !== 'All' || filterStatus !== 'All' || selectedTreeNodeId !== null || searchQuery !== '') && (
              <button
                onClick={resetFilters}
                className="text-xs text-status-critical hover:underline font-mono flex items-center space-x-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Database Filters</span>
              </button>
            )}
          </div>

          {/* Quick Filter Inputs Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
            
            {/* Search Input box */}
            <div className="sm:col-span-2 lg:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Query machinery tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-background-custom border border-border-custom rounded text-text-primary focus:outline-none focus:border-primary/50 text-xs"
              />
            </div>

            {/* Area Filter */}
            <div>
              <Select
                value={filterArea}
                onValueChange={(v) => setFilterArea(v)}
                className="w-full px-2 py-1.5 text-xs"
                options={[
                  { value: 'All', label: 'All Sectors' },
                  { value: 'Area A - Crude Block', label: 'Crude Block' },
                  { value: 'Utilities & Offsites', label: 'Utilities' },
                ]}
              />
            </div>

            {/* Type Filter */}
            <div>
              <Select
                value={filterType}
                onValueChange={(v) => setFilterType(v)}
                className="w-full px-2 py-1.5 text-xs"
                options={[
                  { value: 'All', label: 'All Types' },
                  { value: 'Pump', label: 'Pumps' },
                  { value: 'Compressor', label: 'Compressors' },
                  { value: 'Valve', label: 'Valves' },
                  { value: 'Tank', label: 'Tanks' },
                ]}
              />
            </div>

            {/* Criticality Filter */}
            <div>
              <Select
                value={filterCriticality}
                onValueChange={(v) => setFilterCriticality(v)}
                className="w-full px-2 py-1.5 text-xs"
                options={[
                  { value: 'All', label: 'All Crit' },
                  { value: 'A', label: 'Class A' },
                  { value: 'B', label: 'Class B' },
                  { value: 'C', label: 'Class C' },
                ]}
              />
            </div>

            {/* Health Band Filter */}
            <div>
              <Select
                value={filterHealthBand}
                onValueChange={(v) => setFilterHealthBand(v)}
                className="w-full px-2 py-1.5 text-xs"
                options={[
                  { value: 'All', label: 'All Health' },
                  { value: 'Good', label: 'Optimal (>80%)' },
                  { value: 'Fair', label: 'Fair (50-80%)' },
                  { value: 'Poor', label: 'Poor (<50%)' },
                ]}
              />
            </div>

          </div>

          {/* Actual DataTable */}
          {filteredAssets.length > 0 ? (
            <div className="overflow-x-auto border border-border-custom/40 rounded-lg">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead>
                  <tr className="bg-surface-muted/30 border-b border-border-custom text-[10px] text-text-muted font-mono uppercase">
                    <th className="p-3">Machinery Tag</th>
                    <th className="p-3">Specification Name</th>
                    <th className="p-3">Class Type</th>
                    <th className="p-3">Crit</th>
                    <th className="p-3">Computed Health</th>
                    <th className="p-3">Diagnostic</th>
                    <th className="p-3">Last Maint</th>
                    <th className="p-3 text-center">Backlog</th>
                    <th className="p-3 text-right">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom/30 text-text-secondary">
                  {filteredAssets.map((asset) => {
                    const healthPct = asset.health;
                    const ringColor = healthPct >= 80 
                      ? 'stroke-status-ok' 
                      : healthPct >= 50 
                        ? 'stroke-status-warn' 
                        : 'stroke-status-critical';

                    const angle = 2 * Math.PI * 8; // r=8
                    const strokeOffset = angle - (healthPct / 100) * angle;

                    return (
                      <tr 
                        key={asset.id} 
                        onClick={() => window.location.hash = `#equipment/${asset.id}`}
                        className="hover:bg-background-custom/40 transition-colors cursor-pointer group"
                      >
                        {/* Prominent Tag */}
                        <td className="p-3 font-mono font-black text-text-primary group-hover:text-primary transition-colors select-all">
                          {asset.tag}
                        </td>

                        {/* Name */}
                        <td className="p-3 font-semibold text-text-primary">
                          <span className="truncate block max-w-[140px] md:max-w-[200px]" title={asset.name}>
                            {asset.name}
                          </span>
                        </td>

                        {/* Type */}
                        <td className="p-3 font-mono text-[10px] uppercase text-text-muted">
                          {asset.type}
                        </td>

                        {/* Criticality */}
                        <td className="p-3">
                          <span className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded ${
                            asset.criticality === 'A' ? 'bg-status-critical/15 text-status-critical' :
                            asset.criticality === 'B' ? 'bg-status-warn/15 text-status-warn' :
                            'bg-surface-muted text-text-secondary'
                          }`}>
                            {asset.criticality}
                          </span>
                        </td>

                        {/* Health Score Circular ring gauge */}
                        <td className="p-3">
                          <div className="flex items-center space-x-1.5">
                            
                            {/* Tiny Gauge */}
                            <svg className="w-5 h-5 transform -rotate-90 flex-shrink-0">
                              <circle cx="10" cy="10" r="8" fill="transparent" stroke="#1E293B" strokeWidth="2.5" />
                              <circle 
                                cx="10" 
                                cy="10" 
                                r="8" 
                                fill="transparent" 
                                stroke="currentColor" 
                                strokeWidth="2.5" 
                                strokeDasharray={angle}
                                strokeDashoffset={strokeOffset}
                                className={ringColor}
                              />
                            </svg>

                            <span className="font-mono font-bold text-text-primary text-[11px]">
                              {healthPct}%
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="p-3">
                          <span className={`w-2 h-2 rounded-full inline-block mr-1 ${
                            asset.status === 'ok' ? 'bg-status-ok' :
                            asset.status === 'warn' ? 'bg-status-warn' : 'bg-status-critical'
                          }`} />
                          <span className="font-mono text-[10px] uppercase">
                            {asset.status}
                          </span>
                        </td>

                        {/* Last Maint */}
                        <td className="p-3 font-mono text-[10px] text-text-secondary">
                          {asset.lastMaint}
                        </td>

                        {/* Open WOs */}
                        <td className="p-3 text-center">
                          <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                            asset.openWos > 0 
                              ? 'bg-status-critical/10 text-status-critical border border-status-critical/20' 
                              : 'bg-surface-muted/50 text-text-muted'
                          }`}>
                            {asset.openWos}
                          </span>
                        </td>

                        {/* Compliance Chip */}
                        <td className="p-3 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                            asset.compliance === 'compliant' ? 'bg-status-ok/10 text-status-ok border-status-ok/20' :
                            asset.compliance === 'gap' ? 'bg-status-critical/10 text-status-critical border-status-critical/20 animate-pulse' :
                            'bg-surface-muted/50 text-text-muted border-border-custom'
                          }`}>
                            {asset.compliance.toUpperCase()}
                          </span>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-16 text-center text-text-muted bg-background-custom/20 border border-dashed border-border-custom rounded-lg">
              <HelpCircle className="w-10 h-10 mx-auto mb-2 opacity-50 animate-bounce" />
              <p className="font-mono text-xs uppercase text-text-primary font-bold">No assets found</p>
              <p className="text-[11px] text-text-secondary mt-1">
                Try widening your drop-down filter metrics or clear the tag query search.
              </p>
              <button
                onClick={resetFilters}
                className="mt-4 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded font-mono text-[10px] font-bold cursor-pointer"
              >
                Reset Filter Parameters
              </button>
            </div>
          )}

        </div>

      </div>

      {/* ------------------------------------------------------------
          QR SCANNER MOBILE CAMERA STUB MODAL
          ------------------------------------------------------------ */}
      {isQrScannerOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col justify-between p-6 animate-in fade-in duration-300">
          
          <div className="flex justify-between items-center text-white">
            <span className="font-mono text-xs font-bold text-primary flex items-center">
              <Camera className="w-4 h-4 mr-1.5 animate-pulse" />
              <span>HMI HARDWARE BARCODE / QR SCANNER</span>
            </span>
            <button 
              onClick={() => setIsQrScannerOpen(false)} 
              className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            
            {/* Target Reticle box */}
            <div className="w-64 h-64 border-2 border-primary rounded-xl relative flex flex-col items-center justify-center shadow-2xl shadow-primary/20 overflow-hidden bg-zinc-900/50">
              
              {/* Animated laser scan lines */}
              <div className="absolute left-0 right-0 h-0.5 bg-primary top-0 animate-[scan_2.5s_ease-in-out_infinite]" />
              
              <QrCode className="w-16 h-16 text-primary/30" />
              
              <div className="absolute inset-0 border-4 border-black/80 pointer-events-none rounded-xl" />
              
              {/* Corner reticle decorations */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-primary" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-primary" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-primary" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-primary" />
              
              {qrScanStep === 'scanning' && (
                <span className="absolute bottom-4 font-mono text-[8px] text-primary tracking-widest animate-pulse">
                  ACQUIRING COGNITIVE FOCUS...
                </span>
              )}

              {qrScanStep === 'success' && (
                <div className="absolute inset-0 bg-status-ok/20 flex flex-col items-center justify-center text-status-ok font-mono font-bold text-xs space-y-1">
                  <CheckCircle2 className="w-8 h-8 animate-bounce" />
                  <span>TAG INDEXED: {scannedTag}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-text-secondary text-center max-w-xs font-mono">
              Position high-pressure warning plate, valve index card, or motor casing QR barcode within reticle lines.
            </p>

          </div>

          {/* Quick Mock Select Panel for Development testing */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg space-y-2.5">
            <span className="font-mono text-accent text-[10px] font-bold uppercase tracking-wider block">
              Simulate Barcode Hardware Signals:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {mockEquipmentAssets.map((asset) => (
                <button
                  key={asset.id}
                  disabled={qrScanStep === 'success'}
                  onClick={() => handleQrSelectScanMock(asset.id)}
                  className="p-2.5 rounded bg-background-custom border border-border-custom text-left hover:border-primary cursor-pointer transition-colors disabled:opacity-40"
                >
                  <strong className="font-mono text-[11px] text-text-primary block">
                    {asset.tag}
                  </strong>
                  <span className="text-[9px] text-text-muted truncate block">
                    {asset.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Add laser-scan keyframe animation directly via style block to support scanning look */}
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>

    </div>
  );
}

interface Meter {
  id: string;
  label: string;
  unit: string;
  normal_min: number;
  normal_max: number;
}

interface Reading {
  id: string;
  meterId: string;
  value: number;
  timestamp: string;
}

function EquipmentConditionTab({ equipmentId }: { equipmentId: string }) {
  const { hasPermission } = useAuthStore();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeterId, setSelectedMeterId] = useState<string>('vibration');
  const [timeRange, setTimeRange] = useState<string>('90d');
  
  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [newMeterId, setNewMeterId] = useState('vibration');
  const [newValue, setNewValue] = useState('');
  const [newTimestamp, setNewTimestamp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch meters and readings
  const fetchData = async () => {
    setLoading(true);
    try {
      const metersRes = await api.get<Meter[]>(`/equipment/${equipmentId}/meters`);
      setMeters(metersRes);
      
      const readingsRes = await api.get<Reading[]>(`/equipment/${equipmentId}/readings?meter=${selectedMeterId}&from=${timeRange}`);
      setReadings(readingsRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [equipmentId, selectedMeterId, timeRange]);

  // Open drawer
  const handleOpenDrawer = () => {
    setNewMeterId(selectedMeterId || (meters[0]?.id || 'vibration'));
    setNewValue('');
    setNewTimestamp(new Date().toISOString().substring(0, 16)); // format: YYYY-MM-DDTHH:MM
    setIsDrawerOpen(true);
  };

  // Submit manual reading
  const handleSubmitReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue || isNaN(Number(newValue))) {
      alert('Please enter a valid numeric value');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/equipment/${equipmentId}/readings`, {
        meterId: newMeterId,
        value: Number(newValue),
        timestamp: new Date(newTimestamp).toISOString()
      });
      
      setToastMessage('Reading recorded successfully!');
      setTimeout(() => setToastMessage(null), 3000);
      setIsDrawerOpen(false);
      
      // Refresh readings
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMeter = meters.find(m => m.id === selectedMeterId) || meters[0];

  // Format readings for charting
  const chartData = readings.map(r => ({
    timestamp: r.timestamp,
    dateLabel: new Date(r.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    timeLabel: new Date(r.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    value: r.value,
  }));

  // Check if readings trend is upward for demo story
  const isTrendingUp = chartData.length > 1 && 
    chartData[chartData.length - 1].value > chartData[0].value;

  const hasRecordPermission = hasPermission('readings.record');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-status-ok border border-status-ok/20 text-white px-4 py-3 rounded-lg shadow-xl flex items-center space-x-2 z-50 animate-bounce font-sans text-xs">
          <Check className="w-4 h-4 text-white bg-white/20 rounded-full p-0.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface border border-border-custom p-4 rounded-lg">
        {/* Meter Selector Chips */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">Select Active Meter Sensor:</span>
          <div className="flex flex-wrap gap-2">
            {meters.map(m => {
              const isActive = selectedMeterId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMeterId(m.id)}
                  className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-primary/10 border-primary text-primary' 
                      : 'bg-background-custom border-border-custom text-text-secondary hover:text-text-primary hover:border-border-custom/80'
                  }`}
                >
                  {m.label} ({m.unit})
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Range Selector & Action */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Range picker chips */}
          <div className="bg-background-custom border border-border-custom rounded-lg p-1 flex items-center space-x-1">
            {['7d', '30d', '90d'].map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded font-semibold transition-colors cursor-pointer ${
                  timeRange === range 
                    ? 'bg-surface-muted text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Record Reading Button */}
          {hasRecordPermission ? (
            <button
              onClick={handleOpenDrawer}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg font-mono text-xs font-bold cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>RECORD READING</span>
            </button>
          ) : (
            <div className="relative group">
              <button
                disabled
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-surface-muted border border-border-custom text-text-muted rounded-lg font-mono text-xs font-bold cursor-not-allowed"
              >
                <Plus className="w-4 h-4 opacity-50" />
                <span>RECORD READING</span>
              </button>
              <span className="absolute bottom-full right-0 mb-1 hidden group-hover:block bg-[#0B0F12] border border-border-custom text-text-muted text-[10px] font-mono px-2.5 py-1 rounded whitespace-nowrap shadow-xl">
                Requires readings.record permission
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Recharts Trend Line Chart */}
        <div className="lg:col-span-3 bg-surface border border-border-custom p-5 rounded-lg space-y-4">
          <div className="flex items-center justify-between border-b border-border-custom pb-3">
            <div className="flex items-center space-x-1.5">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                Telemetry Trend Log
              </h3>
            </div>
            {selectedMeter && (
              <div className="flex items-center space-x-4 text-[10px] font-mono">
                <span className="text-text-muted">
                  NORMAL RANGE: <strong className="text-text-primary">{selectedMeter.normal_min} - {selectedMeter.normal_max} {selectedMeter.unit}</strong>
                </span>
                {isTrendingUp && (
                  <span className="text-status-critical font-bold uppercase animate-pulse flex items-center space-x-1">
                    <span>▲ RETRO GRADE DEVIATION (ALERT)</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : chartData.length > 0 ? (
            <div className="h-80 font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#262F36" opacity={0.3} />
                  <XAxis 
                    dataKey="dateLabel" 
                    stroke="#5F7582" 
                    tick={{ fill: '#5F7582', fontSize: 10 }}
                    tickLine={{ stroke: '#262F36' }}
                  />
                  <YAxis 
                    stroke="#5F7582" 
                    tick={{ fill: '#5F7582', fontSize: 10 }}
                    tickLine={{ stroke: '#262F36' }}
                    domain={[
                      (dataMin: number) => Math.max(0, Math.floor(dataMin * 0.8)), 
                      (dataMax: number) => Math.ceil(dataMax * 1.2)
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111820',
                      border: '1px solid #23313D',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#8898A5', fontWeight: 'bold' }}
                    itemStyle={{ color: '#0E7C86' }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return `${payload[0].payload.dateLabel} @ ${payload[0].payload.timeLabel}`;
                      }
                      return label;
                    }}
                  />
                  <Legend />
                  
                  {/* Normal band reference area */}
                  {selectedMeter && (
                    <ReferenceArea
                      y1={selectedMeter.normal_min}
                      y2={selectedMeter.normal_max}
                      fill="#0E7C86"
                      fillOpacity={0.06}
                      stroke="none"
                    />
                  )}
                  {/* Min and Max limit reference lines */}
                  {selectedMeter && (
                    <ReferenceLine 
                      y={selectedMeter.normal_max} 
                      stroke="#EF4444" 
                      strokeDasharray="4 4" 
                      strokeWidth={1}
                      label={{ value: 'MAX ALERT', fill: '#EF4444', fontSize: 9, position: 'top' }}
                    />
                  )}
                  
                  <Line
                    name={selectedMeter?.label || 'Value'}
                    type="monotone"
                    dataKey="value"
                    stroke="#0E7C86"
                    strokeWidth={2.5}
                    dot={{ r: 1.5, stroke: '#0E7C86', strokeWidth: 1, fill: '#111820' }}
                    activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 1.5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex flex-col items-center justify-center border border-dashed border-border-custom rounded-lg">
              <Info className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-text-secondary text-xs">No readings found for this time interval.</p>
            </div>
          )}
        </div>

        {/* Right Column: Diagnostic Summary */}
        <div className="space-y-6">
          {/* Stats Card */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <div className="border-b border-border-custom pb-3">
              <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                Current Calibration Specs
              </h4>
            </div>

            {selectedMeter ? (
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-border-custom/30 font-mono font-semibold">
                  <span className="text-text-muted uppercase">Sensor Code</span>
                  <span className="text-text-primary font-bold">{selectedMeter.id}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-border-custom/30 font-mono font-semibold">
                  <span className="text-text-muted uppercase">Engineering Unit</span>
                  <span className="text-text-primary font-bold">{selectedMeter.unit}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-border-custom/30 font-mono font-semibold">
                  <span className="text-text-muted uppercase">Normal Lower Limit</span>
                  <span className="text-status-ok font-bold">{selectedMeter.normal_min} {selectedMeter.unit}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-border-custom/30 font-mono font-semibold">
                  <span className="text-text-muted uppercase">Normal Upper Limit</span>
                  <span className="text-status-critical font-bold">{selectedMeter.normal_max} {selectedMeter.unit}</span>
                </div>
                {chartData.length > 0 && (
                  <div className="flex justify-between items-center py-1.5 font-mono font-semibold">
                    <span className="text-text-muted uppercase">Latest Reading</span>
                    <span className={`font-black ${
                      chartData[chartData.length - 1].value > selectedMeter.normal_max || 
                      chartData[chartData.length - 1].value < selectedMeter.normal_min
                        ? 'text-status-critical'
                        : 'text-status-ok'
                    }`}>
                      {chartData[chartData.length - 1].value} {selectedMeter.unit}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-text-muted text-xs">Select a meter sensor to load specifications.</p>
            )}
          </div>

          {/* AI Insights Card */}
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <div className="flex items-center space-x-1.5 text-primary border-b border-border-custom pb-3">
              <Bot className="w-4 h-4" />
              <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                Telemetry Diagnostics
              </h4>
            </div>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              {isTrendingUp ? (
                <>
                  <strong className="text-text-primary block mb-1">ALERT: Persistent Upward Escalation</strong>
                  The calibration telemetry exhibits a steady 90-day upward drift that has now crossed the normal operating band. This is a classic indication of bearing fatigue, friction build-up, or misalignment. Schedule secondary verification.
                </>
              ) : (
                <>
                  <strong className="text-text-primary block mb-1">Nominal Telemetry Sequence</strong>
                  The telemetry is operating within normal, steady limits. No immediate secondary actions are required.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Record Reading Drawer/Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-sm flex items-center justify-end z-50 p-4 transition-all">
          <div className="fixed inset-0" onClick={() => setIsDrawerOpen(false)} />
          
          <div className="bg-surface border border-border-custom w-full max-w-md h-full rounded-l-xl shadow-2xl relative z-10 overflow-hidden font-sans flex flex-col justify-between">
            <div>
              <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                <div className="flex items-center space-x-2 text-primary">
                  <Activity className="w-4 h-4" />
                  <span className="font-mono font-bold text-xs uppercase text-text-primary">Record Manual Reading</span>
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)} 
                  className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitReading} className="p-5 space-y-4 text-xs">
                <div className="p-3 bg-primary/5 rounded border border-primary/20 font-mono text-[10px] text-text-secondary">
                  TARGET ASSET ID: <strong className="text-text-primary">{equipmentId}</strong>
                </div>

                {/* Meter Sensor Select */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Select Sensor Meter:</label>
                  <Select
                    value={newMeterId}
                    onValueChange={(v) => setNewMeterId(v)}
                    className="w-full px-3 py-2 font-mono"
                    options={meters.map(m => ({ value: m.id, label: `${m.label} (${m.unit})` }))}
                  />
                </div>

                {/* Value Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Sensor Reading Value:</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Enter measured value"
                      className="w-full pl-3 pr-16 py-2 bg-background-custom border border-border-custom rounded font-mono text-text-primary focus:outline-none focus:border-primary"
                    />
                    <span className="absolute right-3 top-2 font-mono text-text-muted font-bold">
                      {meters.find(m => m.id === newMeterId)?.unit}
                    </span>
                  </div>
                </div>

                {/* Timestamp Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-text-muted uppercase">Measurement Timestamp:</label>
                  <input
                    type="datetime-local"
                    required
                    value={newTimestamp}
                    onChange={(e) => setNewTimestamp(e.target.value)}
                    className="w-full px-3 py-2 bg-background-custom border border-border-custom rounded font-mono text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Action buttons */}
                <div className="pt-4 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom rounded font-mono text-xs font-bold text-text-secondary cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded font-mono text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'RECORDING...' : 'SAVE READING'}
                  </button>
                </div>
              </form>
            </div>

            <div className="p-4 bg-surface-muted/30 border-t border-border-custom/50 text-[10px] text-text-muted font-mono leading-relaxed">
              Recording manual measurements immediately updates the asset trend chart. Anomalies will feed directly into the predictive outage modeling algorithms.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Equipment360;
