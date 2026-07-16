# IndusMind — Complete Beginner's Guide (Run + Test)

This is the **only file you need** to get IndusMind running on your own computer
and to check that it works. It assumes you have never used this project before.
Follow it top to bottom. Copy each command exactly.

**What is IndusMind?** A web app for factories. You upload documents (machine
manuals, inspection reports, shift notes), and it lets engineers ask questions and
get answers with the source cited — plus equipment tracking, maintenance
predictions, and compliance tools.

**How it's built (you don't need to understand this to run it):**
- **Backend** = the "brain". A Python program that stores data and answers requests. Lives in the `BACKEND` folder.
- **Frontend** = the "face". The website you click around in. Lives in the `FRONTEND` folder.
- **Databases** = where information is saved. We run these inside Docker.

---

## Part 0 — Install these first (one time only)

You need three things installed on your computer. If you already have them, skip ahead.

| Tool | What it's for | Where to get it | How to check it's installed |
|---|---|---|---|
| **Docker Desktop** | Runs the databases | <https://www.docker.com/products/docker-desktop/> | Open a terminal, type `docker --version` |
| **Python 3.11** | Runs the backend | <https://www.python.org/downloads/release/python-3119/> | `python --version` → must say **3.11.x** |
| **Node.js 20+** | Runs the frontend | <https://nodejs.org/> (pick the "LTS" version) | `node --version` → must say v20 or higher |

> **What is a "terminal"?** It's a window where you type commands instead of
> clicking. On Windows, search the Start menu for **"Git Bash"** (installs with
> Git) or **"PowerShell"**. On Mac, open **"Terminal"**. This guide's commands
> work in Git Bash on Windows and Terminal on Mac.

> ⚠️ **Python must be exactly version 3.11.** If `python --version` shows 3.12 or
> higher, the backend will refuse to install. Download 3.11 from the link above.

**Before you start every session: open Docker Desktop and wait** until its whale
icon stops animating. If Docker isn't running, the very first command below fails
with a confusing "cannot find the file" error.

---

## Part 1 — Get the code and open a terminal there

If you already have the project folder (`IndusMind`), open a terminal and go into
it. For example, if it's on your Desktop:

```bash
cd ~/Desktop/IndusMind        # Mac
cd /c/Users/YOUR_NAME/OneDrive/Desktop/IndusMind   # Windows Git Bash
```

You should now be "inside" the IndusMind folder. Type `ls` and you should see
folders named `BACKEND`, `FRONTEND`, `DOCS`, and `infra`.

---

## Part 2 — Start the databases (Docker)

The app needs four databases. Docker runs them all for you with one command.

```bash
cd BACKEND
cp .env.example .env
docker compose up -d postgres redis neo4j minio minio-bootstrap mailhog
```

**What just happened, in plain words:**
- `cd BACKEND` — go into the backend folder.
- `cp .env.example .env` — make a copy of the example settings file. The app reads `.env`.
- `docker compose up -d ...` — download and start the databases in the background.

The first time, Docker downloads several gigabytes — this can take **5–10
minutes**. That's normal, and it only happens once.

**Check they started:**

```bash
docker compose ps
```

You should see a list where every row says **`healthy`** or **`running`**. If
Neo4j says "starting" for a bit, wait 30 seconds and run it again — it's the
slowest to wake up.

| Database | What it does (plain words) |
|---|---|
| postgres | The main filing cabinet — most data lives here |
| redis | Short-term memory / speed cache |
| neo4j | Stores how equipment connects to documents |
| minio | Stores uploaded files (like a mini Dropbox) |
| mailhog | A fake email inbox so you can see emails the app "sends" |

---

## Part 3 — Set up and run the backend (the brain)

Stay in the `BACKEND` folder. Run these **one line at a time**.

**Step 3a — Create a private Python workspace** (called a "virtual environment").
This keeps this project's tools separate from the rest of your computer.

```bash
python -m venv .venv
```

**Step 3b — Install the backend's tools.** This reads the shopping list and
installs everything. Takes a few minutes.

```bash
.venv/Scripts/pip install -e ".[dev]"      # Windows
# On Mac/Linux use this line instead:
# .venv/bin/pip install -e ".[dev]"
```

**Step 3c — Create the database tables** (the empty filing-cabinet drawers):

```bash
.venv/Scripts/python -m alembic upgrade head
```

**Step 3d — Fill it with demo data** (sample factory, users, documents, parts):

```bash
.venv/Scripts/python -m seeds.seed
```

When this finishes it prints a line starting with `Seeded:` listing how many users,
equipment, documents, etc. it created. That means it worked.

**Step 3e — Start the backend:**

```bash
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Leave this terminal window **open and running**. It's now the brain, listening on
your computer at "port 8000". You'll see log lines appear — that's fine.

**Quick check it's alive:** open a *new* terminal window and run:

```bash
curl http://localhost:8000/healthz
```

It should print `{"status":"ok"}`. 🎉 The backend works.

> On Mac/Linux, everywhere you see `.venv/Scripts/...`, use `.venv/bin/...` instead.

---

## Part 4 — Set up and run the frontend (the website)

Open a **new** terminal window (leave the backend one running). Go to the project,
then into `FRONTEND`:

```bash
cd ~/Desktop/IndusMind/FRONTEND      # adjust path to where your project is
cp .env.example .env.local
npm install
npm run dev
```

**What each line does:**
- `cp .env.example .env.local` — copy the settings that tell the website where the brain is.
- `npm install` — download the website's building blocks (takes 1–2 minutes).
- `npm run dev` — start the website.

When it's ready you'll see a line like `Local: http://localhost:3000/`.

---

## Part 5 — Open the app and log in

Open your web browser and go to:

```
http://localhost:3000
```

Log in with any of these demo accounts. **The password is `Demo@1234` for all of them.**

| Email | What they can see |
|---|---|
| `admin@indusmind.io` | Everything (start here) |
| `manager@indusmind.io` | Plant manager view |
| `engineer@indusmind.io` | Maintenance engineer view |
| `technician@indusmind.io` | Field technician view |
| `compliance@indusmind.io` | Compliance officer view |

Log in as **admin** first — it can see every screen. Click around the left-hand
menu: Dashboard, Documents, Equipment, Maintenance, Compliance, and (at the
bottom) Admin.

**You now have the whole app running!** ✅

---

## Part 6 — How to test that everything works

There are **two kinds** of testing. Do whichever you need.

### 6a — The easy manual check (no coding)

With the app open in your browser (Part 5), click through this checklist:

1. **Log in** as `admin@indusmind.io` — you land on a dashboard with charts. ✔
2. **Documents** — you see a list of ~12 uploaded documents. ✔
3. **Equipment** — you see ~25 machines (like "P-101"). Click one to open its detail page. ✔
4. **Maintenance** — you see work orders and predictions. ✔
5. **Spare Parts** (or Maintenance → Parts) — you see parts like "SEAL-40M". ✔
6. **Admin → Audit Log** — you see a history of actions. ✔
7. Log out, then **log in as `technician@indusmind.io`** — notice the menu is
   shorter (technicians see less). That proves permissions work. ✔

If every screen shows data (not an error or a blank page), the frontend and
backend are talking to each other correctly.

**Bonus — see a "sent" email:** open <http://localhost:8025> (Mailhog). When the
app sends a password-reset or notification email, it appears here instead of a
real inbox.

### 6b — The automated tests (checks the backend by itself)

These are pre-written tests that check the brain works correctly. You need the
databases from Part 2 running.

Open a terminal, go into `BACKEND`, and run:

```bash
cd BACKEND
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python -m pytest -q
```

(On Windows PowerShell instead of Git Bash, use:
`$env:RATE_LIMIT_ENABLED="false"; $env:PYTHONPATH=$PWD; .venv\Scripts\python -m pytest -q`)

**What you'll see:** a row of dots, each dot = one passing test, ending with
something like `250 passed`. If you see `failed`, something is wrong — check the
troubleshooting table below.

To run just one area (faster), name its file:

```bash
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python -m pytest tests/test_b19_final.py -q
```

> ⚠️ **Important:** running the tests **empties the database** (they clean up
> after themselves). So after testing, re-fill the demo data before using the app
> again:
> ```bash
> .venv/Scripts/python -m seeds.seed
> ```

### 6c — Check the API directly (optional, for the curious)

The backend has a built-in, clickable list of everything it can do. With the
backend running (Part 3), open:

```
http://localhost:8000/docs
```

This is an interactive page where you can try any request and see the response —
useful for confirming a specific feature works.

---

## Part 7 — Starting and stopping later

**To stop everything:** press `Ctrl + C` in the backend terminal and in the
frontend terminal. To stop the databases:

```bash
cd BACKEND
docker compose stop
```

**To start again next time** (databases keep their data):

```bash
# 1. Make sure Docker Desktop is open, then:
cd BACKEND
docker compose start
.venv/Scripts/python -m uvicorn app.main:app --port 8000     # leave running

# 2. In a second terminal:
cd FRONTEND
npm run dev                                                   # leave running
```

You do **not** need to re-install or re-seed each time — only the first time (or
after running the tests, which wipe the data).

---

## Part 8 — Do I need an AI key?

**No, not to run or demo the app.** Without an AI key, the app works fully —
uploading, searching, all screens — but the "Copilot" chat gives placeholder
answers instead of real AI ones.

**To turn on real AI answers:** open `BACKEND/.env` in a text editor, find the
`LLM_PROVIDER` line, and set one provider plus its key. You can use any of:

```ini
LLM_PROVIDER=anthropic        # then set ANTHROPIC_API_KEY=your-key
# or openai   → OPENAI_API_KEY
# or gemini   → GEMINI_API_KEY
# or grok     → GROK_API_KEY
```

Then install the AI libraries once and restart the backend:

```bash
.venv/Scripts/pip install -e ".[ai]"
```

---

## Part 9 — Troubleshooting (when something goes wrong)

| What you see | What it means | How to fix it |
|---|---|---|
| `cannot find the file ... dockerDesktopLinuxEngine` | Docker Desktop isn't running | Open Docker Desktop, wait for the whale icon to settle, try again |
| `python: command not found` or wrong version | Python 3.11 not installed/selected | Install Python 3.11 (Part 0). Try `python3.11` instead of `python` |
| `pip install` fails with build errors | Usually wrong Python version | Confirm `python --version` says **3.11** |
| Backend won't start: `connection refused` / `password authentication failed` | Databases aren't up, or a different Postgres is interfering | Run `docker compose ps` — all should be healthy. Re-run Part 2 |
| `curl localhost:8000/healthz` fails | Backend didn't start | Look at the backend terminal for a red error message |
| Website loads but every screen is empty/errors | Backend not running, or demo data was wiped by tests | Make sure the backend terminal is running; re-run `python -m seeds.seed` |
| Login says wrong password | Typo | The password is exactly `Demo@1234` (capital D, `@`, `1234`) |
| Copilot chat gives fake/empty answers | No AI key set | Normal — see Part 8 to enable real AI |
| Tests show `failed` | A real problem, or leftover data | Re-seed, then run one test file at a time to find which fails |
| Port 3000 or 8000 "already in use" | Something else is using it | Close the old terminal running it, or restart your computer |

---

## Quick reference card (once you're set up)

```bash
# ── Every session, in order ──
# 0. Open Docker Desktop first.

# 1. Databases
cd BACKEND && docker compose start

# 2. Backend (leave running)
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 3. Frontend (new terminal, leave running)
cd FRONTEND && npm run dev

# 4. Open http://localhost:3000  → log in admin@indusmind.io / Demo@1234

# ── Run the tests (wipes data — re-seed after) ──
cd BACKEND
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python -m pytest -q
.venv/Scripts/python -m seeds.seed
```

That's everything. If a step's output matches what's described here, you're good.
