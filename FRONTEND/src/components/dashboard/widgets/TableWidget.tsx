/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StatusChip } from '../../shared';

interface TableWidgetRow {
  id: string;
  cells: string[];
  status?: { label: string; type: 'ok' | 'warn' | 'critical' | 'info' };
  actionLink?: string;
}

interface TableWidgetProps {
  title: string;
  headers: string[];
  rows: TableWidgetRow[];
  description?: string;
  emptyMessage?: string;
}

export function TableWidget({
  title,
  headers,
  rows,
  description,
  emptyMessage = "No active records registered in this block.",
}: TableWidgetProps) {

  const handleRowClick = (link?: string) => {
    if (link) {
      window.location.hash = link;
    }
  };

  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between h-full shadow overflow-hidden">
      <div>
        <h4 className="font-display text-xs font-bold text-white uppercase tracking-wider mb-1">
          {title}
        </h4>
        {description && (
          <p className="text-[10px] text-text-secondary font-mono mb-4 leading-normal">
            {description.toUpperCase()}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto my-1 max-h-[220px]">
        {rows.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-center p-4">
            <span className="text-text-muted font-mono text-[10px] uppercase">
              {emptyMessage}
            </span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border-custom bg-surface-muted sticky top-0 z-10">
                {headers.map((h, idx) => (
                  <th key={idx} className="p-2 font-mono text-[9px] text-text-muted uppercase tracking-wider font-bold">
                    {h}
                  </th>
                ))}
                {rows.some(r => r.status) && (
                  <th className="p-2 font-mono text-[9px] text-text-muted uppercase tracking-wider font-bold text-right">
                    Status
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/50 text-text-secondary">
              {rows.map((row) => (
                <tr 
                  key={row.id} 
                  onClick={() => handleRowClick(row.actionLink)}
                  className={`hover:bg-background-custom/30 transition-colors ${row.actionLink ? 'cursor-pointer' : ''}`}
                >
                  {row.cells.map((cell, idx) => (
                    <td key={idx} className="p-2 font-sans text-xs truncate max-w-[140px]" title={cell}>
                      {cell}
                    </td>
                  ))}
                  {row.status && (
                    <td className="p-2 text-right">
                      <StatusChip label={row.status.label} type={row.status.type} className="scale-75 origin-right" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
