/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LIVE-mode reshaping helpers for the Compliance hub.
 *
 * These functions convert the FastAPI backend read models (see
 * BACKEND/app/modules/compliance/schemas.py + service.py) into the EXACT
 * fixture TypeScript types the child tabs already consume, so no child
 * component needs to change. MOCK mode never calls these — it keeps using the
 * fixtures + localStorage in ComplianceHub.tsx.
 */

import {
  Regulation,
  ClauseNode,
  MappedItem,
  ComplianceGap,
  EvidenceRecord,
  Audit,
  EvidencePackage,
} from './mockComplianceData';

// ── enum translators (backend code → fixture display label) ──────────────────

const SEVERITY_LABEL: Record<string, ComplianceGap['severity']> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const GAP_STATUS_LABEL: Record<string, ComplianceGap['status']> = {
  open: 'Open',
  in_remediation: 'Remediating',
  resolved: 'Closed',
  accepted_risk: 'Risk Accepted',
};

// Reverse map for PATCH bodies (used by the Hub when it can route a write).
export const GAP_STATUS_CODE: Record<string, string> = {
  Open: 'open',
  Remediating: 'in_remediation',
  Closed: 'resolved',
  'Risk Accepted': 'accepted_risk',
};

const MAPPING_TYPE_LABEL: Record<string, MappedItem['type']> = {
  procedure_doc: 'Procedure',
  equipment: 'Equipment',
  record: 'Record',
};

const MAPPING_STATUS_LABEL: Record<string, MappedItem['status']> = {
  proposed: 'Proposed',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

export const MAPPING_STATUS_CODE: Record<string, string> = {
  Proposed: 'proposed',
  Confirmed: 'confirmed',
  Rejected: 'rejected',
};

const AUDIT_STATUS_LABEL: Record<string, Audit['status']> = {
  planned: 'Scheduled',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function isoDate(v: any): string {
  if (!v || typeof v !== 'string') return '';
  return v.slice(0, 10);
}

// ── regulations ──────────────────────────────────────────────────────────────

/**
 * Merge GET /compliance/regulations (RegulationRead[]) with the per-regulation
 * summary from GET /compliance/coverage (clause/mapped/gap counts). Clause trees
 * are lazy-loaded per regulation, so `clauses` starts empty here.
 */
export function reshapeRegulations(regs: any[], coverage: any): Regulation[] {
  const summaryById: Record<string, any> = {};
  const summaries = (coverage && Array.isArray(coverage.regulations)) ? coverage.regulations : [];
  for (const s of summaries) summaryById[String(s.regulation_id)] = s;

  return (regs || []).map((r): Regulation => {
    const s = summaryById[String(r.id)] || {};
    return {
      id: String(r.id),
      code: r.code ?? '',
      title: r.title ?? '',
      body: (r.body ?? 'internal') as Regulation['body'],
      clausesCount: Number(s.clauses ?? 0),
      mappedPercent: Math.round(Number(s.coverage_pct ?? 0)),
      gaps: Number(s.gaps ?? 0),
      clauses: [],
    };
  });
}

/**
 * Build the recursive ClauseNode tree from a flat clause list
 * (GET /compliance/regulations/{id}/clauses → ClauseRead[]), attaching mapped
 * items (GET /compliance/mappings) and per-clause gap counts (GET /compliance/gaps).
 */
export function reshapeClauseTree(clauses: any[], mappings: any[], gaps: any[]): ClauseNode[] {
  const mapsByClause: Record<string, MappedItem[]> = {};
  for (const m of (mappings || [])) {
    const cid = String(m.clause_id);
    (mapsByClause[cid] ||= []).push({
      id: String(m.id),
      type: MAPPING_TYPE_LABEL[m.target_type] ?? 'Record',
      name: m.target_label ?? '',
      confidence: Math.round(Number(m.mapping_confidence ?? 0) * 100),
      status: MAPPING_STATUS_LABEL[m.status] ?? 'Proposed',
    });
  }

  const gapCountByClause: Record<string, number> = {};
  for (const g of (gaps || [])) {
    if (!g.clause_id) continue;
    if (g.status === 'resolved' || g.status === 'accepted_risk') continue;
    const cid = String(g.clause_id);
    gapCountByClause[cid] = (gapCountByClause[cid] ?? 0) + 1;
  }

  const nodeById: Record<string, ClauseNode> = {};
  for (const c of (clauses || [])) {
    const cid = String(c.id);
    nodeById[cid] = {
      id: cid,
      code: c.clause_no ?? '',
      title: c.title ?? '',
      text: c.text ?? '',
      gapsCount: gapCountByClause[cid] ?? 0,
      mappedItems: mapsByClause[cid] ?? [],
      children: [],
    };
  }

  // Wire parent/child relationships; collect roots.
  const roots: ClauseNode[] = [];
  for (const c of (clauses || [])) {
    const node = nodeById[String(c.id)];
    const parentId = c.parent_id ? String(c.parent_id) : null;
    if (parentId && nodeById[parentId]) {
      (nodeById[parentId].children ||= []).push(node);
    } else {
      roots.push(node);
    }
  }

  // Bubble child gap counts up so parent rows show the "N GAP" badge like the fixture.
  const rollup = (n: ClauseNode): number => {
    let total = n.gapsCount;
    for (const ch of (n.children || [])) total += rollup(ch);
    n.gapsCount = total;
    return total;
  };
  roots.forEach(rollup);

  return roots;
}

// ── gaps ─────────────────────────────────────────────────────────────────────

function reshapeEvidenceRecords(detail: any): EvidenceRecord[] {
  const records = (detail && Array.isArray(detail.records)) ? detail.records : [];
  return records.map((rec: any): EvidenceRecord => {
    const isSchedule = rec.type === 'schedule';
    return {
      id: String(rec.id ?? ''),
      name: rec.label ?? String(rec.id ?? ''),
      date: isoDate(rec.at ?? rec.next_due_at),
      details: isSchedule
        ? `Active maintenance schedule${rec.interval_days ? ` (${rec.interval_days}d interval)` : ''}`
        : 'Maintenance / test work-order record',
      status: rec.status ?? '',
    };
  });
}

/**
 * Reshape one GapRead → ComplianceGap. GapRead carries `detail` (the side-by-side
 * clause/procedure/records comparison) on every row, so this works for both the
 * list and the GET /compliance/gaps/{id} detail fetch. Fields with no backend
 * source get safe defaults (see the report notes).
 */
export function reshapeGap(g: any): ComplianceGap {
  const detail = g.detail || {};
  const clause = detail.clause || {};
  const procedure = detail.procedure || {};
  const requirement = detail.requirement || {};
  const regCode = clause.regulation_code ?? '';
  const clauseNo = clause.clause_no ?? '';

  return {
    id: String(g.id),
    clauseId: g.clause_id ? String(g.clause_id) : '',
    clauseCode: `${regCode} ${clauseNo}`.trim(),
    regulationId: '', // no backend source (not rendered)
    regulationCode: regCode,
    regulationTitle: clause.regulation_title ?? '',
    description: g.description ?? '',
    severity: SEVERITY_LABEL[g.severity] ?? 'Medium',
    affectedEquipment: '', // no equipment label in gap detail
    affectedEquipmentId: g.affected_equipment_id ? String(g.affected_equipment_id) : '',
    affectedProcedure: procedure.title ?? '',
    affectedProcedureCode: '', // no backend source
    owner: g.owner_id ? String(g.owner_id) : 'Unassigned',
    due: isoDate(g.due_at),
    status: GAP_STATUS_LABEL[g.status] ?? 'Open',
    clauseText: clause.text ?? '',
    sopExcerpt: procedure.snippet ?? requirement.description ?? '',
    aiExplanation: g.ai_explanation ?? '',
    evidenceRecords: reshapeEvidenceRecords(detail),
    history: [], // no backend source exposed via this endpoint
  };
}

export function reshapeGaps(list: any[]): ComplianceGap[] {
  return (list || []).map(reshapeGap);
}

// ── audits ───────────────────────────────────────────────────────────────────

export function reshapeAudits(list: any[]): Audit[] {
  return (list || []).map((a): Audit => {
    const scope = a.scope || {};
    return {
      id: String(a.id),
      title: a.name ?? '',
      regulationSet: a.body ?? scope.regulation_code ?? scope.regulation_set ?? '',
      plantArea: scope.plant_area ?? scope.area ?? '',
      date: isoDate(a.scheduled_at),
      status: AUDIT_STATUS_LABEL[a.status] ?? 'Scheduled',
      auditor: a.auditor ?? '',
    };
  });
}

// ── evidence packages ────────────────────────────────────────────────────────

export function reshapeEvidencePackage(p: any): EvidencePackage {
  const scope = p.scope || {};
  const summary = p.summary || {};
  const coverage = Array.isArray(summary.coverage) ? summary.coverage : [];
  const sources = summary.manifest && Array.isArray(summary.manifest.sources)
    ? summary.manifest.sources
    : [];

  const avgCoverage = coverage.length
    ? Math.round(coverage.reduce((acc: number, c: any) => acc + Number(c.coverage_pct ?? 0), 0) / coverage.length)
    : 0;

  const regulations = Array.isArray(scope.regulations)
    ? scope.regulations
    : (scope.regulation_code ? [scope.regulation_code] : []);

  const generatedAt = summary.generated_at
    ? String(summary.generated_at).replace('T', ' ').slice(0, 16)
    : (p.created_at ? String(p.created_at).replace('T', ' ').slice(0, 16) : '');

  return {
    id: String(p.id),
    name: p.title ?? 'Compliance evidence package',
    regulations,
    plantArea: scope.plant_area ?? scope.area ?? '',
    dateRange: scope.date_range ?? '',
    itemCount: sources.length,
    coveragePercent: avgCoverage,
    generatedAt,
    downloadUrl: '#', // real presigned URL requires a separate /download-url call
    shareLink: p.share_token
      ? `https://indusmind.app/share/${p.share_token}`
      : '#',
  };
}

export function reshapeEvidencePackages(list: any[]): EvidencePackage[] {
  return (list || []).map(reshapeEvidencePackage);
}

// ── diff helpers for optimistic → API write bridging ─────────────────────────

/** Flatten every mapped item across a regulation's clause tree into id→status. */
export function flattenMappingStatuses(regs: Regulation[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (nodes: ClauseNode[] = []) => {
    for (const n of nodes) {
      for (const m of (n.mappedItems || [])) out[m.id] = m.status;
      walk(n.children);
    }
  };
  for (const r of (regs || [])) walk(r.clauses);
  return out;
}
