/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  VisibilityState,
  RowSelectionState,
} from '@tanstack/react-table';
import { 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  ChevronDown, Download, EyeOff, Table, AlertCircle, FileSpreadsheet
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader, Select } from '../shared';
import { api } from '../../lib/api/client';
import { useNotificationStore } from '../../stores/notificationStore';

interface SavedView {
  id: string;
  name: string;
  tableId: string;
  columns: string[];
  density: 'compact' | 'comfortable' | 'relaxed';
  sorting: SortingState;
  isShared: boolean;
  createdBy: string;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  queryHook: (params: { page: number; limit: number; sorting: SortingState }) => {
    data: { items: TData[]; total: number } | TData[] | undefined;
    isLoading: boolean;
    isError: boolean;
    error: any;
    refetch?: () => void;
  };
  bulkActions?: {
    label: string;
    action: (rows: TData[]) => void;
    icon?: React.ReactNode;
  }[];
  emptyTitle?: string;
  emptyMessage?: string;
  tableId?: string;
}

export function DataTable<TData>({
  columns,
  queryHook,
  bulkActions = [],
  emptyTitle = "No records found",
  emptyMessage = "There is currently no data registered in this database node.",
  tableId,
}: DataTableProps<TData>) {
  // 1. Table states
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  
  // Advanced Export states
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Saved Views & Density states
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'relaxed'>('comfortable');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string>('');
  const [isSavingView, setIsSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [isNewViewShared, setIsNewViewShared] = useState(false);

  // Fetch Saved Views
  useEffect(() => {
    if (!tableId) return;
    const fetchViews = async () => {
      try {
        const res = await api.get<SavedView[]>('/saved-views');
        if (res) {
          setSavedViews(res.filter(v => v.tableId === tableId));
        }
      } catch (err) {
        console.error('Failed to load saved views:', err);
      }
    };
    fetchViews();
  }, [tableId]);

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    try {
      const visibleColumnIds = table.getVisibleFlatColumns()
        .filter(col => col.id !== 'select')
        .map(col => col.id);

      const payload = {
        name: newViewName,
        tableId,
        columns: visibleColumnIds,
        density,
        sorting,
        isShared: isNewViewShared,
      };

      const res = await api.post<SavedView>('/saved-views', payload);
      if (res) {
        setSavedViews(prev => [...prev, res]);
        setSelectedViewId(res.id);
        setIsSavingView(false);
        setNewViewName('');
        setIsNewViewShared(false);
      }
    } catch (err) {
      console.error('Failed to save view:', err);
    }
  };

  const handleDeleteView = async (id: string) => {
    try {
      await api.delete(`/saved-views/${id}`);
      setSavedViews(prev => prev.filter(v => v.id !== id));
      if (selectedViewId === id) {
        setSelectedViewId('');
        setColumnVisibility({});
        setDensity('comfortable');
      }
    } catch (err) {
      console.error('Failed to delete view:', err);
    }
  };

  const applySavedView = (view: SavedView) => {
    const newVisibility: VisibilityState = {};
    table.getAllLeafColumns().forEach(col => {
      if (col.id === 'select') {
        newVisibility[col.id] = true;
      } else {
        newVisibility[col.id] = view.columns.includes(col.id);
      }
    });
    setColumnVisibility(newVisibility);
    setDensity(view.density || 'comfortable');
    if (view.sorting && view.sorting.length > 0) {
      setSorting(view.sorting);
    }
    setSelectedViewId(view.id);
  };

  // 2. Fetch data via queryHook
  const { data, isLoading, isError, error, refetch } = queryHook({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    sorting,
  });

  // Normalize fetched data
  const { items, total } = useMemo(() => {
    if (!data) return { items: [], total: 0 };
    if (Array.isArray(data)) {
      return { items: data, total: data.length };
    }
    return {
      items: data.items || [],
      total: data.total || 0,
    };
  }, [data]);

  const pageCount = Math.ceil(total / pagination.pageSize);

  // 3. Initialize TanStack Table instance
  const table = useReactTable({
    data: items,
    columns,
    pageCount,
    state: {
      pagination,
      sorting,
      columnVisibility,
      rowSelection,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  // 4. CSV Export Helper
  const handleExportCSV = () => {
    if (items.length === 0) return;
    
    // Get visible columns headers and keys
    const visibleCols = table.getVisibleFlatColumns().filter(col => col.id !== 'select');
    const headers = visibleCols.map(col => {
      if (typeof col.columnDef.header === 'string') return col.columnDef.header;
      return col.id;
    });

    const csvRows = [headers.join(',')];

    items.forEach(row => {
      const values = visibleCols.map(col => {
        // Retrieve cell value
        const val = (row as any)[col.id] || '';
        const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // Escape quotes
        return `"${stringVal.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `indusmind_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTriggerExport = async (format: 'CSV' | 'XLSX') => {
    setShowExportMenu(false);
    
    // Get visible columns
    const visibleColumnIds = table.getVisibleFlatColumns()
      .filter(col => col.id !== 'select')
      .map(col => {
        if (typeof col.columnDef.header === 'string') return col.columnDef.header;
        return col.id;
      });

    try {
      setExportToast(`Export processing queued in background. Check notifications drawer in 2s.`);
      setTimeout(() => setExportToast(null), 4000);

      const res = await api.post<{ exportId: string; message: string; downloadUrl: string }>('/exports', {
        entity: tableId || 'generic',
        columns: visibleColumnIds,
        format,
        timestamp: new Date().toISOString()
      });

      // Simulation delay of 2 seconds before writing notification
      setTimeout(() => {
        const { addNotification } = useNotificationStore.getState();
        addNotification({
          title: `EXPORT READY (${format})`,
          desc: `The bulk file export requested for the ${tableId || 'plant dataset'} table has finalized. Download URL: ${res.downloadUrl}`,
          type: 'info',
          category: 'Compliance'
        });
      }, 2000);

    } catch (err) {
      console.error('Export failed:', err);
      setExportToast('Regulatory export failed. Check console trace logs.');
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  // Get selected raw rows
  const selectedRows = useMemo(() => {
    return table.getSelectedRowModel().rows.map(r => r.original);
  }, [rowSelection, items]);

  // Loading Mode (Skeletons)
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <SkeletonLoader className="h-8 w-40" />
          <SkeletonLoader className="h-8 w-24" />
        </div>
        <div className="border border-border-custom rounded-lg overflow-hidden bg-surface">
          <div className="bg-surface-muted h-10 border-b border-border-custom" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 border-b border-border-custom flex space-x-4">
              <SkeletonLoader className="h-4 w-4" />
              <SkeletonLoader className="h-4 flex-1" />
              <SkeletonLoader className="h-4 w-24" />
              <SkeletonLoader className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error Mode
  if (isError) {
    return (
      <ErrorState 
        message={error?.message || "Failed to load database index stream."} 
        errorCode="TABLE_FETCH_FAULT"
        onRetry={refetch}
      />
    );
  }

  const densityPaddingClass = useMemo(() => {
    switch (density) {
      case 'compact':
        return 'p-1.5 px-2 text-[11px]';
      case 'relaxed':
        return 'p-4 px-5 text-sm';
      case 'comfortable':
      default:
        return 'p-3';
    }
  }, [density]);

  return (
    <div className="space-y-4 font-sans">
      {/* Toast Notification */}
      {exportToast && (
        <div className="fixed bottom-4 right-4 bg-primary border border-primary/25 text-white px-4 py-3 rounded-lg shadow-xl flex items-center space-x-2 z-50 animate-bounce font-sans text-xs">
          <FileSpreadsheet className="w-4 h-4 text-white bg-white/20 rounded p-0.5" />
          <span>{exportToast}</span>
        </div>
      )}

      {/* Saved Views Control Panel */}
      {tableId && (
        <div className="bg-surface border border-border-custom rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-text-muted uppercase text-[10px] tracking-wider flex items-center space-x-1.5">
              <Table className="w-3.5 h-3.5 text-primary" />
              <span>Active View:</span>
            </span>
            <div className="flex items-center space-x-2">
              <Select
                value={selectedViewId}
                onValueChange={(v) => {
                  const view = savedViews.find(sv => sv.id === v);
                  if (view) applySavedView(view);
                }}
                options={[
                  { value: '', label: '-- Standard View --' },
                  { value: '__shared_header', label: 'System & Shared Views', disabled: true },
                  ...savedViews.filter(v => v.isShared).map(v => ({
                    value: v.id,
                    label: `🖧 ${v.name} (by ${v.createdBy})`,
                  })),
                  { value: '__personal_header', label: 'My Personal Views', disabled: true },
                  ...savedViews.filter(v => !v.isShared).map(v => ({
                    value: v.id,
                    label: `👤 ${v.name}`,
                  })),
                ]}
                className="px-2.5 py-1.5 text-xs min-h-[36px]"
              />

              {selectedViewId && !savedViews.find(v => v.id === selectedViewId)?.isShared && (
                <button
                  type="button"
                  onClick={() => handleDeleteView(selectedViewId)}
                  className="p-1 text-status-critical hover:bg-status-critical/10 rounded cursor-pointer transition-all"
                  title="Delete view"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* View Saving Tool */}
            {isSavingView ? (
              <form onSubmit={handleSaveView} className="flex items-center space-x-2 bg-background-custom p-1 rounded border border-border-custom/50 animate-fade-in min-h-[36px]">
                <input
                  type="text"
                  placeholder="View Name..."
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  required
                  className="bg-transparent text-text-primary text-xs font-medium focus:outline-none px-2 py-0.5 w-32 border-0"
                />
                <label className="flex items-center space-x-1 text-[10px] text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNewViewShared}
                    onChange={(e) => setIsNewViewShared(e.target.checked)}
                    className="rounded border-border-custom bg-background-custom text-primary focus:ring-primary"
                  />
                  <span>Share</span>
                </label>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary-hover text-white text-[10px] font-bold uppercase px-2 py-1 rounded cursor-pointer min-h-[28px]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsSavingView(false)}
                  className="text-text-muted hover:text-text-primary text-[10px] font-mono px-1 cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsSavingView(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded font-bold cursor-pointer text-[10px] uppercase transition-colors min-h-[36px]"
              >
                <span>+ Save Current View</span>
              </button>
            )}

            {/* Density Selector */}
            <div className="flex items-center space-x-1 bg-background-custom border border-border-custom rounded p-0.5 min-h-[36px]">
              {(['compact', 'comfortable', 'relaxed'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={`px-2.5 py-1 text-[10px] font-mono uppercase font-bold rounded transition-all cursor-pointer ${
                    density === d
                      ? 'bg-primary text-white font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 4. Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface p-3 border border-border-custom rounded-lg text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-mono text-text-muted uppercase text-[10px] tracking-wider">
            Total records: <strong className="text-text-primary">{total}</strong>
          </span>
        </div>

        <div className="flex items-center space-x-2 relative">
          {/* Advanced Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={items.length === 0}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded border border-border-custom hover:bg-surface-muted text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer min-h-[36px]"
              title="Export Table Datasets"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-[10px] uppercase font-bold">Export Menu</span>
              <ChevronDown className="w-3 h-3 text-text-muted" />
            </button>

            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-surface border border-border-custom rounded-md shadow-xl z-30 p-2 space-y-1 font-sans">
                  <span className="block text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider p-1 border-b border-border-custom/50 mb-1">
                    Export Core Format
                  </span>
                  <button
                    onClick={() => handleTriggerExport('CSV')}
                    className="w-full text-left p-1.5 hover:bg-surface-muted rounded text-[11px] font-mono font-bold text-text-primary cursor-pointer flex items-center space-x-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                    <span>EXPORT AS CSV</span>
                  </button>
                  <button
                    onClick={() => handleTriggerExport('XLSX')}
                    className="w-full text-left p-1.5 hover:bg-surface-muted rounded text-[11px] font-mono font-bold text-text-primary cursor-pointer flex items-center space-x-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-status-warn" />
                    <span>EXPORT AS XLSX</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Visibility Menu trigger */}
          <div className="relative">
            <button
              onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded border border-border-custom hover:bg-surface-muted text-text-primary transition-colors cursor-pointer min-h-[36px]"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span className="font-mono text-[10px] uppercase font-bold">Columns</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showVisibilityMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-surface border border-border-custom rounded-md shadow-xl z-30 p-2 space-y-1">
                <span className="block text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider p-1 border-b border-border-custom/50 mb-1">
                  Toggle Columns
                </span>
                {table.getAllLeafColumns().filter(col => col.id !== 'select').map(column => (
                  <label 
                    key={column.id} 
                    className="flex items-center space-x-2 p-1.5 hover:bg-surface-muted rounded text-xs text-text-primary cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                      className="rounded border-border-custom bg-background-custom text-primary focus:ring-primary"
                    />
                    <span className="capitalize">{typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Main Table Container */}
      {items.length === 0 ? (
        <EmptyState 
          icon={Table}
          title={emptyTitle}
          message={emptyMessage}
        />
      ) : (
        <div className="space-y-4">
          
          {/* Desktop Table: Hidden below md (768px) */}
          <div className="hidden md:block border border-border-custom rounded-lg overflow-hidden bg-surface shadow-md">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface-muted border-b border-border-custom z-10">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th 
                          key={header.id} 
                          className={`${densityPaddingClass} font-mono text-[10px] text-text-muted uppercase tracking-wider font-bold select-none cursor-pointer hover:bg-background-custom/40`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center space-x-1.5">
                            <span>
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {header.column.getCanSort() && (
                              <span className="text-text-muted opacity-60">
                                {{
                                  asc: ' ▴',
                                  desc: ' ▾',
                                }[header.column.getIsSorted() as string] ?? ' ⇅'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-border-custom/40 text-xs text-text-secondary">
                  {table.getRowModel().rows.map(row => (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-background-custom/20 transition-colors ${
                        row.getIsSelected() ? 'bg-primary/5' : ''
                      }`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className={densityPaddingClass}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Stacked Cards: Visible below md (768px) */}
          <div className="md:hidden space-y-3">
            {table.getRowModel().rows.map(row => {
              const visibleCells = row.getVisibleCells().filter(cell => cell.column.id !== 'select');
              const isSelected = row.getIsSelected();

              return (
                <div 
                  key={row.id} 
                  className={`p-4 bg-surface border rounded-lg space-y-2 relative transition-all ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border-custom'
                  }`}
                >
                  {/* Checkbox placement */}
                  {row.getVisibleCells().find(c => c.column.id === 'select') && (
                    <div className="absolute top-3 right-3">
                      {flexRender(
                        row.getVisibleCells().find(c => c.column.id === 'select')?.column.columnDef.cell,
                        row.getVisibleCells().find(c => c.column.id === 'select')?.getContext() as any
                      )}
                    </div>
                  )}

                  {/* Render Visible fields */}
                  {visibleCells.map(cell => {
                    const header = cell.column.columnDef.header;
                    const headerLabel = typeof header === 'string' ? header : cell.column.id;

                    return (
                      <div key={cell.id} className="flex justify-between items-start border-b border-border-custom/30 pb-1.5 last:border-0 last:pb-0">
                        <span className="font-mono text-[9px] text-text-muted uppercase pr-2">
                          {headerLabel}:
                        </span>
                        <span className="text-text-primary text-xs font-semibold text-right">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Bulk Action Bar (Overlay or Static bar at bottom if rows selected) */}
          {selectedRows.length > 0 && bulkActions.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-primary/10 to-background-custom border border-primary/30 rounded-lg animate-fade-in">
              <div className="flex items-center space-x-2 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <span className="text-text-primary font-bold">{selectedRows.length} rows selected</span>
              </div>
              <div className="flex items-center space-x-2">
                {bulkActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => action.action(selectedRows)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded shadow-sm transition-all cursor-pointer"
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => table.resetRowSelection()}
                  className="px-2.5 py-1.5 bg-surface-muted hover:bg-surface border border-border-custom text-text-secondary text-[10px] font-mono uppercase font-bold rounded cursor-pointer transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface p-3 border border-border-custom rounded-lg text-xs font-sans">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10px] text-text-muted uppercase">Rows per page:</span>
              <Select
                value={String(table.getState().pagination.pageSize)}
                onValueChange={(v) => {
                  table.setPageSize(Number(v));
                }}
                options={[25, 50, 100].map(size => ({
                  value: String(size),
                  label: `${size} rows`,
                }))}
                className="p-1 text-xs"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="p-1.5 rounded border border-border-custom hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-1.5 rounded border border-border-custom hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              
              <span className="font-mono text-[10px] uppercase text-text-muted px-2">
                Page <strong className="text-text-primary">{table.getState().pagination.pageIndex + 1}</strong> of <strong className="text-text-primary">{pageCount || 1}</strong>
              </span>

              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-1.5 rounded border border-border-custom hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="p-1.5 rounded border border-border-custom hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
