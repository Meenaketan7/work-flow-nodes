# Forge — build status (2026-06-30)

AI Build Operator for solo founders, Lemma-native. Core loop:
**input → state → action → approval → outcome.**

> ✅ **VERIFIED LIVE END-TO-END.** Lemma Cloud recovered and every step below was
> run against the real pod (org runtime agents, files RAG, all record writes) and
> through the FastAPI BFF and the React/reactflow UI in a real browser. The earlier
> 503 outage is over. `generate_architecture` (Step 3) is now verified too.
> Re-run commands are in the last section.

---

## Unified canvas redesign (2026-06-30) — VERIFIED LIVE

Forge is now ONE screen in the legacy pipeline's 3-pane shape (no Forge/Pipeline
toggle, no separate project page):
- **Left** — Node Library palette: architecture components grouped by layer
  (Client / API / Data / Integration / Infra) **plus** the kept legacy Workflow
  nodes. Dragging one onto the canvas **persists a real node** in the current project.
- **Center** — the reactflow board. De-tangled: a backend **barycenter layered
  layout** (`generate_architecture.layout`, reused by a `relayout` endpoint behind
  the header **Tidy** button), plus **arrowheads + smoothstep edges + select-to-
  highlight** (selected node's edges go bold/animated, the rest dim to 0.18 opacity).
- **Right** — project controls on top (lock/unlock, export, digest, node status +
  guidance), **build-description input pinned at the bottom**. Project dropdown +
  **New** (blank project) + **Tidy** live in the header.

New BFF endpoints (all live-verified): `POST /api/projects` (blank), `POST/PATCH/
DELETE /api/projects/{id}/nodes[/{slug}]`, `POST/DELETE /api/projects/{id}/edges
[/{edge_id}]` (edge create is **DAG-guarded → 400 on cycle**), `POST /api/projects/
{id}/relayout`. Manual node create→persist→render, position drag-persist, cascade
delete, and the cycle guard were all confirmed against the real pod + in the browser.

Also added **auth self-heal**: the BFF catches expired-token 401s, refreshes via
`lemma auth print-token`, patches the shared Pod's client header, and retries once —
so a long demo no longer dies on the ~hourly token expiry.

---

## Streaming generation + abort (2026-07-01) — VERIFIED LIVE

Generation is two LLM agent passes (decompose + refine) and genuinely takes minutes
(observed **403s** for a 28-node map). Previously the UI showed a blind spinner with
no feedback and no way to stop, and a dead BFF surfaced only as
`NS_ERROR_CONNECTION_REFUSED`. Now:

- **Backend** — `generate_architecture.generate_steps(pod, prompt)` is a generator
  that `yield`s staged progress events (`grounding → grounded → decompose →
  decomposed → refine → persisting → done`). New SSE route
  **`POST /api/generate/stream`** (`StreamingResponse`, `text/event-stream`,
  `X-Accel-Buffering: no`) emits each event as a `data: {json}\n\n` frame. On client
  disconnect Starlette stops pulling the generator, so **no later stage (incl. the
  persist) runs** — abort leaves no orphan project. `_ensure_auth(pod)` warms a fresh
  token before the long run. The blocking `generate_architecture()` wrapper (CLI +
  non-streaming `/api/generate`) is unchanged, layered over the same generator.
- **Frontend** — `forgeApi.generateStream(prompt, {onProgress, signal})` reads the
  SSE body (`getReader` + `TextDecoder`, split on `\n\n`) and an **AbortController**
  drives a **Stop** button. The canvas shows a "Designing your architecture" overlay
  with the live stage label, a **4-segment stepper**, and node/task counts as they
  arrive; the bottom build area mirrors it with a progress card + full-width Stop.

**Verified live in the browser (2026-07-01):** a run streamed `grounding →
decomposing → …`; **Stop** mid-flight aborted cleanly
(`POST /api/generate/stream → net::ERR_ABORTED`, toast "Generation stopped", UI reset
to idle, **no orphan project, 0 console errors**); a full run completed in 403s,
auto-loaded the new project (toast **"Built 28 nodes, 61 edges, 56 tasks"**), and the
backend read back **project `f47eece8…` = 28 / 61 / 56**. Edge readability re-confirmed:
selecting a node left **5 connected edges bold** (opacity 0.90 / width 2.5) and **56
dimmed** (0.18 / 1.5).

---

## Legacy UI fully restored (2026-07-01, round 2) — VERIFIED LIVE

The whole Forge screen now wears the legacy pipeline's shadcn **sidebar-inset**
shape (same as the old `Layout.tsx`), not just the node visuals — while keeping ALL
Forge backend logic + the architecture node model. Old UI was the priority; **no
backend changes** (rename uses the existing `PATCH …/nodes/{slug}` title field, tag
links use the existing DAG-guarded `POST …/edges`).

- **Layout** — `forge-screen.tsx` rebuilt onto `SidebarProvider` + `SidebarInset`:
  the Node Library is now a real collapsible shadcn `Sidebar` (a plain area, left),
  and the canvas lives in the inset **workspace card** (`rounded-lg border shadow-sm`)
  with the header **on** the card — exactly the screenshots.
- **Header** — legacy `SiteHeader` shape: `NodeLibraryTrigger` collapse button at the
  **left corner** (toggles the sidebar, ⌘B) · separator · Forge / AI Build Operator ·
  project dropdown / New / Tidy, then right-aligned `ModeToggle` + a new **Assistant**
  button.
- **Assistant drawer** — the old right rail (describe-to-build input, project
  lock/export/digest, node status + guidance) moved into a shadcn **Sheet** (`side=
  "right"`, `modal={false}` so the canvas stays visible/interactive) toggled by the
  Assistant button; auto-closes on a successful generate to reveal the fresh board.
- **Sidebar node cards** — `forge-palette.tsx` cards now carry the **`Accents` corner
  brackets** + dashed 2-col category grid, matching the old `NodeCard` (the missing
  corner "box design" the user flagged).
- **Board nodes** — `forge-node.tsx`: **removed the coloured left border**
  (`border-l-4`/`borderLeftColor` gone → `border-left-width:0`); the header title is
  now an **inline editable input (rename)** persisted via `updateNode({title})` on
  blur; added a **tag field** ("+ link a node…") that filters the other nodes in a
  `Command` dropdown and, on pick, creates a real edge (picked → this) — the restored
  {{mention}} auto-edge behaviour. Slug stays the immutable edge key in the blue tag box.

Verified live (browser 1440×900, project `Build a digital twin` 43 nodes / 120 edges):
node DOM `border-left-width:0px`, editable title input (`MQTT Broker`), tag field
present, 4 accent corners; tag dropdown filtered "api" → 6 node suggestions; sidebar
collapse toggles `data-state` expanded↔collapsed (gap width 288↔0) and the inset card
expands; Assistant Sheet opens with no overlay blocking the canvas; palette cards show
corner brackets; **0 console errors**; `tsc --noEmit` clean; `bun run build` green.

**Node overlap fix + Arrange button (2026-07-01):** the taller nodes (tag field made
them **277px**) overlapped the old layout `ROW_GAP=150`. Bumped the barycenter layout
spacing in `generate_architecture.py` -> `ROW_GAP=340`, `COL_GAP=400` (feeds both
generation AND the `relayout` endpoint) and dropped one node separator to slim it. Added
an **Arrange** button to the canvas toolbar: `pipeline-controller.tsx` takes an optional
`onArrange` prop (renders a `LayoutGrid` ControlButton next to Fit-to-View, then fits);
`forge-canvas.tsx` threads it; `forge-screen.tsx` passes `onTidy` (the same relayout the
header Tidy uses). Verified: clicking Arrange -> min vertical gap **340px, 0 overlapping
pairs** across 44 nodes / 5 columns (BFF auto-reloaded via `--reload`). NOTE: `bunx tsc`
resolves a **typosquat** pkg (fake "Version 6.0.3") — use `bun run build` (tsc -b + vite)
or `./node_modules/.bin/tsc` for a real typecheck.

## Generation speed (2026-07-01)

Collapsed the two sequential agent passes (decompose, then refine + tasks) into a
SINGLE pass that emits nodes + edges + tasks at once — the local `normalize()`
already repairs the graph into a valid DAG and back-fills tasks, so the 2nd LLM
round-trip was redundant. One fewer agent call per generation, **no node cap**; the
SSE stage events (`grounding…done`) are unchanged so the progress UI is untouched.
Polling in `_forge.ask` tightened 3s→2s. NOTE: the dominant latency is the agent
**model itself** (org runtime default `minimax-m3`, observed high variance), so the
biggest real speed win is the model swap below — not the pass count.

## AI model lives in the Lemma runtime profile (NOT in this repo)

Generation uses the Lemma agent `"hello"` (`AGENT="hello"` in `_forge.py`), and its
LLM is the org **runtime profile** — configured server-side, there is no model
string in the code. The agent's `agent_runtime` is `null` → it inherits the default
`system:lemma` profile (default model `minimax-m3`, 6-model catalog). "Open code free
model" maps to the **OpenCode** harness (a `USER_DAEMON` runtime profile):
1. run a Lemma user daemon exposing OpenCode → it shows in `lemma runtime harnesses`;
2. `lemma runtime profiles create USER_DAEMON --harness OPENCODE --daemon-id <id> --name OpenCode`;
3. pin it on the agent: `lemma agents update hello --pod forge -d '{"agent_runtime": <profile-id>}'`.
User opted to **set this in Lemma** (no code change) — it makes generation free and,
being a local harness, faster.

## What exists (by plan step) — all VERIFIED LIVE

| Step | File | What it does | State |
|---|---|---|---|
| 3 | `backend/lemma-map/generate_architecture.py` | idea → DAG system map + backlog → records | **VERIFIED ✅** |
| — | `backend/lemma-map/_forge.py` | shared core: pod, retry, agent `ask`, RAG `search_knowledge`, `split_reply` | **VERIFIED ✅** |
| 4 | `backend/lemma-map/guide_node.py` | per-node RAG guidance → `node_threads`, cached by qhash | **VERIFIED ✅** |
| 5a | `backend/lemma-map/approvals.py` | design-lock / unlock / gate / set-status (approval = record state) | **VERIFIED ✅** |
| 5b | `backend/lemma-map/export_repo.py` | approval-gated GitHub scaffold (BYO token, **dry-run default**) | **VERIFIED ✅ (dry-run)** |
| 5c | `backend/lemma-map/digest.py` | on-demand build digest (+ optional connector send / schedule) | **VERIFIED ✅ (on-demand)** |
| 6 | `backend/main.py` | FastAPI BFF — all `/api/*` routes over the SDK, one shared Pod | **VERIFIED ✅** |
| 6 | `frontend/src/components/forge/*`, `src/pages/forge/*`, `src/lib/forge-api.ts` | reactflow state board + side panel driving the whole loop | **VERIFIED ✅ (browser)** |
| 7 | — | seed 2–3 demo projects + record the core loop | **your task — 2 demo projects already seeded** |

The legacy pipeline canvas is untouched — Forge is the default view, "Legacy
pipeline →" is one click away.

---

## VERIFIED LIVE (what actually ran against the real pod, 2026-06-30)

- **Auth** refreshed via `lemma auth print-token`; `Pod.from_env()` reads the new
  token; `pod.tables.list()` returns `edges, items, node_threads, nodes, projects, tasks`.
- **Step 3** — `generate_architecture "a shared to-do app with login…"` →
  grounded with 1914 chars of `/knowledge`, 2-pass agent, repaired to a DAG,
  persisted **project `51a870eb…` = 14 nodes / 24 edges / 28 tasks**, read back
  from the pod. `=== STEP 3: GO ✅ ===`.
- **Step 4** — `guide_node` on the foundation node → fresh guidance grounded by
  2 `/knowledge` sources (10 steps / 7 checks / 6 tech) written to `node_threads`;
  **repeat call was a CACHE HIT**. `=== STEP 4: GO ✅ ===`.
- **Step 5** — pre-lock status (14 designed); export **correctly blocked** by the
  gate (`PermissionError`); `lock_design` → 14 nodes designed→building + 28 tasks
  approved + `design_locked=True`; export now yields a **9-file dry-run scaffold**;
  `compute_state` classified 0 shipped / 6 in-progress / 8 blocked and the agent
  wrote a useful prioritized digest.
- **Step 6 BFF** — booted with `uvicorn`; every route exercised against real Cloud:
  `GET /api/projects`, `GET /api/projects/{id}` (reactflow-shaped 14 nodes /
  24 edges / 28 tasks), `POST /api/nodes/status` (end-user→done),
  `POST /api/guidance` (`cached:true`), `POST /api/projects/{id}/export` (dry-run +
  **HTTP 409 when unlocked**), `POST /api/projects/{id}/digest` (reflected the
  shipped node), `unlock`/`lock`, and `POST /api/generate` →
  **project `07966e35…` = 21 nodes / 58 edges / 42 tasks**.
- **Step 6 frontend** — loaded in a real browser against the live BFF: project
  picker populated from `/api/projects` (lock 🔒 shown), selecting a project
  rendered the **layered, color-coded DAG (14/24)**, the side panel showed
  Project (Design locked → Unlock/Export/Build digest), Node (status controls),
  and clicking a node fetched live **grounded guidance** ("How to build API
  Server"). No network/CORS errors. Fixed a React Flow `nodeTypes` warning
  (hoisted to module scope) — **0 warnings** after; `bun run build` green.

## Still optional / not exercised (by design — outward-facing)

- `export_repo --push` (real GitHub write) — needs a `GITHUB_TOKEN`; left unrun on
  purpose (publishes outward). The dry-run manifest path is verified.
- `digest.send_digest` (Slack/Gmail connector) and `register_daily_schedule`
  (Lemma cron) — optional, off by default; the on-demand digest is verified.

---

## How to re-verify / run the demo

```bash
# 0. refresh auth if the token has expired between sessions
lemma auth print-token   # (or: lemma auth login)

cd backend && source .venv/bin/activate

# 1. Step 3 — idea -> system map + backlog, persisted
python lemma-map/generate_architecture.py "a shared to-do app with login"
#    -> "=== STEP 3: GO ✅ ==="

# 2. Step 4 — guidance + cache (2nd call = CACHE HIT)
python lemma-map/guide_node.py
#    -> "=== STEP 4: GO ✅ (cache hit on repeat) ==="

# 3. Step 5 — approvals + outcomes (all dry/safe)
python lemma-map/approvals.py "" status
python lemma-map/approvals.py "" lock
python lemma-map/export_repo.py     # dry-run scaffold (no GitHub call)
python lemma-map/digest.py          # on-demand digest

# 4. Step 6 — BFF + canvas
uvicorn main:app --reload --port 8000              # backend (terminal 1)
cd ../frontend && bun install && bun run dev        # frontend (terminal 2) -> open printed URL
```

Two demo projects are already seeded in the pod:
- `51a870eb-54a0-4df2-955e-4d95c3928e94` — shared to-do app (locked, one node done)
- `07966e35-fca7-4765-b469-41edb9cfa778` — habit tracker (21 nodes)

Outward-facing actions stay off by default: `export_repo` only touches GitHub with
`--push <owner> <repo>` **and** `GITHUB_TOKEN`; `digest` only sends with an explicit
connector. Nothing publishes on its own.
