import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { formatNumber } from '../../../lib/format';
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  MarkerType, 
  useReactFlow, 
  ReactFlowProvider,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  getBezierPath
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { 
  Wrench, FileText, AlertTriangle, Activity, ShieldCheck, User, Sliders, 
  ClipboardList, Lightbulb, Search, Filter, Layers, ZoomIn, ZoomOut, 
  Maximize2, Download, Info, ArrowUpRight, HelpCircle, X, Check, BookOpen, ChevronRight, Menu
} from 'lucide-react';
import { mockNodes, mockEdges, mockGraphStats, GraphNodeData, GraphEdgeData } from './mockData';
import { computeLayout, PositionedNode } from './layout';
import { api, USE_MOCK } from '../../../lib/api/client';
import { fetchStats, searchNodes, nodeCluster, seedCanvas } from './live';

// Seed node ids for the MOCK demo's focused view on P-101 (unchanged behavior).
const SEED_IDS = ['P-101', 'P-101-MOTOR', 'P-101-SEAL', 'P-101-IMPELLER', 'P-102', 'DOC-OEM-P101', 'DOC-PID-992', 'EV-2026-06', 'MODE-SEAL-FAIL', 'REG-OISD-118-C64', 'USER-PRIYA', 'PAR-SEAL-PRESS', 'LES-MONSOON'];

// Colors for node types (Colorblind-safe industrial theme palette)
const NODE_COLORS: Record<string, { bg: string; border: string; text: string; accent: string; dot: string }> = {
  Equipment: { bg: 'bg-[#0E7C86]/10', border: 'border-[#0E7C86]/50', text: 'text-[#0E7C86]', accent: '#0E7C86', dot: 'bg-[#0E7C86]' },
  Document: { bg: 'bg-[#3E7BFA]/10', border: 'border-[#3E7BFA]/50', text: 'text-[#3E7BFA]', accent: '#3E7BFA', dot: 'bg-[#3E7BFA]' },
  FailureEvent: { bg: 'bg-[#E5484D]/10', border: 'border-[#E5484D]/50', text: 'text-[#E5484D]', accent: '#E5484D', dot: 'bg-[#E5484D]' },
  FailureMode: { bg: 'bg-[#F5A524]/10', border: 'border-[#F5A524]/50', text: 'text-[#F5A524]', accent: '#F5A524', dot: 'bg-[#F5A524]' },
  Regulation: { bg: 'bg-[#8F3EFA]/10', border: 'border-[#8F3EFA]/50', text: 'text-[#8F3EFA]', accent: '#8F3EFA', dot: 'bg-[#8F3EFA]' },
  Person: { bg: 'bg-[#FA3E8F]/10', border: 'border-[#FA3E8F]/50', text: 'text-[#FA3E8F]', accent: '#FA3E8F', dot: 'bg-[#FA3E8F]' },
  Parameter: { bg: 'bg-[#10B981]/10', border: 'border-[#10B981]/50', text: 'text-[#10B981]', accent: '#10B981', dot: 'bg-[#10B981]' },
  Procedure: { bg: 'bg-[#059669]/10', border: 'border-[#059669]/50', text: 'text-[#059669]', accent: '#059669', dot: 'bg-[#059669]' },
  Lesson: { bg: 'bg-[#F59E0B]/10', border: 'border-[#F59E0B]/50', text: 'text-[#F59E0B]', accent: '#F59E0B', dot: 'bg-[#F59E0B]' }
};

const NODE_ICONS: Record<string, React.ComponentType<any>> = {
  Equipment: Wrench,
  Document: FileText,
  FailureEvent: AlertTriangle,
  FailureMode: Activity,
  Regulation: ShieldCheck,
  Person: User,
  Parameter: Sliders,
  Procedure: ClipboardList,
  Lesson: Lightbulb
};

// ----------------------------------------------------------------------------
// CUSTOM COMPONENT: REACT FLOW NODE
// ----------------------------------------------------------------------------
const CustomNodeComponent = ({ data, selected }: NodeProps) => {
  const nodeData = data.nodeData as GraphNodeData;
  const colors = NODE_COLORS[nodeData.type] || NODE_COLORS.Equipment;
  const Icon = NODE_ICONS[nodeData.type] || Wrench;

  return (
    <div className={`p-3 rounded-lg border bg-surface/90 backdrop-blur-md shadow-xl transition-all duration-300 min-w-[200px] max-w-[240px] text-left select-none ${
      selected ? 'ring-2 ring-primary border-primary scale-105 shadow-primary/10' : colors.border
    }`}>
      {/* Dynamic multi-handles for perfect layout wrapping */}
      <Handle type="target" position={Position.Top} className="opacity-60 bg-text-secondary !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="opacity-60 bg-text-secondary !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="opacity-60 bg-text-secondary !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="opacity-60 bg-text-secondary !w-2 !h-2" />

      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-border-custom/40">
        <div className="flex items-center space-x-1">
          <span className={`p-1 rounded ${colors.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
          </span>
          <span className="font-mono text-[9px] font-bold text-text-secondary uppercase tracking-wider">
            {nodeData.type}
          </span>
        </div>
        {nodeData.status && (
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              nodeData.status === 'ok' ? 'bg-[#2E9E5B]' :
              nodeData.status === 'warn' ? 'bg-[#F5A524]' : 'bg-[#E5484D]'
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              nodeData.status === 'ok' ? 'bg-[#2E9E5B]' :
              nodeData.status === 'warn' ? 'bg-[#F5A524]' : 'bg-[#E5484D]'
            }`}></span>
          </span>
        )}
      </div>

      <div className="text-xs font-semibold text-text-primary truncate mb-1">
        {nodeData.label}
      </div>

      {nodeData.properties['Asset Tag'] && (
        <span className="font-mono text-[9px] text-text-muted bg-surface-muted/60 px-1 py-0.5 rounded">
          {nodeData.properties['Asset Tag']}
        </span>
      )}
      {nodeData.properties['Failure Code'] && (
        <span className="font-mono text-[9px] text-[#E5484D] bg-[#E5484D]/10 px-1 py-0.5 rounded">
          {nodeData.properties['Failure Code']}
        </span>
      )}
    </div>
  );
};

// Registered Custom Node Type
const nodeTypes = {
  custom: CustomNodeComponent
};

// ----------------------------------------------------------------------------
// KNOWLEDGE GRAPH EXPLORER MAIN CONTENT
// ----------------------------------------------------------------------------
function KnowledgeGraphContent() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Layout selection
  const [layoutType, setLayoutType] = useState<'force' | 'hierarchical' | 'grid'>('force');

  // Interactive controls state
  const [depth, setDepth] = useState<number>(2);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    ['Equipment', 'Document', 'FailureEvent', 'FailureMode', 'Regulation', 'Person', 'Parameter', 'Procedure', 'Lesson']
  );
  const [selectedEdges, setSelectedEdges] = useState<string[]>(
    ['MENTIONS', 'PART_OF', 'FAILED_WITH', 'HAS_MODE', 'GOVERNED_BY', 'PERFORMED_BY', 'REFERENCES', 'APPLIES_TO', 'DERIVED_FROM']
  );

  // Active nodes & edges in the working canvas.
  // MOCK: seed a focused subset on P-101 synchronously (unchanged).
  // LIVE: start empty; the mount effect below fetches the seed cluster.
  const [currentNodes, setCurrentNodes] = useState<GraphNodeData[]>(() => {
    if (!USE_MOCK) return [];
    return mockNodes.filter(n => SEED_IDS.includes(n.id));
  });

  const [currentEdges, setCurrentEdges] = useState<GraphEdgeData[]>(() => {
    if (!USE_MOCK) return [];
    const ids = currentNodes.map(n => n.id);
    return mockEdges.filter(e => ids.includes(e.source) && ids.includes(e.target));
  });

  // Stats strip + per-type filter counts. MOCK uses the fixture; LIVE starts
  // zeroed (real for a new tenant) and the mount effect fills it from the backend.
  const EMPTY_GRAPH_STATS = { totalNodes: 0, totalEdges: 0, typesCount: 0, typesBreakdown: {} } as typeof mockGraphStats;
  const [stats, setStats] = useState(USE_MOCK ? mockGraphStats : EMPTY_GRAPH_STATS);

  // Loading indicator for LIVE fetches.
  const [loading, setLoading] = useState(false);

  // Selected state for drawers
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Search suggestions. MOCK derives synchronously from the fixture; LIVE fills
  // this from /graph/search as the query changes (effect below).
  const [liveSuggestions, setLiveSuggestions] = useState<GraphNodeData[]>([]);
  const mockSuggestions = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return mockNodes.filter(node =>
      (node.label || '').toLowerCase().includes(query) ||
      (node.type || '').toLowerCase().includes(query) ||
      Object.values(node.properties || {}).some(val => (val || '').toLowerCase().includes(query))
    );
  }, [searchQuery]);
  const filteredSearchSuggestions = USE_MOCK ? mockSuggestions : liveSuggestions;

  // LIVE only: seed the canvas + stats on mount.
  useEffect(() => {
    if (USE_MOCK) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [liveStats, seed] = await Promise.all([fetchStats(), seedCanvas()]);
        if (cancelled) return;
        setStats(liveStats);
        setCurrentNodes(seed.nodes);
        setCurrentEdges(seed.edges);
      } catch (err) {
        console.error('[KnowledgeGraph] failed to seed live graph', err);
        if (!cancelled) {
          setCurrentNodes([]);
          setCurrentEdges([]);
          setStats(EMPTY_GRAPH_STATS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // LIVE only: fetch search suggestions as the query changes.
  useEffect(() => {
    if (USE_MOCK) return;
    if (!searchQuery) { setLiveSuggestions([]); return; }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await searchNodes(searchQuery);
        if (!cancelled) setLiveSuggestions(results);
      } catch (err) {
        console.error('[KnowledgeGraph] search failed', err);
        if (!cancelled) setLiveSuggestions([]);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [searchQuery]);

  // Handle Mobile Width Detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Deep linking: Listen to Route/Hash updates
  // Supported format: #knowledge-graph/node/[id]
  useEffect(() => {
    const checkDeepLink = () => {
      const hash = window.location.hash;
      if (hash.includes('/node/')) {
        const parts = hash.split('/node/');
        const targetId = parts[1];

        if (!USE_MOCK) {
          // LIVE: load the node + its depth-1 neighbors from the backend.
          setLoading(true);
          nodeCluster(targetId)
            .then(({ nodes, edges, center }) => {
              setCurrentNodes(nodes);
              setCurrentEdges(edges);
              setSelectedNode(center);
              setTimeout(() => { fitView({ padding: 0.3, duration: 800 }); }, 400);
            })
            .catch(err => console.error('[KnowledgeGraph] deep-link load failed', err))
            .finally(() => setLoading(false));
          return;
        }

        const match = mockNodes.find(n => n.id === targetId);
        if (match) {
          // Found node deep link! Load node and its depth-1 neighbors
          const connectedEdges = mockEdges.filter(e => e.source === targetId || e.target === targetId);
          const neighborIds = new Set<string>([targetId]);
          connectedEdges.forEach(e => {
            neighborIds.add(e.source);
            neighborIds.add(e.target);
          });
          const nodesSubset = mockNodes.filter(n => neighborIds.has(n.id));
          setCurrentNodes(nodesSubset);
          setCurrentEdges(connectedEdges);
          setSelectedNode(match);

          // Smooth focus centering
          setTimeout(() => {
            fitView({ padding: 0.3, duration: 800 });
          }, 400);
        }
      }
    };
    checkDeepLink();
    window.addEventListener('hashchange', checkDeepLink);
    return () => window.removeEventListener('hashchange', checkDeepLink);
  }, [fitView]);

  // Map to React Flow Nodes & Edges format with layout positions
  const reactFlowNodes = useMemo(() => {
    // Filter active nodes by selected types
    const filteredNodes = currentNodes.filter(node => selectedTypes.includes(node.type));
    const finalNodes = computeLayout(filteredNodes, currentEdges, layoutType);

    return finalNodes.map(node => ({
      id: node.id,
      type: 'custom',
      position: node.position,
      data: { nodeData: node.data },
      style: { cursor: 'pointer' }
    }));
  }, [currentNodes, currentEdges, selectedTypes, layoutType]);

  const reactFlowEdges = useMemo(() => {
    // Filter edges by relationship type and active node ids
    const activeNodeIds = new Set(reactFlowNodes.map(n => n.id));
    return currentEdges
      .filter(edge => selectedEdges.includes(edge.label) && activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target))
      .map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'bezier',
        animated: edge.label === 'HAS_MODE' || edge.label === 'FAILED_WITH' || edge.label === 'APPLIES_TO',
        style: { 
          stroke: '#64748B', 
          strokeWidth: 1.5,
          opacity: 0.6
        },
        labelStyle: { 
          fill: '#94A3B8', 
          fontSize: 7, 
          fontFamily: 'JetBrains Mono', 
          fontWeight: 'bold',
          background: 'var(--surface)'
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: '#64748B',
        },
      }));
  }, [currentEdges, reactFlowNodes, selectedEdges]);

  // Handle Node Click
  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    const rawData = node.data.nodeData as GraphNodeData;
    setSelectedNode(rawData);
  }, []);

  // Double Click: Auto expand neighbors
  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: any) => {
    const rawData = node.data.nodeData as GraphNodeData;
    expandNeighbors(rawData.id);
  }, [currentNodes]);

  // Expand Neighbors Method (Merges connected graph pieces)
  const expandNeighbors = useCallback((nodeId: string) => {
    if (!USE_MOCK) {
      // LIVE: fetch the node's cluster from the backend and merge it in.
      setLoading(true);
      nodeCluster(nodeId)
        .then(({ nodes: clusterNodes, edges: clusterEdges }) => {
          setCurrentNodes(prev => {
            const existing = new Set(prev.map(n => n.id));
            const merged = [...prev, ...clusterNodes.filter(n => !existing.has(n.id))];
            const activeIds = new Set(merged.map(n => n.id));
            setCurrentEdges(prevEdges => {
              const seenEdge = new Set(prevEdges.map(e => e.id));
              const newEdges = clusterEdges.filter(
                e => !seenEdge.has(e.id) && activeIds.has(e.source) && activeIds.has(e.target)
              );
              return [...prevEdges, ...newEdges];
            });
            return merged;
          });
          setTimeout(() => { fitView({ padding: 0.2, duration: 600 }); }, 100);
        })
        .catch(err => console.error('[KnowledgeGraph] expand failed', err))
        .finally(() => setLoading(false));
      return;
    }

    // Find all edges connected to nodeId in complete database
    const relatedEdges = mockEdges.filter(e => e.source === nodeId || e.target === nodeId);
    const relatedNodeIds = new Set<string>();
    relatedEdges.forEach(e => {
      relatedNodeIds.add(e.source);
      relatedNodeIds.add(e.target);
    });

    // Filter missing nodes to bring them onto the canvas
    const currentIds = new Set(currentNodes.map(n => n.id));
    const newNodesToAppend = mockNodes.filter(n => relatedNodeIds.has(n.id) && !currentIds.has(n.id));
    
    if (newNodesToAppend.length === 0) {
      // Already fully expanded local cluster
      return;
    }

    setCurrentNodes(prev => [...prev, ...newNodesToAppend]);
    setCurrentEdges(prev => {
      // Find new edges to merge
      const activeIds = new Set([...currentNodes, ...newNodesToAppend].map(n => n.id));
      return mockEdges.filter(e => activeIds.has(e.source) && activeIds.has(e.target));
    });

    // Auto layout and center viewport
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 600 });
    }, 100);
  }, [currentNodes, fitView]);

  // Search Suggestion Selected
  const handleSelectSuggestion = (node: GraphNodeData) => {
    if (!USE_MOCK) {
      // LIVE: pull the node's cluster (node + neighbors + edges) and merge it in.
      setSelectedNode(node);
      setSearchQuery('');
      setShowSearchDropdown(false);
      setLoading(true);
      nodeCluster(node.id)
        .then(({ nodes: clusterNodes, edges: clusterEdges, center }) => {
          setCurrentNodes(prev => {
            const existing = new Set(prev.map(n => n.id));
            const merged = [...prev, ...clusterNodes.filter(n => !existing.has(n.id))];
            const activeIds = new Set(merged.map(n => n.id));
            setCurrentEdges(prevEdges => {
              const seenEdge = new Set(prevEdges.map(e => e.id));
              const newEdges = clusterEdges.filter(
                e => !seenEdge.has(e.id) && activeIds.has(e.source) && activeIds.has(e.target)
              );
              return [...prevEdges, ...newEdges];
            });
            return merged;
          });
          setSelectedNode(center);
          setTimeout(() => { fitView({ padding: 0.2, duration: 800 }); }, 200);
        })
        .catch(err => console.error('[KnowledgeGraph] suggestion load failed', err))
        .finally(() => setLoading(false));
      return;
    }

    // Check if node is in current working canvas, if not add it
    const alreadyExists = currentNodes.some(n => n.id === node.id);
    if (!alreadyExists) {
      setCurrentNodes(prev => [...prev, node]);
      // Recalculate edges that connect it to existing nodes
      setCurrentEdges(prev => {
        const activeIds = new Set([...currentNodes, node].map(n => n.id));
        return mockEdges.filter(e => activeIds.has(e.source) && activeIds.has(e.target));
      });
    }

    setSelectedNode(node);
    setSearchQuery('');
    setShowSearchDropdown(false);

    // Dynamic focus centering in React Flow
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 800 });
    }, 200);
  };

  // Reset Graph Canvas to Seed Elements
  const handleResetCanvas = () => {
    setSelectedNode(null);
    if (!USE_MOCK) {
      // LIVE: re-fetch the seed cluster from the backend.
      setLoading(true);
      seedCanvas()
        .then(seed => {
          setCurrentNodes(seed.nodes);
          setCurrentEdges(seed.edges);
          setTimeout(() => { fitView({ padding: 0.2, duration: 600 }); }, 100);
        })
        .catch(err => console.error('[KnowledgeGraph] reset failed', err))
        .finally(() => setLoading(false));
      return;
    }
    const nodesSubset = mockNodes.filter(n => SEED_IDS.includes(n.id));
    setCurrentNodes(nodesSubset);
    setCurrentEdges(mockEdges.filter(e => SEED_IDS.includes(e.source) && SEED_IDS.includes(e.target)));
  };

  // Export Canvas as PNG Function
  const handleExportPNG = () => {
    const element = document.querySelector('.react-flow') as HTMLElement;
    if (!element) return;

    // Hide controls and minimap temporarily for clean capture
    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    const minimap = document.querySelector('.react-flow__minimap') as HTMLElement;
    if (controls) controls.style.visibility = 'hidden';
    if (minimap) minimap.style.visibility = 'hidden';

    toPng(element, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0B0F12',
      style: {
        transform: 'scale(1)',
      },
      width: element.offsetWidth,
      height: element.offsetHeight,
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `indusmind-knowledge-graph-${new Date().toISOString().split('T')[0]}.png`;
        link.href = dataUrl;
        link.click();

        // Restore UI components
        if (controls) controls.style.visibility = 'visible';
        if (minimap) minimap.style.visibility = 'visible';
      })
      .catch((err) => {
        console.error('Error rendering PNG export:', err);
        if (controls) controls.style.visibility = 'visible';
        if (minimap) minimap.style.visibility = 'visible';
      });
  };

  // Redirections and Actions inside Drawer
  const handleOpenAssetOrDoc = (node: GraphNodeData) => {
    if (node.type === 'Equipment') {
      window.location.hash = '#equipment';
    } else if (node.type === 'Document') {
      window.location.hash = '#documents';
    }
  };

  const handleAskCopilot = (node: GraphNodeData) => {
    // Generate an intelligent compliance prompt matching the node properties
    const prompt = `Analyze entity node [${node.label}] of type [${node.type}]. Here are its details: ${JSON.stringify(node.properties)}. Please provide safety checks, OISD code guidance, or preventive actions.`;
    localStorage.setItem('copilot_preseed_prompt', prompt);
    window.location.hash = '#copilot';
  };

  // Filter handlers
  const toggleNodeType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleEdgeType = (label: string) => {
    setSelectedEdges(prev => 
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden font-sans bg-background-custom text-text-primary">
      
      {/* ----------------------------------------------------------------------
          LEFT CONTROL PANEL
          ---------------------------------------------------------------------- */}
      <div className="w-full lg:w-80 bg-surface border-b lg:border-b-0 lg:border-r border-border-custom flex flex-col h-1/3 lg:h-full relative z-20">
        
        {/* Header Stats Strip */}
        <div className="p-4 border-b border-border-custom bg-surface-muted/30">
          <h2 className="font-display text-lg font-bold text-text-primary tracking-tight flex items-center space-x-1.5">
            <Layers className="w-5 h-5 text-primary" />
            <span>Knowledge Graph</span>
          </h2>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Dynamic entity mapping engine over refinery corpus documents.
          </p>

          {/* Prominent Demo Stats Strip */}
          <div className="mt-3 grid grid-cols-3 gap-2 py-2 px-3 bg-background-custom/80 border border-border-custom rounded font-mono text-[10px]">
            <div>
              <span className="text-text-muted block uppercase">Nodes</span>
              <span className="text-text-primary font-bold text-xs">{formatNumber(stats.totalNodes)}</span>
            </div>
            <div className="border-l border-border-custom/60 pl-2">
              <span className="text-text-muted block uppercase">Edges</span>
              <span className="text-text-primary font-bold text-xs">{formatNumber(stats.totalEdges)}</span>
            </div>
            <div className="border-l border-border-custom/60 pl-2">
              <span className="text-text-muted block uppercase">Types</span>
              <span className="text-text-primary font-bold text-xs">{stats.typesCount}</span>
            </div>
          </div>
        </div>

        {/* Filters Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          
          {/* Node Search Bar */}
          <div className="relative">
            <span className="block text-[10px] font-mono font-bold text-text-secondary uppercase mb-1.5">Search Graph Node</span>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                placeholder="Search tags, documents, events..."
                className="w-full bg-surface-muted border border-border-custom rounded-md py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSearchDropdown && suggestionsDropdown(filteredSearchSuggestions, handleSelectSuggestion, () => setShowSearchDropdown(false))}
          </div>

          {/* Node Types Filters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-border-custom/50 pb-1">
              <span className="font-mono text-[10px] font-bold text-text-secondary uppercase">Entity Classes</span>
              <button 
                onClick={() => setSelectedTypes(selectedTypes.length === 9 ? [] : ['Equipment', 'Document', 'FailureEvent', 'FailureMode', 'Regulation', 'Person', 'Parameter', 'Procedure', 'Lesson'])}
                className="text-[9px] font-mono text-primary hover:underline"
              >
                Toggle All
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
              {Object.keys(NODE_COLORS).map(type => {
                const count = stats.typesBreakdown[type as keyof typeof stats.typesBreakdown] || 0;
                const active = selectedTypes.includes(type);
                const colors = NODE_COLORS[type];
                return (
                  <label key={type} className="flex items-center justify-between p-1 rounded hover:bg-surface-muted/50 cursor-pointer">
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={active}
                        onChange={() => toggleNodeType(type)}
                        className="rounded border-border-custom text-primary focus:ring-primary/40 bg-background-custom w-3.5 h-3.5"
                      />
                      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                      <span className="text-text-primary text-[11px] font-mono font-medium">{type}</span>
                    </div>
                    <span className="font-mono text-[9px] text-text-muted bg-background-custom px-1.5 py-0.5 rounded">
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Relationship Edge Filters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-border-custom/50 pb-1">
              <span className="font-mono text-[10px] font-bold text-text-secondary uppercase">Relations (Edges)</span>
              <button 
                onClick={() => setSelectedEdges(selectedEdges.length === 9 ? [] : ['MENTIONS', 'PART_OF', 'FAILED_WITH', 'HAS_MODE', 'GOVERNED_BY', 'PERFORMED_BY', 'REFERENCES', 'APPLIES_TO', 'DERIVED_FROM'])}
                className="text-[9px] font-mono text-primary hover:underline"
              >
                Toggle All
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-[120px] overflow-y-auto pr-1">
              {['MENTIONS', 'PART_OF', 'FAILED_WITH', 'HAS_MODE', 'GOVERNED_BY', 'PERFORMED_BY', 'REFERENCES', 'APPLIES_TO', 'DERIVED_FROM'].map(label => {
                const active = selectedEdges.includes(label);
                return (
                  <label key={label} className="flex items-center space-x-1.5 p-1 rounded hover:bg-surface-muted/50 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={active}
                      onChange={() => toggleEdgeType(label)}
                      className="rounded border-border-custom text-primary focus:ring-primary/40 bg-background-custom w-3 h-3"
                    />
                    <span className="text-text-secondary text-[10px] font-mono font-semibold truncate" title={label}>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Depth Slider */}
          <div className="space-y-1.5 pt-2 border-t border-border-custom">
            <div className="flex justify-between items-center text-text-secondary font-mono text-[10px]">
              <span className="font-bold uppercase">Neighbor Load Depth</span>
              <span className="text-primary font-bold">Hops: {depth}</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="3" 
              value={depth} 
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-surface-muted rounded-lg appearance-none cursor-pointer accent-primary" 
            />
            <div className="flex justify-between text-[8px] font-mono text-text-muted">
              <span>1 (Direct Only)</span>
              <span>2 (Extended)</span>
              <span>3 (Global Story)</span>
            </div>
          </div>

          {/* Reset / Clean State Action */}
          <button
            onClick={handleResetCanvas}
            className="w-full mt-2 py-1.5 border border-border-custom hover:bg-surface-muted bg-surface text-text-primary text-xs font-semibold rounded cursor-pointer transition-colors"
          >
            Reset Working Canvas
          </button>

        </div>
      </div>

      {/* ----------------------------------------------------------------------
          MIDDLE FLOW CHART CANVAS AREA
          ---------------------------------------------------------------------- */}
      <div className="flex-1 h-2/3 lg:h-full relative bg-bg flex flex-col">
        
        {/* Top Control Bar inside canvas */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 pointer-events-auto">
          {/* Layout Pickers */}
          <div className="bg-surface/90 backdrop-blur-md border border-border-custom px-2 py-1.5 rounded-lg shadow-2xl flex items-center space-x-1">
            <span className="text-[10px] font-mono font-bold text-text-muted mr-1.5">LAYOUT:</span>
            <button
              onClick={() => setLayoutType('force')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                layoutType === 'force' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Organic
            </button>
            <button
              onClick={() => setLayoutType('hierarchical')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                layoutType === 'hierarchical' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Hierarchical
            </button>
            <button
              onClick={() => setLayoutType('grid')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                layoutType === 'grid' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Grid
            </button>
          </div>

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            className="flex items-center space-x-1.5 bg-surface/90 backdrop-blur-md border border-border-custom hover:bg-surface-muted px-3 py-1.5 rounded-lg shadow-2xl text-xs font-semibold text-text-primary transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export PNG</span>
          </button>
        </div>

        {/* Legend Panel (Floating Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-10 bg-surface/90 backdrop-blur-md border border-border-custom p-3 rounded-lg shadow-2xl max-w-xs text-[10px] hidden sm:block pointer-events-none">
          <span className="font-mono font-bold text-text-secondary uppercase block mb-1">Interactive Legend</span>
          <p className="text-text-muted mb-2">Double-click a node to fetch neighbor nodes dynamically.</p>
          <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E5B]" />
              <span className="text-text-secondary">Normal State</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5A524]" />
              <span className="text-text-secondary">Warning Node</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5484D]" />
              <span className="text-text-secondary">Critical Node</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3E7BFA]" />
              <span className="text-text-secondary">Information Link</span>
            </div>
          </div>
        </div>

        {/* Programmatic Zooms and Fit-View Controls */}
        <div className="absolute right-4 top-4 z-10 flex flex-col space-y-1.5 pointer-events-auto">
          <button onClick={() => zoomIn()} className="p-2 bg-surface/90 border border-border-custom rounded-lg hover:bg-surface-muted text-text-primary shadow-2xl transition-all" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => zoomOut()} className="p-2 bg-surface/90 border border-border-custom rounded-lg hover:bg-surface-muted text-text-primary shadow-2xl transition-all" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => fitView()} className="p-2 bg-surface/90 border border-border-custom rounded-lg hover:bg-surface-muted text-text-primary shadow-2xl transition-all" title="Fit View">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* React Flow Core Engine */}
        <div className="flex-1 w-full h-full relative z-0">
          {loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-surface/90 backdrop-blur-md border border-border-custom px-3 py-1.5 rounded-lg shadow-2xl pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span className="text-[10px] font-mono font-bold text-text-secondary uppercase tracking-wider">Loading graph…</span>
            </div>
          )}
          <ReactFlow
            nodes={reactFlowNodes}
            edges={reactFlowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodesDraggable={!isMobile} // Disable node dragging on mobile so pan/zoom is seamless
            nodesConnectable={false}
            elementsSelectable={true}
            fitView
            className="font-sans"
          >
            <MiniMap 
              position="bottom-right" 
              className="!bg-surface border border-border-custom !rounded-lg overflow-hidden hidden md:block" 
              nodeColor={(node: any) => {
                const nodeData = node.data?.nodeData as GraphNodeData;
                if (!nodeData) return '#64748B';
                return NODE_COLORS[nodeData.type]?.accent || '#64748B';
              }}
              maskColor="rgba(127, 127, 127, 0.18)"
            />
            <Background color="var(--border-strong)" gap={18} size={1} />
          </ReactFlow>
        </div>
      </div>

      {/* ----------------------------------------------------------------------
          RIGHT COMPLIANCE DRAWER (Bottom Sheet on Mobile)
          ---------------------------------------------------------------------- */}
      {selectedNode ? (
        <div className={`bg-surface border-t md:border-t-0 md:border-l border-border-custom flex flex-col z-30 transition-all duration-300 ${
          isMobile 
            ? 'fixed bottom-0 left-0 right-0 h-[45vh] rounded-t-xl shadow-2xl' 
            : 'w-full lg:w-96 h-full shadow-2xl relative'
        }`}>
          {/* Drawer Header */}
          <div className="p-4 border-b border-border-custom flex items-center justify-between bg-surface-muted/20">
            <div className="flex items-center space-x-2">
              <span className={`p-1.5 rounded ${NODE_COLORS[selectedNode.type]?.bg}`}>
                {React.createElement(NODE_ICONS[selectedNode.type] || Wrench, { className: `w-4 h-4 ${NODE_COLORS[selectedNode.type]?.text}` })}
              </span>
              <div>
                <span className="font-mono text-[9px] font-bold text-text-muted uppercase tracking-wider block">
                  {selectedNode.type} Entity
                </span>
                <h3 className="font-display font-bold text-text-primary text-sm truncate max-w-[200px]" title={selectedNode.label}>
                  {selectedNode.label}
                </h3>
              </div>
            </div>
            <button 
              onClick={() => setSelectedNode(null)}
              className="p-1 rounded-full border border-border-custom/80 hover:bg-surface-muted text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Meta ID Table */}
            <div className="bg-background-custom/80 border border-border-custom rounded p-2.5">
              <span className="block text-[9px] font-mono text-text-muted uppercase mb-1">Global Knowledge Identifier</span>
              <span className="font-mono text-[10px] text-text-primary bg-surface-muted px-2 py-1 rounded border border-border-custom/50 block select-all">
                indus:ent:{selectedNode.id.toLowerCase()}
              </span>
            </div>

            {/* Properties Table */}
            <div className="space-y-1.5">
              <span className="block text-[9px] font-mono text-text-muted uppercase tracking-wider font-bold">Metadata Properties</span>
              <div className="border border-border-custom rounded-md overflow-hidden bg-background-custom/40">
                <table className="w-full text-left font-sans text-xs">
                  <tbody>
                    {Object.entries(selectedNode.properties).map(([key, val]) => (
                      <tr key={key} className="border-b border-border-custom/50 last:border-b-0 hover:bg-surface-muted/30 transition-colors">
                        <td className="p-2 font-mono text-[10px] text-text-secondary bg-surface-muted/10 border-r border-border-custom/40 w-1/3 truncate" title={key}>
                          {key}
                        </td>
                        <td className="p-2 text-text-primary font-medium font-mono text-[10px] break-words">
                          {val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Connected Documents lists if matching */}
            {selectedNode.connectedDocs && selectedNode.connectedDocs.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-[9px] font-mono text-text-muted uppercase tracking-wider font-bold">Associated Files & Artifacts</span>
                <div className="space-y-1">
                  {selectedNode.connectedDocs.map((doc, idx) => (
                    <a
                      key={idx}
                      href={doc.url}
                      className="flex items-center justify-between p-2 rounded border border-border-custom bg-surface hover:border-primary/50 text-text-secondary hover:text-text-primary transition-all text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-[#3E7BFA]" />
                        <span className="truncate max-w-[200px] text-[11px] font-mono">{doc.name}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* AI Core Insight (Dynamic based on Type) */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-md space-y-1.5">
              <span className="font-mono text-[9px] text-primary uppercase font-bold flex items-center space-x-1">
                <Info className="w-3 h-3" />
                <span>Knowledge Graph Context</span>
              </span>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                {selectedNode.type === 'Equipment' && "This physical asset acts as a key industrial hub. It is governed by OISD parameters and cross-referenced inside P&ID drawing archives."}
                {selectedNode.type === 'Document' && "Extracted unstructured PDF dossier. IndusMind ingested and mapped this artifact into Neo4j using zero-shot semantic parsing models."}
                {selectedNode.type === 'FailureEvent' && "Active system incident node. Linked immediately to technical failure modes, relevant standards, and millwright work logs."}
                {selectedNode.type === 'FailureMode' && "FMEA-classified root degradation pattern. Preventive maintenance shims are derived directly from lessons learned on this node."}
                {selectedNode.type === 'Regulation' && "Statutory directive. Non-compliance risks of mechanical equipment seals are cross-referenced with this statutory node."}
                {selectedNode.type === 'Person' && "Designated refinery maintenance and compliance engineer. Authorized to log overrides and clear work orders."}
                {selectedNode.type === 'Parameter' && "SCADA/DCS sensor tag. Telemetry trends are automatically cross-checked against statutory alarm levels."}
                {selectedNode.type === 'Procedure' && "SOP checklist node. Governs physical startup alignments, flushing plans, and dynamic valve tests."}
                {selectedNode.type === 'Lesson' && "Historical operating experience. Highly recommended precaution before commissioning active rotating equipment nodes."}
              </p>
            </div>

          </div>

          {/* Drawer Actions Footer */}
          <div className="p-4 border-t border-border-custom bg-surface-muted/10 space-y-2">
            <button
              onClick={() => expandNeighbors(selectedNode.id)}
              className="w-full py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded cursor-pointer transition-colors flex items-center justify-center space-x-1.5"
            >
              <Layers className="w-4 h-4" />
              <span>Expand Node Neighbors</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleOpenAssetOrDoc(selectedNode)}
                disabled={selectedNode.type !== 'Equipment' && selectedNode.type !== 'Document'}
                className="py-1.5 border border-border-custom hover:bg-surface bg-surface-muted/50 text-text-primary disabled:opacity-40 disabled:hover:bg-transparent text-xs font-semibold rounded cursor-pointer transition-colors flex items-center justify-center space-x-1"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Open 360°/Doc</span>
              </button>
              <button
                onClick={() => handleAskCopilot(selectedNode)}
                className="py-1.5 border border-border-custom hover:bg-surface bg-surface-muted/50 text-text-primary text-xs font-semibold rounded cursor-pointer transition-colors flex items-center justify-center space-x-1"
              >
                <span>Ask Copilot</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex w-80 bg-surface border-l border-border-custom flex-col items-center justify-center text-center p-6 relative z-10">
          <div className="p-4 rounded-full bg-surface-muted/40 mb-3 border border-border-custom">
            <HelpCircle className="w-8 h-8 text-text-muted animate-pulse" />
          </div>
          <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-1">Select a Node</h4>
          <p className="text-xs text-text-secondary leading-relaxed">
            Click any entity node inside the active canvas control room to load metadata profiles, linked documents, and compliance records.
          </p>
        </div>
      )}

    </div>
  );
}

// ----------------------------------------------------------------------------
// Suggestions Dropdown Helper Component
// ----------------------------------------------------------------------------
function suggestionsDropdown(
  suggestions: GraphNodeData[],
  onSelect: (node: GraphNodeData) => void,
  onClose: () => void
) {
  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose} 
      />
      <div className="absolute left-0 right-0 mt-1.5 bg-surface border border-border-custom rounded-lg shadow-2xl max-h-[220px] overflow-y-auto z-50">
        {suggestions.length === 0 ? (
          <div className="p-3 text-text-muted text-center font-mono text-[10px]">
            No matching nodes found.
          </div>
        ) : (
          <div className="py-1">
            {suggestions.map((node) => {
              const Icon = NODE_ICONS[node.type] || Wrench;
              const colors = NODE_COLORS[node.type];
              return (
                <button
                  key={node.id}
                  onClick={() => onSelect(node)}
                  className="w-full text-left px-3 py-2 hover:bg-surface-muted border-b border-border-custom/30 last:border-b-0 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className={`p-1 rounded ${colors.bg}`}>
                      <Icon className={`w-3 h-3 ${colors.text}`} />
                    </span>
                    <div className="truncate">
                      <span className="text-text-primary text-[11px] font-semibold block truncate">
                        {node.label}
                      </span>
                      <span className="text-text-muted text-[9px] font-mono uppercase block">
                        {node.type} • ID: {node.id}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export function KnowledgeGraphExplorer() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphContent />
    </ReactFlowProvider>
  );
}
