# backend/lemma-map/generate_architecture.py — Step 3: idea -> ArchGraph -> tables
# Run: source .venv/bin/activate && python lemma-map/generate_architecture.py "your product idea"
#
# Pipeline: ground (/knowledge RAG) -> pass1 decompose -> pass2 refine+tasks ->
# validate/repair DAG -> persist project/nodes/edges/tasks. Two-part contract
# (json fence + ## Build Summary markdown) and all agent/RAG/retry plumbing live
# in _forge.py; this file owns only the graph-shaping + persistence.
#
# STATUS: built + compiles; one earlier run succeeded (15 nodes). The current
# shape is UNVERIFIED end-to-end only because Cloud was mid-outage at build time.
import sys

from _forge import LAYERS, LAYER_X, ask, ground, list_all, open_pod, retry, split_reply


# ---------- DAG validation / repair (Kahn's, slug-keyed; ported from main.py) ----------
def is_dag(slugs: set[str], edges: list[tuple[str, str]]) -> bool:
    adj = {s: [] for s in slugs}
    indeg = {s: 0 for s in slugs}
    for s, t in edges:
        if s not in slugs or t not in slugs:
            continue
        adj[s].append(t)
        indeg[t] += 1
    queue = [s for s, d in indeg.items() if d == 0]
    visited = 0
    while queue:
        n = queue.pop()
        visited += 1
        for nb in adj[n]:
            indeg[nb] -= 1
            if indeg[nb] == 0:
                queue.append(nb)
    return visited == len(slugs)


def acyclic_subset(slugs: set[str], edges: list[tuple[str, str]]):
    """Greedily keep edges that don't introduce a cycle; return (kept, dropped)."""
    kept: list[tuple[str, str]] = []
    dropped: list[tuple[str, str]] = []
    for s, t in edges:
        if s not in slugs or t not in slugs or s == t:
            dropped.append((s, t))
            continue
        if is_dag(slugs, kept + [(s, t)]):
            kept.append((s, t))
        else:
            dropped.append((s, t))
    return kept, dropped


# ---------- normalize the agent graph ----------
def normalize(graph: dict):
    nodes, seen_slugs = [], set()
    for n in graph.get("nodes", []):
        slug = str(n.get("id") or "").strip()
        if not slug or slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        layer = str(n.get("layer") or "").strip().lower()
        if layer not in LAYERS:
            layer = "api"
        nodes.append({
            "slug": slug,
            "layer": layer,
            "title": str(n.get("title") or slug).strip(),
            "summary": str(n.get("summary") or "").strip(),
        })
    slugs = {n["slug"] for n in nodes}
    raw_edges = [
        (str(e.get("source") or "").strip(), str(e.get("target") or "").strip())
        for e in graph.get("edges", [])
    ]
    kept, dropped = acyclic_subset(slugs, raw_edges)
    tasks = []
    for t in graph.get("tasks", []) or []:
        node = str(t.get("node") or t.get("node_id") or "").strip()
        title = str(t.get("title") or "").strip()
        if node in slugs and title:
            tasks.append({"node": node, "title": title})
    if not tasks:  # fallback: one concrete first task per node
        tasks = [{"node": n["slug"], "title": f"Build {n['title']}"} for n in nodes]
    return nodes, kept, dropped, tasks


# ---------- layered canvas layout (barycenter crossing-reduction) ----------
COL_GAP = 400.0   # x distance between layers (node is 224px wide)
ROW_GAP = 340.0   # y distance between rows (node is ~277px tall — keep a clear gap)


def layout(nodes, edges=None):
    """Left→right layered layout (column per layer) with the rows inside each
    column ordered by the barycenter (mean) of their neighbours' rows, iterated a
    few times. This is the cheap Sugiyama ordering heuristic — it untangles edges
    so source→target stays readable without pulling in a layout dependency."""
    edges = edges or []
    # group slugs by their column (layer); preserve input order as the seed
    columns: dict[int, list[str]] = {}
    col_of: dict[str, int] = {}
    for n in nodes:
        c = LAYER_X.get(n["layer"], 5)
        columns.setdefault(c, []).append(n["slug"])
        col_of[n["slug"]] = c

    nbrs: dict[str, list[str]] = {n["slug"]: [] for n in nodes}
    for s, t in edges:
        if s in nbrs and t in nbrs:
            nbrs[s].append(t)
            nbrs[t].append(s)

    order_cols = sorted(columns)
    for _ in range(4):  # a few sweeps converge fast for these sizes
        for c in order_cols:
            rank = {slug: i for col in columns.values() for i, slug in enumerate(col)}
            def bary(slug: str) -> float:
                ns = nbrs.get(slug, [])
                return (sum(rank[m] for m in ns) / len(ns)) if ns else rank[slug]
            columns[c].sort(key=bary)

    pos = {}
    for c in order_cols:
        col = columns[c]
        # vertically center each column so the graph reads as a balanced band
        offset = -(len(col) - 1) * ROW_GAP / 2.0
        for row, slug in enumerate(col):
            pos[slug] = (c * COL_GAP, offset + row * ROW_GAP)
    return pos


# ---------- persist ----------
def persist(pod, name: str, prompt: str, nodes, edges, tasks, summary_md: str):
    project = retry(lambda: pod.records.create("projects", {
        "name": name,
        "prompt": prompt,
        "status": "active",
        "design_locked": False,
        "summary": summary_md,
    }))
    pid = project["id"]
    pos = layout(nodes, edges)
    node_rows = [{
        "project_id": pid,
        "slug": n["slug"],
        "layer": n["layer"],
        "kind": "component",
        "title": n["title"],
        "summary": n["summary"],
        "status": "designed",
        "pos_x": pos[n["slug"]][0],
        "pos_y": pos[n["slug"]][1],
    } for n in nodes]
    edge_rows = [{"project_id": pid, "source": s, "target": t} for s, t in edges]
    task_rows = [{
        "project_id": pid,
        "node_id": t["node"],
        "title": t["title"],
        "status": "todo",
        "approval_state": "none",
        "priority": i,
    } for i, t in enumerate(tasks)]
    retry(lambda: pod.records.bulk_create("nodes", node_rows))
    if edge_rows:
        retry(lambda: pod.records.bulk_create("edges", edge_rows))
    if task_rows:
        retry(lambda: pod.records.bulk_create("tasks", task_rows))
    return pid


# ---------- re-tidy an existing project's layout ----------
def relayout_project(pod, project_id: str):
    """Recompute + persist node positions for a project (the canvas "Tidy" action).
    Single source of truth for layout, shared with generation."""
    nodes = list_all(pod, "nodes", project_id=project_id)
    edges = list_all(pod, "edges", project_id=project_id)
    edge_pairs = [(e.get("source"), e.get("target")) for e in edges]
    node_lite = [{"slug": n.get("slug"), "layer": n.get("layer") or "api"} for n in nodes]
    pos = layout(node_lite, edge_pairs)
    updates = [{"id": n["id"], "pos_x": pos[n["slug"]][0], "pos_y": pos[n["slug"]][1]}
               for n in nodes if n.get("slug") in pos]
    if updates:
        retry(lambda: pod.records.bulk_update("nodes", updates))
    return len(updates)


# ---------- orchestration ----------
# A generator that yields {"stage", ...} progress events as it works, ending with a
# {"stage":"done", ...} carrying the result. The whole pipeline takes minutes (two
# LLM passes), so streaming these stages is what lets the UI show real progress and
# lets the client abort: if it disconnects, the consumer stops pulling and no later
# stage (including the persist) runs.
def generate_steps(pod, prompt: str, name: str | None = None):
    name = name or " ".join(prompt.split()[:6])[:60]

    yield {"stage": "grounding"}
    guidance = ground(pod, prompt)
    yield {"stage": "grounded", "chars": len(guidance)}

    # SINGLE agent pass: ask for the full map AND the first build tasks at once.
    # This used to be two sequential passes (decompose, then refine + tasks), which
    # roughly doubled the wall-clock time. The local normalize() below already
    # repairs the graph into a valid DAG and back-fills tasks, so the second LLM
    # round-trip was redundant — dropping it ~halves generation time with no node cap.
    yield {"stage": "decompose"}
    reply = ask(pod, (
        "You are a senior software architect. Using the GUIDANCE below, decompose the "
        "product idea into a COMPLETE, production-quality system map AND its first build "
        "tasks in a SINGLE pass. Include every component the system genuinely needs across "
        "all relevant layers (client, api, data, integration, infra). Do not truncate or "
        "cap node count, but no filler.\n"
        "Output EXACTLY two parts and nothing else:\n"
        "1) a ```json fenced block of shape:\n"
        '{"nodes":[{"id":"kebab-slug","layer":"client|api|data|integration|infra",'
        '"title":"short name","summary":"one clear sentence"}],'
        '"edges":[{"source":"id","target":"id"}],'
        '"tasks":[{"node":"id","title":"first concrete build task"}]}\n'
        "   Rules: an edge means target depends on source; ids unique kebab-case; the graph "
        "MUST be a DAG (no cycles) and fully connected (no orphans); 1-2 tasks per node.\n"
        "2) a markdown section starting with `## Build Summary`: a one-line overview, then "
        "one bullet per node `- **title** (layer) — what it does`, then a `Build first:` line.\n"
        f"\nIDEA: {prompt}\n\nGUIDANCE:\n{guidance}"
    ), title="generate-architecture")
    graph, summary_md = split_reply(reply)
    yield {"stage": "decomposed",
           "nodes": len(graph.get("nodes", [])), "edges": len(graph.get("edges", []))}

    # local pass: normalize layers, repair cycles into a DAG, back-fill tasks (no LLM call)
    yield {"stage": "refine"}
    nodes, edges, dropped, tasks = normalize(graph)
    assert nodes, "no nodes produced"
    assert is_dag({n["slug"] for n in nodes}, edges), "graph still cyclic after repair"

    yield {"stage": "persisting",
           "nodes": len(nodes), "edges": len(edges), "tasks": len(tasks)}
    pid = persist(pod, name, prompt, nodes, edges, tasks, summary_md)
    yield {"stage": "done", "project_id": pid, "nodes": nodes, "edges": edges,
           "tasks": tasks, "summary_md": summary_md}


def generate_architecture(pod, prompt: str, name: str | None = None):
    """Blocking convenience wrapper (CLI + non-streaming route) over generate_steps."""
    done = None
    for ev in generate_steps(pod, prompt, name):
        if ev["stage"] == "done":
            done = ev
        else:
            print(f"• {ev['stage']}" + (f" { {k: v for k, v in ev.items() if k != 'stage'} }"
                                         if len(ev) > 1 else ""))
    assert done, "generation produced no result"
    return (done["project_id"], done["nodes"], done["edges"],
            done["tasks"], done["summary_md"])


def main() -> None:
    prompt = " ".join(sys.argv[1:]).strip() or (
        "A meal-planning app that turns saved recipes and dietary preferences into a "
        "weekly menu and an auto-generated grocery list."
    )
    print(f"PROMPT: {prompt}\n")
    with open_pod() as pod:
        pid, nodes, edges, tasks, summary_md = generate_architecture(pod, prompt)
        print(f"\n✓ persisted project {pid}")
        # read back to prove durability
        back = retry(lambda: pod.records.list(
            "nodes", limit=200,
            filter=[{"field": "project_id", "op": "eq", "value": pid}]
        )).to_dict()["items"]
        print(f"✓ read back {len(back)} node rows from the pod")
        print("\n--- Build Summary (stored on project) ---")
        print(summary_md[:1200] or "(none)")
        print("\n=== STEP 3: GO ✅ ===" if back else "=== persisted but read-back empty ===")


if __name__ == "__main__":
    main()
