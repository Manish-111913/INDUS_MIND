/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, AlertCircle, Info, Flame, Check } from 'lucide-react';

interface DigestItem {
  id: string;
  type: 'safety' | 'audit' | 'general' | 'critical';
  text: string;
  checked?: boolean;
}

interface NotificationDigestProps {
  title: string;
  items: DigestItem[];
  description?: string;
  onToggleCheck?: (id: string) => void;
}

export function NotificationDigest({
  title,
  items,
  description,
  onToggleCheck,
}: NotificationDigestProps) {

  const getBadge = (type: string) => {
    switch (type) {
      case 'critical':
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-status-critical/10 text-status-critical border border-status-critical/20 rounded">
            <Flame className="w-2.5 h-2.5" />
            <span>CRITICAL</span>
          </span>
        );
      case 'safety':
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-status-ok/10 text-status-ok border border-status-ok/20 rounded">
            <ShieldCheck className="w-2.5 h-2.5" />
            <span>SAFETY</span>
          </span>
        );
      case 'audit':
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-status-warn/10 text-status-warn border border-status-warn/20 rounded">
            <AlertCircle className="w-2.5 h-2.5" />
            <span>AUDIT RISK</span>
          </span>
        );
      case 'general':
      default:
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-status-info/10 text-status-info border border-status-info/20 rounded">
            <Info className="w-2.5 h-2.5" />
            <span>INFO</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-surface border border-border-custom p-4 rounded-lg flex flex-col justify-between h-full shadow overflow-hidden">
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

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 my-1 max-h-[220px]">
        {items.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-center">
            <span className="text-text-muted font-mono text-[10px] uppercase">
              No pending alerts or checklists.
            </span>
          </div>
        ) : (
          items.map((item) => {
            const isCompleted = item.checked;
            
            return (
              <div 
                key={item.id} 
                onClick={() => onToggleCheck?.(item.id)}
                className={`p-3 bg-background-custom/20 border rounded transition-all flex items-start space-x-3 text-xs ${
                  onToggleCheck ? 'cursor-pointer hover:border-primary/50' : 'border-border-custom/50'
                } ${isCompleted ? 'opacity-50 border-status-ok/30 bg-status-ok/5' : ''}`}
              >
                {/* Checkbox trigger if clickable */}
                {onToggleCheck && (
                  <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
                    isCompleted ? 'bg-status-ok border-status-ok text-white' : 'border-border-custom bg-black/40'
                  }`}>
                    {isCompleted && <Check className="w-3.5 h-3.5" />}
                  </div>
                )}
                
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    {getBadge(item.type)}
                  </div>
                  <p className={`font-sans text-xs text-text-primary leading-relaxed ${isCompleted ? 'line-through text-text-muted' : ''}`}>
                    {item.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
