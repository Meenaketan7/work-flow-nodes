# backend/seed_knowledge.py — Step 2b: seed /knowledge RAG corpus (idempotent)
# Run: source .venv/bin/activate && python seed_knowledge.py
import time
from lemma_sdk import Pod

FOLDER = "/knowledge"
TERMINAL = {"COMPLETED", "NOT_REQUIRED", "FAILED"}

KNOWLEDGE: dict[str, str] = {
    "mvp-architecture-patterns.md": """# MVP Architecture Patterns

How to decompose a software product into a buildable system map (nodes + edges).

## Layers (every node belongs to one)
- **client** — what the user sees: web UI, mobile app, landing page.
- **api** — application/backend logic: endpoints, services, auth, business rules.
- **data** — persistence: database tables, object/file storage, caches, queues.
- **integration** — third-party services: payments, email/SMS, auth providers, LLM APIs.
- **infra** — deploy & run: hosting, CI/CD, env config, monitoring, secrets.

## Node kinds
component (a buildable unit) · service (a running process) · store (a datastore) ·
external (a 3rd-party dependency) · job (a scheduled/background task).

## Edges mean a real dependency
source -> target reads as "target depends on source" / "data flows source to target".
The graph MUST be a DAG (no cycles) so the build can be sequenced.

## Common system shapes
- **CRUD SaaS**: client -> api -> data, plus auth integration + infra.
- **AI app**: client -> api -> LLM integration, with data for history + a vector/RAG store.
- **Marketplace**: two client surfaces (buyer/seller) -> api -> data + payments integration.
- **Data pipeline**: ingest job -> store -> transform job -> api -> client.

## Node status lifecycle
designed -> building -> blocked -> done.
A node is **blocked** when an upstream dependency (an inbound edge source) is not yet done,
or an external decision/credential is missing.
""",
    "solo-founder-stack.md": """# Solo-Founder Default Stack

Opinionated, boring, ship-in-days choices for a pre-seed founder building a first MVP.
Prefer managed services over self-hosting; optimize for speed to first user.

## Frontend (client)
- **Next.js + React + TypeScript + Tailwind** — one framework, SSR + routing built in.
- Component kit: shadcn/ui. Deploy on **Vercel** (zero-config).

## Backend (api)
- **FastAPI (Python)** for AI/data-heavy products; **Node + Hono/Express** if the team is JS-first.
- Keep it a single service until traffic forces a split. REST first; add streaming for AI.

## Data (store)
- **Postgres** as the default system of record (managed: Supabase / Neon / RDS).
- Object/file storage: S3 or the platform's file store. Cache/queue: Redis only when needed.
- Model the schema before writing endpoints — the data model is the contract.

## Integrations
- **Auth**: Clerk or Supabase Auth (don't hand-roll passwords).
- **Payments**: Stripe Checkout (hosted) before custom billing.
- **Email**: Resend or Postmark. **LLM**: Anthropic Claude API.

## Infra
- Hosting: Vercel (frontend) + Railway/Fly/Render (backend). DB managed.
- CI: GitHub Actions. Secrets in the host's env store. Add error monitoring (Sentry) early.

## Rule of thumb
Choose the option with the least operational surface area that a single person can run.
""",
    "build-sequencing-and-backlog.md": """# Build Sequencing & Backlog

How to turn a system map into an ordered backlog a solo founder can execute.

## Sequence (build order)
1. **Data model** — tables/schema. Everything else depends on it.
2. **API** — endpoints over the data, with auth.
3. **Client** — UI that calls the API. Vertical slice: one feature end-to-end first.
4. **Integrations** — payments, email, external APIs, once the core flow works.
5. **Infra & polish** — deploy, monitoring, edge cases, performance.

Follow the DAG: a node is ready to build only when all its upstream nodes are done.

## What a backlog task looks like
Each task has: title (verb-first, e.g. "Create users table"), node_id (which node it advances),
owner, status (todo/doing/done), priority. Seed 1-3 tasks per node when the map is generated.

## When is a node blocked?
- An inbound-edge dependency is not done yet, OR
- A credential/decision is missing (e.g. Stripe keys, a choice of auth provider).
Blocked nodes surface what the founder must unblock next — that is the operating signal.

## Slicing an MVP to days, not months
- Cut every "nice to have" — ship the single core loop a user can complete.
- One persona, one happy path. Defer settings, admin, edge cases.
- Prefer hosted/managed components over anything you must build and operate.
""",
    "build-guide-playbooks.md": """# Build Guide Playbooks

Concrete, ordered steps for building common nodes. Used to ground per-node guidance.

## Build the database schema (data)
1. List entities and relationships from the system map.
2. Define tables, columns, types, and foreign keys; add indexes on lookup columns.
3. Create a migration; seed minimal demo data; verify with a couple of queries.

## Build a REST API endpoint (api)
1. Define the route, method, request/response shape.
2. Validate input; enforce auth (who can call this?).
3. Implement the data access; handle the not-found/forbidden/error cases.
4. Return typed JSON; add a smoke test for the happy path + one failure.

## Build authentication (integration)
1. Pick a provider (Clerk / Supabase Auth) — do not store raw passwords.
2. Wire sign-up/sign-in UI and the session/token on the client.
3. Protect API routes by verifying the session; attach user_id to writes.

## Wire payments (integration)
1. Create products/prices in Stripe; use hosted Checkout first.
2. Redirect to Checkout; handle success/cancel URLs.
3. Verify the webhook signature; mark the order/subscription paid on webhook, not on redirect.

## Deploy to production (infra)
1. Frontend to Vercel; backend to Railway/Fly; DB on a managed provider.
2. Move secrets to the host env store; never commit them.
3. Add error monitoring; smoke-test the deployed core loop before sharing.
""",
}


def main() -> None:
    with Pod.from_env() as pod:
        # 1. ensure the folder exists (created during smoke — ignore "already exists")
        try:
            pod.files.create_folder(FOLDER, description="Forge RAG corpus")
            print(f"✓ folder {FOLDER}")
        except Exception as e:
            print(f"• folder {FOLDER} already there ({type(e).__name__}) — ok")

        # 2. write each doc straight from a string (overwrites on re-run)
        for name, content in KNOWLEDGE.items():
            pod.files.write_text(f"{FOLDER}/{name}", content, search_enabled=True)
            print(f"✓ wrote {name}")

        # 3. poll until indexing reaches a terminal status (async)
        want = set(KNOWLEDGE)
        print("\nindexing", end="", flush=True)
        deadline = time.time() + 150
        statuses: dict[str, str] = {}
        while time.time() < deadline:
            items = pod.files.list(FOLDER).to_dict()["items"]
            statuses = {i["name"]: i["status"] for i in items if i["name"] in want}
            if want <= statuses.keys() and all(s in TERMINAL for s in statuses.values()):
                break
            print(".", end="", flush=True)
            time.sleep(4)
        print()
        for name in KNOWLEDGE:
            print(f"  {statuses.get(name, 'MISSING'):<12} {name}")

        # 4. verify retrieval: scoped HYBRID search over /knowledge
        probes = [
            "what database and auth should a solo founder use",
            "in what order should I build an MVP",
            "how do I wire Stripe payments",
        ]
        print("\n--- search verification ---")
        for q in probes:
            hits = pod.files.search(
                q, scope_path=FOLDER, scope_mode="SUBTREE", search_method="HYBRID"
            ).to_dict()["items"]
            print(f"\nQ: {q}")
            for h in hits[:2]:
                snippet = " ".join(h["content"].split())[:90]
                print(f"  {h['score']:.3f}  {h['path']}  | {snippet}…")
            if not hits:
                print("  (no hits — indexing may still be in flight)")


if __name__ == "__main__":
    main()