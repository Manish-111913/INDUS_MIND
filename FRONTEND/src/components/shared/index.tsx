/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LucideIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

// 1. Permission Gate Component
interface CanProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  if (hasPermission(permission)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

// 2. Skeleton Loader
export function SkeletonLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-muted rounded-md ${className}`} />
  );
}

// 3. Empty State Component
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-border-custom rounded-lg max-w-md mx-auto">
      <div className="p-3 mb-4 rounded-full bg-surface-muted text-primary border border-border-custom">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="font-display text-lg font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-secondary mb-6">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded cursor-pointer transition-colors duration-200"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// 4. Error State Component
interface ErrorStateProps {
  message: string;
  errorCode?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, errorCode = 'ERROR_UNKNOWN', onRetry }: ErrorStateProps) {
  return (
    <div className="p-6 bg-surface border border-status-critical/30 rounded-lg max-w-lg mx-auto">
      <div className="flex items-start space-x-4">
        <div className="p-2 rounded bg-status-critical/10 text-status-critical">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-status-critical mb-1">
            System Fault Detected
          </h3>
          <p className="text-xs text-text-primary font-mono bg-black/40 p-2 rounded mb-3 border border-border-custom overflow-x-auto select-all">
            Fault Code: {errorCode}
          </p>
          <p className="text-sm text-text-secondary mb-4">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-white bg-status-critical hover:bg-status-critical/90 rounded cursor-pointer transition-colors duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
              <span>Execute System Recovery</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 5. Status Chip
export const statusStyleMap: Record<string, string> = {
  ok: 'bg-success-soft text-success border-success-border',
  success: 'bg-success-soft text-success border-success-border',
  warn: 'bg-warning-soft text-warning border-warning-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  critical: 'bg-danger-soft text-danger border-danger-border',
  danger: 'bg-danger-soft text-danger border-danger-border',
  info: 'bg-info-soft text-info border-info-border',
  neutral: 'bg-surface-2 text-text-3 border-border',
  draft: 'bg-surface-2 text-text-3 border-border',
  'wo-hold': 'bg-[var(--wo-hold)]/10 text-[var(--wo-hold)] border-[var(--wo-hold)]/20',
  'risk-high': 'bg-[var(--risk-high)]/10 text-[var(--risk-high)] border-[var(--risk-high)]/20',
};

interface StatusChipProps {
  label: string;
  type: string;
  className?: string;
}

export function StatusChip({ label, type, className = '' }: StatusChipProps) {
  const key = (type || '').toLowerCase();
  const style = statusStyleMap[key] || statusStyleMap.neutral;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-mono font-medium border ${style} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current animate-pulse" />
      {label.toUpperCase()}
    </span>
  );
}

// 6. Confidence Badge
interface ConfidenceBadgeProps {
  confidence: 'High' | 'Med' | 'Low' | number;
  percentage?: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, percentage, className = '' }: ConfidenceBadgeProps) {
  let tier: 'High' | 'Med' | 'Low' = 'Low';
  let pct = percentage || 50;

  if (typeof confidence === 'string') {
    tier = confidence;
    if (!percentage) {
      pct = tier === 'High' ? 94 : tier === 'Med' ? 76 : 41;
    }
  } else {
    pct = confidence;
    if (pct >= 85) tier = 'High';
    else if (pct >= 60) tier = 'Med';
    else tier = 'Low';
  }

  const styles = {
    High: statusStyleMap.success,
    Med: statusStyleMap.warning,
    Low: statusStyleMap.danger,
  };

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-mono border ${styles[tier]} ${className}`}>
      <span className="mr-1 text-text-3 font-medium">AI CONFIDENCE:</span>
      <span className="font-bold">{tier} ({pct}%)</span>
    </div>
  );
}

// 7. Risk Badge
interface RiskBadgeProps {
  level: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  className?: string;
}

export function RiskBadge({ level, className = '' }: RiskBadgeProps) {
  const normalized = (level || '').toLowerCase();
  let styleClass = '';
  if (normalized.includes('low')) {
    styleClass = statusStyleMap.success;
  } else if (normalized.includes('medium')) {
    styleClass = statusStyleMap.warning;
  } else if (normalized.includes('high')) {
    styleClass = statusStyleMap['risk-high'];
  } else if (normalized.includes('critical')) {
    styleClass = statusStyleMap.danger;
  } else {
    styleClass = statusStyleMap.neutral;
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-mono font-medium border ${styleClass} ${className}`}>
      {level.toUpperCase()}
    </span>
  );
}

// Re-export shadcn-style Select dropdown
export { Select } from './Select';
export type { SelectOption } from './Select';
