/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LIVE-mode data layer for the Maintenance hub.
 *
 * MOCK mode is untouched — the hub keeps its fixture + localStorage behaviour.
 * In LIVE mode the hub calls the helpers here to (1) fetch the real backend
 * read models and (2) reshape each one into the EXACT fixture TypeScript types
 * the child components already consume, so no child component changes.
 *
 * Field names are taken verbatim from BACKEND/app/modules/maintenance/schemas.py
 * (WorkOrderRead, FailureRead, PredictionRead, ScheduleRead, AiContext) and
 * users/schemas.py (UserRead). Backend enum *codes* are mapped to the fixture
 * display enums. Backend identity we need for later mutations (uuid + optimistic
 * version) rides along on each object under `_uuid`/`_version` — extra keys the
 * fixture interfaces ignore and the children pass through untouched (same trick
 * adapters.ts uses with `_raw`).
 */

import { api, USE_MOCK } from '../../../lib/api/client';
import { apiRequest } from '../../../lib/api/client';
import {
  WorkOrder,
  FailureRecord,
  RiskPrediction,
  ScheduledPm,
  AiContext,
  Assignee,
  MOCK_ASSIGNEES,
} from './mockMaintData';

// PATCH is a real backend verb but the shared `api` object only exposes
// get/post/put/delete; go through the exported low-level request for it. In
// LIVE mode adapters.ts passes maintenance paths through unchanged.
const patch = <T>(path: string, body?: any) =>
  apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });

// ── enum maps (backend code ⇄ fixture display) ───────────────────────────────
const TYPE_FWD: Record<string, WorkOrder['type']> = {
  preventive: 'PM', corrective: 'CM', predictive: 'Predictive', inspection: 'Inspection',
};
const TYPE_REV: Record<string, string> = {
  PM: 'preventive', CM: 'corrective', Predictive: 'predictive', Inspection: 'inspection',
};
const PRIORITY_FWD: Record<string, WorkOrder['priority']> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
const PRIORITY_REV: Record<string, string> = {
  Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low',
};
const STATUS_FWD: Record<string, WorkOrder['status']> = {
  open: 'Open', in_progress: 'In Progress', on_hold: 'On Hold',
  review: 'Review', closed: 'Closed', cancelled: 'Closed',
};
export const STATUS_REV: Record<string, string> = {
  Open: 'open', 'In Progress': 'in_progress', 'On Hold': 'on_hold',
  Review: 'review', Closed: 'closed',
};
const RCA_FWD: Record<string, FailureRecord['rcaStatus']> = {
  none: 'Pending', pending: 'Pending', in_progress: 'In Progress',
  open: 'In Progress', published: 'Published', closed: 'Published',
};
const PRED_STATUS_FWD: Record<string, RiskPrediction['status']> = {
  open: 'active', active: 'active', accepted: 'accepted',
  dismissed: 'dismissed', snoozed: 'snoozed',
};

const cap = (s?: string | null): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const dateOnly = (v?: string | null): string => (v ? String(v).split('T')[0] : '');
const initials = (name?: string | null): string =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '--';

// ── reference maps (uuid → display) ──────────────────────────────────────────
export interface RefMaps {
  equipmentById: Record<string, { tag: string; name: string; areaId: string | null }>;
  tagToId: Record<string, string>;
  assigneeById: Record<string, Assignee>;
  nameToId: Record<string, string>;
  areaById: Record<string, string>;
  failureModeById: Record<string, string>;
}

const EMPTY_MAPS: RefMaps = {
  equipmentById: {}, tagToId: {}, assigneeById: {},
  nameToId: {}, areaById: {}, failureModeById: {},
};

const UNASSIGNED: Assignee = { name: 'Unassigned', email: '', avatar: '--', role: '' };

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api.get<T>(path);
  } catch (e) {
    console.error(`[maintenance:live] GET ${path} failed`, e);
    return fallback;
  }
}

/** Fetch + build the equipment/user/area/failure-mode lookup maps used by every reshaper. */
export async function loadRefMaps(): Promise<RefMaps> {
  const [equipment, users, areas, failureModes] = await Promise.all([
    safeGet<any[]>('/equipment', []),
    // /users needs user.manage; non-admin sessions 403 by design → fall back to
    // the fixture roster silently (this is expected, not an error).
    api.get<any[]>('/users').catch(() => null),
    safeGet<any[]>('/areas', []),
    safeGet<any[]>('/lookups/failure_modes', []),
  ]);

  const maps: RefMaps = {
    equipmentById: {}, tagToId: {}, assigneeById: {},
    nameToId: {}, areaById: {}, failureModeById: {},
  };

  for (const e of equipment || []) {
    const id = String(e.id);
    maps.equipmentById[id] = { tag: e.tag || '', name: e.name || '', areaId: e.areaId ?? null };
    if (e.tag) maps.tagToId[e.tag] = id;
  }
  for (const a of areas || []) {
    if (a?.id) maps.areaById[String(a.id)] = a.name || '';
  }
  for (const m of failureModes || []) {
    if (m?.id) maps.failureModeById[String(m.id)] = m.label || m.code || '';
  }
  if (Array.isArray(users)) {
    for (const u of users) {
      const assignee = adaptAssignee(u);
      maps.assigneeById[String(u.id)] = assignee;
      if (assignee.name) maps.nameToId[assignee.name] = String(u.id);
    }
  } else {
    // No /users access — surface the fixture assignees so new-WO creation still
    // has a roster; existing WOs show their assignee id can't be resolved.
    for (const a of MOCK_ASSIGNEES) maps.nameToId[a.name] = '';
  }
  return maps;
}

export function adaptAssignee(u: any): Assignee {
  const name = u.full_name || u.name || u.email || '';
  return {
    name,
    email: u.email || '',
    avatar: initials(name),
    role: Array.isArray(u.roles) && u.roles.length ? String(u.roles[0]) : (u.role || ''),
  };
}

// ── work orders ──────────────────────────────────────────────────────────────
function splitChecklist(checklist: any[]): { safety: WorkOrder['safetyChecklist']; steps: WorkOrder['steps'] } {
  const safety: WorkOrder['safetyChecklist'] = [];
  const steps: WorkOrder['steps'] = [];
  for (const item of Array.isArray(checklist) ? checklist : []) {
    if (item == null) continue;
    if (item.kind === 'step' || item.title !== undefined || item.desc !== undefined) {
      steps.push({
        id: String(item.id ?? `step-${steps.length}`),
        title: item.title ?? '',
        desc: item.desc ?? '',
        checked: !!item.checked,
        note: item.note ?? '',
        photo: item.photo ?? null,
      });
    } else if (item.text !== undefined || item.kind === 'safety') {
      safety.push({
        id: String(item.id ?? `s-${safety.length}`),
        text: item.text ?? '',
        checked: !!item.checked,
      });
    }
  }
  return { safety, steps };
}

function adaptParts(parts: any[]): WorkOrder['parts'] {
  return (Array.isArray(parts) ? parts : []).map((p) => ({
    partNo: p.part_no ?? p.partNo ?? '',
    name: p.name ?? '',
    qty: Number(p.qty ?? 0),
    cost: Number(p.cost ?? 0),
  }));
}

/**
 * WorkOrderRead → fixture WorkOrder. `detail` decides whether we expand the
 * nested checklist/parts (only fetched on the detail view); list rows keep the
 * cheap empty defaults so the registry renders instantly.
 */
export function adaptWorkOrder(w: any, maps: RefMaps, detail = false): WorkOrder {
  const eq = w.equipment_id ? maps.equipmentById[String(w.equipment_id)] : undefined;
  const assignee = w.assignee_id ? maps.assigneeById[String(w.assignee_id)] : undefined;
  const { safety, steps } = detail
    ? splitChecklist(w.checklist)
    : { safety: [], steps: [] };
  const wo: WorkOrder = {
    id: w.wo_number || String(w.id),
    title: w.title || '',
    equipmentId: eq?.tag || (w.equipment_id ? String(w.equipment_id) : ''),
    equipmentName: eq?.name || '',
    type: TYPE_FWD[w.type] || 'PM',
    priority: PRIORITY_FWD[w.priority] || 'Medium',
    assignee: assignee || UNASSIGNED,
    dueDate: dateOnly(w.due_at),
    status: STATUS_FWD[w.status] || 'Open',
    sla: w.sla_breach ? 'BREACH' : 'MET',
    slaDetails: w.sla_breach ? 'SLA BREACH (Response Target Violated)' : 'SLA MET',
    description: w.description || '',
    safetyChecklist: safety,
    steps,
    parts: detail ? adaptParts(w.parts) : [],
    labor: [],
    attachments: [],
    logs: [],
    closureNotes: w.closure_notes || undefined,
    actualHours: w.labor_hours != null ? Number(w.labor_hours) : undefined,
  };
  (wo as any)._uuid = String(w.id);
  (wo as any)._version = w.version;
  return wo;
}

/** fixture WorkOrder → WorkOrderCreate body. */
export function toWorkOrderCreateBody(wo: WorkOrder, maps: RefMaps): any {
  const checklist = [
    ...(wo.safetyChecklist || []).map((s) => ({ id: s.id, text: s.text, checked: s.checked, kind: 'safety' })),
    ...(wo.steps || []).map((s) => ({
      id: s.id, title: s.title, desc: s.desc, checked: s.checked, note: s.note, photo: s.photo, kind: 'step',
    })),
  ];
  return {
    title: wo.title,
    description: wo.description || null,
    equipment_id: maps.tagToId[wo.equipmentId] || null,
    type: TYPE_REV[wo.type] || 'preventive',
    priority: PRIORITY_REV[wo.priority] || 'medium',
    assignee_id: (wo.assignee && maps.nameToId[wo.assignee.name]) || null,
    due_at: wo.dueDate ? new Date(wo.dueDate).toISOString() : null,
    checklist,
    parts: (wo.parts || []).map((p) => ({ part_no: p.partNo, name: p.name, qty: p.qty, cost: p.cost })),
  };
}

// ── failures ─────────────────────────────────────────────────────────────────
export function adaptFailure(f: any, maps: RefMaps): FailureRecord {
  const eq = f.equipment_id ? maps.equipmentById[String(f.equipment_id)] : undefined;
  const rec: FailureRecord = {
    id: String(f.id),
    equipmentId: eq?.tag || (f.equipment_id ? String(f.equipment_id) : ''),
    equipmentName: eq?.name || '',
    failureMode:
      (f.failure_mode_id && maps.failureModeById[String(f.failure_mode_id)]) ||
      f.description ||
      'Unclassified failure',
    severity: (cap(f.severity) as FailureRecord['severity']) || 'Medium',
    date: dateOnly(f.occurred_at),
    downtimeMinutes: f.downtime_minutes != null ? Number(f.downtime_minutes) : 0,
    rcaStatus: RCA_FWD[f.rca_status] || 'Pending',
    incidentSummary: f.description || undefined,
  };
  (rec as any)._uuid = String(f.id);
  (rec as any)._version = f.version;
  return rec;
}

// ── predictions ──────────────────────────────────────────────────────────────
function windowLabel(start?: string | null, end?: string | null): string {
  if (!end) return '';
  const ms = new Date(end).getTime() - Date.now();
  if (Number.isNaN(ms)) return '';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Imminent';
  return `~${days} Days`;
}

export function adaptPrediction(p: any, maps: RefMaps): RiskPrediction {
  const eq = p.equipment_id ? maps.equipmentById[String(p.equipment_id)] : undefined;
  const rec: RiskPrediction = {
    id: String(p.id),
    equipmentId: eq?.tag || (p.equipment_id ? String(p.equipment_id) : ''),
    equipmentName: eq?.name || '',
    area: (eq?.areaId && maps.areaById[String(eq.areaId)]) || '',
    riskScore: Math.round(Number(p.risk_score ?? 0)),
    predictedFailureMode: p.predicted_failure_mode || 'Emerging risk',
    predictionWindow: windowLabel(p.window_start, p.window_end),
    drivers: (Array.isArray(p.drivers) ? p.drivers : []).map((d: any) => ({
      text: d.detail || d.factor || '',
      link: '#equipment',
    })),
    recommendedAction: p.recommendation || '',
    status: PRED_STATUS_FWD[p.status] || 'active',
    dismissReason: p.dismiss_reason || undefined,
  };
  (rec as any)._uuid = String(p.id);
  (rec as any)._version = p.version;
  return rec;
}

// ── schedules ────────────────────────────────────────────────────────────────
const SCHED_COLORS: Record<string, string> = {
  Critical: '#EF4444', High: '#0E7C86', Medium: '#F5A524', Low: '#10B981',
};

export function adaptSchedule(s: any, maps: RefMaps): ScheduledPm {
  const eq = s.equipment_id ? maps.equipmentById[String(s.equipment_id)] : undefined;
  const tpl = s.task_template || {};
  const priority = (cap(tpl.priority) as ScheduledPm['priority']) || 'Medium';
  const hours = Number(tpl.durationHours ?? tpl.duration_hours ?? tpl.estimatedHours ?? 4);
  const rec: ScheduledPm = {
    id: String(s.id),
    title: s.name || '',
    equipmentId: eq?.tag || (s.equipment_id ? String(s.equipment_id) : ''),
    equipmentName: eq?.name || '',
    date: dateOnly(s.next_due_at),
    durationHours: hours,
    type: tpl.type || s.frequency_type || 'PM',
    color: tpl.color || SCHED_COLORS[priority] || '#0E7C86',
    crew: tpl.crew || '',
    priority,
    estimatedHours: hours,
  };
  (rec as any)._uuid = String(s.id);
  (rec as any)._version = s.version;
  return rec;
}

/** fixture ScheduledPm → ScheduleCreate body. */
export function toScheduleCreateBody(pm: ScheduledPm, maps: RefMaps): any {
  return {
    equipment_id: maps.tagToId[pm.equipmentId] || null,
    name: pm.title,
    frequency_type: 'time',
    next_due_at: pm.date ? new Date(pm.date).toISOString() : null,
    task_template: {
      type: pm.type,
      priority: pm.priority,
      crew: pm.crew,
      durationHours: pm.durationHours,
      color: pm.color,
    },
    active: true,
  };
}

// ── AI context (GET /work-orders/{id}/ai-context) ────────────────────────────
export function adaptAiContext(c: any): AiContext {
  const pct = (v: any) => Math.round(Number(v ?? 0) * 100);
  return {
    similarWos: (Array.isArray(c?.similar_work_orders) ? c.similar_work_orders : []).map((s: any) => ({
      id: s.wo_number || String(s.id || ''),
      title: s.title || '',
      fixedBy: s.fixed_by || '',
      confidence: pct(s.confidence),
      citation: s.citation?.title || '',
      citationDocId: s.citation?.document_id || '',
    })),
    sopSteps: (Array.isArray(c?.sop_steps) ? c.sop_steps : []).map((s: any) => ({
      title: s.title || '',
      excerpt: s.excerpt || '',
      confidence: pct(s.confidence),
      docName: s.citation?.title || '',
      docId: s.citation?.document_id || '',
    })),
    failureModes: (Array.isArray(c?.failure_modes) ? c.failure_modes : []).map((f: any) => ({
      mode: f.mode || '',
      frequency: `${f.frequency ?? 0}×`,
      confidence: pct(f.confidence),
      recommendation: f.recommendation || '',
    })),
  };
}

// ── the aggregate fetch used to seed the hub ─────────────────────────────────
export interface MaintenanceData {
  workOrders: WorkOrder[];
  failures: FailureRecord[];
  predictions: RiskPrediction[];
  schedule: ScheduledPm[];
  assignees: Assignee[];
  maps: RefMaps;
}

export async function loadMaintenanceData(): Promise<MaintenanceData> {
  try {
    const maps = await loadRefMaps();
    const [wos, failures, preds, scheds] = await Promise.all([
      safeGet<any[]>('/work-orders?page_size=100', []),
      safeGet<any[]>('/failures?page_size=100', []),
      safeGet<any[]>('/maintenance/predictions?page_size=100', []),
      safeGet<any[]>('/maintenance/schedules?page_size=100', []),
    ]);
    const assignees = Object.keys(maps.assigneeById).length
      ? Object.values(maps.assigneeById)
      : MOCK_ASSIGNEES;
    return {
      workOrders: (wos || []).map((w) => adaptWorkOrder(w, maps)),
      failures: (failures || []).map((f) => adaptFailure(f, maps)),
      predictions: (preds || []).map((p) => adaptPrediction(p, maps)),
      schedule: (scheds || []).map((s) => adaptSchedule(s, maps)),
      assignees,
      maps,
    };
  } catch (e) {
    console.error('[maintenance:live] loadMaintenanceData failed', e);
    return { workOrders: [], failures: [], predictions: [], schedule: [], assignees: MOCK_ASSIGNEES, maps: EMPTY_MAPS };
  }
}

/** Lazy-load the full WO detail (expanded checklist/parts) by uuid. */
export async function loadWorkOrderDetail(uuid: string, maps: RefMaps): Promise<WorkOrder | null> {
  try {
    const w = await api.get<any>(`/work-orders/${uuid}`);
    return adaptWorkOrder(w, maps, true);
  } catch (e) {
    console.error(`[maintenance:live] GET /work-orders/${uuid} failed`, e);
    return null;
  }
}

/** Lazy-load AI decision support for a WO. */
export async function loadAiContext(uuid: string): Promise<AiContext | null> {
  try {
    const c = await api.get<any>(`/work-orders/${uuid}/ai-context`);
    return adaptAiContext(c);
  } catch (e) {
    console.error(`[maintenance:live] GET /work-orders/${uuid}/ai-context failed`, e);
    return null;
  }
}

// ── live mutations ───────────────────────────────────────────────────────────
// Each returns the reshaped server object (or void) so the caller can reconcile
// React state. All swallow-and-log so a failed sync never crashes the UI.

const uuidOf = (o: any): string | undefined => o?._uuid;
const versionOf = (o: any): number | undefined => o?._version;

export async function createWorkOrder(wo: WorkOrder, maps: RefMaps): Promise<WorkOrder | null> {
  try {
    const created = await api.post<any>('/work-orders', toWorkOrderCreateBody(wo, maps));
    return adaptWorkOrder(created, maps, true);
  } catch (e) {
    console.error('[maintenance:live] create work order failed', e);
    return null;
  }
}

/**
 * Reconcile a single edited WorkOrder against the backend: assignee → /assign,
 * status → /transition (or /close), and the editable fields → PATCH. `prev` is
 * the pre-edit fixture object so we only fire the calls that actually changed.
 */
export async function syncWorkOrderEdit(prev: WorkOrder, next: WorkOrder, maps: RefMaps): Promise<void> {
  const id = uuidOf(next) || uuidOf(prev);
  if (!id) return;
  let version = versionOf(next) ?? versionOf(prev);
  try {
    // assignee change
    if (next.assignee?.name !== prev.assignee?.name) {
      const assigneeId = maps.nameToId[next.assignee?.name || ''];
      if (assigneeId) {
        const w = await api.post<any>(`/work-orders/${id}/assign`, { assignee_id: assigneeId, version });
        version = w.version;
      }
    }
    // field edits (title/description/type/priority/due/checklist/parts)
    const patchBody = toWorkOrderCreateBody(next, maps);
    delete patchBody.assignee_id;
    const w2 = await patch<any>(`/work-orders/${id}`, { ...patchBody, version });
    version = w2.version;
    // status change
    if (next.status !== prev.status) {
      const target = STATUS_REV[next.status];
      if (target === 'closed') {
        await api.post<any>(`/work-orders/${id}/close`, {
          closure_notes: next.closureNotes || 'Closed via maintenance console.',
          labor_hours: next.actualHours ?? null,
          version,
        });
      } else if (target) {
        await api.post<any>(`/work-orders/${id}/transition`, { status: target, version });
      }
    }
  } catch (e) {
    console.error('[maintenance:live] sync work order edit failed', e);
  }
}

export async function deleteWorkOrder(wo: WorkOrder): Promise<void> {
  const id = uuidOf(wo);
  if (!id) return;
  try {
    await api.delete(`/work-orders/${id}`);
  } catch (e) {
    console.error('[maintenance:live] delete work order failed', e);
  }
}

export async function syncFailureEdit(next: FailureRecord): Promise<void> {
  const id = uuidOf(next);
  if (!id) return;
  const rca =
    next.rcaStatus === 'Published' ? 'published'
    : next.rcaStatus === 'In Progress' ? 'in_progress'
    : 'pending';
  try {
    await patch<any>(`/failures/${id}`, { rca_status: rca, version: versionOf(next) });
  } catch (e) {
    console.error('[maintenance:live] sync failure edit failed', e);
  }
}

/** accept / dismiss based on the new prediction status (snooze has no backend verb). */
export async function syncPredictionAction(next: RiskPrediction): Promise<{ workOrderId?: string } | null> {
  const id = uuidOf(next);
  if (!id) return null;
  try {
    if (next.status === 'accepted') {
      const res = await api.post<any>(`/maintenance/predictions/${id}/accept`, {});
      return { workOrderId: res?.work_order_id };
    }
    if (next.status === 'dismissed') {
      await api.post<any>(`/maintenance/predictions/${id}/dismiss`, {
        reason: next.dismissReason || 'Dismissed via maintenance console.',
      });
    }
    // 'snoozed' is a frontend-only state — no backend endpoint; kept local.
    return null;
  } catch (e) {
    console.error('[maintenance:live] sync prediction action failed', e);
    return null;
  }
}

export async function createSchedule(pm: ScheduledPm, maps: RefMaps): Promise<ScheduledPm | null> {
  try {
    const created = await api.post<any>('/maintenance/schedules', toScheduleCreateBody(pm, maps));
    return adaptSchedule(created, maps);
  } catch (e) {
    console.error('[maintenance:live] create schedule failed', e);
    return null;
  }
}

export async function syncScheduleEdit(pm: ScheduledPm, maps: RefMaps): Promise<void> {
  const id = uuidOf(pm);
  if (!id) return;
  try {
    await patch<any>(`/maintenance/schedules/${id}`, {
      name: pm.title,
      next_due_at: pm.date ? new Date(pm.date).toISOString() : null,
      task_template: {
        type: pm.type, priority: pm.priority, crew: pm.crew,
        durationHours: pm.durationHours, color: pm.color,
      },
      version: versionOf(pm),
    });
  } catch (e) {
    console.error('[maintenance:live] sync schedule edit failed', e);
  }
}

export async function deleteSchedule(pm: ScheduledPm): Promise<void> {
  const id = uuidOf(pm);
  if (!id) return;
  try {
    await api.delete(`/maintenance/schedules/${id}`);
  } catch (e) {
    console.error('[maintenance:live] delete schedule failed', e);
  }
}

export { USE_MOCK };
