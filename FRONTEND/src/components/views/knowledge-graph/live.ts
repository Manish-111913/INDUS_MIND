/**
 * LIVE backend adapters for the Knowledge Graph explorer.
 *
 * These helpers talk to the real FastAPI `/graph/*` endpoints and RESHAPE the
 * responses into the EXACT fixture types (GraphNodeData / GraphEdgeData and the
 * mockGraphStats shape) so the ReactFlow canvas and the stats strip need no
 * changes. Only used when USE_MOCK === false — the mock demo path is untouched.
 *
 * Backend node shape (service._node):   { id, labels: string[], properties: {} }
 * Backend node() adds:                   edges: [{ type, node_id, labels, props }]
 * Backend stats():                       { nodes_by_label, edges_by_type,
 *                                          total_nodes, total_edges }
 */

import { api } from '../../../lib/api/client';
import { GraphNodeData, GraphEdgeData, mockGraphStats } from './mockData';

type RawNode = { id: string; labels?: string[]; properties?: Record<string, any> };
type RawEdge = { type: string; node_id: string; labels?: string[]; props?: Record<string, any> };
type RawNodeDetail = RawNode & { edges?: RawEdge[] };
type RawStats = {
  nodes_by_label?: Record<string, number>;
  edges_by_type?: Record<string, number>;
  total_nodes?: number;
  total_edges?: number;
};

type Stats = typeof mockGraphStats;

// ---------------------------------------------------------------------------
// ENUM MAPPINGS (backend label/edge vocab -> fixture's 9 enums)
// ---------------------------------------------------------------------------

// Backend NODE_LABELS include several classes the fixture does not model
// (Area, Clause, Material, WorkOrder, Chunk). Each is folded into its closest
// fixture entity class; anything unrecognised defaults to 'Equipment'.
const NODE_TYPE_MAP: Record<string, GraphNodeData['type']> = {
  Equipment: 'Equipment',
  Document: 'Document',
  FailureEvent: 'FailureEvent',
  FailureMode: 'FailureMode',
  Regulation: 'Regulation',
  Person: 'Person',
  Parameter: 'Parameter',
  Procedure: 'Procedure',
  Lesson: 'Lesson',
  // Near-neighbours folded to the closest fixture class:
  Clause: 'Regulation',
  Area: 'Equipment',
  Material: 'Equipment',
  WorkOrder: 'Document',
  Chunk: 'Document',
};

export function mapNodeType(labels: string[] | undefined): GraphNodeData['type'] {
  for (const l of labels || []) {
    if (NODE_TYPE_MAP[l]) return NODE_TYPE_MAP[l];
  }
  return 'Equipment';
}

// Backend EDGE_TYPES -> fixture relationship enum. Unknowns default to the
// most neutral link, 'REFERENCES'.
const EDGE_LABEL_MAP: Record<string, GraphEdgeData['label']> = {
  MENTIONS: 'MENTIONS',
  PART_OF: 'PART_OF',
  HAS_MODE: 'HAS_MODE',
  APPLIES_TO: 'APPLIES_TO',
  REFERENCES: 'REFERENCES',
  DERIVED_FROM: 'DERIVED_FROM',
  GOVERNS: 'GOVERNED_BY',
  PERFORMED: 'PERFORMED_BY',
  PERFORMED_ON: 'PERFORMED_BY',
  LOCATED_IN: 'PART_OF',
  OCCURRED_ON: 'FAILED_WITH',
  RESOLVED: 'FAILED_WITH',
  MEASURED_ON: 'APPLIES_TO',
};

export function mapEdgeLabel(type: string): GraphEdgeData['label'] {
  return EDGE_LABEL_MAP[type] || 'REFERENCES';
}

// Backend has no explicit status field; derive one from `criticality` (or a
// `status` prop if present). Unknown -> undefined (node renders no status dot).
function mapStatus(props: Record<string, any>): GraphNodeData['status'] | undefined {
  const raw = String(props?.criticality ?? props?.status ?? '').toLowerCase();
  if (!raw) return undefined;
  if (raw.includes('critical')) return 'critical';
  if (raw.includes('high') || raw.includes('warn')) return 'warn';
  if (raw.includes('info')) return 'info';
  if (raw.includes('ok') || raw.includes('low') || raw.includes('medium') || raw.includes('normal')) return 'ok';
  return undefined;
}

// Human label for a node from its free-form props.
function nodeLabel(props: Record<string, any>, id: string): string {
  return String(props?.name || props?.title || props?.tag || props?.ref || id);
}

// Pass backend node properties through verbatim (keys preserved), coercing every
// value to a string for the drawer table. Internal graph plumbing keys are the
// only ones dropped so they don't clutter the metadata table.
const INTERNAL_KEYS = new Set(['tenant_id', 'pg_id', 'source_document_ids']);
function toProps(props: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (INTERNAL_KEYS.has(k) || v == null) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

export function toGraphNode(raw: RawNode): GraphNodeData {
  const props = raw?.properties || {};
  return {
    id: String(raw.id),
    label: nodeLabel(props, String(raw.id)),
    type: mapNodeType(raw.labels),
    status: mapStatus(props),
    properties: toProps(props),
  };
}

// Reshape backend stats() into the mockGraphStats shape used by the strip and
// the per-type filter counts.
export function toStats(raw: RawStats): Stats {
  const byLabel = raw?.nodes_by_label || {};
  const breakdown: Stats['typesBreakdown'] = {
    Equipment: 0, Document: 0, FailureEvent: 0, FailureMode: 0, Regulation: 0,
    Person: 0, Parameter: 0, Procedure: 0, Lesson: 0,
  };
  for (const [label, count] of Object.entries(byLabel)) {
    const t = mapNodeType([label]);
    breakdown[t] = (breakdown[t] || 0) + Number(count || 0);
  }
  return {
    totalNodes: Number(raw?.total_nodes || 0),
    totalEdges: Number(raw?.total_edges || 0),
    typesCount: Object.keys(byLabel).length,
    typesBreakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// FETCHERS
// ---------------------------------------------------------------------------

export async function fetchStats(): Promise<Stats> {
  const raw = await api.get<RawStats>('/graph/stats');
  return toStats(raw);
}

export async function searchNodes(q: string): Promise<GraphNodeData[]> {
  const raw = await api.get<RawNode[]>(`/graph/search?q=${encodeURIComponent(q)}`);
  return (raw || []).map(toGraphNode);
}

// Load a node together with its immediate edges + neighbour stubs. This is the
// one endpoint that returns edges, so it powers the seed, deep-link, expand and
// suggestion-select flows.
export async function nodeCluster(
  id: string,
): Promise<{ nodes: GraphNodeData[]; edges: GraphEdgeData[]; center: GraphNodeData }> {
  const raw = await api.get<RawNodeDetail>(`/graph/nodes/${encodeURIComponent(id)}`);
  const center = toGraphNode(raw);
  const nodes: GraphNodeData[] = [center];
  const edges: GraphEdgeData[] = [];
  const seen = new Set<string>([center.id]);
  for (const e of raw?.edges || []) {
    const nid = String(e.node_id);
    if (!nid) continue;
    if (!seen.has(nid)) {
      nodes.push(toGraphNode({ id: nid, labels: e.labels, properties: e.props }));
      seen.add(nid);
    }
    edges.push({
      id: `${center.id}::${e.type}::${nid}`,
      source: center.id,
      target: nid,
      label: mapEdgeLabel(e.type),
    });
  }
  return { nodes, edges, center };
}

// Seed the working canvas without knowing any node ids up front: pick the most
// populated backend label, use the constrained pattern query to find a node,
// then load that node's local cluster (node + neighbours + edges). Falls back to
// a broad search if the graph has nodes but no edges.
export async function seedCanvas(): Promise<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] }> {
  const stats = await api.get<RawStats>('/graph/stats');
  const labels = (Object.entries(stats?.nodes_by_label || {}) as [string, number][])
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([label]) => label);

  for (const label of labels) {
    try {
      const res = await api.post<RawNode[]>('/graph/query', { start_type: label, depth: 1 });
      if (res && res.length) {
        const cluster = await nodeCluster(String(res[0].id));
        if (cluster.nodes.length) return { nodes: cluster.nodes, edges: cluster.edges };
      }
    } catch (e) {
      // try the next label
    }
  }

  // Fallback: no edges anywhere — surface some isolated nodes so the canvas
  // isn't blank. A single space matches multi-word names (CONTAINS ' ').
  try {
    const nodes = await searchNodes(' ');
    return { nodes: nodes.slice(0, 15), edges: [] };
  } catch (e) {
    return { nodes: [], edges: [] };
  }
}
