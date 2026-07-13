/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import * as Icons from 'lucide-react';
import { StatusChip } from '../../shared';

interface KpiCardProps {
  title: string;
  value: string;
  delta?: string;
  status?: 'ok' | 'warn' | 'critical' | 'info';
  sparkline?: number[];
  drillLink?: string;
  icon?: string;
}

export function KpiCard({
  title,
  value,
  delta,
  status = 'info',
  sparkline,
  drillLink,
  icon,
}: KpiCardProps) {
  // Parse dynamic icon
  const IconComponent = icon && (Icons as any)[icon];

  // Map status color to SVG fill
  const statusColors: Record<string, { stroke: string; fill: string }> = {
    ok: { stroke: 'var(--success)', fill: 'var(--success-soft)' },
    warn: { stroke: 'var(--warning)', fill: 'var(--warning-soft)' },
    critical: { stroke: 'var(--danger)', fill: 'var(--danger-soft)' },
    info: { stroke: 'var(--info)', fill: 'var(--info-soft)' },
  };

  const chartColor = statusColors[status] || statusColors.info;

  // Format sparkline data for Recharts
  const chartData = sparkline?.map((val, idx) => ({ id: idx, value: val }));

  const deltaIsPositive = delta && !delta.includes('▼') && !delta.includes('-') && !delta.includes('Critical');

  const handleDrilldown = (e: React.MouseEvent) => {
    if (drillLink) {
      e.preventDefault();
      window.location.hash = drillLink;
    }
  };

  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between h-full relative overflow-hidden shadow group hover:border-primary/40 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider block truncate pr-4">
          {title}
        </span>
        {IconComponent && (
          <div className={`p-1 rounded bg-surface-muted text-text-muted group-hover:text-primary transition-colors`}>
            <IconComponent className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline space-x-2 my-1">
        <h3 className="text-2xl lg:text-3xl font-display font-bold text-text-primary tracking-tight leading-tight select-all">
          {value}
        </h3>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 mt-2">
        {delta && (
          <span className={`text-[10px] font-mono font-semibold ${
            deltaIsPositive ? 'text-success' : 'text-danger'
          }`}>
            {delta}
          </span>
        )}
        <StatusChip label={status} type={status} className="scale-90 origin-right" />
      </div>

      {chartData && chartData.length > 0 && (
        <div className="h-10 w-full mt-3 opacity-60 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor.stroke} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={chartColor.stroke} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor.stroke}
                strokeWidth={1.5}
                fill={`url(#grad-${title})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {drillLink && (
        <button
          onClick={handleDrilldown}
          className="absolute inset-x-0 bottom-0 py-1 bg-surface-muted hover:bg-primary/10 border-t border-border-custom text-center text-[9px] font-mono font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          EXECUTE SYSTEM DRILLDOWN
        </button>
      )}
    </div>
  );
}
