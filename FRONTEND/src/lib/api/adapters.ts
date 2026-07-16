/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live-mode API adapters (docs/02 §13).
 *
 * The frontend was built against a bespoke mock contract; the real backend uses
 * different paths and field names. Rather than rewrite every call-site, live mode
 * routes each request through this registry, which:
 *   1. rewrites the frontend path → the backend path, and
 *   2. reshapes the backend response → the frontend's expected shape.
 *
 * Every function here is **pure** (no `import.meta`, no client state) so it can be
 * unit-tested against real backend JSON. Paths with no entry pass through
 * unchanged; paths with no backend home throw `NoBackendRouteError` so the UI can
 * degrade gracefully instead of hard-crashing.
 */

export class NoBackendRouteError extends Error {
  constructor(public readonly frontendPath: string) {
    super(`No backend route for "${frontendPath}"`);
    this.name = 'NoBackendRouteError';
  }
}

export interface AdaptedRequest {
  /** Backend path (relative to API base), including any query string. */
  path: string;
  /** Optional transform applied to the *unwrapped* backend `data` before return. */
  adaptResponse?: (data: any, meta?: any) => any;
  /** Optional transform applied to the request body before sending. */
  adaptBody?: (body: any) => any;
}

// ── small helpers ────────────────────────────────────────────────────────────

function splitPathQuery(pathWithQuery: string): [string, URLSearchParams] {
  const qIdx = pathWithQuery.indexOf('?');
  if (qIdx === -1) return [pathWithQuery, new URLSearchParams()];
  return [pathWithQuery.slice(0, qIdx), new URLSearchParams(pathWithQuery.slice(qIdx + 1))];
}

const iso = (v: any): string => (v == null ? '' : String(v));

function humanSize(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Backend ingestion_status → frontend DocumentFile.status pipeline enum. */
function mapDocStatus(s?: string): string {
  switch (s) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'processing': return 'parsing';
    case 'queued': case 'pending': return 'pending';
    default: return s || 'pending';
  }
}

// ── response reshapers (backend → frontend) ──────────────────────────────────

/** Backend DocumentRead → frontend DocumentFile. */
export function adaptDocument(d: any): any {
  return {
    id: iso(d.id),
    name: d.title ?? 'Untitled Document',
    type: d.doc_type_label ?? d.doc_type ?? d.mime ?? 'Unknown',
    tags: Array.isArray(d.tags) ? d.tags : [],
    plant: d.plant_label ?? d.plant_id ?? '',
    area: d.area_label ?? d.area_id ?? '',
    uploader: d.uploaded_by_name ?? d.source ?? 'Unknown',
    date: iso(d.created_at),
    version: d.version != null ? `v${d.version}` : 'v1',
    status: mapDocStatus(d.ingestion_status),
    confidence: d.confidence ?? d.meta?.confidence ?? 0,
    fileSize: humanSize(d.size_bytes),
    content: d.content ?? '',
    extractedEntities: Array.isArray(d.entities) ? d.entities.map(adaptEntity) : [],
    // keep raw ids for detail lookups
    _raw: d,
  };
}

/** Backend EntityRead → frontend ExtractedEntity. */
export function adaptEntity(e: any): any {
  return {
    key: e.entity_type ?? e.value ?? '',
    value: e.normalized_value ?? e.value ?? '',
    confidence: Math.round((e.confidence ?? 0) * 100),
    category:
      e.entity_type === 'equipment_tag' ? 'Equipment Tag'
      : e.entity_type === 'standard_ref' ? 'Standard Reference'
      : e.entity_type === 'failure_mode' ? 'Failure Mode'
      : 'Safety Directive',
  };
}

/** Backend LookupRead[] → the flat string[] the frontend filter dropdowns expect. */
export function adaptLookupLabels(rows: any): string[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => r.label ?? r.code ?? '').filter(Boolean);
}

/** Backend EquipmentRead → frontend equipment card shape (superset, keep raw). */
export function adaptEquipment(e: any): any {
  return {
    id: iso(e.id),
    tag: e.tag,
    name: e.name,
    criticality: e.criticality,
    status: e.status,
    manufacturer: e.manufacturer ?? '',
    model: e.model ?? '',
    healthScore: e.health_score != null ? Number(e.health_score) : null,
    plantId: e.plant_id ?? null,
    areaId: e.area_id ?? null,
    specs: e.specs ?? {},
    _raw: e,
  };
}

// ── the registry ─────────────────────────────────────────────────────────────

/**
 * Map a frontend (method, pathWithQuery) to a backend request + reshapers.
 * Returns null to pass the request through unchanged (path already aligns).
 */
export function adaptRequest(method: string, pathWithQuery: string): AdaptedRequest | null {
  const [path, query] = splitPathQuery(pathWithQuery);
  const m = method.toUpperCase();

  // ── lookups: /lookups?type=X and /lookups/<name> → /lookups/{category} ──────
  if (path === '/lookups' && query.get('type')) {
    return { path: `/lookups/${query.get('type')}`, adaptResponse: adaptLookupLabels };
  }
  const flatLookup = /^\/lookups\/(doc_types|plants|areas|statuses|tags)$/.exec(path);
  if (flatLookup) {
    const name = flatLookup[1];
    // plants/areas are real resources; doc_types/statuses/tags are lookup categories.
    if (name === 'plants') return { path: '/plants', adaptResponse: (d) => (d || []).map((p: any) => p.name) };
    if (name === 'areas') return { path: '/areas', adaptResponse: (d) => (d || []).map((a: any) => a.name) };
    return { path: `/lookups/${name}`, adaptResponse: adaptLookupLabels };
  }

  // ── documents ──────────────────────────────────────────────────────────────
  if (path === '/documents' && m === 'GET') {
    // frontend sends page/status/tag/plant/area/search/sort_by/sort_order; the
    // backend accepts page/page_size/q/status/tag — forward the compatible ones.
    const bq = new URLSearchParams();
    if (query.get('page')) bq.set('page', query.get('page')!);
    if (query.get('page_size')) bq.set('page_size', query.get('page_size')!);
    if (query.get('search')) bq.set('q', query.get('search')!);
    if (query.get('status')) bq.set('status', query.get('status')!);
    if (query.get('tag')) bq.set('tag', query.get('tag')!);
    const qs = bq.toString();
    return {
      path: `/documents${qs ? `?${qs}` : ''}`,
      adaptResponse: (d) => (Array.isArray(d) ? d.map(adaptDocument) : []),
    };
  }
  const docDetail = /^\/documents\/([^/]+)$/.exec(path);
  if (docDetail && m === 'GET') {
    return { path, adaptResponse: adaptDocument };
  }

  // ── equipment ────────────────────────────────────────────────────────────────
  if (path === '/equipment' && m === 'GET') {
    return { path: pathWithQuery, adaptResponse: (d) => (Array.isArray(d) ? d.map(adaptEquipment) : []) };
  }
  // /equipment/{id} detail — but NOT the sub-routes that share the prefix
  // (/equipment/tree, /resolve, /import, /suggest, /labels), which have their own
  // shapes and query params and must pass through unchanged (with their query).
  const EQUIPMENT_SUBROUTES = new Set(['tree', 'resolve', 'import', 'suggest', 'labels']);
  const eqDetail = /^\/equipment\/([^/]+)$/.exec(path);
  if (eqDetail && m === 'GET' && !EQUIPMENT_SUBROUTES.has(eqDetail[1])) {
    return { path, adaptResponse: adaptEquipment };
  }
  // /equipment/{id}/readings is a real backend endpoint (B16) — pass through.
  // The legacy /meters alias is remapped to it below.

  // ── admin settings: frontend split → backend's single /settings surface ──────
  // Backend `GET /settings?scope=&scope_id=` returns {definitions, values}; the
  // frontend fetches them as two calls. Map both onto the one endpoint and pick
  // the half each caller wants.
  if (path === '/admin/settings/definitions' && m === 'GET') {
    return { path: '/settings', adaptResponse: (d) => d?.definitions ?? [] };
  }
  if (path === '/admin/settings/values' && m === 'GET') {
    return { path: '/settings', adaptResponse: (d) => d?.values ?? {} };
  }
  if (path === '/admin/settings/values' && m === 'PUT') {
    return { path: '/settings' };  // body already {key, scope, scope_id, value}
  }

  // ── meters: legacy alias → real readings endpoint (B16) ──────────────────────
  const eqMetersLegacy = /^\/equipment\/([^/]+)\/meters$/.exec(path);
  if (eqMetersLegacy) return { path: `/equipment/${eqMetersLegacy[1]}/readings` };

  // ── genuinely-absent backend routes (fail loudly, callers can catch) ─────────
  // Everything else — /navigation, /parts, /shift-logs, /exports, /import/*,
  // /content/*, /changelog, /tours/*, /settings/effective, /me/*, /saved-views,
  // and the whole /admin/* surface — now exists on the backend (B15–B19) and
  // passes through unchanged. Only these have no home:
  if (
    path === '/documents/bulk-action' ||   // superseded by POST /documents/bulk
    path === '/me/password'                // use POST /me/change-password instead
  ) {
    throw new NoBackendRouteError(path);
  }

  // default: pass through unchanged (auth/*, /navigation, /parts, /shift-logs,
  // /admin/*, /settings/*, /me/*, /saved-views, /tours, /changelog, /content,
  // /i18n, search, chat/*, compliance/*, …)
  return null;
}
