/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { History, FileText, CheckCircle2, Cpu, Eye, ArrowRight } from 'lucide-react';
import { StatusChip } from '../../shared';

interface ActivityItem {
  id: string;
  title: string;
  subtitle?: string;
  time: string;
  progress?: number; // 0 to 100 for linear progress indicator
  status?: { label: string; type: 'ok' | 'warn' | 'critical' | 'info' };
  iconType?: 'file' | 'cpu' | 'check' | 'log';
}

interface ActivityFeedProps {
  title: string;
  items: ActivityItem[];
  description?: string;
}

export function ActivityFeed({
  title,
  items,
  description,
}: ActivityFeedProps) {

  const getIcon = (type?: string) => {
    switch (type) {
      case 'file':
        return <FileText className="w-4 h-4 text-primary" />;
      case 'cpu':
        return <Cpu className="w-4 h-4 text-accent" />;
      case 'check':
        return <CheckCircle2 className="w-4 h-4 text-status-ok" />;
      case 'log':
      default:
        return <History className="w-4 h-4 text-text-secondary" />;
    }
  };

  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between h-full shadow overflow-hidden">
      <div>
        <div className="flex justify-between items-center border-b border-border-custom/50 pb-2 mb-3">
          <h4 className="font-display text-xs font-bold text-white uppercase tracking-wider">
            {title}
          </h4>
          <StatusChip label="Live Stream" type="ok" className="scale-75 origin-right" />
        </div>
        {description && (
          <p className="text-[10px] text-text-secondary font-mono mb-3 leading-normal">
            {description.toUpperCase()}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3.5 my-1 pr-1 max-h-[260px]">
        {items.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-center">
            <span className="text-text-muted font-mono text-[10px] uppercase">
              No live telemetry signal.
            </span>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-2.5 bg-background-custom/30 rounded border border-border-custom/40 space-y-2">
              <div className="flex items-start justify-between space-x-3 text-xs">
                <div className="flex items-start space-x-2.5 min-w-0">
                  <div className="p-1.5 rounded bg-surface border border-border-custom mt-0.5">
                    {getIcon(item.iconType)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-white text-[11px] truncate leading-tight" title={item.title}>
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-[10px] text-text-secondary font-sans mt-0.5 truncate max-w-[190px]">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[9px] font-mono text-text-muted block">{item.time}</span>
                  {item.status && (
                    <StatusChip 
                      label={item.status.label} 
                      type={item.status.type} 
                      className="scale-[0.7] origin-right mt-1" 
                    />
                  )}
                </div>
              </div>

              {/* Progress bar logic if present */}
              {typeof item.progress === 'number' && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-muted">
                    <span>STAGE PROGRESS</span>
                    <span className="text-primary font-bold">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-surface-muted h-1 rounded-full overflow-hidden">
                    <div 
                      className="bg-primary h-full rounded-full transition-all duration-500" 
                      style={{ width: `${item.progress}%` }} 
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
