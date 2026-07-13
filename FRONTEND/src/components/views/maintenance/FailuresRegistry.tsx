/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  ComposedChart
} from 'recharts';
import { 
  Search, 
  AlertOctagon, 
  SlidersHorizontal, 
  Calendar, 
  Clock, 
  Eye, 
  GitBranch, 
  TrendingUp,
  FileCheck
} from 'lucide-react';
import { FailureRecord, MOCK_PARETO_DATA } from './mockMaintData';
import { Select } from '../../shared';

interface FailuresRegistryProps {
  failures: FailureRecord[];
  onStartRca: (failureId: string) => void;
}

export function FailuresRegistry({ failures, onStartRca }: FailuresRegistryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [rcaFilter, setRcaFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<keyof FailureRecord>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filtered and sorted records
  const filteredRecords = useMemo(() => {
    return failures
      .filter(record => {
        const matchesSearch = 
          (record.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (record.equipmentId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (record.equipmentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (record.failureMode || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesSeverity = severityFilter === 'ALL' || record.severity === severityFilter;
        const matchesRca = rcaFilter === 'ALL' || record.rcaStatus === rcaFilter;

        return matchesSearch && matchesSeverity && matchesRca;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return 0;
      });
  }, [failures, searchTerm, severityFilter, rcaFilter, sortField, sortOrder]);

  const handleSort = (field: keyof FailureRecord) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case 'Critical':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'High':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Medium':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getRcaStatusStyle = (status: string) => {
    switch (status) {
      case 'Published':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'In Progress':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* PARETO INSIGHT BANNER & CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Pareto explanation card */}
        <div className="bg-surface border border-border-custom rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-primary">
              <TrendingUp className="w-5 h-5" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider">Refinery Pareto Axiom</span>
            </div>
            <h3 className="font-display text-lg font-bold text-text-primary leading-snug">
              80% of Downtime Traces back to 20% of Failure Modes
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Our continuous fault graph aggregates historical failure signatures. 
              <strong> Impeller Cavitation</strong> and <strong>Gasket Blowouts</strong> contribute to 56% of cumulative outage times.
            </p>
          </div>
          
          <div className="p-3 bg-surface-muted/50 border border-border-custom/50 rounded text-[11px] font-mono text-text-secondary">
            <span className="text-text-primary font-bold block mb-1">💡 Recommendations</span>
            Tuning suction manifold valves (V-230 series) is identified as the highest ROI preventive action.
          </div>
        </div>

        {/* Recharts Pareto Plot */}
        <div className="lg:col-span-2 bg-surface border border-border-custom rounded-lg p-5">
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Failure Mode Pareto Distribution</span>
            <span className="text-[10px] text-text-muted font-normal uppercase">Last 365 Days</span>
          </h3>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={MOCK_PARETO_DATA}
                margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis 
                  dataKey="mode" 
                  stroke="var(--text-3)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="var(--text-3)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  label={{ value: 'Outage Count', angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 10, offset: 0 }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="var(--text-3)" 
                  fontSize={10} 
                  domain={[0, 100]}
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `${val}%`}
                  label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fill: 'var(--text-3)', fontSize: 10, offset: 0 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-strong)', borderRadius: '6px' }}
                  labelStyle={{ color: 'var(--text)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' }}
                  itemStyle={{ fontSize: '11px', fontFamily: 'sans-serif', color: 'var(--text-2)' }}
                />
                <Bar yAxisId="left" dataKey="count" fill="url(#barGrad)" radius={[4, 4, 0, 0]} name="Failure Count" />
                <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" stroke="var(--chart-2)" strokeWidth={2} activeDot={{ r: 6 }} name="Cumulative %" />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-surface border border-border-custom rounded-lg p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search failures by ID, asset, or failure mode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-background-custom border border-border-custom pl-9 pr-4 py-2 text-xs rounded-md focus:outline-none focus:border-primary placeholder-text-muted text-text-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
          
          {/* Severity filter */}
          <div className="flex items-center space-x-1.5 bg-background-custom border border-border-custom px-2 py-1 rounded text-xs">
            <AlertOctagon className="w-3.5 h-3.5 text-text-muted" />
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v)}
              options={[
                { value: 'ALL', label: 'Severity: All' },
                { value: 'Critical', label: 'Critical Only' },
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' }
              ]}
              className="pr-4 font-mono text-[11px]"
            />
          </div>

          {/* RCA Status filter */}
          <div className="flex items-center space-x-1.5 bg-background-custom border border-border-custom px-2 py-1 rounded text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted" />
            <Select
              value={rcaFilter}
              onValueChange={(v) => setRcaFilter(v)}
              options={[
                { value: 'ALL', label: 'RCA: All' },
                { value: 'Pending', label: 'Pending' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Published', label: 'Published' }
              ]}
              className="pr-4 font-mono text-[11px]"
            />
          </div>

        </div>
      </div>

      {/* FAILURES DATA TABLE */}
      <div className="bg-surface border border-border-custom rounded-lg overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-custom bg-surface-muted/40 font-mono text-[10px] text-text-muted uppercase tracking-wider">
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted" onClick={() => handleSort('id')}>
                  ID {sortField === 'id' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted" onClick={() => handleSort('equipmentName')}>
                  Asset {sortField === 'equipmentName' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted" onClick={() => handleSort('failureMode')}>
                  Failure Mode {sortField === 'failureMode' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted" onClick={() => handleSort('severity')}>
                  Severity {sortField === 'severity' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted" onClick={() => handleSort('date')}>
                  Date {sortField === 'date' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted text-right" onClick={() => handleSort('downtimeMinutes')}>
                  Downtime {sortField === 'downtimeMinutes' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-surface-muted" onClick={() => handleSort('rcaStatus')}>
                  RCA Status {sortField === 'rcaStatus' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/50 text-xs">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-surface-muted/30 transition-all">
                    {/* ID */}
                    <td className="py-3 px-4 font-mono font-bold text-text-primary">
                      {record.id}
                    </td>

                    {/* Asset */}
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-semibold text-text-primary block leading-tight">{record.equipmentName}</span>
                        <span className="font-mono text-[10px] text-text-muted mt-0.5 block">{record.equipmentId}</span>
                      </div>
                    </td>

                    {/* Failure Mode */}
                    <td className="py-3 px-4 text-text-secondary font-medium">
                      {record.failureMode}
                    </td>

                    {/* Severity */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border font-bold ${getSeverityStyle(record.severity)}`}>
                        {record.severity}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 text-text-secondary font-mono">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-text-muted" />
                        <span>{record.date}</span>
                      </div>
                    </td>

                    {/* Downtime */}
                    <td className="py-3 px-4 text-right font-mono text-text-primary font-semibold">
                      <div className="flex items-center justify-end space-x-1">
                        <Clock className="w-3.5 h-3.5 text-text-muted" />
                        <span>{record.downtimeMinutes}m</span>
                      </div>
                    </td>

                    {/* RCA Status */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-mono ${getRcaStatusStyle(record.rcaStatus)}`}>
                        {record.rcaStatus}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      {record.rcaStatus === 'Published' ? (
                        <button
                          onClick={() => onStartRca(record.id)}
                          className="px-2.5 py-1 bg-surface-muted hover:bg-surface-muted/80 text-text-primary rounded border border-border-custom text-[11px] font-mono font-medium transition-all cursor-pointer flex items-center space-x-1 ml-auto"
                        >
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>View RCA</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onStartRca(record.id)}
                          className="px-2.5 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded border border-primary/30 text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center space-x-1 ml-auto shadow-sm"
                        >
                          <GitBranch className="w-3 h-3 text-primary" />
                          <span>{record.rcaStatus === 'In Progress' ? 'Continue RCA' : 'Start RCA'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-muted font-mono">
                    No matching failure records found in current database node.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
