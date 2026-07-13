/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, Cpu, Network, Wrench, ShieldCheck, History, Search, Download, 
  Plus, Check, ArrowRight, Sparkles, Filter, ExternalLink, RefreshCw, 
  Upload, CheckCircle, AlertTriangle, FileCheck, Info, User, Layers, HelpCircle
} from 'lucide-react';
import { StatusChip, ConfidenceBadge, SkeletonLoader } from '../shared';
import { useAuthStore } from '../../stores/authStore';
import { MaintenanceHub as NewMaintenanceHub } from './maintenance/MaintenanceHub';

// ============================================================================
// 1. DOCUMENTS LIBRARY & LIVE INGESTION CONSOLE
// ============================================================================
// Migrated to separate modular view folder: /src/components/views/documents/DocumentsLibrary.tsx
// Old placeholder content removed.

// ============================================================================
// 2. KNOWLEDGE GRAPH EXPLORER (React Flow Canvas)
// ============================================================================
export { KnowledgeGraphExplorer } from './knowledge-graph/KnowledgeGraphExplorer';

// ============================================================================
// 3. EQUIPMENT 360° TELEMETRY DASHBOARD
// ============================================================================
// Migrated to separate modular view file: /src/components/views/equipment/Equipment360.tsx
export { Equipment360 } from './equipment/Equipment360';

// ============================================================================
// 4. MAINTENANCE & WORK ORDERS HUBS
// ============================================================================
export function MaintenanceHub() {
  return <NewMaintenanceHub />;
}

// ============================================================================
// 5. COMPLIANCE GAPS & AUDIT HUB
// ============================================================================
import NewComplianceHub from './compliance/ComplianceHub';

export function ComplianceHub() {
  return <NewComplianceHub />;
}

// ============================================================================
// 6. LESSONS LEARNED HUB
// ============================================================================
import { LessonsLearnedHub as NewLessonsLearnedHub } from './lessons/LessonsLearnedHub';

export function LessonsLearnedHub() {
  return <NewLessonsLearnedHub />;
}

// ============================================================================
// 7. QUALITY HUB
// ============================================================================
import { QualityHub as NewQualityHub } from './quality/QualityHub';

export function QualityHub() {
  return <NewQualityHub />;
}

// ============================================================================
// 8. NOTIFICATIONS HUB
// ============================================================================
import { NotificationsHub as NewNotificationsHub } from './notifications/NotificationsHub';

export function NotificationsHub() {
  return <NewNotificationsHub />;
}

// ============================================================================
// 9. ANALYTICS HUB
// ============================================================================
import { AnalyticsHub as NewAnalyticsHub } from './analytics/AnalyticsHub';

export function AnalyticsHub() {
  return <NewAnalyticsHub />;
}

// ============================================================================
// 6. SECURITY AUDIT LOGS
// ============================================================================
interface AuditRecord {
  id: string;
  time: string;
  actor: string;
  action: string;
  node: string;
  diff: string;
}

export function AuditLogs() {
  const records: AuditRecord[] = [
    { id: '1', time: '2026-07-12 11:04:12', actor: 'Arun Kumar (Tech)', action: 'WO CLOSE_OUT_PERMIT', node: 'WO-2041', diff: 'Step 1 checklist verified. Security hash signed.' },
    { id: '2', time: '2026-07-12 10:48:22', actor: 'Priya Sharma (Eng)', action: 'RCA UPDATE_WHY_ logic', node: 'INC-991', diff: 'Causal level Why-3 added to pump cavitation tree.' },
    { id: '3', time: '2026-07-12 09:12:41', actor: 'Meena Iyer (Comp)', action: 'EVIDENCE_PACKAGE GENERATE', node: 'REG-OISD-118', diff: 'Evidence bundle compiled for Area REF-A. PDF rendered.' },
    { id: '4', time: '2026-07-12 08:34:00', actor: 'Aditya Vardhan (Admin)', action: 'CONFIG OVERRIDE_LLM', node: 'SYSTEM-AI', diff: 'Temperature override from 0.2 to 0.1 for high-precision RAG.' }
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-border-custom pb-4">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
          <span>Immutable Operational Audit Ledger</span>
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Cryptographically aligned system logs recording human actions, AI configuration overrides, and closure hashes.
        </p>
      </div>

      <div className="bg-surface border border-border-custom rounded-lg overflow-hidden">
        <div className="p-3 border-b border-border-custom bg-surface-muted/30 font-mono text-[10px] text-text-muted uppercase tracking-wider">
          Node Security Ledger Logs [LIVE]
        </div>

        <div className="overflow-x-auto text-xs font-mono">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] text-text-muted uppercase">
                <th className="p-3">Timestamp</th>
                <th className="p-3">Authorized Actor</th>
                <th className="p-3">Operation Action</th>
                <th className="p-3">Target Node</th>
                <th className="p-3">Ledger Diff Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom/50 text-text-secondary">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-background-custom/30 transition-colors">
                  <td className="p-3 text-white select-all">{r.time}</td>
                  <td className="p-3 font-sans text-text-primary font-semibold">{r.actor}</td>
                  <td className="p-3"><span className="text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 text-[10px]">{r.action}</span></td>
                  <td className="p-3 text-accent">{r.node}</td>
                  <td className="p-3 font-sans text-xs text-text-muted max-w-xs truncate" title={r.diff}>{r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
