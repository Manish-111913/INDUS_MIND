/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Bot, Sparkles, Link as LinkIcon } from 'lucide-react';
import { ConfidenceBadge } from '../../shared';

interface EvidenceLink {
  label: string;
  hashUrl: string;
}

interface ActionButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface AiInsightCardProps {
  headline: string;
  body: string;
  confidence: 'High' | 'Med' | 'Low' | number;
  evidenceLinks?: EvidenceLink[];
  actionButtons?: ActionButton[];
}

export function AiInsightCard({
  headline,
  body,
  confidence,
  evidenceLinks = [],
  actionButtons = [],
}: AiInsightCardProps) {

  const handleLinkClick = (e: React.MouseEvent, hashUrl: string) => {
    e.preventDefault();
    window.location.hash = hashUrl;
  };

  return (
    <div className="bg-ai-soft/40 border border-ai-soft-border border-l-4 border-l-ai p-4 rounded-lg flex flex-col justify-between h-full shadow-card relative">
      <div className="absolute top-3 right-3">
        <Sparkles className="w-4 h-4 text-ai animate-pulse" />
      </div>

      <div>
        {/* Header Block */}
        <div className="flex items-center space-x-2 mb-3">
          <Bot className="w-4.5 h-4.5 text-ai" />
          <span className="font-display text-[10px] font-bold text-ai uppercase tracking-widest">
            AI Operational Synthesis
          </span>
        </div>

        {/* Content Headline & Body */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-text-primary tracking-tight uppercase leading-snug">
              {headline}
            </h4>
            <ConfidenceBadge confidence={confidence} />
          </div>
          <p className="text-xs text-text-2 leading-relaxed font-sans">
            {body}
          </p>
        </div>

        {/* Evidence Links */}
        {evidenceLinks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border-custom/30 space-y-1.5">
            <span className="block text-[9px] font-mono font-bold text-text-3 uppercase tracking-wider">
              Correlated Historical Evidence:
            </span>
            <div className="flex flex-wrap gap-2">
              {evidenceLinks.map((link, idx) => (
                <button
                  key={idx}
                  onClick={(e) => handleLinkClick(e, link.hashUrl)}
                  className="inline-flex items-center space-x-1.5 px-2 py-1 bg-surface hover:bg-surface-2 border border-border-custom text-[10px] font-mono text-primary rounded cursor-pointer transition-colors"
                >
                  <LinkIcon className="w-3 h-3 text-text-3" />
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons Footer */}
      {actionButtons.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2 pt-2 border-t border-border-custom/20">
          {actionButtons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.onClick}
              className={`px-3 py-1.5 text-xs font-semibold font-mono uppercase tracking-wide rounded cursor-pointer transition-colors ${
                btn.primary
                  ? 'bg-primary hover:bg-primary-hover text-on-primary font-bold'
                  : 'bg-surface-2 hover:bg-surface-3 border border-border-strong text-text'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
