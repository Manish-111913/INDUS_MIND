/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import * as Icons from 'lucide-react';

interface ShortcutItem {
  label: string;
  sublabel?: string;
  icon: string; // Lucide icon name
  hashUrl?: string;
  onClick?: () => void;
  accent?: 'primary' | 'accent' | 'critical' | 'normal';
}

interface ShortcutGridProps {
  title: string;
  shortcuts: ShortcutItem[];
  description?: string;
}

export function ShortcutGrid({
  title,
  shortcuts,
  description,
}: ShortcutGridProps) {

  const handleShortcutClick = (item: ShortcutItem) => {
    if (item.onClick) {
      item.onClick();
    } else if (item.hashUrl) {
      window.location.hash = item.hashUrl;
    }
  };

  const getAccentClass = (accent?: string) => {
    switch (accent) {
      case 'accent':
        return 'text-accent border-accent/20 bg-accent/5 hover:bg-accent/10';
      case 'critical':
        return 'text-status-critical border-status-critical/20 bg-status-critical/5 hover:bg-status-critical/10';
      case 'primary':
        return 'text-primary border-primary/20 bg-primary/5 hover:bg-primary/10';
      case 'normal':
      default:
        return 'text-text-primary border-border-custom hover:bg-surface-muted';
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

      <div className="flex-1 grid grid-cols-2 gap-2 my-1 max-h-[220px] overflow-y-auto">
        {shortcuts.map((sc, idx) => {
          const IconComponent = (Icons as any)[sc.icon] || Icons.HelpCircle;
          return (
            <button
              key={idx}
              onClick={() => handleShortcutClick(sc)}
              className={`p-3 border rounded text-left flex flex-col justify-between items-start transition-all cursor-pointer h-24 relative overflow-hidden group ${getAccentClass(
                sc.accent
              )}`}
            >
              <div className="p-1 rounded bg-black/30 mb-2">
                <IconComponent className="w-4 h-4" />
              </div>
              <div className="w-full">
                <span className="block font-sans text-xs font-bold text-white truncate leading-tight group-hover:text-primary transition-colors">
                  {sc.label}
                </span>
                {sc.sublabel && (
                  <span className="block font-mono text-[9px] text-text-muted mt-0.5 truncate uppercase">
                    {sc.sublabel}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
