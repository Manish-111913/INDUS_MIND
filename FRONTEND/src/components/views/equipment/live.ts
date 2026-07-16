/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LIVE-mode reshapers for the Equipment 360 hub.
 *
 * These are PURE functions: they take already-unwrapped backend payloads (as
 * returned by `api.get`, after adapters.ts) and reshape them into the EXACT
 * fixture TypeScript types from ./mockEquipmentData so no other component needs
 * to change. Fetching/orchestration lives in Equipment360.tsx.
 *
 * Backend endpoints consumed (all pass through adapters unchanged unless noted):
 *   GET /equipment                → adaptEquipment[]  (list rows)
 *   GET /equipment/{id}           → adaptEquipment    (detail base)
 *   GET /equipment/{id}/summary   → 360 header
 *   GET /equipment/{id}/history   → TimelineEvent[]
 *   GET /equipment/{id}/metrics   → MTBF/MTTR/health
 *   GET /equipment/tree?plant_id  → { plant_id, areas[], unassigned[] }
 *   GET /plants                   → PlantRead[]  (for plant names)
 */

import type {
  EquipmentAsset,
  EquipmentSpec,
  AiSummary,
  KeyMetrics,
  EventLog,
  PredictionCard,
  TreeNode,
} from './mockEquipmentData';

// ── shape of the adapters.ts adaptEquipment() output ─────────────────────────
export interface AdaptedEquipment {
  id: string;
  tag: string;
  name: string;
  criticality: string;
  status: string;
  manufacturer: string;
  model: string;
  healthScore: number | null;
  plantId: string | null;
  areaId: string | null;
  specs: Record<string, any>;
  _raw?: any;
}

// ── sensible empty defaults for sub-fields with no (or not-yet-fetched) source ─
export function emptyAiSummary(): AiSummary {
  return { text: '', confidence: 0, evidenceLinks: [] };
}

export function emptyMetrics(): KeyMetrics {
  return {
    mtbf: '—',
    mttr: '—',
    availability: '—',
    mtbfSparkline: [],
    mttrSparkline: [],
    availSparkline: [],
  };
}

export function emptyPredictions(): PredictionCard {
  return {
    riskScore: 0,
    predictedMode: '—',
    drivers: [],
    recommendedAction: { title: '—', desc: 'No predictive model output is available for this asset yet.' },
  };
}

// ── scalar mappers ───────────────────────────────────────────────────────────
export function mapCriticality(c: string | null | undefined): 'A' | 'B' | 'C' {
  const up = String(c ?? '').trim().toUpperCase();
  return up === 'A' || up === 'B' || up === 'C' ? (up as 'A' | 'B' | 'C') : 'C';
}

export function healthOf(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Backend status codes are lookup-driven ('operational', 'maintenance', 'down',
 * …). The fixture type is the 3-value UI set ok|warn|critical which StatusChip
 * keys off. Map known codes; fall back to health bands for unknown codes.
 */
export function mapStatus(status: string | null | undefined, health: number): 'ok' | 'warn' | 'critical' {
  const s = String(status ?? '').trim().toLowerCase();
  if (['operational', 'running', 'ok', 'active', 'online', 'normal'].includes(s)) return 'ok';
  if (['maintenance', 'standby', 'degraded', 'warning', 'warn', 'service'].includes(s)) return 'warn';
  if (['down', 'failed', 'critical', 'offline', 'fault', 'tripped', 'decommissioned'].includes(s)) return 'critical';
  // unknown code → derive from health so the chip stays meaningful
  if (health >= 80) return 'ok';
  if (health >= 50) return 'warn';
  return 'critical';
}

export function specsToArray(specs: Record<string, any> | null | undefined): EquipmentSpec[] {
  if (!specs || typeof specs !== 'object') return [];
  return Object.entries(specs).map(([label, value]) => ({
    label: String(label),
    value: value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
}

function toDateStr(ts: any): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 10);
}

// ── registry rows ────────────────────────────────────────────────────────────
/**
 * Build an EquipmentAsset registry row from an adapted list/detail item.
 * Header fields are populated; rich detail sub-fields are defaulted to empties
 * and filled in later when a single asset is selected.
 */
export function listItemToAsset(
  item: AdaptedEquipment,
  opts: { plantName?: string; areaName?: string } = {},
): EquipmentAsset {
  const health = healthOf(item.healthScore);
  const rawType = item._raw?.type ?? item.specs?.type ?? '';
  return {
    id: item.id,
    tag: item.tag,
    name: item.name,
    type: rawType ? String(rawType) : '',
    criticality: mapCriticality(item.criticality),
    health,
    status: mapStatus(item.status, health),
    lastMaint: item._raw?.install_date ? toDateStr(item._raw.install_date) : '—',
    openWos: 0,
    compliance: 'unmapped',
    plant: opts.plantName ?? '',
    area: opts.areaName ?? '',
    unit: '',
    specs: specsToArray(item.specs),
    aiSummary: emptyAiSummary(),
    metrics: emptyMetrics(),
    history: [],
    documents: [],
    scheduledWos: [],
    clauses: [],
    relationships: [],
    predictions: emptyPredictions(),
    pastRca: [],
  };
}

// ── detail bundle → Partial<EquipmentAsset> merged onto the active row ────────
export function summaryToPartial(summary: any): Partial<EquipmentAsset> {
  if (!summary) return {};
  const health = summary.health_score != null ? healthOf(summary.health_score) : undefined;
  const partial: Partial<EquipmentAsset> = {
    tag: summary.tag ?? undefined,
    name: summary.name ?? undefined,
    type: summary.type ? String(summary.type) : undefined,
    criticality: summary.criticality ? mapCriticality(summary.criticality) : undefined,
    plant: summary.plant?.name ?? undefined,
    area: summary.area?.name ?? undefined,
    specs: summary.specs ? specsToArray(summary.specs) : undefined,
  };
  if (health != null) {
    partial.health = health;
    partial.status = mapStatus(summary.status, health);
  } else if (summary.status) {
    partial.status = mapStatus(summary.status, 0);
  }
  // strip undefined so we never overwrite good base values with blanks
  Object.keys(partial).forEach((k) => (partial as any)[k] === undefined && delete (partial as any)[k]);
  return partial;
}

const HISTORY_TYPES: EventLog['type'][] = ['work_order', 'failure', 'inspection', 'document'];

function mapHistoryType(source: string, type: string): EventLog['type'] {
  const hay = `${source} ${type}`.toLowerCase();
  const hit = HISTORY_TYPES.find((t) => hay.includes(t) || hay.includes(t.replace('_', '')));
  if (hit) return hit;
  if (hay.includes('audit')) return 'inspection';
  return 'document';
}

function historyLink(t: EventLog['type']): string {
  if (t === 'work_order' || t === 'failure') return '#maintenance';
  if (t === 'document') return '#documents';
  return '#admin/audit-log';
}

export function mapHistory(events: any[]): EventLog[] {
  if (!Array.isArray(events)) return [];
  return events.map((e, i) => {
    const t = mapHistoryType(e?.source ?? '', e?.type ?? '');
    return {
      id: String(e?.ref_id ?? `${e?.source ?? 'evt'}-${i}`),
      date: toDateStr(e?.timestamp),
      type: t,
      title: e?.title ?? e?.type ?? 'Event',
      desc: e?.payload?.description ?? e?.payload?.desc ?? e?.payload?.summary ?? '',
      status: e?.payload?.status ?? '',
      link: historyLink(t),
    };
  });
}

/** Most-recent work_order date from a mapped history list (drives lastMaint). */
export function lastMaintFromHistory(history: EventLog[]): string | undefined {
  const wo = history.filter((h) => h.type === 'work_order' && h.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  return wo.length ? wo[0].date : undefined;
}

export function mapMetrics(m: any): KeyMetrics {
  if (!m) return emptyMetrics();
  const num = (v: any) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const mtbf = num(m.mtbf_hours);
  const mttr = num(m.mttr_hours);
  const avail = num(m.availability ?? m.availability_pct ?? m.uptime);
  const series = (v: any): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : []);
  return {
    mtbf: mtbf != null ? `${Math.round(mtbf)} hrs` : '—',
    mttr: mttr != null ? `${mttr.toFixed(1)} hrs` : '—',
    availability: avail != null ? `${avail.toFixed(1)}%` : '—',
    mtbfSparkline: series(m.mtbf_series ?? m.mtbf_trend),
    mttrSparkline: series(m.mttr_series ?? m.mttr_trend),
    availSparkline: series(m.availability_series ?? m.availability_trend),
  };
}

export function openWosFromMetrics(m: any): number {
  const n = Number(m?.open_work_orders);
  return Number.isFinite(n) ? n : 0;
}

// ── hierarchy tree → Record<string, TreeNode> (mockEquipmentTree shape) ───────
export interface TreeBuildResult {
  tree: Record<string, TreeNode>;
  areaNameById: Record<string, string>;
  plantNameByAreaId: Record<string, string>;
}

function collectEquipment(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes || []) {
    acc.push(n);
    if (Array.isArray(n.children) && n.children.length) collectEquipment(n.children, acc);
  }
  return acc;
}

/**
 * Merge one-or-more per-plant tree responses into a single flat Record keyed the
 * same way the fixture is (plant-<id>, area-<id>, equip-<id>). The backend has no
 * "unit" level, so equipment sits directly under its area (rendered in the tree's
 * unit slot). Also returns id→name maps used to enrich registry rows.
 */
export function buildTree(
  trees: any[],
  plantNameById: Record<string, string> = {},
): TreeBuildResult {
  const tree: Record<string, TreeNode> = {};
  const areaNameById: Record<string, string> = {};
  const plantNameByAreaId: Record<string, string> = {};

  for (const resp of trees) {
    if (!resp) continue;
    const plantId = String(resp.plant_id);
    const plantKey = `plant-${plantId}`;
    const plantName = plantNameById[plantId] || 'Plant';
    const areaKeys: string[] = [];

    const areaBlocks = [
      ...(Array.isArray(resp.areas) ? resp.areas : []),
      ...(Array.isArray(resp.unassigned) && resp.unassigned.length
        ? [{ id: `unassigned-${plantId}`, name: 'Unassigned', code: '', equipment: resp.unassigned }]
        : []),
    ];

    for (const area of areaBlocks) {
      const areaId = String(area.id);
      const areaKey = `area-${areaId}`;
      areaNameById[areaId] = area.name;
      plantNameByAreaId[areaId] = plantName;

      const equipment = collectEquipment(area.equipment || []);
      const equipKeys: string[] = [];
      for (const eq of equipment) {
        const eqId = String(eq.id);
        const eqKey = `equip-${eqId}`;
        tree[eqKey] = {
          id: eqKey,
          label: `${eq.tag}${eq.name ? ` ${eq.name}` : ''}`.trim(),
          type: 'equipment',
          equipmentId: eqId,
        };
        equipKeys.push(eqKey);
      }

      tree[areaKey] = {
        id: areaKey,
        label: area.name,
        type: 'area',
        childrenIds: equipKeys,
      };
      areaKeys.push(areaKey);
    }

    tree[plantKey] = {
      id: plantKey,
      label: plantName,
      type: 'plant',
      childrenIds: areaKeys,
    };
  }

  return { tree, areaNameById, plantNameByAreaId };
}
