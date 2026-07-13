/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface HeatmapWidgetProps {
  title: string;
  rows: string[];
  cols: string[];
  data: number[][]; // rows x cols grid
  minLabel?: string;
  maxLabel?: string;
  colorScale?: 'red' | 'teal' | 'amber';
  description?: string;
}

export function HeatmapWidget({
  title,
  rows,
  cols,
  data,
  minLabel = "Low Risk / Nominal",
  maxLabel = "Critical Fault / Extreme",
  colorScale = 'teal',
  description,
}: HeatmapWidgetProps) {

  // Color logic based on scale and values from 0 to 100
  const getCellStyles = (val: number) => {
    const opacity = Math.max(10, Math.min(100, val));
    
    switch (colorScale) {
      case 'red':
        return {
          bg: `color-mix(in srgb, var(--danger) ${opacity}%, transparent)`,
          text: opacity > 60 ? 'var(--on-primary)' : 'var(--text-2)',
          border: 'color-mix(in srgb, var(--danger) 20%, transparent)'
        };
      case 'amber':
        return {
          bg: `color-mix(in srgb, var(--warning) ${opacity}%, transparent)`,
          text: opacity > 60 ? 'var(--bg)' : 'var(--text-2)',
          border: 'color-mix(in srgb, var(--warning) 20%, transparent)'
        };
      case 'teal':
      default:
        return {
          bg: `color-mix(in srgb, var(--primary) ${opacity}%, transparent)`,
          text: opacity > 60 ? 'var(--on-primary)' : 'var(--text-2)',
          border: 'color-mix(in srgb, var(--primary) 20%, transparent)'
        };
    }
  };

  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between h-full shadow select-none">
      <div>
        <h4 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
          {title}
        </h4>
        {description && (
          <p className="text-[10px] text-text-secondary font-mono mb-4 leading-normal">
            {description.toUpperCase()}
          </p>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center my-2 overflow-x-auto">
        <div className="min-w-[280px]">
          {/* Header Row */}
          <div className="grid" style={{ gridTemplateColumns: `80px repeat(${cols.length}, minmax(0, 1fr))` }}>
            <div className="text-[9px] font-mono font-bold text-text-muted uppercase flex items-end pb-1.5">
              Area Node
            </div>
            {cols.map((col, idx) => (
              <div 
                key={idx} 
                className="text-[9px] font-mono font-bold text-text-muted uppercase text-center pb-1.5 truncate px-1"
                title={col}
              >
                {col}
              </div>
            ))}
          </div>

          {/* Matrix Rows */}
          <div className="space-y-1">
            {rows.map((rowName, rIdx) => (
              <div 
                key={rIdx} 
                className="grid items-center" 
                style={{ gridTemplateColumns: `80px repeat(${cols.length}, minmax(0, 1fr))` }}
              >
                {/* Row Title */}
                <div 
                  className="text-[10px] font-mono font-bold text-text-primary truncate pr-2" 
                  title={rowName}
                >
                  {rowName}
                </div>

                {/* Cells */}
                {cols.map((_, cIdx) => {
                  const cellVal = data[rIdx]?.[cIdx] ?? 0;
                  const styles = getCellStyles(cellVal);

                  return (
                    <div
                      key={cIdx}
                      style={{ 
                        backgroundColor: styles.bg,
                        color: styles.text,
                        borderColor: styles.border
                      }}
                      className="h-8 border flex items-center justify-center font-mono text-[10px] font-bold rounded-sm m-[1px] hover:ring-1 hover:ring-white/40 transition-all cursor-pointer"
                      title={`${rowName} ➔ ${cols[cIdx]}: ${cellVal}%`}
                    >
                      {cellVal}%
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-border-custom/50 flex items-center justify-between text-[9px] font-mono text-text-muted">
        <span>{minLabel.toUpperCase()}</span>
        <div className="flex space-x-0.5">
          {[15, 35, 55, 75, 95].map((val) => {
            const styles = getCellStyles(val);
            return (
              <div 
                key={val} 
                style={{ backgroundColor: styles.bg }} 
                className="w-3.5 h-2.5 rounded-sm border border-black/20" 
              />
            );
          })}
        </div>
        <span>{maxLabel.toUpperCase()}</span>
      </div>
    </div>
  );
}
