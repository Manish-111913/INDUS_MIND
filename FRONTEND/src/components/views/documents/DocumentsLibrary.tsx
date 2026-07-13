import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Search, Download, Plus, Check, ArrowRight, Sparkles, Filter, 
  ExternalLink, RefreshCw, Upload, CheckCircle, AlertTriangle, FileCheck, 
  Info, User, Layers, HelpCircle, Grid, List, ChevronLeft, ChevronRight, 
  Trash2, Tag, Calendar, FileType, CheckSquare, Square, X, ChevronDown, Clock, Eye,
  ShieldCheck, ZoomIn, ZoomOut, RotateCw, RotateCcw, EyeOff, MessageSquare, Share2, Send, History
} from 'lucide-react';
import {
  StatusChip, ConfidenceBadge, SkeletonLoader, EmptyState, ErrorState, Can, Select
} from '../../shared';
import { useAuthStore } from '../../../stores/authStore';
import { api, getStoredDocuments } from '../../../lib/api/client';
import { DocumentFile, ExtractedEntity } from '../../../types';
import { getDocumentDetails, OverlayEntity, LinkedEquipment, DocVersion, RelatedDoc, DocComment } from './mockDetailsData';
import { formatDate } from '../../../lib/format';

export function DocumentsLibrary() {
  const { user } = useAuthStore();
  const [currentHash, setCurrentHash] = useState(() => window.location.hash);

  // Sync hash changes internally
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sub-routing determination
  const isUploadView = currentHash === '#documents/upload';
  const isDetailView = !isUploadView && currentHash.startsWith('#documents/') && currentHash !== '#documents';
  const detailId = isDetailView ? currentHash.replace('#documents/', '') : null;

  if (isUploadView) {
    return <DocumentsUploadWorkspace />;
  }

  if (isDetailView && detailId) {
    return <DocumentDetailsExplorer docId={detailId} />;
  }

  return <DocumentsLibraryTableAndGrid />;
}

// ============================================================================
// 1. MAIN DOCUMENTS LIBRARY (TABLE / GRID VIEW WITH FILTERS)
// ============================================================================
function DocumentsLibraryTableAndGrid() {
  // Filters state
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedPlant, setSelectedPlant] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination & Sorting state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // View mode
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Multi-select bulk action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Dynamic lookups state
  const [lookups, setLookups] = useState<Record<string, string[]>>({
    doc_types: [],
    plants: [],
    areas: [],
    tags: [],
    statuses: []
  });

  // Loaded documents
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  // Fetch Lookups on Mount
  useEffect(() => {
    async function loadLookups() {
      try {
        const [doc_types, plants, areas, tags, statuses] = await Promise.all([
          api.get<string[]>('/lookups/doc_types'),
          api.get<string[]>('/lookups/plants'),
          api.get<string[]>('/lookups/areas'),
          api.get<string[]>('/lookups/tags'),
          api.get<string[]>('/lookups/statuses')
        ]);
        setLookups({ doc_types, plants, areas, tags, statuses });
      } catch (err) {
        console.error('Error loading lookups', err);
      }
    }
    loadLookups();
  }, []);

  // Fetch Documents with Pagination, Filter & Sort params
  const fetchDocuments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        search,
        doc_type: selectedType,
        status: selectedStatus,
        tag: selectedTag,
        plant: selectedPlant,
        area: selectedArea,
        sort_by: sortBy,
        sort_order: sortOrder
      });

      // Fetch
      const response = await api.get<any>(`/documents?${queryParams.toString()}`);
      
      // Real pagination envelope
      const rawDocs = Array.isArray(response) ? response : (response?.data || []);
      // Normalize each doc so fields the table renders are always defined. Older/uploaded
      // records in localStorage may be missing `tags`, `plant`, `uploader`, etc., which would
      // crash the render (e.g. `doc.tags.map`, `doc.plant.split`, `doc.uploader.toUpperCase`).
      const normalizedDocs = (rawDocs as DocumentFile[]).map((d) => ({
        ...d,
        tags: Array.isArray(d?.tags) ? d.tags : [],
        name: d?.name ?? 'Untitled Document',
        type: d?.type ?? 'Unknown',
        plant: d?.plant ?? '',
        area: d?.area ?? '',
        uploader: d?.uploader ?? 'Unknown',
        status: d?.status ?? 'pending',
        content: d?.content ?? '',
      }));
      setDocuments(normalizedDocs as DocumentFile[]);
      // In simulateNetworkCall we wrap in response, let's verify if response has a meta or if we need to get total from local DB length
      const fullDocs = getStoredDocuments();
      
      // Let's perform local filtering counts for meta total if needed, or fallback
      let filteredCount = fullDocs.length;
      if (search || selectedType || selectedStatus || selectedTag || selectedPlant || selectedArea) {
        let f = [...fullDocs];
        if (search) {
          f = f.filter(d => d && ((d.name || '').toLowerCase().includes((search || '').toLowerCase()) || (d.content || '').toLowerCase().includes((search || '').toLowerCase())));
        }
        if (selectedType) f = f.filter(d => d.type === selectedType);
        if (selectedStatus) f = f.filter(d => d.status === selectedStatus);
        if (selectedTag) f = f.filter(d => (d.tags || []).includes(selectedTag));
        if (selectedPlant) f = f.filter(d => d.plant === selectedPlant);
        if (selectedArea) f = f.filter(d => d.area === selectedArea);
        filteredCount = f.length;
      }
      setTotalCount(filteredCount);
    } catch (err: any) {
      setError(err?.error?.message || 'Failed to fetch vault repository files.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [page, pageSize, search, selectedType, selectedStatus, selectedTag, selectedPlant, selectedArea, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === documents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(documents.map(d => d.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Bulk Actions
  const handleBulkReprocess = async () => {
    try {
      await api.post('/documents/bulk-action', {
        action: 'reprocess',
        ids: selectedIds
      });
      setSelectedIds([]);
      fetchDocuments();
      alert(`AI Core reprocess triggered for ${selectedIds.length} file blocks successfully.`);
    } catch (err) {
      alert('Error triggering bulk reprocess.');
    }
  };

  const handleBulkAddTags = async () => {
    if (!bulkTagInput.trim()) return;
    try {
      await api.post('/documents/bulk-action', {
        action: 'add-tags',
        ids: selectedIds,
        payload: [bulkTagInput.trim().toUpperCase()]
      });
      setBulkTagInput('');
      setIsBulkTagOpen(false);
      setSelectedIds([]);
      fetchDocuments();
      alert('Equipment tags added to selected documents safely.');
    } catch (err) {
      alert('Error adding bulk tags.');
    }
  };

  const handleBulkDelete = async () => {
    try {
      await api.post('/documents/bulk-action', {
        action: 'delete',
        ids: selectedIds
      });
      setIsDeleteConfirmOpen(false);
      setSelectedIds([]);
      setPage(1);
      fetchDocuments();
      alert('Documents expunged from the vault securely.');
    } catch (err) {
      alert('Error expunging selected files.');
    }
  };

  const handleExportMetadata = () => {
    const selectedDocs = documents.filter(d => selectedIds.includes(d.id));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedDocs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `indusmind_metadata_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setSelectedIds([]);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedType('');
    setSelectedStatus('');
    setSelectedTag('');
    setSelectedPlant('');
    setSelectedArea('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Matched status colors for OCR pipe states
  const getStatusType = (status: string): 'ok' | 'warn' | 'critical' | 'info' => {
    switch (status) {
      case 'completed': return 'ok';
      case 'failed': return 'critical';
      case 'pending': return 'info';
      case 'ocr':
      case 'parsing':
      case 'chunking':
      case 'embedding':
      case 'extracting':
      case 'graphing':
        return 'warn';
      default: return 'info';
    }
  };

  const getDocTypeIcon = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('schematic') || t.includes('p&id')) return <Layers className="w-4 h-4 text-primary" />;
    if (t.includes('manual')) return <FileText className="w-4 h-4 text-status-info" />;
    if (t.includes('procedure') || t.includes('sop')) return <FileCheck className="w-4 h-4 text-status-ok" />;
    if (t.includes('audit')) return <ShieldCheck className="w-4 h-4 text-status-warn" />;
    return <FileText className="w-4 h-4 text-text-muted" />;
  };

  return (
    <div className="space-y-5">
      {/* 1. Header with primary trigger */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4 gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2">
            <span>Enterprise Knowledge Repository</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Browse, inspect, and analyze structured engineering schematics, SOP checklists, and OEM manuals processed by the AI pipeline.
          </p>
        </div>
        
        <Can permission="doc.create">
          <button
            onClick={() => window.location.hash = '#documents/upload'}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded cursor-pointer transition-all duration-200 flex items-center space-x-2 shadow-lg shadow-primary/20"
          >
            <Upload className="w-4 h-4" />
            <span>Upload & Ingest documents</span>
          </button>
        </Can>
      </div>

      {/* 2. Filter console panel */}
      <div className="bg-surface border border-border-custom rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
          <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5" />
            <span>Search & Filter Parameters</span>
          </span>
          <button 
            onClick={clearFilters}
            className="text-[10px] font-mono text-text-muted hover:text-text-primary uppercase transition-colors"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Main Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Filter by name, text content, uploader..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-background-custom text-xs px-3 py-2 pl-9 border border-border-custom focus:outline-none focus:border-primary rounded font-sans text-text-primary placeholder:text-text-muted"
            />
          </div>

          {/* Doc Type Dropdown */}
          <Select
            value={selectedType}
            onValueChange={(v) => { setSelectedType(v); setPage(1); }}
            className="text-xs px-3 py-2"
            options={[
              { value: '', label: '-- ALL DOCUMENT TYPES --' },
              ...(lookups?.doc_types || []).map(t => ({ value: t, label: t.toUpperCase() })),
            ]}
          />

          {/* Plant Selector */}
          <Select
            value={selectedPlant}
            onValueChange={(v) => { setSelectedPlant(v); setPage(1); }}
            className="text-xs px-3 py-2"
            options={[
              { value: '', label: '-- ALL PLANT NODES --' },
              ...(lookups?.plants || []).map(p => ({ value: p, label: p.split(' - ')[1]?.toUpperCase() || p.toUpperCase() })),
            ]}
          />

          {/* Area Selector */}
          <Select
            value={selectedArea}
            onValueChange={(v) => { setSelectedArea(v); setPage(1); }}
            className="text-xs px-3 py-2"
            options={[
              { value: '', label: '-- ALL SECTOR AREAS --' },
              ...(lookups?.areas || []).map(a => ({ value: a, label: a.toUpperCase() })),
            ]}
          />

          {/* Tag Selector */}
          <Select
            value={selectedTag}
            onValueChange={(v) => { setSelectedTag(v); setPage(1); }}
            className="text-xs px-3 py-2"
            options={[
              { value: '', label: '-- EQUIPMENT TAG --' },
              ...(lookups?.tags || []).map(t => ({ value: t, label: t })),
            ]}
          />

          {/* Status Selector */}
          <Select
            value={selectedStatus}
            onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}
            className="text-xs px-3 py-2"
            options={[
              { value: '', label: '-- PIPELINE STATUS --' },
              ...(lookups?.statuses || []).map(s => ({ value: s, label: s.toUpperCase() })),
            ]}
          />

          {/* Start Date */}
          <div className="relative flex items-center">
            <Calendar className="absolute left-2.5 w-3.5 h-3.5 text-text-muted" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              placeholder="From Date"
              className="w-full bg-background-custom text-[11px] px-3 py-2 pl-9 border border-border-custom focus:outline-none focus:border-primary rounded font-sans text-text-primary"
            />
          </div>

          {/* End Date */}
          <div className="relative flex items-center">
            <Calendar className="absolute left-2.5 w-3.5 h-3.5 text-text-muted" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              placeholder="To Date"
              className="w-full bg-background-custom text-[11px] px-3 py-2 pl-9 border border-border-custom focus:outline-none focus:border-primary rounded font-sans text-text-primary"
            />
          </div>
        </div>
      </div>

      {/* 3. Actions & View Mode Toggle */}
      <div className="flex items-center justify-between bg-surface-muted/30 border border-border-custom p-3 rounded-lg text-xs">
        <span className="text-[10px] font-mono text-text-muted uppercase font-bold">
          TOTAL MATCHES IN REPOSITORY: <span className="text-text-primary">{totalCount} FILES</span>
        </span>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded border border-border-custom hover:bg-surface transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-primary text-white border-primary' : 'bg-surface text-text-secondary'}`}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded border border-border-custom hover:bg-surface transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-primary text-white border-primary' : 'bg-surface text-text-secondary'}`}
            title="Grid View"
          >
            <Grid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. Table / Grid Renderer */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonLoader key={idx} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} errorCode="VAULT_FETCH_FAIL" onRetry={fetchDocuments} />
      ) : documents.length === 0 ? (
        <EmptyState 
          icon={FileText} 
          title="Vault Search Yields No Records" 
          message="No documentation matches your filters. Expand your parameters or upload new engineering files to start." 
          actionLabel="Clear Filter Settings"
          onAction={clearFilters}
        />
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div 
              key={doc.id} 
              className="bg-surface border border-border-custom rounded-lg p-4 hover:border-primary/40 hover:shadow-lg transition-all duration-200 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2 truncate max-w-[80%]">
                    {getDocTypeIcon(doc.type)}
                    <button 
                      onClick={() => window.location.hash = `#documents/${doc.id}`}
                      className="font-display font-bold text-xs text-text-primary hover:text-primary transition-colors text-left truncate hover:underline"
                    >
                      {doc.name}
                    </button>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(doc.id)}
                    onChange={() => toggleSelectRow(doc.id)}
                    className="cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-text-muted uppercase">
                  <span>SIZE: {doc.fileSize}</span>
                  <span>VERSION: {doc.version}</span>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                  {doc.content}
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {(doc.tags || []).map(t => (
                    <span key={t} className="tag-mono bg-[#0E7C86]/10 text-[#0E7C86] border border-[#0E7C86]/20 text-[9px]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border-custom/50 flex items-center justify-between text-[11px]">
                <div className="flex flex-col">
                  <span className="text-[9px] text-text-muted font-mono uppercase">AREA</span>
                  <span className="text-text-primary truncate max-w-[120px]">{doc.area}</span>
                </div>
                <div className="text-right">
                  <StatusChip label={doc.status} type={getStatusType(doc.status)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW WITH STICKY HEADERS & MOBILE STACKED CARD MODE */
        <div className="bg-surface border border-border-custom rounded-lg overflow-hidden relative">
          <div className="overflow-x-auto">
            {/* Desktop Table View (>= 768px) */}
            <table className="w-full text-left border-collapse text-xs hidden md:table">
              <thead>
                <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] font-mono text-text-muted uppercase tracking-wider select-none">
                  <th className="p-3 w-8">
                    <button onClick={toggleSelectAll} className="cursor-pointer text-text-secondary hover:text-text-primary">
                      {selectedIds.length === documents.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="p-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('name')}>
                    File Name {sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('type')}>
                    Doc Type {sortBy === 'type' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="p-3">Equipment Tags</th>
                  <th className="p-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('plant')}>
                    Plant Node / Area {sortBy === 'plant' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('date')}>
                    Ingested Date {sortBy === 'date' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="p-3">Status</th>
                  <th className="p-3 cursor-pointer hover:text-text-primary text-right" onClick={() => handleSort('confidence')}>
                    AI Confidence {sortBy === 'confidence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/40 text-text-secondary">
                {documents.map((doc) => (
                  <tr 
                    key={doc.id} 
                    className={`hover:bg-background-custom/40 transition-colors ${selectedIds.includes(doc.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(doc.id)}
                        onChange={() => toggleSelectRow(doc.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="p-3 font-semibold text-text-primary truncate max-w-xs">
                      <div className="flex items-center space-x-2">
                        {getDocTypeIcon(doc.type)}
                        <button 
                          onClick={() => window.location.hash = `#documents/${doc.id}`}
                          className="truncate hover:text-primary hover:underline font-display text-left font-semibold text-text-primary"
                        >
                          {doc.name}
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-1.5 py-0.5 rounded bg-surface-muted border border-border-custom text-[10px] uppercase font-mono tracking-wider font-semibold">
                        {doc.type}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(doc.tags || []).map(tag => (
                          <span key={tag} className="tag-mono bg-[#0E7C86]/10 text-[#0E7C86] border border-[#0E7C86]/20 text-[9px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 truncate max-w-xs">
                      <div className="font-sans text-[11px] text-text-primary font-medium">{doc.plant.split(' - ')[1] || doc.plant}</div>
                      <div className="font-mono text-[9px] text-text-muted uppercase mt-0.5">{doc.area}</div>
                    </td>
                    <td className="p-3 font-mono text-[10px]">
                      <div>{formatDate(doc.date)}</div>
                      <div className="text-text-muted mt-0.5">BY {doc.uploader.toUpperCase()}</div>
                    </td>
                    <td className="p-3">
                      <StatusChip label={doc.status} type={getStatusType(doc.status)} />
                    </td>
                    <td className="p-3 text-right">
                      <ConfidenceBadge confidence="High" percentage={doc.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Stacked Cards Mode (< 768px) */}
            <div className="md:hidden divide-y divide-border-custom/50">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 space-y-3 bg-surface hover:bg-surface-muted/20 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 truncate max-w-[85%]">
                      {getDocTypeIcon(doc.type)}
                      <button 
                        onClick={() => window.location.hash = `#documents/${doc.id}`}
                        className="truncate font-display font-bold text-xs text-text-primary hover:text-primary text-left"
                      >
                        {doc.name}
                      </button>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(doc.id)}
                      onChange={() => toggleSelectRow(doc.id)}
                      className="cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-text-secondary uppercase">
                    <div>
                      <span className="text-text-muted block">Doc Type</span>
                      <span className="text-text-primary font-sans">{doc.type}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Area Location</span>
                      <span className="text-text-primary font-sans">{doc.area}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Uploaded Date</span>
                      <span className="text-text-primary">{formatDate(doc.date)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">AI Confidence</span>
                      <span className="text-status-ok font-bold">{doc.confidence}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex flex-wrap gap-1">
                      {(doc.tags || []).map(t => (
                        <span key={t} className="tag-mono bg-[#0E7C86]/10 text-[#0E7C86] border border-[#0E7C86]/20 text-[8px]">
                          {t}
                        </span>
                      ))}
                    </div>
                    <StatusChip label={doc.status} type={getStatusType(doc.status)} />
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* 5. Pagination controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border border-border-custom p-3 bg-surface rounded-lg text-xs gap-3 font-sans">
        <div className="flex items-center space-x-2 text-text-secondary justify-center">
          <span>Displaying page_size:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => { setPageSize(parseInt(v, 10)); setPage(1); }}
            className="text-[11px] p-1 font-mono font-bold"
            options={[
              { value: '10', label: '10 records' },
              { value: '25', label: '25 records' },
              { value: '50', label: '50 records' },
              { value: '100', label: '100 records' },
            ]}
          />
        </div>

        <div className="flex items-center justify-center space-x-3 text-text-secondary">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="p-1.5 rounded border border-border-custom bg-surface-muted/30 hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px]">
            PAGE <span className="text-text-primary font-bold">{page}</span> OF <span className="text-text-primary font-bold">{totalPages}</span>
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded border border-border-custom bg-surface-muted/30 hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 6. FIXED BULK ACTIONS FLOATING FOOTER */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 bg-[#0F1418] border border-[#0E7C86]/50 rounded-lg shadow-2xl p-3 z-50 flex items-center space-x-3 max-w-[90vw] animate-in slide-in-from-bottom duration-200">
          <span className="text-[10px] font-mono font-bold text-white bg-[#0E7C86] px-2 py-1 rounded">
            {selectedIds.length} SELECTED
          </span>

          <div className="h-5 w-[1px] bg-border-custom" />

          {/* Reprocess trigger */}
          <Can permission="doc.reprocess">
            <button
              onClick={handleBulkReprocess}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-muted border border-border-custom font-mono text-[10px] font-bold text-text-primary rounded cursor-pointer transition-colors flex items-center space-x-1"
              title="Re-run AI processing pipeline"
            >
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">REPROCESS</span>
            </button>
          </Can>

          {/* Add Tag trigger */}
          <div className="relative">
            <button
              onClick={() => setIsBulkTagOpen(!isBulkTagOpen)}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-muted border border-border-custom font-mono text-[10px] font-bold text-text-primary rounded cursor-pointer transition-colors flex items-center space-x-1"
            >
              <Tag className="w-3.5 h-3.5 text-status-info" />
              <span className="hidden sm:inline">ADD TAG</span>
            </button>

            {isBulkTagOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsBulkTagOpen(false)} />
                <div className="absolute bottom-10 left-0 bg-surface border border-border-custom rounded shadow-xl p-2 z-50 flex space-x-1.5 w-48 font-sans text-xs">
                  <input
                    type="text"
                    placeholder="e.g. C-302B"
                    value={bulkTagInput}
                    onChange={(e) => setBulkTagInput(e.target.value.toUpperCase())}
                    className="bg-background-custom border border-border-custom p-1 rounded text-text-primary text-xs w-full uppercase focus:outline-none focus:border-primary font-mono"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBulkAddTags(); }}
                  />
                  <button 
                    onClick={handleBulkAddTags}
                    className="p-1 bg-primary text-white rounded text-xs px-2 cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Metadata export */}
          <button
            onClick={handleExportMetadata}
            className="px-2.5 py-1.5 bg-surface hover:bg-surface-muted border border-border-custom font-mono text-[10px] font-bold text-text-primary rounded cursor-pointer transition-colors flex items-center space-x-1"
          >
            <Download className="w-3.5 h-3.5 text-status-ok" />
            <span className="hidden sm:inline">EXPORT</span>
          </button>

          {/* Delete trigger */}
          <Can permission="doc.delete">
            <button
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="px-2.5 py-1.5 bg-status-critical/10 hover:bg-status-critical/20 border border-status-critical/30 font-mono text-[10px] font-bold text-status-critical rounded cursor-pointer transition-colors flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">DELETE</span>
            </button>
          </Can>

          <button 
            onClick={() => setSelectedIds([])}
            className="text-text-muted hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-surface border border-status-critical/30 p-6 rounded-lg max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-status-critical border-b border-border-custom pb-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h3 className="font-display font-bold text-sm uppercase">Expunge Files Securely?</h3>
            </div>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              You are about to permanently delete <strong className="text-text-primary">{selectedIds.length} file block(s)</strong> from the industrial knowledge vault. This operation is highly destructive and cannot be undone.
            </p>

            <div className="flex justify-end space-x-2 pt-2 text-xs font-mono font-bold">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-3 py-1.5 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary rounded cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-status-critical hover:bg-status-critical/90 text-white rounded cursor-pointer"
              >
                EXECUTE PURGE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. DOCUMENT UPLOAD & LIVE COGNITIVE PIPELINE INGESTION CONSOLE
// ============================================================================
interface FileIngestionTask {
  id: string;
  file: File;
  docType: string;
  plant: string;
  area: string;
  tagsInput: string;
  progress: number;
  stage: string;
  timer: number;
  timerIntervalId?: any;
  status: 'pending' | 'ocr' | 'parsing' | 'chunking' | 'embedding' | 'extracting' | 'graphing' | 'completed' | 'failed';
  extractedEntities: ExtractedEntity[];
}

function DocumentsUploadWorkspace() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<FileIngestionTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Lookup selections
  const [lookups, setLookups] = useState<Record<string, string[]>>({
    doc_types: [],
    plants: [],
    areas: []
  });

  useEffect(() => {
    async function loadLookups() {
      try {
        const [doc_types, plants, areas] = await Promise.all([
          api.get<string[]>('/lookups/doc_types'),
          api.get<string[]>('/lookups/plants'),
          api.get<string[]>('/lookups/areas')
        ]);
        setLookups({ doc_types, plants, areas });
      } catch (err) {
        console.error(err);
      }
    }
    loadLookups();
  }, []);

  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
    let files: FileList | null = null;
    if ('dataTransfer' in e) {
      e.preventDefault();
      files = e.dataTransfer.files;
    } else {
      files = e.target.files;
    }

    if (!files || files.length === 0) return;

    const newTasks: FileIngestionTask[] = Array.from(files).map((f, idx) => {
      // AI suggested doc type based on naming triggers
      let suggestedType = 'Safety Procedure';
      const name = f.name.toLowerCase();
      if (name.includes('pid') || name.includes('schematic') || name.includes('dwg')) {
        suggestedType = 'P&ID Schematic';
      } else if (name.includes('manual') || name.includes('oem')) {
        suggestedType = 'Equipment Manual';
      } else if (name.includes('audit') || name.includes('oisd') || name.includes('compliance')) {
        suggestedType = 'Regulatory Audit';
      } else if (name.includes('wo-') || name.includes('order')) {
        suggestedType = 'Work Order Record';
      } else if (name.includes('inc-') || name.includes('incident') || name.includes('failure')) {
        suggestedType = 'Incident Report';
      } else if (name.includes('report') || name.includes('inspection')) {
        suggestedType = 'Inspection Report';
      }

      // Default tags
      let suggestedTags = 'P-101A';
      if (name.includes('valve') || name.includes('v-230')) suggestedTags = 'V-230';
      if (name.includes('compressor') || name.includes('302b')) suggestedTags = 'C-302B';
      if (name.includes('turbine') || name.includes('102')) suggestedTags = 'T-102';
      if (name.includes('gauge') || name.includes('104')) suggestedTags = 'PG-104';

      return {
        id: 'task-' + Date.now() + '-' + idx,
        file: f,
        docType: suggestedType,
        plant: user?.plant || 'Reliance Jamnagar Refinery - Sector A',
        area: 'Crude Unit 1',
        tagsInput: suggestedTags,
        progress: 0,
        stage: 'Awaiting ingestion triggers...',
        timer: 0.0,
        status: 'pending',
        extractedEntities: []
      };
    });

    setTasks(prev => [...prev, ...newTasks]);
    if (newTasks.length > 0 && !activeTaskId) {
      setActiveTaskId(newTasks[0].id);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const updateTaskMetadata = (id: string, field: keyof FileIngestionTask, value: any) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  // Launch AI Ingestion vertical pipeline
  const runIngestionPipeline = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'pending') return;

    // Set active task view
    setActiveTaskId(taskId);

    // Initial state
    updateTaskMetadata(taskId, 'status', 'ocr');
    updateTaskMetadata(taskId, 'stage', 'OCR Scrape initiated');
    updateTaskMetadata(taskId, 'progress', 5);

    const stages = [
      { prg: 15, stage: 'OCR Scrape initiated', status: 'ocr' as const },
      { prg: 35, stage: 'Grid analysis complete', status: 'parsing' as const },
      { prg: 55, stage: 'Text stream chunked', status: 'chunking' as const },
      { prg: 75, stage: 'Embeddings vector mapped', status: 'embedding' as const },
      { prg: 90, stage: 'Entity extraction (bge-large-en) complete', status: 'extracting' as const },
      { prg: 100, stage: 'Knowledge Graph wiring complete', status: 'graphing' as const }
    ];

    // Timer elapsed simulation in tenths of seconds
    let startTime = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      updateTaskMetadata(taskId, 'timer', parseFloat(elapsed));
    }, 100);

    // Progression loop
    let stageIndex = 0;
    const progressInterval = setInterval(() => {
      if (stageIndex < stages.length) {
        const nextStage = stages[stageIndex];
        updateTaskMetadata(taskId, 'progress', nextStage.prg);
        updateTaskMetadata(taskId, 'stage', nextStage.stage);
        updateTaskMetadata(taskId, 'status', nextStage.status);
        stageIndex++;
      } else {
        clearInterval(progressInterval);
        clearInterval(timerInterval);

        // Generate high fidelity entities based on the document name & type
        const tags = task.tagsInput.split(',').map(s => s.trim().toUpperCase());
        const entities: ExtractedEntity[] = [
          { key: tags[0] || 'P-101A', value: task.docType === 'P&ID Schematic' ? 'Manifold primary node' : 'High pressure core assembly', confidence: 97, category: 'Equipment Tag' },
          { key: 'OISD-STD-118', value: 'Weekly pressure gauges and safety checking regulatory standard', confidence: 91, category: 'Standard Reference' },
          { key: 'Hydraulic Cavitation', value: 'Localized fluid vapor pocket collapse causing mechanical vibration pitting', confidence: 72, category: 'Failure Mode' }, // CONFIDENCE < 85% to trigger alert warning border!
          { key: 'Lock-Out Tag-Out (LOTO)', value: 'Ensure electrical bus isolate breakers are chained and padlocked before maintenance opening', confidence: 94, category: 'Safety Directive' }
        ];

        // If extra tags, append them
        if (tags.length > 1) {
          tags.slice(1).forEach(tg => {
            entities.push({ key: tg, value: 'Associated cross-connected asset node', confidence: 88, category: 'Equipment Tag' });
          });
        }

        updateTaskMetadata(taskId, 'status', 'completed');
        updateTaskMetadata(taskId, 'stage', 'Knowledge Graph Core Synchronized');
        updateTaskMetadata(taskId, 'extractedEntities', entities);
      }
    }, 1200);
  };

  const activeTask = tasks.find(t => t.id === activeTaskId);

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (activeTaskId === id) {
      const remaining = tasks.filter(t => t.id !== id);
      setActiveTaskId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Editable entities grid handlers
  const handleEntityChange = (idx: number, field: keyof ExtractedEntity, val: any) => {
    if (!activeTask) return;
    const updatedEntities = [...activeTask.extractedEntities];
    updatedEntities[idx] = { ...updatedEntities[idx], [field]: val };
    updateTaskMetadata(activeTask.id, 'extractedEntities', updatedEntities);
  };

  // Final confirmation
  const handleApproveExtraction = async (task: FileIngestionTask) => {
    try {
      // 1. Get mock upload URL
      const uploadUrlRes = await api.post<any>('/documents/upload-url');
      const docId = uploadUrlRes.id;

      // 2. Assemble new DocumentFile object
      const newDocFile: DocumentFile = {
        id: docId,
        name: task.file.name,
        type: task.docType,
        tags: task.tagsInput.split(',').map(s => s.trim().toUpperCase()),
        plant: task.plant,
        area: task.area,
        uploader: user?.name || 'Operator',
        date: new Date().toISOString().split('T')[0],
        version: 'V1.0',
        status: 'completed',
        confidence: Math.round(task.extractedEntities.reduce((sum, e) => sum + e.confidence, 0) / task.extractedEntities.length) || 92,
        fileSize: (task.file.size / (1024 * 1024)).toFixed(1) + ' MB',
        content: `Raw AI extracted OCR text blocks representing: ${task.file.name}. Mapped with ${task.docType} rules. Governing equipment nodes: ${task.tagsInput}. Area node is ${task.area}. Entities verified by ${user?.name}.`,
        extractedEntities: task.extractedEntities
      };

      // 3. Confirm to local storage mock database
      await api.post('/documents', newDocFile);
      
      // Remove from task view
      removeTask(task.id);
      alert('Cognitive document entities confirmed. Knowledge Graph synchronized successfully.');
      
      // Redirect to main library
      if (tasks.length <= 1) {
        window.location.hash = '#documents';
      }
    } catch (err) {
      alert('Error confirming entities. Please check validation logs.');
    }
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Back to Vault Library */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => window.location.hash = '#documents'}
          className="p-1 rounded hover:bg-surface-muted text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
          Return to Vault Library
        </span>
      </div>

      <div className="border-b border-border-custom pb-3">
        <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">
          AI Ingestion & Pipeline Workspace
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Drag and drop enterprise files. Review suggested classes, monitor real-time graph wiring, and validate extracted entities.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Upload dropzone and files selection rail */}
        <div className="space-y-4 lg:col-span-1">
          {/* Multi-file dragzone */}
          <div 
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            className="bg-surface border-2 border-dashed border-[#0E7C86]/30 p-6 rounded-lg text-center cursor-pointer hover:border-primary/50 transition-colors relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-[0.01] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#0E7C86 1px, transparent 1px), linear-gradient(90deg, #0E7C86 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <label className="cursor-pointer flex flex-col items-center space-y-3">
              <div className="p-2.5 bg-[#0E7C86]/10 text-primary rounded-full border border-[#0E7C86]/20">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">Drag & drop files or click to upload</p>
                <p className="text-[9px] font-mono text-text-muted mt-1 uppercase">SOPs, OEM manuals, P&IDs (PDF, PNG, XLSX, MSG)</p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                multiple
                onChange={handleFileDrop}
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.msg" 
              />
            </label>
          </div>

          {/* Queued files list rail */}
          <div className="bg-surface border border-border-custom rounded-lg p-3 space-y-2.5">
            <span className="text-[9px] font-mono font-bold text-primary uppercase block pb-1.5 border-b border-border-custom">
              Ingestion Queue ({tasks.length} files)
            </span>

            {tasks.length === 0 ? (
              <p className="text-[10px] text-text-muted text-center py-6 font-mono uppercase">
                Queue is empty
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {tasks.map(t => {
                  const isAct = t.id === activeTaskId;
                  return (
                    <div 
                      key={t.id}
                      className={`p-2.5 border rounded-md transition-all flex items-center justify-between cursor-pointer ${isAct ? 'border-[#0E7C86] bg-[#0E7C86]/5' : 'border-border-custom bg-background-custom/40 hover:bg-surface-muted/20'}`}
                      onClick={() => setActiveTaskId(t.id)}
                    >
                      <div className="flex items-center space-x-2 truncate max-w-[80%]">
                        <FileText className={`w-4 h-4 flex-shrink-0 ${isAct ? 'text-primary' : 'text-text-muted'}`} />
                        <div className="truncate text-left">
                          <span className="block text-[11px] font-semibold text-text-primary truncate">{t.file.name}</span>
                          <span className="block text-[9px] font-mono text-text-muted uppercase">{(t.file.size / 1024).toFixed(0)} KB</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {t.status === 'completed' && <CheckCircle className="w-4 h-4 text-status-ok" />}
                        {t.status !== 'pending' && t.status !== 'completed' && <RefreshCw className="w-3.5 h-3.5 text-status-warn animate-spin" />}
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeTask(t.id); }}
                          className="text-text-muted hover:text-text-primary"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column (Double col): Active ingestion task workstation */}
        <div className="lg:col-span-2">
          {activeTask ? (
            <div className="bg-surface border border-border-custom rounded-lg p-5 space-y-6">
              {/* Task Header info */}
              <div className="flex items-start justify-between border-b border-border-custom/50 pb-3">
                <div className="space-y-1 truncate max-w-[80%]">
                  <span className="font-mono text-[9px] font-bold text-primary uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                    ACTIVE COGNITIVE TASK
                  </span>
                  <h3 className="font-display font-bold text-text-primary text-base truncate pt-1">{activeTask.file.name}</h3>
                </div>

                <div className="text-right text-xs font-mono font-bold text-text-muted">
                  <span>{(activeTask.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              </div>

              {/* Editable Metadata suggestions */}
              <div className="space-y-3 p-4 bg-background-custom/60 border border-border-custom rounded-lg text-xs">
                <span className="text-[9px] font-mono font-bold text-primary uppercase block">
                  AI-Suggested Metadata (Verify before ingest)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Class select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Doc Type Class</label>
                    <Select
                      value={activeTask.docType}
                      disabled={activeTask.status !== 'pending'}
                      onValueChange={(v) => updateTaskMetadata(activeTask.id, 'docType', v)}
                      className="w-full text-xs px-2.5 py-1.5"
                      options={(lookups?.doc_types || []).map(t => ({ value: t, label: t }))}
                    />
                  </div>

                  {/* Plant select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Plant Location</label>
                    <Select
                      value={activeTask.plant}
                      disabled={activeTask.status !== 'pending'}
                      onValueChange={(v) => updateTaskMetadata(activeTask.id, 'plant', v)}
                      className="w-full text-xs px-2.5 py-1.5"
                      options={(lookups?.plants || []).map(p => ({ value: p, label: p }))}
                    />
                  </div>

                  {/* Area Location */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Sector Area</label>
                    <Select
                      value={activeTask.area}
                      disabled={activeTask.status !== 'pending'}
                      onValueChange={(v) => updateTaskMetadata(activeTask.id, 'area', v)}
                      className="w-full text-xs px-2.5 py-1.5"
                      options={(lookups?.areas || []).map(a => ({ value: a, label: a }))}
                    />
                  </div>

                  {/* Tags Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-muted uppercase">Equipment Tags (comma sep)</label>
                    <input
                      type="text"
                      placeholder="e.g. P-101A, V-230"
                      value={activeTask.tagsInput}
                      disabled={activeTask.status !== 'pending'}
                      onChange={(e) => updateTaskMetadata(activeTask.id, 'tagsInput', e.target.value)}
                      className="w-full bg-surface text-xs px-2.5 py-1.5 border border-border-custom focus:outline-none focus:border-primary rounded text-text-primary uppercase font-mono"
                    />
                  </div>
                </div>

                {activeTask.status === 'pending' && (
                  <div className="pt-3 flex justify-end">
                    <button
                      onClick={() => runIngestionPipeline(activeTask.id)}
                      className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-mono font-bold uppercase rounded cursor-pointer flex items-center space-x-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ingest & Sync Graph</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Live Progress stepper and timer */}
              {activeTask.status !== 'pending' && (
                <div className="space-y-4 p-4 bg-[#0B0F12] border border-border-custom rounded-lg">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-[#F5A524] flex items-center animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      AI COGNITIVE GRAPH ENGINE PIPELINE
                    </span>

                    <span className="text-white font-bold flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>ELAPSED TIMER: {activeTask.timer.toFixed(1)}s</span>
                    </span>
                  </div>

                  {/* Stepper with Glowing bar */}
                  <div className="space-y-3 pt-2">
                    {/* Glowing progress bar */}
                    <div className="relative w-full h-2.5 bg-surface rounded-full overflow-hidden border border-border-custom shadow-[0_0_10px_rgba(14,124,134,0.1)]">
                      <div 
                        className="bg-gradient-to-r from-primary to-[#F5A524] h-full transition-all duration-300 relative shadow-[0_0_8px_rgba(14,124,134,0.5)]" 
                        style={{ width: `${activeTask.progress}%` }}
                      >
                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-white animate-pulse" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-text-muted uppercase">
                      <span>PIPELINE PROGRESS: {activeTask.progress}%</span>
                      <span className="text-white font-bold">{activeTask.stage.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Dynamic Vertical pipeline tracker */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[10px] font-mono pt-2 border-t border-border-custom/50">
                    {[
                      { step: 1, label: 'OCR Scrape initiated', activeAt: ['ocr', 'parsing', 'chunking', 'embedding', 'extracting', 'graphing', 'completed'] },
                      { step: 2, label: 'Grid analysis complete', activeAt: ['parsing', 'chunking', 'embedding', 'extracting', 'graphing', 'completed'] },
                      { step: 3, label: 'Text stream chunked', activeAt: ['chunking', 'embedding', 'extracting', 'graphing', 'completed'] },
                      { step: 4, label: 'Embeddings vector mapped', activeAt: ['embedding', 'extracting', 'graphing', 'completed'] },
                      { step: 5, label: 'Entity extraction complete', activeAt: ['extracting', 'graphing', 'completed'] },
                      { step: 6, label: 'Knowledge Graph wired', activeAt: ['graphing', 'completed'] }
                    ].map(st => {
                      const completed = st.activeAt.includes(activeTask.status) && activeTask.status !== 'ocr';
                      const active = activeTask.status === st.activeAt[0];
                      return (
                        <div 
                          key={st.step}
                          className={`p-2 border rounded flex items-center space-x-2 transition-all ${completed ? 'border-status-ok bg-status-ok/5 text-status-ok' : active ? 'border-[#F5A524] bg-status-warn/5 text-status-warn animate-pulse' : 'border-border-custom bg-surface-muted/30 text-text-muted'}`}
                        >
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${completed ? 'bg-status-ok text-white' : active ? 'bg-[#F5A524] text-white' : 'bg-surface border border-border-custom'}`}>
                            {completed ? <Check className="w-2.5 h-2.5" /> : st.step}
                          </div>
                          <span className="truncate">{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Extraction Entity validation pane */}
              {activeTask.extractedEntities.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-border-custom/50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-primary uppercase block">
                        COGNITIVE REASONING EXTRACTED ENTITIES
                      </span>
                      <p className="text-[10px] text-text-muted font-sans mt-0.5">
                        Highlighting properties mapped from document context. Please validate and edit values where needed.
                      </p>
                    </div>

                    <div className="flex items-center text-[10px] font-mono text-status-warn bg-status-warn/10 border border-status-warn/20 px-2 py-1 rounded">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                      <span>AMBER BORDER INDICATES CONFIDENCE &lt; 85%</span>
                    </div>
                  </div>

                  {/* Key-Value editable grid */}
                  <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                    {activeTask.extractedEntities.map((ent, idx) => {
                      const lowConfidence = ent.confidence < 85;
                      return (
                        <div 
                          key={idx}
                          className={`p-3 border rounded-md grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-sans transition-all ${lowConfidence ? 'border-status-warn bg-status-warn/5' : 'border-border-custom bg-background-custom/40'}`}
                        >
                          {/* Key */}
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono text-text-muted uppercase font-bold">Category</span>
                            <span className="block px-2 py-1 bg-surface border border-border-custom rounded text-text-primary text-[10px] font-mono uppercase truncate">
                              {ent.category}
                            </span>
                          </div>

                          {/* Attribute Key */}
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono text-text-muted uppercase font-bold">Property Key</span>
                            <input
                              type="text"
                              value={ent.key}
                              onChange={(e) => handleEntityChange(idx, 'key', e.target.value)}
                              className="w-full bg-surface border border-border-custom p-1 rounded font-mono text-text-primary text-[11px] focus:outline-none focus:border-primary"
                            />
                          </div>

                          {/* Attribute Value */}
                          <div className="space-y-1 md:col-span-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-mono text-text-muted uppercase font-bold">Extracted Context</span>
                              <div className="flex items-center space-x-1">
                                <span className="text-[9px] font-mono text-text-muted">CONF:</span>
                                <input
                                  type="number"
                                  value={ent.confidence}
                                  onChange={(e) => handleEntityChange(idx, 'confidence', parseInt(e.target.value, 10))}
                                  className={`w-10 bg-surface border border-border-custom p-0.5 text-center text-[10px] font-mono font-bold rounded ${lowConfidence ? 'text-status-warn' : 'text-status-ok'}`}
                                  min={0}
                                  max={100}
                                />
                                <span className="text-[9px] font-mono text-text-muted">%</span>
                              </div>
                            </div>
                            <input
                              type="text"
                              value={ent.value}
                              onChange={(e) => handleEntityChange(idx, 'value', e.target.value)}
                              className="w-full bg-surface border border-border-custom p-1 rounded text-text-primary text-[11px] focus:outline-none focus:border-primary"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-border-custom/40 flex justify-between items-center text-xs">
                    <button
                      onClick={() => removeTask(activeTask.id)}
                      className="px-3 py-1.5 border border-border-custom rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
                    >
                      Discard Ingestion Draft
                    </button>
                    
                    <button
                      onClick={() => handleApproveExtraction(activeTask)}
                      className="px-4 py-2 bg-status-ok hover:bg-status-ok/90 text-white font-mono font-bold text-xs uppercase rounded cursor-pointer flex items-center space-x-1.5 shadow-lg shadow-status-ok/10"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve Extraction & Commit Graph</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface border border-border-custom rounded-lg p-12 text-center h-full flex flex-col items-center justify-center">
              <HelpCircle className="w-12 h-12 text-text-muted mb-3 animate-bounce" />
              <h4 className="font-display text-sm font-bold text-text-primary uppercase tracking-wider mb-1">No Ingestion Task Focused</h4>
              <p className="text-xs text-text-secondary max-w-sm leading-relaxed">
                Select a queued file from the left rail or drop new enterprise documents to load metadata and initiate OCR pipelines.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. SPLITSCREEN DOCUMENT DETAILS EXPLORER
// ============================================================================
// ============================================================================
// 3. SPLITSCREEN DOCUMENT DETAILS EXPLORER (EXTENDED METADATA & ENTITY HIGHLIGHTER)
// ============================================================================
function DocumentDetailsExplorer({ docId }: { docId: string }) {
  const [doc, setDoc] = useState<DocumentFile | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOverlay, setShowOverlay] = useState(true);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);

  // Editor/Tabs state
  const [activeTab, setActiveTab] = useState<'metadata' | 'entities' | 'equipment' | 'versions' | 'related' | 'comments'>('metadata');
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editValueInput, setEditValueInput] = useState('');

  // Mobile drawer state
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const fetchDocumentDetail = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<DocumentFile>(`/documents/${docId}`);
      if (response) {
        setDoc(response);
        // Load extensive mock details mapped to this document
        const extraDetails = getDocumentDetails(docId);
        setDetails(extraDetails);
      }
    } catch (err: any) {
      setError(err?.error?.message || 'Document file not found.');
    } finally {
      setIsLoading(false);
      // Simulate dynamic loading for the PDF rendering engine
      setTimeout(() => {
        setIsPdfLoading(false);
      }, 700);
    }
  };

  useEffect(() => {
    fetchDocumentDetail();
    // Scroll to top of window on mount
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [docId]);

  // Actions
  const handleDownload = () => {
    if (!doc) return;
    const element = document.createElement("a");
    const file = new Blob([doc.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${doc.name}_RAW_TEXT.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Share link copied to clipboard. Operators can now deep link directly to this document ledger.');
  };

  const handleReprocess = () => {
    if (window.confirm('WARNING: Are you sure you want to trigger the cognitive reprocessing queue for this document? This will clear the current verified graph state and re-initialize OCR scraping and entity boundary extraction.')) {
      alert('Cognitive reprocessing queue triggered. Running pipeline...');
      fetchDocumentDetail();
    }
  };

  const handleEntityStatusChange = (entId: string, status: 'unverified' | 'confirmed' | 'rejected') => {
    if (!details) return;
    const updatedEntities = details.entities.map((e: any) => 
      e.id === entId ? { ...e, status } : e
    );
    setDetails({ ...details, entities: updatedEntities });
  };

  const startEditingEntity = (ent: any) => {
    setEditingEntityId(ent.id);
    setEditValueInput(ent.value);
  };

  const saveEntityCorrection = (entId: string) => {
    if (!details) return;
    const updatedEntities = details.entities.map((e: any) => 
      e.id === entId ? { ...e, value: editValueInput, status: 'corrected' as const } : e
    );
    setDetails({ ...details, entities: updatedEntities });
    setEditingEntityId(null);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || !details) return;

    const newComment: DocComment = {
      id: 'c-' + Date.now(),
      author: 'Operator',
      role: 'Verified Control Room Node',
      avatarText: 'OP',
      timestamp: 'Just now',
      text: commentInput.trim()
    };

    setDetails({
      ...details,
      comments: [newComment, ...details.comments]
    });
    setCommentInput('');
  };

  const zoomIn = () => setZoomScale(prev => Math.min(prev + 0.25, 2.5));
  const zoomOut = () => setZoomScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setZoomScale(1.0);
  const rotateCw = () => setRotation(prev => (prev + 90) % 360);
  const rotateCcw = () => setRotation(prev => (prev - 90 + 360) % 360);

  const jumpToPageAndHighlight = (page: number, entId: string) => {
    setCurrentPage(page);
    setHighlightedEntityId(entId);
    setActiveTab('entities');
    setIsBottomSheetOpen(false); // Close bottom sheet on mobile to focus on page view
    // Auto-clear highlight pulse after 3 seconds
    setTimeout(() => {
      setHighlightedEntityId(null);
    }, 3000);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6 min-h-[80vh] flex flex-col justify-center">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <span className="text-xs font-mono text-text-muted uppercase tracking-widest">Hydrating Knowledge Node...</span>
        </div>
      </div>
    );
  }

  if (error || !doc || !details) {
    return (
      <div className="p-6">
        <ErrorState message={error || 'We were unable to locate this record.'} errorCode="DOC_NOT_FOUND" onRetry={fetchDocumentDetail} />
      </div>
    );
  }

  // Define styling map for different entity types
  const ENTITY_STYLE_MAP: Record<string, { bg: string; border: string; text: string; label: string; activeBorder: string }> = {
    equipment_tag: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/60',
      activeBorder: 'border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.6)]',
      text: 'text-cyan-400',
      label: 'EQUIPMENT TAG'
    },
    parameter: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/60',
      activeBorder: 'border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]',
      text: 'text-amber-400',
      label: 'PARAMETER LIMIT'
    },
    regulation_ref: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/60',
      activeBorder: 'border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]',
      text: 'text-blue-400',
      label: 'REGULATORY CLAUSE'
    },
    person: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/60',
      activeBorder: 'border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.6)]',
      text: 'text-purple-400',
      label: 'OPERATOR IDENTITY'
    },
    date: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/60',
      activeBorder: 'border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.6)]',
      text: 'text-rose-400',
      label: 'INGESTION DATE'
    },
    failure_mode: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/60',
      activeBorder: 'border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.6)]',
      text: 'text-red-400',
      label: 'FAILURE MODE'
    }
  };

  const getEntityStyle = (type: string, isHighlighted: boolean) => {
    const defaultStyle = {
      bg: 'bg-gray-500/10',
      border: 'border-gray-500/60',
      activeBorder: 'border-white',
      text: 'text-gray-300',
      label: 'GENERIC'
    };
    const style = ENTITY_STYLE_MAP[type] || defaultStyle;
    return isHighlighted ? style.activeBorder + ' ' + style.bg : style.border + ' ' + style.bg;
  };

  const currentEntities = details.entities.filter((e: any) => e.page === currentPage);

  // Vectorized High Fidelity Mock PDF Pages
  const renderPdfMockPage = () => {
    const isDoc1 = docId === 'doc-1';
    
    if (currentPage === 1) {
      return (
        <svg viewBox="0 0 800 600" className="w-full h-full text-text-primary select-none" style={{ backgroundColor: '#070A0D' }}>
          {/* Blueprint background grid lines */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="none" />
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(14, 124, 134, 0.05)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Drawing Borders & Standard Header */}
          <rect x="15" y="15" width="770" height="570" fill="none" stroke="rgba(14,124,134,0.15)" strokeWidth="2" />
          <line x1="15" y1="520" x2="785" y2="520" stroke="rgba(14,124,134,0.15)" strokeWidth="1" />
          <line x1="550" y1="520" x2="550" y2="585" stroke="rgba(14,124,134,0.15)" strokeWidth="1" />
          <text x="560" y="540" fill="rgba(14,124,134,0.6)" className="font-mono text-[9px] uppercase font-bold">Document Title</text>
          <text x="560" y="555" fill="white" className="font-sans text-[11px] font-bold">{doc.name}</text>
          <text x="560" y="572" fill="rgba(245,165,36,0.8)" className="font-mono text-[9px] font-bold">APPROVED BY: MEENA IYER (PESO)</text>

          {isDoc1 ? (
            <>
              {/* Piping & Instrumentation Diagram Schematic Components */}
              <text x="40" y="50" fill="rgba(255,255,255,0.15)" className="font-sans text-3xl font-bold italic tracking-wide">P&ID SCHEMATIC: CRUDE SECTION A</text>
              
              {/* Horizontal primary flow pipe */}
              <line x1="50" y1="300" x2="750" y2="300" stroke="#0E7C86" strokeWidth="6" strokeLinecap="round" />
              <polygon points="400,295 415,300 400,305" fill="#0E7C86" />
              <polygon points="120,295 135,300 120,305" fill="#0E7C86" />
              <text x="80" y="285" fill="#0E7C86" className="font-mono text-[10px] font-bold">MAIN FEED: 14" HIGH TEMP CRUDE</text>

              {/* Pump P-101A Symbol */}
              <g transform="translate(180, 300)">
                <circle cx="0" cy="0" r="30" fill="#0F172A" stroke="#10B981" strokeWidth="4" />
                <path d="M -15,0 L 25,-15 L 25,15 Z" fill="#10B981" />
                {/* Search match highlight marker if applicable */}
                {(searchQuery || '').toLowerCase() === 'p-101a' && (
                  <circle cx="0" cy="0" r="40" fill="none" stroke="#F5A524" strokeWidth="2" strokeDasharray="4,4" className="animate-spin" />
                )}
                <text x="-25" y="-40" fill="white" className="font-mono text-xs font-bold bg-surface p-1">P-101A (FEED PUMP)</text>
              </g>

              {/* Isolation Butterfly Valve V-230 Symbol */}
              <g transform="translate(480, 300)">
                <polygon points="-25,-20 0,0 -25,20" fill="#EF4444" stroke="#EF4444" strokeWidth="2" />
                <polygon points="25,-20 0,0 25,20" fill="#EF4444" stroke="#EF4444" strokeWidth="2" />
                <line x1="0" y1="-20" x2="0" y2="0" stroke="white" strokeWidth="3" />
                <line x1="-12" y1="-20" x2="12" y2="-20" stroke="white" strokeWidth="3" />
                <text x="-15" y="-30" fill="white" className="font-mono text-xs font-bold">V-230 (ISOLATION)</text>
              </g>

              {/* Cavitation warning circle */}
              <g transform="translate(180, 380)">
                <circle cx="0" cy="0" r="15" fill="rgba(239,68,68,0.1)" stroke="#EF4444" strokeWidth="2" strokeDasharray="3,3" />
                <text x="25" y="4" fill="#EF4444" className="font-mono text-[9px] font-bold uppercase tracking-wider">CAVITATION THRESHOLD ZONE</text>
              </g>

              {/* Bypass secondary line */}
              <path d="M 480,300 L 480,180 L 680,180 L 680,300" fill="none" stroke="#F5A524" strokeWidth="3" strokeDasharray="4,4" />
              <text x="500" y="170" fill="#F5A524" className="font-mono text-[9px] font-bold uppercase">SAFETY BYPASS OUTLET (3" PRESSURE VENT)</text>
            </>
          ) : (
            <>
              {/* Equipment Manual Cover / Intro schematic */}
              <text x="40" y="50" fill="rgba(255,255,255,0.15)" className="font-sans text-3xl font-bold italic tracking-wide">FISHER CONTROLS: TECHNICAL SCHEMATIC</text>
              
              <g transform="translate(400, 260)">
                {/* Massive technical cross-section draft of a butterfly valve */}
                <circle cx="0" cy="0" r="110" fill="none" stroke="#0E7C86" strokeWidth="3" />
                <circle cx="0" cy="0" r="95" fill="none" stroke="#0E7C86" strokeWidth="1" strokeDasharray="5,5" />
                {/* Valve shaft stem */}
                <rect x="-10" y="-140" width="20" height="280" fill="none" stroke="white" strokeWidth="2" />
                {/* Butterfly Disc plate rotated angled */}
                <ellipse cx="0" cy="0" rx="90" ry="25" fill="rgba(14,124,134,0.1)" stroke="#EF4444" strokeWidth="4" transform="rotate(-30)" />
                {/* Actuator assembly block */}
                <rect x="-35" y="-180" width="70" height="40" fill="none" stroke="#F5A524" strokeWidth="3" />
                <text x="-30" y="-155" fill="#F5A524" className="font-mono text-[10px] font-bold">ACTUATOR</text>
                
                <text x="-90" y="160" fill="white" className="font-mono text-xs font-bold">FISHER VALVES: TRIPLE-OFFSET TRUNNION DESIGN</text>
              </g>
            </>
          )}
        </svg>
      );
    } else if (currentPage === 2) {
      return (
        <div className="w-full h-full p-8 bg-[#070A0D] text-[#94A3B8] font-mono text-[11px] leading-relaxed select-all">
          <div className="border border-border-custom p-4 bg-[#0B0F12] rounded space-y-4">
            <h3 className="text-white text-xs font-bold uppercase tracking-wider border-b border-border-custom pb-2 text-center">
              Page 2: Physical Parameters & Structural Limits
            </h3>
            
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between border-b border-border-custom/30 pb-1">
                <span>MAXIMUM DESIGN PRESSURE LIMIT:</span>
                <span className="text-white font-bold select-all">40 BAR (NOMINAL COMPLIANCE)</span>
              </div>
              <div className="flex justify-between border-b border-border-custom/30 pb-1">
                <span>CRITICAL TEMPERATURE THRESHOLD:</span>
                <span className="text-white font-bold select-all">450°C (MAX THERMAL TOLERANCE)</span>
              </div>
              <div className="flex justify-between border-b border-border-custom/30 pb-1">
                <span>SEAT LEAKAGE CLASSIFICATION:</span>
                <span className="text-white font-bold">ANSI FCI 70-2 CLASS VI</span>
              </div>
              <div className="flex justify-between border-b border-border-custom/30 pb-1">
                <span>NOMINAL ACTUATOR TORQUE RANGE:</span>
                <span className="text-status-warn font-bold">180 N-m MAXIMUM NOMINAL FORCE</span>
              </div>
              <div className="flex justify-between border-b border-border-custom/30 pb-1">
                <span>BYPASS OUTLET BORE DIAMETER:</span>
                <span className="text-white font-bold">3.0 INCH VENT LINE</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border-custom/30 text-[9px] text-text-muted leading-normal">
              WARNING: Under-torqueing the actuator stem can lead to seat blowouts. Secure all bolts in a star sequence configuration using cross-pattern sequence. Reference OISD-STD-118 safety directives for additional compliance specifications.
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="w-full h-full p-8 bg-[#070A0D] text-[#94A3B8] font-mono text-[11px] leading-relaxed select-all">
          <div className="border border-border-custom p-4 bg-[#0B0F12] rounded space-y-4">
            <h3 className="text-white text-xs font-bold uppercase tracking-wider border-b border-border-custom pb-2 text-center">
              Page 3: Regulatory Protocols & Signoff logs
            </h3>

            <div className="space-y-3 font-sans text-xs">
              <p className="font-mono text-[10px] text-primary uppercase font-bold tracking-wider">
                FEDERAL INDUSTRY REGULATORY COMPLIANCE DIRECTIVE:
              </p>
              
              <div className="bg-surface p-3 border border-border-custom rounded font-mono text-[10px] leading-normal">
                <span className="text-[#F5A524] font-bold">REGULATION REF: OISD-STD-118 Section 6</span>
                <p className="mt-1.5 text-text-secondary">
                  "All pressure venting butterfly valves and centrifugal pump assemblies on Sector A pipelines must undergo certified pressure recalibration and seal verification checks within 7 days of scheduled shutdowns. Record calibration certifications into the master refinery asset ledger."
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[10px] font-mono pt-2">
                <div className="p-2 border border-border-custom bg-[#070A0D]/50 rounded">
                  <span className="text-text-muted block uppercase">Primary Inspector</span>
                  <span className="text-white font-bold">ADITYA VARDHAN</span>
                  <span className="block text-text-muted text-[8px] mt-0.5">Control Room Superintendent</span>
                </div>
                <div className="p-2 border border-border-custom bg-[#070A0D]/50 rounded">
                  <span className="text-text-muted block uppercase">Verification Date</span>
                  <span className="text-status-ok font-bold">2026-07-11 15:30</span>
                  <span className="block text-text-muted text-[8px] mt-0.5">Automated Cognitive Lock</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Dynamic Main Detail Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface border border-border-custom/80 p-4 rounded-lg shadow-xl gap-4">
        <div className="flex items-center space-x-3 max-w-[70%]">
          <button
            onClick={() => window.location.hash = '#documents'}
            className="p-1.5 rounded hover:bg-surface-muted text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
            title="Return to Vault Library"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="space-y-1 truncate">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[8px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded uppercase select-all">
                ID: {doc.id}
              </span>
              <span className="font-mono text-[8px] font-bold text-text-primary bg-surface-muted border border-border-custom px-1.5 py-0.5 rounded uppercase">
                {doc.version}
              </span>
            </div>
            <h2 className="font-display font-bold text-text-primary text-base truncate">{doc.name}</h2>
          </div>
        </div>

        {/* Header Actions Panel */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Ask Copilot */}
          <a
            href={`#copilot?scope=doc:${doc.id}`}
            className="px-3 py-2 bg-gradient-to-r from-primary to-[#F5A524] text-white text-[11px] font-mono font-bold uppercase rounded cursor-pointer flex items-center space-x-1.5 shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ask Copilot</span>
          </a>

          {/* Reprocess */}
          <button
            onClick={handleReprocess}
            className="px-2.5 py-2 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary rounded cursor-pointer transition-colors flex items-center space-x-1"
            title="Force OCR & Entity Reprocess"
          >
            <RefreshCw className="w-3.5 h-3.5 text-status-warn" />
            <span className="hidden sm:inline font-mono font-bold text-[10px]">REPROCESS</span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="px-2.5 py-2 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary rounded cursor-pointer transition-colors flex items-center space-x-1"
            title="Copy Direct Link"
          >
            <Share2 className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline font-mono font-bold text-[10px]">SHARE</span>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="px-2.5 py-2 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary rounded cursor-pointer transition-colors flex items-center space-x-1"
            title="Download Document Raw Text"
          >
            <Download className="w-3.5 h-3.5 text-status-ok" />
            <span className="hidden sm:inline font-mono font-bold text-[10px]">DOWNLOAD</span>
          </button>

          {/* Mobile Tab Drawer Trigger */}
          <button
            onClick={() => setIsBottomSheetOpen(true)}
            className="lg:hidden px-3 py-2 bg-surface hover:bg-surface-muted border border-border-custom text-text-primary rounded cursor-pointer font-mono font-bold text-[10px]"
          >
            VIEW DETAILS
          </button>
        </div>
      </div>

      {/* Main Splitscreen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* ====================================================================
            LEFT COLUMN (60%): DYNAMIC PDF/IMAGE VIEWPORT (AND OVERLAY ENGINE)
            ==================================================================== */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-surface border border-border-custom rounded-lg overflow-hidden flex flex-col h-[68vh] shadow-2xl relative">
            
            {/* Viewport Control Bar */}
            <div className="p-3 bg-surface-muted/50 border-b border-border-custom flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-[10px] text-text-muted uppercase tracking-wider">
              {/* Left page controls */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-background-custom disabled:opacity-30 disabled:hover:bg-transparent text-text-primary cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-text-primary">
                  Page {currentPage} of 3
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, 3))}
                  disabled={currentPage === 3}
                  className="p-1 rounded hover:bg-background-custom disabled:opacity-30 disabled:hover:bg-transparent text-text-primary cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Text Search inside Doc */}
              <div className="relative w-full sm:w-40">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="SEARCH SPEC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background-custom text-[9px] px-2.5 py-1.5 pl-8 border border-border-custom focus:outline-none focus:border-primary rounded font-sans text-text-primary placeholder-text-muted font-bold uppercase tracking-wider"
                />
              </div>

              {/* Zoom & Rotation Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={zoomOut}
                  className="p-1 rounded hover:bg-background-custom text-text-primary cursor-pointer transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={resetZoom}
                  className="px-1.5 py-0.5 rounded hover:bg-background-custom text-text-primary font-bold text-[9px] cursor-pointer"
                  title="Reset Zoom"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  onClick={zoomIn}
                  className="p-1 rounded hover:bg-background-custom text-text-primary cursor-pointer transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-border-custom mx-1" />
                <button
                  onClick={rotateCcw}
                  className="p-1 rounded hover:bg-background-custom text-text-primary cursor-pointer transition-colors"
                  title="Rotate Counter-Clockwise"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={rotateCw}
                  className="p-1 rounded hover:bg-background-custom text-text-primary cursor-pointer transition-colors"
                  title="Rotate Clockwise"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Split Page Thumbnails and Main Content Canvas */}
            <div className="flex-1 flex overflow-hidden">
              {/* Rail Thumbnails panel */}
              <div className="w-20 md:w-24 bg-[#080D10] border-r border-border-custom flex flex-col p-2 space-y-3 overflow-y-auto">
                <span className="text-[8px] font-mono text-center font-bold text-text-muted uppercase block border-b border-border-custom/50 pb-1">
                  Pages
                </span>
                {[1, 2, 3].map(pageIdx => {
                  const isActive = pageIdx === currentPage;
                  return (
                    <button
                      key={pageIdx}
                      onClick={() => setCurrentPage(pageIdx)}
                      className={`relative aspect-[3/4] border rounded overflow-hidden flex flex-col items-center justify-center p-1 cursor-pointer transition-all ${isActive ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-border-custom bg-surface-muted/30 hover:border-text-secondary/50'}`}
                    >
                      <span className="text-[10px] font-mono font-bold text-white z-10">{pageIdx}</span>
                      <div className="absolute inset-0 opacity-10 bg-gradient-to-t from-primary/40 to-transparent" />
                      {/* Bounding boxes preview inside thumbnail */}
                      <div className="absolute inset-x-2 top-3 bottom-2 flex flex-col space-y-0.5 justify-around pointer-events-none opacity-40">
                        <div className="h-1 bg-cyan-400 rounded-sm w-[60%]" />
                        <div className="h-1 bg-amber-400 rounded-sm w-[40%]" />
                        <div className="h-1 bg-blue-400 rounded-sm w-[70%]" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Main Canvas Area */}
              <div className="flex-1 bg-[#050709] overflow-auto relative flex items-center justify-center p-6">
                
                {isPdfLoading ? (
                  <div className="absolute inset-0 bg-[#050709] flex flex-col items-center justify-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Loading PDF Render Canvas...</span>
                  </div>
                ) : (
                  <div 
                    className="relative bg-[#070A0D] border border-border-custom/80 shadow-2xl transition-all duration-300"
                    style={{
                      width: '100%',
                      maxWidth: '650px',
                      aspectRatio: '4/3',
                      transform: `scale(${zoomScale}) rotate(${rotation}deg)`,
                      transformOrigin: 'center center'
                    }}
                  >
                    {/* Render page SVG/Details */}
                    {renderPdfMockPage()}

                    {/* ABSOLUTE COGNITIVE ENTITY HIGHLIGHT OVERLAY */}
                    {showOverlay && currentEntities.map((ent: OverlayEntity) => {
                      const isHovered = hoveredEntityId === ent.id;
                      const isHighlighted = highlightedEntityId === ent.id;
                      const classes = getEntityStyle(ent.entity_type, isHovered || isHighlighted);
                      const isSearchResult = searchQuery && (ent.value || '').toLowerCase().includes(searchQuery.toLowerCase());

                      return (
                        <div
                          key={ent.id}
                          className={`absolute border-2 rounded-sm cursor-pointer transition-all duration-200 z-20 ${classes} ${isHighlighted ? 'animate-pulse scale-[1.03] ring-2 ring-primary/40' : ''} ${isSearchResult ? 'ring-2 ring-[#F5A524] scale-[1.01]' : ''}`}
                          style={{
                            left: `${ent.bbox.x}%`,
                            top: `${ent.bbox.y}%`,
                            width: `${ent.bbox.w}%`,
                            height: `${ent.bbox.h}%`
                          }}
                          onMouseEnter={() => setHoveredEntityId(ent.id)}
                          onMouseLeave={() => setHoveredEntityId(null)}
                          onClick={() => jumpToPageAndHighlight(ent.page, ent.id)}
                        >
                          {/* Inner pulsing layer for highlighted item */}
                          {isHighlighted && <div className="absolute inset-0 bg-primary/20 animate-ping" />}
                          
                          {/* Rich Floating Tooltip on Hover */}
                          {isHovered && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[#0B0F12] border border-border-custom p-2.5 rounded shadow-2xl z-50 text-[10px] font-sans leading-normal pointer-events-none text-left select-none text-white ring-1 ring-black/80">
                              <span className="block font-mono text-[8px] font-bold text-primary uppercase border-b border-border-custom pb-1 tracking-wider">
                                {ENTITY_STYLE_MAP[ent.entity_type]?.label || 'EXTRACTED ENTITY'}
                              </span>
                              
                              <div className="mt-1.5 space-y-1">
                                <div>
                                  <span className="text-text-muted">Value: </span>
                                  <span className="font-mono font-bold">{ent.value}</span>
                                </div>
                                <div>
                                  <span className="text-text-muted">Normalized: </span>
                                  <span className="font-mono text-text-secondary select-all text-[8px]">{ent.normalized}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-border-custom/50 mt-1">
                                  <span className="text-text-muted">Confidence:</span>
                                  <span className={`font-bold ${ent.confidence >= 85 ? 'text-status-ok' : 'text-status-warn'}`}>{ent.confidence}%</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Viewport Footer with Legend & Overlay Toggle */}
            <div className="p-3.5 bg-[#0B0F12] border-t border-border-custom flex flex-col md:flex-row md:items-center justify-between gap-3 text-[10px]">
              {/* Color legend */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-bold text-text-muted uppercase tracking-wider mr-1">LEGEND:</span>
                <div className="flex items-center space-x-1">
                  <div className="w-2.5 h-2.5 rounded bg-cyan-500/20 border border-cyan-500" />
                  <span className="font-mono text-[9px] text-cyan-400 font-bold">Tag</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500" />
                  <span className="font-mono text-[9px] text-amber-400 font-bold">Param</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2.5 h-2.5 rounded bg-blue-500/20 border border-blue-500" />
                  <span className="font-mono text-[9px] text-blue-400 font-bold">Reg</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2.5 h-2.5 rounded bg-purple-500/20 border border-purple-500" />
                  <span className="font-mono text-[9px] text-purple-400 font-bold">Operator</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2.5 h-2.5 rounded bg-rose-500/20 border border-rose-500" />
                  <span className="font-mono text-[9px] text-rose-400 font-bold">Date</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2.5 h-2.5 rounded bg-red-500/20 border border-red-500" />
                  <span className="font-mono text-[9px] text-red-400 font-bold">Fault</span>
                </div>
              </div>

              {/* Overlay display toggler */}
              <button
                onClick={() => setShowOverlay(prev => !prev)}
                className={`px-3 py-1.5 rounded border font-mono font-bold text-[9px] cursor-pointer transition-colors flex items-center space-x-1 ${showOverlay ? 'bg-[#0E7C86]/10 text-primary border-[#0E7C86]/30 hover:bg-[#0E7C86]/20' : 'bg-surface text-text-muted border-border-custom hover:text-text-primary'}`}
              >
                {showOverlay ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                <span>{showOverlay ? 'HIDE HIGHLIGHT OVERLAY' : 'SHOW HIGHLIGHT OVERLAY'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ====================================================================
            RIGHT COLUMN (40%): INTERACTIVE TABS VIEW (DESKTOP MODE)
            ==================================================================== */}
        <div className="hidden lg:block lg:col-span-2 space-y-4">
          <div className="bg-surface border border-border-custom rounded-lg shadow-xl overflow-hidden flex flex-col h-[68vh]">
            {/* Workspace Tabs Header */}
            <div className="bg-[#0B0F12] border-b border-border-custom flex overflow-x-auto">
              {[
                { id: 'metadata', label: 'METADATA' },
                { id: 'entities', label: 'ENTITIES' },
                { id: 'equipment', label: 'EQUIPMENT' },
                { id: 'versions', label: 'VERSIONS' },
                { id: 'related', label: 'RELATED' },
                { id: 'comments', label: 'COMMENTS' }
              ].map(tb => {
                const isAct = activeTab === tb.id;
                return (
                  <button
                    key={tb.id}
                    onClick={() => setActiveTab(tb.id as any)}
                    className={`px-3.5 py-3 font-mono font-bold text-[9px] tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${isAct ? 'border-primary text-primary bg-[#0E7C86]/5' : 'border-transparent text-text-muted hover:text-white hover:bg-surface-muted/10'}`}
                  >
                    {tb.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Body Workspace */}
            <div className="flex-1 overflow-y-auto p-4 leading-relaxed">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          RESPONSIVE SLIDE-UP BOTTOM SHEET (MOBILE TABS DISCOVERY)
          ==================================================================== */}
      {isBottomSheetOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end lg:hidden animate-fade-in">
          {/* Backdrop Touch Close Target */}
          <div className="absolute inset-0" onClick={() => setIsBottomSheetOpen(false)} />
          
          {/* Bottom Sheet Drawer Frame */}
          <div className="relative w-full bg-surface border-t border-border-custom rounded-t-xl z-55 flex flex-col max-h-[85vh] animate-slide-up shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
            {/* Sheet Handle Accent */}
            <div className="w-12 h-1.5 bg-border-custom rounded-full mx-auto my-3" />
            
            <div className="flex justify-between items-center px-4 pb-2 border-b border-border-custom/50">
              <span className="font-mono text-xs font-bold text-text-primary">DOCUMENT ANALYSIS</span>
              <button
                onClick={() => setIsBottomSheetOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-text-muted hover:text-white bg-[#0B0F12] rounded-full border border-border-custom/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab selection scroll bar */}
            <div className="bg-[#0B0F12] border-b border-border-custom/50 flex overflow-x-auto px-2">
              {[
                { id: 'metadata', label: 'METADATA' },
                { id: 'entities', label: 'ENTITIES' },
                { id: 'equipment', label: 'EQUIPMENT' },
                { id: 'versions', label: 'VERSIONS' },
                { id: 'related', label: 'RELATED' },
                { id: 'comments', label: 'COMMENTS' }
              ].map(tb => {
                const isAct = activeTab === tb.id;
                return (
                  <button
                    key={tb.id}
                    onClick={() => setActiveTab(tb.id as any)}
                    className={`px-4 py-3 font-mono font-bold text-[9px] tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${isAct ? 'border-primary text-primary bg-[#0E7C86]/5' : 'border-transparent text-text-muted'}`}
                  >
                    {tb.label}
                  </button>
                );
              })}
            </div>

            {/* Mobile Sheet Content */}
            <div className="flex-1 overflow-y-auto p-4 leading-relaxed bg-[#070A0D]">
              {renderTabContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Tab Rendering Dispatcher
  function renderTabContent() {
    switch (activeTab) {
      
      // TAB 1: METADATA & HISTORY PIPELINE TIMELINE
      case 'metadata':
        return (
          <div className="space-y-6">
            {/* Raw metadata values */}
            <div className="p-4 bg-background-custom/60 border border-border-custom rounded-lg space-y-3.5">
              <span className="text-[10px] font-mono font-bold text-primary uppercase block border-b border-border-custom/50 pb-1.5">
                Technical Metadata Card
              </span>
              
              <div className="grid grid-cols-2 gap-4 text-[10px] font-mono leading-relaxed">
                <div>
                  <span className="text-text-muted block uppercase">Document ID</span>
                  <span className="text-text-primary font-sans font-bold select-all">{doc.id}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">Uploader identity</span>
                  <span className="text-text-primary font-sans font-bold">{doc.uploader}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">Doc Type Class</span>
                  <span className="text-text-primary font-sans font-bold">{doc.type}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">Plant sector</span>
                  <span className="text-text-primary font-sans font-bold">{doc.plant}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">Refinery Area</span>
                  <span className="text-text-primary font-sans font-bold">{doc.area}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">File Payload Size</span>
                  <span className="text-text-primary font-sans font-bold">{doc.fileSize}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">Ingested Date</span>
                  <span className="text-text-primary font-sans font-bold">{doc.date}</span>
                </div>
                <div>
                  <span className="text-text-muted block uppercase">Ingestion Confidence</span>
                  <span className="text-status-ok font-bold font-mono">{doc.confidence}% SCORE</span>
                </div>
              </div>
            </div>

            {/* Vertical pipeline logs timeline */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono font-bold text-primary uppercase block border-b border-border-custom/50 pb-1.5">
                Ingestion Pipeline Timeline
              </span>

              <div className="relative border-l border-border-custom pl-4 ml-2.5 space-y-4 pt-1 pb-1">
                {details.timeline.map((item: any, idx: number) => {
                  return (
                    <div key={idx} className="relative text-[10px] font-mono">
                      {/* Timeline dot */}
                      <div className="absolute -left-[20.5px] top-1 w-3 h-3 rounded-full bg-status-ok border-2 border-[#0B0F12]" />
                      
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-bold text-text-primary leading-tight">{item.stage}</p>
                          <p className="text-text-muted text-[8px] mt-0.5">OPERATOR: {item.operator.toUpperCase()}</p>
                        </div>
                        <span className="text-text-muted text-[8px] flex-shrink-0">{item.timestamp}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // TAB 2: EXTRACTED GRAPH ENTITIES (DATATABLE WITH VERIFICATION ACTIONS)
      case 'entities':
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
                Extracted Properties Ledgers ({details.entities.length})
              </span>
              <span className="text-[9px] font-mono text-text-muted">
                CLICK ROW TO SCROLL & HIGHLIGHT
              </span>
            </div>

            {/* Entities DataTable */}
            <div className="border border-border-custom rounded-md overflow-hidden bg-[#070A0D]/50 text-[10px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#0B0F12] border-b border-border-custom font-mono text-text-muted text-[9px] uppercase">
                  <tr>
                    <th className="p-2">Type</th>
                    <th className="p-2">Value</th>
                    <th className="p-2 hidden sm:table-cell">Normalized</th>
                    <th className="p-2 text-center">Ref</th>
                    <th className="p-2 text-center">Conf</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom/40">
                  {details.entities.map((ent: OverlayEntity) => {
                    const isHighlighted = highlightedEntityId === ent.id;
                    const styleMap = ENTITY_STYLE_MAP[ent.entity_type];

                    return (
                      <tr 
                        key={ent.id}
                        onClick={() => jumpToPageAndHighlight(ent.page, ent.id)}
                        className={`hover:bg-[#0E7C86]/5 transition-colors cursor-pointer ${isHighlighted ? 'bg-[#0E7C86]/10 font-bold' : ''}`}
                      >
                        {/* Type badge */}
                        <td className="p-2 truncate max-w-[80px]">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wide ${styleMap?.bg} ${styleMap?.text}`}>
                            {ent.entity_type.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Value block */}
                        <td className="p-2 font-mono font-bold text-white max-w-[120px] truncate">
                          {editingEntityId === ent.id ? (
                            <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                              <input 
                                type="text" 
                                value={editValueInput}
                                onChange={e => setEditValueInput(e.target.value)}
                                className="bg-surface text-[10px] px-1 py-0.5 border border-primary rounded text-text-primary focus:outline-none w-24"
                              />
                              <button 
                                onClick={() => saveEntityCorrection(ent.id)}
                                className="p-0.5 bg-status-ok text-white rounded text-[8px]"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <span className="select-all">{ent.value}</span>
                          )}
                        </td>

                        {/* Normalized Name */}
                        <td className="p-2 font-mono text-text-muted select-all hidden sm:table-cell max-w-[100px] truncate">
                          {ent.normalized}
                        </td>

                        {/* Page Link */}
                        <td className="p-2 text-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              jumpToPageAndHighlight(ent.page, ent.id);
                            }}
                            className="text-primary hover:underline font-mono font-bold"
                          >
                            P{ent.page}
                          </button>
                        </td>

                        {/* Confidence Index */}
                        <td className="p-2 text-center font-mono">
                          <span className={ent.confidence >= 85 ? 'text-status-ok' : 'text-status-warn font-bold'}>
                            {ent.confidence}%
                          </span>
                        </td>

                        {/* Verification inline actions */}
                        <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1">
                            {ent.status === 'confirmed' ? (
                              <span className="text-status-ok bg-status-ok/10 border border-status-ok/20 px-1 py-0.5 rounded text-[8px] font-bold uppercase">OK</span>
                            ) : ent.status === 'rejected' ? (
                              <span className="text-status-critical bg-status-critical/10 border border-status-critical/20 px-1 py-0.5 rounded text-[8px] font-bold uppercase">REJ</span>
                            ) : ent.status === 'corrected' ? (
                              <span className="text-status-warn bg-status-warn/10 border border-status-warn/20 px-1 py-0.5 rounded text-[8px] font-bold uppercase">CORR</span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleEntityStatusChange(ent.id, 'confirmed')}
                                  className="p-1 bg-surface hover:bg-status-ok/20 border border-border-custom hover:border-status-ok text-text-secondary hover:text-text-primary rounded transition-colors"
                                  title="Confirm value is correct"
                                >
                                  <Check className="w-3 h-3 text-status-ok" />
                                </button>
                                <button
                                  onClick={() => startEditingEntity(ent)}
                                  className="p-1 bg-surface hover:bg-status-warn/20 border border-border-custom hover:border-status-warn text-text-secondary hover:text-text-primary rounded transition-colors"
                                  title="Correct Value"
                                >
                                  <FileType className="w-3 h-3 text-status-warn" />
                                </button>
                                <button
                                  onClick={() => handleEntityStatusChange(ent.id, 'rejected')}
                                  className="p-1 bg-surface hover:bg-status-critical/20 border border-border-custom hover:border-status-critical text-text-secondary hover:text-text-primary rounded transition-colors"
                                  title="Reject and drop from Graph"
                                >
                                  <X className="w-3 h-3 text-status-critical" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

      // TAB 3: LINKED INDUSTRIAL EQUIPMENT LIST (EQUIPMENT CARDS)
      case 'equipment':
        return (
          <div className="space-y-4">
            <span className="text-[10px] font-mono font-bold text-primary uppercase block border-b border-border-custom/50 pb-1.5">
              Associated Industrial Assets ({details.equipment.length})
            </span>

            {details.equipment.map((eq: LinkedEquipment) => {
              return (
                <div 
                  key={eq.tag}
                  className="p-3.5 bg-[#0B0F12] border border-border-custom/80 hover:border-[#0E7C86]/40 rounded-lg flex items-center justify-between transition-all group shadow-md"
                >
                  <div className="space-y-1 max-w-[70%]">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[11px] font-bold text-white group-hover:text-primary transition-colors">
                        {eq.tag}
                      </span>
                      <span className="font-mono text-[8px] bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase">
                        {eq.type}
                      </span>
                    </div>
                    <p className="text-white text-[11px] font-bold truncate">{eq.name}</p>
                    <p className="text-[9px] text-text-muted font-mono uppercase">
                      BRAND: {eq.manufacturer} | MODEL: {eq.model}
                    </p>
                  </div>

                  {/* Health Gauge */}
                  <div className="text-right text-[10px] font-mono font-bold leading-normal">
                    <span className="text-text-muted block text-[8px] uppercase">HEALTH INDEX</span>
                    <span className="text-status-ok text-xs block font-bold mt-0.5">{eq.health}%</span>
                    <div className="w-16 h-1 bg-surface rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-status-ok" style={{ width: `${eq.health}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );

      // TAB 4: FILE VERSION CONTROL & HISTORY LOG
      case 'versions':
        return (
          <div className="space-y-4">
            <span className="text-[10px] font-mono font-bold text-primary uppercase block border-b border-border-custom/50 pb-1.5">
              Document Ledger Version Tree
            </span>

            <div className="space-y-3">
              {details.versions.map((ver: DocVersion, idx: number) => {
                return (
                  <div 
                    key={idx}
                    className="p-3 bg-[#0B0F12] border border-border-custom/80 rounded-lg text-[10px] leading-relaxed relative"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-white text-xs">{ver.version}</span>
                        {ver.isReingested && (
                          <span className="px-1.5 py-0.5 bg-status-warn/10 border border-status-warn/20 text-[#F5A524] text-[8px] font-mono font-bold uppercase rounded">
                            RE-INGESTED
                          </span>
                        )}
                      </div>
                      <span className="text-text-muted text-[8px] font-mono">{ver.date}</span>
                    </div>

                    <p className="text-text-secondary mt-1.5">{ver.notes}</p>
                    <p className="text-text-muted text-[8px] font-mono mt-1 uppercase">AUTHORED BY: {ver.author.toUpperCase()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );

      // TAB 5: RELATED SYSTEM DOCUMENTS (DEEP RELATIONAL CLUSTER)
      case 'related':
        return (
          <div className="space-y-4">
            <span className="text-[10px] font-mono font-bold text-primary uppercase block border-b border-border-custom/50 pb-1.5">
              Knowledge Graph Closest Neighbors ({details.relatedDocs.length})
            </span>

            <div className="space-y-3">
              {details.relatedDocs.map((rel: RelatedDoc) => {
                return (
                  <a 
                    key={rel.id}
                    href={`#documents/${rel.id}`}
                    className="block p-3 bg-[#0B0F12] border border-border-custom/80 hover:border-primary/40 rounded-lg text-[10px] leading-relaxed transition-all hover:translate-x-1"
                  >
                    <div className="flex justify-between items-start">
                      <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[8px] font-mono font-bold uppercase rounded">
                        {rel.relationship.replace('_', ' ')}
                      </span>
                      <span className="text-text-muted font-mono text-[8px]">MATCH: {rel.confidence}%</span>
                    </div>

                    <p className="text-white font-bold mt-2 truncate">{rel.name}</p>
                    <p className="text-text-muted text-[8px] font-mono mt-1 uppercase">{rel.type}</p>
                  </a>
                );
              })}
            </div>
          </div>
        );

      // TAB 6: DISCUSSIONS & CHATTER DECK
      case 'comments':
        return (
          <div className="space-y-4 flex flex-col h-full">
            <span className="text-[10px] font-mono font-bold text-primary uppercase block border-b border-border-custom/50 pb-1.5 flex-shrink-0">
              Operator Discussion Chatter Deck ({details.comments.length})
            </span>

            {/* Comment Thread */}
            <div className="space-y-3 overflow-y-auto max-h-[34vh] flex-1 pr-1 pb-2">
              {details.comments.map((comm: DocComment) => {
                return (
                  <div key={comm.id} className="bg-[#0B0F12] p-3 border border-border-custom/80 rounded-lg text-[10px] leading-relaxed">
                    <div className="flex items-center space-x-2 pb-1.5 border-b border-border-custom/20">
                      {/* Avatar */}
                      <div className="w-5 h-5 rounded-full bg-[#0E7C86]/20 border border-[#0E7C86]/30 text-primary flex items-center justify-center font-bold text-[8px]">
                        {comm.avatarText}
                      </div>
                      
                      <div>
                        <span className="font-bold text-white text-[10px] block leading-tight">{comm.author}</span>
                        <span className="text-text-muted text-[8px] uppercase tracking-wider block font-mono">{comm.role}</span>
                      </div>

                      <span className="ml-auto text-text-muted text-[8px] font-mono">{comm.timestamp}</span>
                    </div>

                    <p className="text-text-secondary mt-2 text-[10px] font-sans">{comm.text}</p>
                  </div>
                );
              })}
            </div>

            {/* Interactive Comment Input Deck */}
            <form onSubmit={handleAddComment} className="flex-shrink-0 border-t border-border-custom/40 pt-3 flex gap-2">
              <input 
                type="text" 
                placeholder="ADD DECK COMMENT..." 
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                className="flex-1 bg-[#050709] border border-border-custom focus:outline-none focus:border-primary rounded px-2.5 py-1.5 text-[10px] text-white placeholder-text-muted font-sans font-medium"
              />
              <button 
                type="submit"
                className="px-3 bg-primary hover:bg-primary-hover text-white text-[10px] font-mono font-bold uppercase rounded flex items-center justify-center cursor-pointer min-h-[32px]"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        );

      default:
        return null;
    }
  }
}
