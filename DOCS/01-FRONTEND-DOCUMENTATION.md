# IndusMind — Complete Frontend Documentation
### AI-Powered Industrial Knowledge Intelligence Platform · Frontend Specification v1.0

---

## 1. Product Overview

IndusMind is an enterprise industrial SaaS that unifies an organisation's fragmented document estate — P&IDs, engineering drawings, maintenance work orders, SOPs, inspection reports, regulatory submissions — into a single queryable "operations brain." The frontend is a fully API-driven web application (responsive down to field-technician mobile) with five intelligence surfaces:

1. **Universal Ingestion Console** — upload anything, watch the AI pipeline (OCR → parsing → entity extraction → knowledge graph) work in real time.
2. **Expert Knowledge Copilot** — RAG chat with citations, confidence scores, deep-links to source pages, and time-to-answer metrics. Mobile-first.
3. **Maintenance Intelligence** — work orders, failure history, RCA agent, predictive recommendations, optimised schedules.
4. **Compliance Intelligence** — regulation-to-procedure mapping (Factory Act, OISD, PESO, environmental, ISO), gap detection, one-click audit evidence packages.
5. **Lessons Learned Engine** — cross-corpus pattern detection with proactive warnings pushed to operational teams.

**Non-negotiable principle: zero hardcoded content.** Dashboards, tables, charts, menus, permissions, lookup values, AI insight cards, notification types, compliance rules — everything comes from backend APIs. The frontend is a rendering + interaction layer over a dynamic configuration.

---

## 2. Target Users

| Role | Primary device | Core jobs |
|---|---|---|
| **Admin (Super Admin)** | Desktop | Tenant setup, users, roles, permissions, AI model config, feature flags, system health |
| **Plant Manager** | Desktop + tablet | Plant-wide KPIs, downtime, cost, team performance, approvals, executive reporting |
| **Maintenance Engineer** | Desktop | Work-order planning, failure analysis, RCA, schedule optimisation, spare-part context |
| **Field Technician** | **Mobile** | Assigned work orders, step-by-step procedures, ask-the-copilot on the shop floor, close-out with photos |
| **Compliance Officer** | Desktop | Regulation mapping, gap remediation, audit calendars, evidence packages |
| **Quality Engineer** | Desktop + tablet | NCRs, deviations, quality trends, CAPA linkage to lessons learned |
| **Auditor** | Tablet | Read-only audit trails, evidence packages, document version history, sign-offs |
| **Operator** | Tablet (control room) | Shift procedures, equipment status, log entries, safety alerts, quick copilot queries |

---

## 3. User Personas

**Rajesh, 52 — Plant Manager, refinery.** 25 yrs experience. Wants one morning screen: downtime, open critical work orders, compliance risk, cost. Hates hunting through emails. Success = decisions from one dashboard.

**Priya, 34 — Maintenance Engineer.** Fights repeat failures on rotating equipment. Needs full equipment history + OEM manual + past RCA in one place. Success = RCA that used to take 3 days done in 30 minutes.

**Arun, 27 — Field Technician.** Phone in one hand, wrench in the other. Gloves, sunlight glare, patchy Wi-Fi. Needs big touch targets, offline-tolerant work order view, voice-friendly copilot. Success = never walking back to the office for a manual.

**Meena, 41 — Compliance Officer.** Lives in fear of a surprise PESO inspection. Manually cross-references 400+ clauses against procedures. Success = system flags gaps before the inspector does; audit pack generated in minutes not weeks.

**Suresh, 58 — Senior Operator (retiring in 3 yrs).** Holds 30 years of undocumented "how this plant actually behaves." Success = his shift notes and incident narratives are captured, indexed, and answer other people's questions after he's gone — the knowledge-cliff answer.

---

## 4. Complete User Journey

**Technician (mobile):** Push notification "WO-2041 assigned" → opens app (biometric) → Today's Work Orders → WO detail: equipment card, safety precautions (auto-pulled from SOP), required permits, procedure steps → hits unknown valve → opens Copilot from WO context → asks "torque spec for valve V-230 bonnet bolts" → answer + citation to OEM manual p.47 → completes steps, attaches photos, adds voice note → closes WO → closure syncs; graph + history update automatically.

**Plant Manager:** Login → Executive dashboard (KPI cards, downtime trend, AI daily brief) → drills into "Unplanned downtime ↑12%" → equipment heatmap → Compressor C-3 → 360° view: failure pattern flagged by Lessons-Learned agent → approves recommended schedule change → forwards AI-generated summary to leadership.

**Compliance Officer:** Login → Compliance dashboard → new gap: "OISD-STD-118 clause 6.4 — firewater pump quarterly test overdue" → opens gap detail: rule text ↔ current procedure ↔ last inspection record side by side → creates remediation task (routes to Maintenance) → audit due next month → "Generate Evidence Package" → selects scope → PDF pack with citations downloads.

**Admin:** Login → Admin console → creates "Quality Engineer" role from permission matrix → configures new dashboard widget from widget registry → uploads tenant regulation set → monitors ingestion queue health.

---

## 5. Navigation Flow

- **Top bar (fixed):** tenant/plant switcher · global search (⌘K) · Copilot launcher · notification bell (badge) · user menu.
- **Left sidebar (collapsible; icon-rail on tablet; bottom-tab-bar on mobile):** items are **served by `/api/v1/navigation`** filtered by role — never hardcoded. Canonical order: Dashboard, Copilot, Documents, Knowledge Graph, Equipment, Maintenance, Compliance, Quality, Lessons Learned, Analytics, Admin.
- **Mobile bottom tabs (technician default):** Home · Work Orders · Copilot (center, elevated) · Scan (QR on equipment) · Alerts.
- **Breadcrumbs** on all nested routes. **Context switching:** every equipment tag, document ID, WO number anywhere in the app is a deep-link chip.

---

## 6. Information Architecture

```
Workspace (Tenant)
└── Plant
    ├── Dashboards (role-scoped, config-driven)
    ├── Knowledge
    │   ├── Documents (library, versions, viewer)
    │   ├── Knowledge Graph (explorer)
    │   └── Search (semantic / hybrid)
    ├── Copilot (chat sessions, saved answers)
    ├── Assets
    │   └── Equipment (hierarchy: Plant→Area→Unit→Equipment→Component)
    ├── Maintenance (work orders, schedules, failures, RCA, predictions)
    ├── Compliance (regulations, mappings, gaps, audits, evidence)
    ├── Quality (NCRs, deviations, CAPA)
    ├── Lessons Learned (patterns, alerts)
    ├── Analytics (report builder, exports)
    └── Admin (users, roles, permissions, AI config, flags, audit log, ingestion monitor)
```

---

## 7. Complete Sitemap (routes)

```
/login  /forgot-password  /reset-password  /select-tenant
/                                → role-based dashboard redirect
/dashboard                        (config-driven per role)
/copilot                          /copilot/:sessionId
/documents                        /documents/upload
/documents/:id                    /documents/:id/versions
/knowledge-graph                  /knowledge-graph/node/:id
/search?q=
/equipment                        /equipment/:id (360°)
/equipment/:id/(history|documents|maintenance|compliance|graph)
/maintenance/work-orders          /maintenance/work-orders/:id
/maintenance/schedule             /maintenance/failures
/maintenance/failures/:id/rca     /maintenance/predictions
/compliance                       /compliance/regulations
/compliance/regulations/:id       /compliance/gaps  /compliance/gaps/:id
/compliance/audits                /compliance/evidence-packages
/quality/ncr                      /quality/ncr/:id   /quality/trends
/lessons-learned                  /lessons-learned/:id
/analytics                        /analytics/reports/:id
/notifications
/admin/(users|roles|permissions|tenants|ai-config|prompts|feature-flags|audit-log|ingestion|system-health|lookups)
/profile  /settings
```

---

## 8. Every Screen Required

> Pattern applied to ALL screens — **Loading:** skeleton loaders shaped like final content (never spinners on full pages). **Empty:** icon + one-line explanation + primary action ("No documents yet → Upload your first document"). **Error:** inline error card with retry + error code + "report" link; toast for transient failures. **Responsive:** desktop = full layout; tablet = collapsed rail + 2-col grids → 1-col; mobile = bottom tabs, stacked cards, tables become card lists, filters become bottom-sheet.

### 8.1 Login
- **Route** `/login` · **Purpose** authenticate, tenant select
- Components: email/password form, SSO buttons (OAuth), MFA step, "remember device". Error: invalid creds, account locked, tenant suspended. Mobile: full-screen, biometric re-login.

### 8.2 Role Dashboard
- **Route** `/dashboard` · **Purpose** role-scoped operational cockpit
- Layout is **rendered from `/dashboards/config?role=`** (widget registry: kpi-card, line, bar, donut, heatmap, table, ai-insight, activity-feed, shortcut-grid). Drag-reorder persists via API. Full widget specs → §9.

### 8.3 Copilot (flagship)
- **Route** `/copilot` · **Purpose** conversational RAG over full corpus
- Components: session list (rename/pin/delete), message thread, streaming answer, **citation chips** (doc title + page → opens viewer at page), **confidence badge** (High/Med/Low + %), **time-to-answer badge**, follow-up suggestion chips, scope filter (plant/equipment/doc-type/date), voice input (mobile), feedback 👍👎 with reason, "save answer to knowledge base", "escalate to expert". Empty: prompt-starter gallery per role. Error: degraded-mode notice with retry; "low confidence — verify with source" banner under threshold. Mobile: full-screen chat, big mic button, citations as swipeable bottom cards.

### 8.4 Document Library
- **Route** `/documents` · Table/grid toggle. Columns: name, type (P&ID/WO/SOP/inspection/manual/incident…), equipment tags, plant/area, uploaded by, date, version, ingestion status (chip with stage), confidence. Filters: type, status, equipment, date range, uploader, tags. Bulk: reprocess, tag, delete, export metadata. Search-as-you-type (semantic toggle). Pagination: server-side, 25/50/100. Import: drag-drop anywhere on page.

### 8.5 Document Upload / Ingestion Console
- **Route** `/documents/upload` · Multi-file dropzone (PDF, images, XLSX, DOCX, MSG/EML, DWG-as-PDF), per-file metadata form (type auto-suggested by AI, editable), then **live pipeline tracker per file**: Uploaded → OCR → Parsed → Chunked → Embedded → Entities extracted (count) → Graph updated (nodes/edges added) — each stage with timestamp + expandable details (extracted entities preview with accept/correct controls → this human-in-loop is a judging differentiator). Errors per-stage with retry.

### 8.6 Document Viewer
- **Route** `/documents/:id` · Split view: left = PDF/image viewer (zoom, rotate, page nav, **entity highlight overlay** — equipment tags, parameters, references highlighted with colored bounding boxes, click → graph node); right tabs: Metadata, Extracted Entities (table w/ confidence), Linked Equipment, Versions (diff summary), Related Documents (graph-derived), Comments. Actions: download, share link, reprocess, ask-copilot-about-this-doc (opens scoped chat).

### 8.7 Knowledge Graph Explorer
- **Route** `/knowledge-graph` · React Flow canvas: nodes typed+colored (Equipment, Document, Failure, Regulation, Person, Parameter, Procedure), edge labels (MENTIONS, PART_OF, FAILED_WITH, GOVERNED_BY, PERFORMED_BY, REFERENCES). Left panel: search + type filters + depth slider. Click node → side drawer: properties, linked docs, "open 360°", "expand neighbors", "ask copilot about this node". Minimap, zoom, export PNG. Mobile: read-mostly, tap-to-expand, pinch zoom.

### 8.8 Global Search Results
- **Route** `/search?q=` · Tabs: All / Documents / Equipment / Work Orders / Regulations / Graph. Each result: snippet with highlighted match, source, relevance score, semantic-vs-keyword indicator. Facets left rail. "Ask Copilot this instead" banner on natural-language queries.

### 8.9 Equipment Registry
- **Route** `/equipment` · Hierarchy tree (Plant→Area→Unit→Equipment) + table: tag, name, type, criticality, health score (AI), status, last maintenance, open WOs, compliance state. Filters: area, type, criticality, health band, status. Bulk: export, assign inspection. QR-scan entry point (mobile) jumps straight to 360°.

### 8.10 Equipment 360°
- **Route** `/equipment/:id` · Header: tag, photo, status, health score gauge, criticality. Tabs: **Overview** (spec cards, live parameters if integrated, AI health summary), **History** (unified timeline: WOs, failures, inspections, doc updates — filterable), **Documents** (auto-linked via graph), **Maintenance** (open/scheduled WOs, MTBF/MTTR mini-charts), **Compliance** (applicable rules + status), **Graph** (ego-network mini graph), **RCA & Predictions**. Sticky action bar: Create WO, Ask Copilot, Report Issue.

### 8.11 Work Orders List
- **Route** `/maintenance/work-orders` · Views: table / kanban (Open→In Progress→On Hold→Review→Closed) / calendar. Columns: WO#, title, equipment, type (PM/CM/predictive), priority, assignee, due, status, SLA indicator. Bulk assign/close/export. Mobile (technician): "My Work Orders today" card list, swipe to start/complete.

### 8.12 Work Order Detail
- **Route** `/maintenance/work-orders/:id` · Sections: summary, equipment card, **AI context panel** ("Similar past WOs", "Relevant SOP steps", "Known failure modes" — each with citations), safety/permit checklist, procedure stepper with per-step check-off, parts, labor, attachments (camera on mobile), activity log, closure form (failure code, root cause quick-pick, notes → feeds Lessons Learned).

### 8.13 Failure Records & RCA
- **Routes** `/maintenance/failures`, `/maintenance/failures/:id/rca` · Failure list w/ Pareto chart of failure modes. RCA workspace: timeline of events, **AI RCA agent output** (probable causes ranked w/ confidence + evidence citations from history/manuals/inspections), 5-Why / fishbone canvas (AI pre-filled, human editable), corrective actions → tasks, publish → becomes Lessons-Learned candidate.

### 8.14 Predictive Maintenance
- **Route** `/maintenance/predictions` · Risk-ranked equipment table (risk score, predicted failure mode, drivers/explainability list, recommended action + window), accept→auto-create WO / snooze / dismiss w/ reason (feedback loop). Trend sparklines.

### 8.15 Maintenance Schedule
- **Route** `/maintenance/schedule` · Calendar + Gantt, drag-reschedule (permission-gated), AI "optimise schedule" action with before/after diff + reasoning, conflict warnings (crew, permits, shutdown windows).

### 8.16 Compliance Overview
- **Route** `/compliance` · KPI cards (compliance %, open gaps by severity, audits upcoming, expiring certifications), regulation coverage heatmap (regulation × area), gap trend chart, recent regulatory-change alerts.

### 8.17 Regulations & Mapping
- **Routes** `/compliance/regulations`, `/:id` · Regulation registry (Factory Act, OISD, PESO, env norms, ISO — loaded via API/ingestion). Detail: clause tree; each clause shows mapped procedures/equipment/records with mapping confidence, unmapped = gap candidates.

### 8.18 Compliance Gaps
- **Routes** `/compliance/gaps`, `/:id` · Gap table: clause, description, severity, affected equipment/procedure, detected date, owner, due, status. Detail: **side-by-side pane — requirement text ↔ current procedure excerpt ↔ evidence records** with AI explanation of the gap; remediation task creation; history.

### 8.19 Audits & Evidence Packages
- **Routes** `/compliance/audits`, `/compliance/evidence-packages` · Audit calendar, checklist per audit, **"Generate Evidence Package"** wizard (scope: regulation set + area + date range → progress → downloadable PDF/ZIP with cited source docs + coverage summary), package history with share links (auditor role sees read-only).

### 8.20 Quality (NCR)
- **Routes** `/quality/ncr`, `/:id`, `/quality/trends` · NCR register, deviation detail w/ linked equipment + docs, CAPA tracking, trends: defect Pareto, deviation rate by line, AI "emerging quality pattern" cards linking to Lessons Learned.

### 8.21 Lessons Learned
- **Routes** `/lessons-learned`, `/:id` · Pattern feed: AI-detected systemic patterns ("Seal failures cluster after monsoon startups — 7 incidents, 3 plants") with evidence graph, affected equipment, recommended preventive action, push-to-team action. Detail: narrative, source incidents (cited), similar external references, subscription toggle per area/equipment.

### 8.22 Analytics & Reports
- **Routes** `/analytics`, `/analytics/reports/:id` · Config-driven report gallery (definitions from API), parameter form → render (charts+tables) → export PDF/XLSX/CSV → schedule email. No hardcoded reports.

### 8.23 Notifications Center
- **Route** `/notifications` · Filter by priority (Critical/High/Normal/Low), category, read state; bulk mark-read; per-category channel preferences (in-app/email/push) — preference schema from API.

### 8.24 Admin Suite
- `/admin/users` (invite, deactivate, role assign, activity), `/admin/roles` + `/admin/permissions` (**editable permission matrix grid** — role × permission checkboxes, straight from API), `/admin/ai-config` (model registry: provider, model, temperature, embedding model, thresholds — per capability), `/admin/prompts` (prompt template CRUD with versioning + test-run panel), `/admin/feature-flags` (toggle per tenant/role), `/admin/audit-log` (immutable table: actor, action, entity, before/after diff viewer, IP, time; export), `/admin/ingestion` (queue depth, per-stage throughput, failed jobs with retry, worker health), `/admin/lookups` (manage all dropdown/option sets — doc types, failure codes, priorities…), `/admin/system-health` (API latency, error rate, DB/graph/queue status).

### 8.25 Profile & Settings
- `/profile`, `/settings` · Profile, password, MFA, sessions/devices (revoke), theme (light/dark/industrial), language, notification prefs, API tokens (permission-gated).

---

## 9. Dashboard Design (all config-driven from `/dashboards/config`)

Widget registry (renderer supports): `kpi-card` (value, delta, spark, drill link) · `chart` (line/bar/area/donut/pareto) · `heatmap` · `table-widget` · `ai-insight-card` (headline, confidence, evidence links, actions) · `activity-feed` · `notification-digest` · `shortcut-grid` · `graph-mini`.

| Dashboard | KPI cards | Graphs | AI widgets | Also |
|---|---|---|---|---|
| **Super Admin** | Active users, docs ingested (24h), pipeline success %, API error rate, storage, LLM spend | Ingestion throughput line, error-rate line, usage by role donut | Anomaly card ("OCR failures ↑ on scanned P&IDs") | Tenant table, queue health, audit feed, shortcuts: invite user / flags / AI config |
| **Plant Manager** | OEE proxy, unplanned downtime hrs, open critical WOs, compliance %, budget vs actual, safety days | Downtime trend, cost by area bar, WO aging, availability heatmap by unit | **Daily AI Brief** (top 3 risks w/ citations), prediction digest | Approvals queue, activity, shortcuts: reports / schedule / gaps |
| **Maintenance** | Open WOs by priority, MTBF, MTTR, PM compliance %, backlog hrs, repeat-failure count | Failure Pareto, WO throughput, backlog burn-down, MTBF trend per class | RCA suggestions, top-5 risk equipment predictions | Today's schedule, recent failures feed, shortcuts: create WO / RCA / predictions |
| **Compliance** | Compliance %, open gaps by severity, audits in 30d, expiring certs, overdue remediations | Gap trend, coverage heatmap, remediation aging | Regulatory-change impact card, gap-detection digest | Audit calendar, evidence-package quick action |
| **Technician (mobile)** | My open WOs, due today, overdue, hrs logged | (minimal — one small completion ring) | "Before you start" safety insight per WO, copilot shortcut | Today card list, scan QR, alerts |
| **Executive** | Plant availability, downtime cost ₹, compliance risk index, knowledge coverage % (docs linked/total), workforce knowledge-risk (retiring experts vs captured docs) | Multi-plant comparison bars, cost trend, risk matrix scatter | Monthly AI executive summary (exportable) | Strategic alerts, board-report shortcut |

---

## 10. Complete Component Library

Foundation: shadcn/ui primitives themed with IndusMind tokens (§15).

Buttons (primary/secondary/destructive/ghost/icon; loading state built-in; min 44px touch on mobile) · Inputs (text, number w/ units, textarea, date/range, file dropzone, tag input, search w/ debounce) · Dropdowns (select, multi w/ chips, async combobox — **options always from `/lookups/:key`**) · Dialogs (modal, confirm-destructive with type-to-confirm, side drawer, bottom sheet mobile) · Cards (KPI, entity, insight) · **Timeline** (unified event timeline: icon, actor, time, payload, filter) · **Stepper** (procedure steps w/ check-off + photo attach) · **KnowledgeGraphViewer** (React Flow wrapper: typed nodes, edge labels, expand, minimap, export) · **EquipmentCard** (tag, health gauge, status, quick actions) · **DocumentViewer / PDFViewer / ImageViewer** (react-pdf; page nav, zoom, entity bounding-box overlay layer, text-layer search) · **AIChatWindow** (streaming markdown, CitationChip, ConfidenceBadge, TimeToAnswerBadge, FeedbackBar, ScopeFilter, VoiceInput) · **NotificationPanel** (grouped, priority-colored, mark-read, deep links) · **ActivityFeed** · Charts (Recharts wrappers: Line, Bar, Area, Donut, Pareto, Scatter — all take `{data, config}` from API) · **DataTable** (TanStack Table: server pagination/sort/filter, column pin/hide, row selection, bulk bar, export, saved views, mobile card mode) · **Heatmap** (matrix w/ drill) · Compliance widgets (GapSeverityBadge, CoverageMatrix, ClauseTree, EvidenceSideBySide) · **MaintenanceTimeline** (Gantt/calendar hybrid) · **RelationshipGraph** (ego-network mini) · Utility: SkeletonLoader, EmptyState, ErrorState, ConfidenceBadge, StatusChip, PermissionGate (`<Can permission="wo.create">`), Breadcrumbs, PageHeader, FilterBar, GlobalSearchOverlay (⌘K).

---

## 11. Every Table (spec pattern)

All tables: server-side pagination (25/50/100), multi-column sort, column show/hide + saved views, sticky header, export CSV/XLSX (permission `*.export`), mobile card-list rendering.

| Table | Key columns | Filters | Bulk actions | Import | Visible to |
|---|---|---|---|---|---|
| Documents | name, type, tags, equipment, status, confidence, version, uploader, date | type, status, equipment, date, tags | reprocess, tag, delete, export | drag-drop files | doc.read |
| Equipment | tag, name, type, area, criticality, health, status, open WOs | area, type, criticality, health, status | export, assign inspection | CSV asset import (admin) | equip.read |
| Work Orders | WO#, title, equipment, type, priority, assignee, due, status, SLA | status, priority, type, assignee, area, date | assign, close, export | CSV (admin) | wo.read |
| Failures | id, equipment, mode, severity, date, downtime hrs, RCA status | equipment, mode, severity, date | export, start RCA | — | maint.read |
| Predictions | equipment, risk, mode, window, recommendation, status | risk band, area, status | accept→WO, dismiss | — | maint.read |
| Regulations/Clauses | code, clause, title, category, mapped count, gaps | category, status | export | regulation set upload | comp.read |
| Gaps | clause, severity, equipment, owner, due, status | severity, status, owner, area | assign, export | — | comp.read |
| NCRs | id, line, defect, severity, status, CAPA | severity, status, line, date | export | — | qual.read |
| Users | name, email, role(s), status, last active | role, status | deactivate, resend invite | CSV invite | user.manage |
| Audit Log | time, actor, action, entity, IP | actor, action, entity, date | export | — | audit.read |
| Notifications | title, category, priority, time, read | priority, category, read | mark read | — | self |
| Ingestion Jobs | file, stage, status, duration, errors | stage, status, date | retry, cancel | — | admin |

---

## 12. Search System

- **Global Search (⌘K overlay):** one box → parallel API: keyword (Postgres FTS) + semantic (pgvector) + entity match (graph). Grouped results, recent searches, quick actions.
- **Semantic Search:** embedding similarity over chunks; each result shows similarity score + snippet + source page.
- **AI Search:** natural-language question detection ("why/how/what") → banner routes to Copilot with the query prefilled.
- **Document Search:** within-viewer text search + library-level filtered search.
- **Equipment Search:** tag autocomplete with fuzzy match (P-101 ≈ P101 ≈ Pump-101) + QR scan on mobile.
- **Knowledge Graph Search:** node/relationship query builder ("Equipment FAILED_WITH mode X GOVERNED_BY OISD-118") rendered as canvas subgraph.

---

## 13. Notifications

Channels: **In-app** (bell + panel + toast), **Real-time** (WebSocket `/ws/notifications`, reconnect w/ backoff, missed-event catch-up), **Email** (digest + immediate for Critical), **Push** (PWA web-push; P2 native). 
Priorities: **Critical** (safety/compliance breach — red, persistent toast, email+push immediate) · **High** (WO assigned, gap detected, prediction) · **Normal** (mentions, doc processed) · **Low** (digests). 
Categories & routing rules come from `/notifications/preferences` schema — user-editable per category×channel. Every notification deep-links to its entity.

---

## 14. Theme

- **Light** (default office) · **Dark** (control rooms/night shift) · **Industrial** (high-contrast, larger type/targets, glare-friendly for field use — auto-suggested on mobile).
- Implemented as CSS-variable token sets on `<html data-theme>`; user choice persisted via API; respects `prefers-color-scheme` initially.

---

## 15. Design System

- **Direction:** precision-industrial. Not a generic admin template — the aesthetic borrows from control-room HMIs and engineering drawings: structured grid, engineering-grade data density, restrained color reserved for status meaning.
- **Color tokens:** `--bg` #0F1417(dark)/#F7F8F9(light) · `--surface` layered elevations · `--primary` deep industrial teal #0E7C86 · `--accent` signal amber #F5A524 (alerts/AI highlights only) · status: ok #2E9E5B / warn #F5A524 / critical #E5484D / info #3E7BFA · graph node palette (7 entity hues, colorblind-safe). Semantic tokens only — components never use raw hex.
- **Typography:** Display/headings **"Archivo"** (technical, condensed confidence); body **"Inter"**; data/mono **"JetBrains Mono"** for tags, IDs, parameters (equipment tags always mono — a signature detail). Scale: 12/14/16/18/22/28/36, weights 400/500/700.
- **Spacing:** 4px base scale (4,8,12,16,24,32,48,64). **Radius:** 6px cards, 4px inputs. **Icons:** Lucide, 20px default. 
- **Grid:** 12-col desktop (max 1440 content), 8-col tablet, 4-col mobile; dashboard = drag-grid (react-grid-layout).
- **Breakpoints:** sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536. Mobile-first CSS.

---

## 16. State Management

- **Server state = TanStack Query.** Keyed per resource (`['workOrders', filters]`), staleTime tuned per volatility (dashboards 30s, lookups 1h), optimistic updates for status changes, invalidation on mutation, infinite queries for feeds.
- **UI state = Zustand** slices: `authStore` (user, permissions, tenant), `uiStore` (sidebar, theme, modals), `copilotStore` (active session, streaming buffer), `notificationStore` (WS-fed unread).
- **URL = state** for filters/pagination/tabs (shareable views).
- **Forms:** react-hook-form + Zod schemas mirroring API validation.
- **WebSocket layer** dispatches into Query cache (e.g., ingestion job progress patches the job query) — no duplicate state.

---

## 17. API Integration Strategy

- Single typed client (`lib/api/client.ts`): base URL from `NEXT_PUBLIC_API_BASE_URL`, attaches access token, **401 → silent refresh (single-flight) → retry → else logout**, normalises errors to `{code, message, fieldErrors}`, request-id header for tracing.
- Resource modules (`api/documents.ts`, `api/copilot.ts`…) export typed functions + Query hooks (`useDocuments(filters)`).
- **Streaming:** copilot uses SSE/fetch-stream; ingestion progress via WebSocket.
- **Mock mode:** `NEXT_PUBLIC_API_MODE=mock` routes the same client to `/app/api/mock/*` route handlers serving fixture JSON identical to the contract — the entire UI phase runs on this; integration = flip one env var.

---

## 18. Folder Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── (auth)/login, forgot-password
│   ├── (app)/              # authed shell: layout w/ sidebar+topbar
│   │   ├── dashboard/  copilot/  documents/  knowledge-graph/
│   │   ├── equipment/  maintenance/  compliance/  quality/
│   │   ├── lessons-learned/  analytics/  notifications/  admin/
│   └── api/mock/           # mock contract handlers (dev only)
├── components/
│   ├── ui/                 # shadcn primitives
│   ├── layout/  charts/  tables/  graph/  documents/  copilot/
│   ├── dashboard/          # widget registry + renderers
│   └── shared/             # EmptyState, ErrorState, PermissionGate...
├── lib/api/                # client + resource modules + types
├── lib/hooks/  lib/utils/  lib/validation/  lib/ws/
├── stores/                 # zustand slices
├── styles/tokens.css       # design tokens (3 themes)
├── config/                 # nav fallback, constants (no data!)
└── public/
```

---

## 19. Frontend Tech Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind + shadcn/ui · TanStack Query v5 · Zustand · TanStack Table · Recharts · React Flow · react-pdf · react-hook-form + Zod · Lucide icons · react-grid-layout (dashboards) · next-intl (i18n) · Serwist (PWA/offline) · Vitest + Testing Library + Playwright (smoke) · ESLint + Prettier.

---

## 20. Route Structure

Route groups: `(auth)` public, `(app)` protected by middleware (token check → redirect `/login`). Per-route permission guard reads `authStore.permissions`; unauthorized → 403 screen (not blank). Lazy-loaded heavy routes (graph, viewer, analytics). Deep-linkable everything (entity URLs stable).

---

## 21. Feature Flags

`/feature-flags` fetched at bootstrap → `flagsStore`; `<Flag name="lessons_learned">` gate component + `useFlag()`. Flags are tenant+role scoped server-side. UI for P2 features ships behind flags (visible in demo when you flip them — good judge moment).

---

## 22. Permission Matrix (rendered dynamically; canonical set)

Permissions follow `resource.action`: `doc.read/create/update/delete/reprocess/export` · `equip.read/manage` · `wo.read/create/assign/close/export` · `maint.schedule/predict.act` · `rca.run/publish` · `comp.read/map/gap.manage/evidence.generate` · `qual.read/manage` · `lesson.read/publish` · `copilot.use/scope.all` · `graph.read` · `analytics.read/export` · `notif.manage` · `user.manage` · `role.manage` · `ai.config` · `flag.manage` · `audit.read` · `tenant.manage`.

| | Admin | PlantMgr | MaintEng | Technician | Compliance | Quality | Auditor | Operator |
|---|---|---|---|---|---|---|---|---|
| doc.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| doc.create | ✓ | ✓ | ✓ | ✓(mobile) | ✓ | ✓ | — | ✓ |
| doc.delete | ✓ | ✓ | — | — | — | — | — | — |
| wo.create | ✓ | ✓ | ✓ | — | — | — | — | ✓(request) |
| wo.assign | ✓ | ✓ | ✓ | — | — | — | — | — |
| wo.close | ✓ | ✓ | ✓ | ✓(own) | — | — | — | — |
| rca.run | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| comp.gap.manage | ✓ | ✓ | — | — | ✓ | — | — | — |
| comp.evidence.generate | ✓ | — | — | — | ✓ | — | — | — |
| audit.read | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — |
| user.manage / role.manage / ai.config / flag.manage | ✓ | — | — | — | — | — | — | — |
| copilot.use | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(read-scope) | ✓ |

(Full grid is data — admin edits it in `/admin/permissions`; UI just renders.)

---

## 23. Loading Strategy

Skeletons matched to layout (dashboard = widget-shaped skeletons; tables = row skeletons). Route-level `loading.tsx`. Progressive: shell paints instantly, widgets stream independently (per-widget Suspense). Prefetch on nav hover. Streaming AI answers token-by-token with typing indicator. Never block whole page on one failed widget — widget-level error cards.

---

## 24. Error Handling

Error boundary per route + per widget. API errors → normalized: field errors inline on forms; entity 404 → friendly "not found or no access" page; 403 → permission explainer; 5xx → retry card w/ request-id; network offline → banner + queue mutations (see §25). Toasts only for transient/system messages. All errors logged to backend `/telemetry/frontend-errors` with request-id.

---

## 25. Offline Support (progressive — technician-focused)

PWA (Serwist): precache shell; runtime cache: assigned WOs + their linked SOP/document pages + equipment cards (stale-while-revalidate). Mutation outbox: WO step check-offs, notes, photos queued in IndexedDB → sync with conflict policy (server wins, local preserved as comment). Clear offline banner + per-item sync status. Copilot: offline → show cached saved answers + "will send when online". (P1 core caching; full outbox P2 — documented for judges.)

---

## 26. Accessibility

WCAG 2.1 AA: full keyboard nav (visible focus rings), ⌘K palette, semantic landmarks, ARIA on custom widgets (graph canvas gets an accessible table alternative), 4.5:1 contrast enforced in tokens (industrial theme ≥7:1), reduced-motion respected, form labels + error announcements (aria-live), touch targets ≥44px, chart data available as table toggle.

---

## 27. Internationalization

next-intl; all strings in locale catalogs (`en`, `hi` scaffolded); dates/numbers via Intl (₹ formatting, en-IN); RTL-ready layout (logical CSS properties); backend content (lookup labels, notification templates) localized server-side via `Accept-Language`. P2 to translate; P0 to structure — no literals in components.

---

## 28. Performance Optimization

Code-split heavy libs (React Flow, react-pdf, Recharts) via dynamic import · virtualized tables/lists (>100 rows) · image thumbnails via backend resize params · Query caching + dedup · debounced search (300ms) · memoized chart transforms · dashboard widgets fetch in parallel · bundle budget: initial route JS < 250KB gz · Lighthouse targets: LCP <2.5s, INP <200ms · WebSocket over polling.

---

## 29. Frontend Security

Tokens: access in memory, refresh in httpOnly SameSite=Strict cookie (never localStorage) · CSP strict (no inline scripts), X-Frame-Options DENY · all rendering React-escaped; markdown from AI sanitized (rehype-sanitize) — AI output is untrusted input · file uploads client-validated (type/size) but server-authoritative · permission checks are UX only — server is the enforcer (never rely on hidden buttons) · no secrets in bundle (only `NEXT_PUBLIC_*` non-sensitive) · idle session timeout w/ warning modal · audit-sensitive actions require confirm dialogs.

---

## 30. Frontend Development Roadmap

- **Sprint 1 (foundation):** design tokens, app shell, auth flow, mock API layer, DataTable + core components, role dashboard renderer.
- **Sprint 2 (knowledge core):** document library + upload/ingestion console + viewer w/ entity overlay, global search, Copilot chat (streaming, citations, confidence).
- **Sprint 3 (operations):** equipment registry + 360°, knowledge graph explorer, work orders (list/detail/mobile), notifications + WebSocket.
- **Sprint 4 (intelligence):** RCA workspace, predictions, compliance suite (regulations, gaps, evidence wizard), lessons learned, quality.
- **Sprint 5 (hardening):** admin suite, analytics, offline caching, a11y pass, performance pass, demo polish.
