# IndusMind — Complete User Guide (Sign-in → Use → Test)

This guide is for a **brand-new person** who wants to actually *use* IndusMind:
get an account, log in, walk through every screen in order, do a real task, and
confirm it works. No prior knowledge assumed. Read top to bottom.

> **Two other docs exist and this one links to them:**
> - **[GETTING_STARTED.md](GETTING_STARTED.md)** — how to *install and run* the app on your computer (Docker, backend, frontend). **Do that first if the app isn't running yet.**
> - **[TESTING.md](TESTING.md)** — deep, technical testing (curl, Playwright, pytest) for developers.
>
> This file sits in the middle: *"the app is running — now how do I use and test it as a human?"*

---

## 0. Before you start — is the app running?

You need three things already started (all covered in **[GETTING_STARTED.md](GETTING_STARTED.md)**):

| Piece | Where | How to know it's up |
|---|---|---|
| **Databases** (Docker) | `BACKEND/` → `docker compose start` | `docker compose ps` shows every row `healthy` |
| **Backend** (the brain) | `BACKEND/` → `uvicorn app.main:app --port 8000` | open <http://localhost:8000/healthz> → `{"status":"ok"}` |
| **Frontend** (the website) | `FRONTEND/` → `npm run dev` | terminal prints `Local: http://localhost:3000/` |

**Quick sanity check before logging in:** open <http://localhost:8000/readyz>.
You want `{"status":"ok", ...}`. If it says `degraded`, one database isn't
connected — fix that first (see the [Troubleshooting](#9-troubleshooting) section), or the app screens will be empty.

When all three are up, open your browser to:

```
http://localhost:3000
```

---

## 1. Getting an account ("sign up")

You have **four** ways in. **Any email address works** (Gmail, company, anything) —
accounts are *not* restricted to `@indusmind.io`; the demo accounts just happen to
use that domain.

### Option A — Use a ready-made demo account (easiest, start here)

The setup step already created 5 demo users. **The password for all of them is
`Demo@1234`** (capital D, then `@`, then `1234`).

| Email | Who they are | What they can do |
|---|---|---|
| `admin@indusmind.io` | Aditi Admin | **Everything** — use this first |
| `manager@indusmind.io` | Rajesh Manager | Dashboards, approvals, all read screens |
| `engineer@indusmind.io` | Priya Engineer | Maintenance, equipment, predictions |
| `technician@indusmind.io` | Arun Technician | Work orders, shift logbook (fewer menus) |
| `compliance@indusmind.io` | Meena Compliance | Compliance, audits, evidence |

> 👉 **Always start as `admin@indusmind.io`.** It sees every screen. Log in as the
> others later to *see how the menu shrinks* — that's the permission system working,
> not a bug.

### Option B — Sign yourself up (self-service registration)

Self sign-up is **enabled**. On the login screen click **Create account** (the
"Create Operator Account" page), enter your **full name, any email, and a
password**, and submit. You're created and **logged in immediately**.

- New self-registered accounts get the **least-privilege role** (they can sign in
  and look around, but an admin grants more access for sensitive actions).
- **Password rules:** at least 10 characters, including a number and a symbol
  (e.g. `Welcome@2026`). The demo password `Demo@1234` is only 9 characters, so
  pick something longer when registering.
- **To turn self sign-up off** (invite-only, more secure), an admin sets
  `SELF_SIGNUP_ENABLED=false` in `BACKEND/.env` and restarts the backend.

### Option C — Have an admin create a real account for you

This is how a new engineer would really get access:

1. Log in as `admin@indusmind.io`.
2. Go to **Admin** (bottom of the left menu) → **Users**.
3. Click **Invite user** (or **Create user**), enter an email + role, and save.
4. **Invited users get an email.** Because this is a demo, the email doesn't go to a
   real inbox — it lands in **MailHog**, a fake inbox at <http://localhost:8025>.
   Open it, click the invite, and set a password.

### Option D — Forgot your password

1. On the login screen click **Forgot password**.
2. Enter your email → the reset email appears in **MailHog** (<http://localhost:8025>).
3. Open it, click the link, choose a new password, log in.

> There's also **MFA** (an authenticator-app code) and **OAuth** ("Sign in with
> Google/Microsoft"). Those are optional and only appear if an admin turned them on;
> you don't need them for normal use.

---

## 2. Your first login

1. At <http://localhost:3000> click **Sign in**.
2. Email: `admin@indusmind.io` — Password: `Demo@1234` — click **Sign in**.
3. You land on the **Dashboard**. On the bottom-left you'll see who you are, e.g.
   `PLANT: CORE / ROLE: ADMIN`.

> **If login fails:** the password is *exactly* `Demo@1234`. If every screen loads
> but is empty, the backend or demo data isn't ready — see [Troubleshooting](#9-troubleshooting).

---

## 3. The 60-second tour (what each menu item is)

The left sidebar is your map. Here's every item in plain words:

| Menu | What it's for |
|---|---|
| **Dashboard** | Your home screen — health charts and key numbers at a glance |
| **Expert Copilot** | Ask questions in plain English, get answers **with the source document cited** |
| **Documents** | All uploaded manuals, P&IDs, inspection reports, shift notes |
| **Knowledge Graph** | A visual web showing how equipment, documents, and rules connect |
| **Equipment 360** | Every machine (e.g. pump `P-101`) with its specs, health, and history |
| **Maintenance Hub** | Work orders, failures, AI predictions, and preventive schedules |
| **Spare Parts** | Parts inventory (e.g. `SEAL-40M`) |
| **Compliance** | Regulations, gaps, audits, and evidence packages |
| **Lessons Learned** | Write-ups of past incidents so mistakes aren't repeated |
| **Quality Management** | Quality checks and records |
| **Shift Logbook** | The running log handed off between shifts |
| **Notifications Center** | Alerts — these can pop up *live* while you work |
| **Operational Analytics** | Trends and reports across the plant |
| **Admin** | (admins only) Users, roles, settings, feature flags |

---

## 4. Walk through it like a real user (do these in order)

Each step below is a small, real task. Do them as **admin** so nothing is blocked.

### 4.1 Dashboard
- Just look. You should see charts and numbers, **not** a blank page or a red error.
- ✅ Success = tiles have data. ❌ If everything is `—` or empty, the backend/data isn't connected — see [Troubleshooting](#9-troubleshooting).

### 4.2 Ask the Copilot a real question ⭐ (the headline feature)
1. Open **Expert Copilot**.
2. Type one of these and press Enter (these are seeded to return real, cited answers):
   - `What failures occurred on pump P-101?`
   - `Torque spec for valve V-230 bonnet bolts`
   - `Which OISD-118 clauses apply to tank farm TF-2?`
3. **What you should see:** the answer appears (streaming in word by word), then
   **citations** (real document names) and a **confidence badge**.
4. Click 👍 or 👎 to leave feedback — it saves.

> **No AI key needed.** Out of the box the Copilot uses a built-in "find-and-quote"
> engine, so answers are **real and cited**, just not creatively worded. To get
> fully AI-written answers, an admin adds an API key in `BACKEND/.env` (see
> [GETTING_STARTED.md](GETTING_STARTED.md) Part 8). Either way the feature works.

### 4.3 Browse Documents
1. Open **Documents** — you'll see ~13 documents (manuals, P&IDs, reports).
2. **Click a document row** to open its detail. Read it, check the metadata.
3. Try the filters/search at the top.

> ⚠️ **Common beginner mistake:** don't type a document ID into the browser address
> bar yourself (e.g. `#documents/doc-1`). The app uses long real IDs, so a made-up
> one shows **"System Fault Detected: DOC_NOT_FOUND"**. That's expected — just
> **click documents from the list** instead of editing the URL. (More on this in
> [Troubleshooting](#9-troubleshooting).)

### 4.4 Explore Equipment 360
1. Open **Equipment 360**.
2. On the left, expand the tree (Plant → Area → Machine) and click `P-101`.
3. The right side fills with tabs: **Overview & Spec**, **Unified History**,
   **Documents Mapped**, **Maintenance Backlog**.
4. Open the **Condition** area and try **posting a meter reading** (e.g. a vibration
   value) — it saves and shows on the chart.

### 4.5 Work the Maintenance Hub
1. Open **Maintenance Hub**.
2. **Work Orders** tab → open `WO-2001`. See its checklist, parts, and status.
   Change the status or assign it — it saves.
3. **Failures** tab → open one to see the root-cause workspace.
4. **Predictions** tab → 7 AI-ranked risks; try **Accept** or **Dismiss** on one.

### 4.6 Check Compliance
1. Open **Compliance**.
2. **Regulations** → expand `OISD-STD-118` to see its clause tree.
3. **Gaps** → open a gap, change its status (e.g. *Risk Accepted*). Choosing
   *Remediating* actually **creates a work order** for it.
4. **Audits** is intentionally **empty** — a good place to test *creating* one.

### 4.7 See the Knowledge Graph
1. Open **Knowledge Graph**.
2. The top strip shows totals (~67 nodes / 70 edges).
3. **Search** `P-101`, click the node, and watch its neighbors expand. Click a node
   to see its properties in the side drawer.

> You may see a yellow console warning `Edge type "bezier" not found`. That's
> cosmetic — the graph still draws fine. Ignore it.

### 4.8 Watch a live Notification 🔔 (the real-time feature)
1. Keep the app open on any screen.
2. As **admin**, trigger a broadcast. Easiest no-code way: open the API playground
   at <http://localhost:8000/docs>, find `POST /notifications/broadcast`, click
   **Try it out**, and send it.
3. **Back in the app, a toast pops up and the bell badge increases — with no
   refresh.** That proves the live connection works.

### 4.9 Prove permissions work (log in as someone else)
1. Log out (top-right menu).
2. Log in as `technician@indusmind.io` / `Demo@1234`.
3. **Notice the sidebar is shorter** — technicians can't see Admin, etc. That's the
   security model doing its job. Some actions will (correctly) be blocked for them.

**You've now used every major feature.** 🎉

---

## 5. A realistic "day in the life" task (ties it all together)

Try this as a single story to feel how the pieces connect:

> **"Pump P-101 keeps failing — figure out why and act on it."**
>
> 1. **Copilot:** ask `What failures occurred on pump P-101?` → read the cited answer.
> 2. **Equipment 360:** open `P-101` → check its **Unified History** and health.
> 3. **Maintenance Hub → Failures:** open the P-101 failure → review root cause.
> 4. **Maintenance Hub → Work Orders:** open/assign the related work order.
> 5. **Spare Parts:** confirm the needed seal (e.g. `SEAL-40M`) is in stock.
> 6. **Lessons Learned / Shift Logbook:** jot a note so the next shift knows.

If you can complete that loop without hitting a blank screen or a hard error, the
system is working end-to-end.

---

## 6. How to test that everything works

There are **three levels**. Pick based on how thorough you want to be.

### Level 1 — The click-through checklist (no coding, 5 minutes)

Logged in as **admin**, confirm each screen shows *data* (not blank, not an error):

- [ ] Dashboard shows charts/numbers
- [ ] Copilot returns a cited answer to `What failures occurred on pump P-101?`
- [ ] Documents lists ~13 docs and one opens
- [ ] Equipment 360 opens `P-101` with populated tabs
- [ ] Maintenance Hub shows work orders / failures / predictions
- [ ] Compliance shows `OISD-STD-118` and gaps
- [ ] Knowledge Graph draws nodes and search works
- [ ] A broadcast notification pops up live
- [ ] Logging in as `technician@` shows a **shorter** menu

All ticked → frontend + backend are talking correctly.

### Level 2 — The API health & docs page (no coding)

- <http://localhost:8000/healthz> → `{"status":"ok"}` (backend alive)
- <http://localhost:8000/readyz> → all stores `ok` (databases connected)
- <http://localhost:8000/docs> → an **interactive list of everything the backend
  can do**. Click any endpoint → **Try it out** → **Execute** to test it directly.

### Level 3 — Automated tests (for developers)

Full curl smoke tests, browser automation (Playwright), and the backend test suite
(pytest) are documented step-by-step in **[TESTING.md](TESTING.md)**. Short version:

```bash
cd BACKEND
# Runs the whole backend test suite. NOTE: this WIPES the demo data.
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python -m pytest -q
# Re-fill demo data afterward so the app has content again:
.venv/Scripts/python -m seeds.seed
```

> ⚠️ Running the automated tests **empties the database**. Always re-run the seed
> command above before using the app again, or every screen will look empty.

---

## 7. Where do the "test files" live?

If you were told to look at tests, here's the map:

| What | Where | How to run |
|---|---|---|
| Backend automated tests | `BACKEND/tests/` (e.g. `test_maintenance.py`, `test_compliance.py`, `test_auth.py`) | `pytest` — see [TESTING.md](TESTING.md) §8 |
| Demo data seeder | `BACKEND/seeds/seed.py` | `python -m seeds.seed` |
| Frontend type/build check | `FRONTEND/` | `npm run lint` and `npm run build` — see [TESTING.md](TESTING.md) §8 |
| Browser end-to-end (optional) | you create `FRONTEND/e2e-smoke.mjs` | copy-paste script in [TESTING.md](TESTING.md) §7 |

---

## 8. Good-to-know "non-bugs" (things that look wrong but aren't)

- **`GET /users` gives 403 for non-admins** — by design. Only admins manage users.
- **A few `401` / i18n messages flash in the browser console *before* you log in** —
  normal; the public page loads translations before you're authenticated.
- **Empty sub-panels** (e.g. equipment relationships, the audits list) — the demo
  data just doesn't fill every corner yet. They render gracefully.
- **`Edge type "bezier" not found` console warning** — cosmetic Knowledge-Graph note.
- **Copilot answers sound quoted rather than conversational** — that's the keyless
  fallback; add an AI key for generative answers (optional).

---

## 9. Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| Login page loads but **every screen is empty** | Backend not running, or demo data was wiped by tests | Make sure the backend terminal is running; run `python -m seeds.seed` |
| **"System Fault Detected: DOC_NOT_FOUND"** (or a `422`) after editing the URL | You navigated to an ID that doesn't exist (e.g. typed `#documents/doc-1`) | Don't hand-type IDs. Go back and **click** the item from its list |
| Dashboard tiles all show `—` / **AI Confidence: Low (0%)** | A backing database (Neo4j/Postgres) isn't connected or seeded | Check <http://localhost:8000/readyz>; start Docker + re-seed |
| Browser console full of **`401 Unauthorized`** before login | Expected — public page loads before auth | Ignore; they turn to `200` after you sign in |
| **Login says wrong password** | Typo | It's exactly `Demo@1234` |
| **Invite / reset email never arrives** | Emails go to the fake inbox, not a real one | Open **MailHog**: <http://localhost:8025> |
| **CORS error** in console, API calls blocked | Frontend is on `:3001` but backend only allows `:3000` | Add `http://localhost:3001` to `BACKEND/.env` `CORS_ORIGINS`, restart backend |
| **Copilot answers are generic** | No AI key set | Optional — add a provider key in `BACKEND/.env` |

---

## 10. One-screen cheat sheet

```
Open app:      http://localhost:3000
Login:         admin@indusmind.io  /  Demo@1234   (start as admin)
Fake inbox:    http://localhost:8025   (invites & password resets land here)
API health:    http://localhost:8000/healthz  and  /readyz
API playground:http://localhost:8000/docs

First things to try:
  1. Copilot → "What failures occurred on pump P-101?"
  2. Equipment 360 → open P-101
  3. Maintenance Hub → open WO-2001
  4. Log in as technician@indusmind.io → see the shorter menu (permissions work)

Golden rules:
  • Click items from their list — don't hand-type IDs in the URL.
  • Running pytest WIPES data → re-run  python -m seeds.seed  afterward.
  • No account signup button — use a demo user, or have an admin invite you.
```

That's the whole journey — from getting in, to using every feature, to proving it
works. For installing/running the app see **[GETTING_STARTED.md](GETTING_STARTED.md)**;
for deep technical testing see **[TESTING.md](TESTING.md)**.
