"""Forge BFF — a thin FastAPI layer over the Lemma SDK (browser stays tokenless).

The frontend never talks to Lemma directly; it calls these endpoints and we run
`lemma_sdk` server-side. Endpoints map 1:1 to the core loop:

    input    POST /api/generate                 -> generate_architecture (Step 3)
    state    GET  /api/projects[/{id}]          -> records, reactflow-shaped
    action   POST /api/guidance                 -> guide_node          (Step 4)
             POST /api/nodes/status             -> set_node_status     (Step 5a)
    approval POST /api/projects/{id}/lock       -> lock_design         (Step 5a)
    outcome  POST /api/projects/{id}/export     -> export_repo (dry)   (Step 5b)
             POST /api/projects/{id}/digest     -> build_digest        (Step 5c)

STATUS: built + compiles; the /api/* routes are UNVERIFIED end-to-end because the
Lemma Cloud was mid-outage at build time. The original /pipelines/parse stays as-is.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# the step modules live in the hyphenated scripts dir; add it to the path so we
# can import them as plain modules (they import each other + _forge the same way).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lemma-map"))

app = FastAPI(title="Forge BFF")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- pod (lazy, shared)
_pod: Any = None
_pod_lock = threading.Lock()


def get_pod():
    """Open one configured Pod and reuse it. Raises 503 if Cloud is unreachable."""
    global _pod
    if _pod is None:
        with _pod_lock:
            if _pod is None:
                try:
                    from lemma_sdk import Pod
                    from _forge import configure_timeout
                    pod = Pod.from_env()
                    configure_timeout(pod)
                    _pod = pod
                except Exception as exc:  # noqa: BLE001 — surface as a clean 503
                    raise HTTPException(503, f"Lemma pod unavailable: {exc}")
    return _pod


# --- auth self-heal: Lemma access tokens expire ~hourly; refresh + retry once so a
#     long-running demo never dies on a stale token. We refresh via the CLI (which
#     rewrites ~/.lemma/config.json from the stored refresh token) and patch the
#     shared Pod's client header in place, so callers that captured the pod recover.
def _lemma_bin() -> str:
    return shutil.which("lemma") or os.path.expanduser("~/.local/bin/lemma")


def _refresh_token() -> str | None:
    try:
        out = subprocess.run([_lemma_bin(), "auth", "print-token"],
                             capture_output=True, text=True, timeout=30)
        lines = [ln.strip() for ln in (out.stdout or "").splitlines() if ln.strip()]
        return lines[-1] if lines else None
    except Exception:  # noqa: BLE001 — refresh is best-effort
        return None


def _apply_token(pod, token: str) -> None:
    try:
        pod.generated.token = token
    except Exception:  # noqa: BLE001
        pass
    for getter in ("get_httpx_client", "get_async_httpx_client"):
        try:
            getattr(pod.generated, getter)().headers["Authorization"] = f"Bearer {token}"
        except Exception:  # noqa: BLE001
            pass


def _is_auth_error(exc: Exception) -> bool:
    s = f"{type(exc).__name__} {exc}".lower()
    return ("lemmaautherror" in s or "401" in s
            or "token has expired" in s or "refresh your session" in s)


def _ensure_auth(pod) -> None:
    """Proactively refresh a stale token before a long, un-retryable run (streaming
    generation can take minutes; we don't want it to 401 halfway through)."""
    try:
        pod.tables.list()
    except Exception as exc:  # noqa: BLE001
        if _is_auth_error(exc):
            token = _refresh_token()
            if token:
                _apply_token(pod, token)
        # any non-auth error here is ignored; the real call will surface it


def guard(fn, *, _retried: bool = False):
    """Run an SDK call, map failures to tidy HTTP errors, and self-heal expired auth."""
    try:
        return fn()
    except HTTPException:
        raise
    except PermissionError as exc:       # gate not satisfied (e.g. design not locked)
        raise HTTPException(409, str(exc))
    except ValueError as exc:            # bad id / bad input
        raise HTTPException(400, str(exc))
    except Exception as exc:             # noqa: BLE001
        if not _retried and _pod is not None and _is_auth_error(exc):
            token = _refresh_token()
            if token:
                _apply_token(_pod, token)
                return guard(fn, _retried=True)
        raise HTTPException(502, f"{type(exc).__name__}: {exc}")


# ---------------------------------------------------------------- slug + layers
ARCH_LAYERS = ("client", "api", "data", "integration", "infra")


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return s or "node"


def _unique_slug(text: str, existing: set[str]) -> str:
    base = _slugify(text)
    slug, i = base, 2
    while slug in existing:
        slug, i = f"{base}-{i}", i + 1
    return slug


# ---------------------------------------------------------------- reactflow shaping
def rf_nodes(nodes: list[dict]) -> list[dict]:
    return [{
        "id": n.get("slug"),
        "type": "forge",
        "position": {"x": n.get("pos_x") or 0.0, "y": n.get("pos_y") or 0.0},
        "data": {
            "slug": n.get("slug"),
            "title": n.get("title"),
            "summary": n.get("summary"),
            "layer": n.get("layer"),
            "kind": n.get("kind"),
            "status": n.get("status"),
        },
    } for n in nodes]


def rf_edges(edges: list[dict]) -> list[dict]:
    out = []
    for e in edges:
        s, t = e.get("source"), e.get("target")
        out.append({"id": e.get("id") or f"{s}->{t}", "source": s, "target": t})
    return out


# ---------------------------------------------------------------- request bodies
class GenerateReq(BaseModel):
    prompt: str
    name: str | None = None


class GuidanceReq(BaseModel):
    project_id: str
    node_id: str
    question: str | None = None
    refresh: bool = False


class StatusReq(BaseModel):
    project_id: str
    node_id: str
    status: str


class ExportReq(BaseModel):
    push: bool = False
    owner: str | None = None
    repo: str | None = None


class CreateProjectReq(BaseModel):
    name: str
    prompt: str | None = None


class CreateNodeReq(BaseModel):
    layer: str
    kind: str = "component"
    title: str
    summary: str = ""
    pos_x: float = 0.0
    pos_y: float = 0.0


class UpdateNodeReq(BaseModel):
    title: str | None = None
    summary: str | None = None
    layer: str | None = None
    status: str | None = None
    pos_x: float | None = None
    pos_y: float | None = None


class CreateEdgeReq(BaseModel):
    source: str
    target: str


# ---------------------------------------------------------------- core-loop routes
@app.get("/")
def read_root():
    return {"Ping": "Pong", "service": "forge-bff"}


@app.post("/api/generate")
def api_generate(req: GenerateReq):
    from generate_architecture import generate_architecture
    pod = get_pod()
    pid, nodes, edges, tasks, summary_md = guard(
        lambda: generate_architecture(pod, req.prompt, req.name)
    )
    return {
        "project_id": pid,
        "summary": summary_md,
        "counts": {"nodes": len(nodes), "edges": len(edges), "tasks": len(tasks)},
        "graph": {"nodes": rf_nodes([{**n, "pos_x": None, "pos_y": None} for n in nodes]),
                  "edges": rf_edges([{"source": s, "target": t} for s, t in edges])},
    }


@app.post("/api/generate/stream")
def api_generate_stream(req: GenerateReq):
    """Server-Sent Events: stream generation progress so the UI shows live stages and
    can abort (disconnecting stops the generator before it persists). Events:
    grounding → grounded → decompose → decomposed → refine → persisting → done|error."""
    from generate_architecture import generate_steps
    pod = get_pod()
    _ensure_auth(pod)  # warm a fresh token; the run is too long to 401 mid-flight

    def event_stream():
        def frame(obj: dict) -> str:
            return f"data: {json.dumps(obj)}\n\n"

        try:
            for ev in generate_steps(pod, req.prompt, req.name):
                if ev["stage"] == "done":
                    yield frame({
                        "stage": "done",
                        "project_id": ev["project_id"],
                        "summary": ev["summary_md"],
                        "counts": {
                            "nodes": len(ev["nodes"]),
                            "edges": len(ev["edges"]),
                            "tasks": len(ev["tasks"]),
                        },
                    })
                else:
                    yield frame(ev)
        except Exception as exc:  # noqa: BLE001 — surface as a terminal SSE event
            yield frame({"stage": "error", "detail": f"{type(exc).__name__}: {exc}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering so events flush live
        },
    )


@app.get("/api/projects")
def api_projects():
    from _forge import retry
    pod = get_pod()
    items = guard(lambda: retry(lambda: pod.records.list(
        "projects", limit=100, sort=[{"field": "created_at", "direction": "desc"}]
    )).to_dict()["items"])
    return {"projects": [{
        "id": p.get("id"), "name": p.get("name"), "status": p.get("status"),
        "design_locked": p.get("design_locked"), "created_at": p.get("created_at"),
    } for p in items]}


@app.get("/api/projects/{project_id}")
def api_project(project_id: str):
    from _forge import list_all, retry
    pod = get_pod()

    def load():
        proj = retry(lambda: pod.records.get("projects", project_id))
        if not proj:
            raise ValueError(f"project {project_id} not found")
        nodes = list_all(pod, "nodes", project_id=project_id)
        edges = list_all(pod, "edges", project_id=project_id)
        tasks = sorted(list_all(pod, "tasks", project_id=project_id),
                       key=lambda t: t.get("priority", 0))
        return proj, nodes, edges, tasks

    proj, nodes, edges, tasks = guard(load)
    return {
        "project": {"id": proj.get("id"), "name": proj.get("name"),
                    "status": proj.get("status"),
                    "design_locked": proj.get("design_locked"),
                    "summary": proj.get("summary"), "prompt": proj.get("prompt")},
        "graph": {"nodes": rf_nodes(nodes), "edges": rf_edges(edges)},
        "tasks": tasks,
    }


@app.post("/api/guidance")
def api_guidance(req: GuidanceReq):
    from guide_node import guide_node
    pod = get_pod()
    return guard(lambda: guide_node(
        pod, req.project_id, req.node_id, req.question, refresh=req.refresh
    ))


@app.post("/api/nodes/status")
def api_node_status(req: StatusReq):
    from approvals import set_node_status
    pod = get_pod()
    return guard(lambda: set_node_status(pod, req.project_id, req.node_id, req.status))


@app.post("/api/projects/{project_id}/lock")
def api_lock(project_id: str):
    from approvals import lock_design
    pod = get_pod()
    return guard(lambda: lock_design(pod, project_id))


@app.post("/api/projects/{project_id}/unlock")
def api_unlock(project_id: str):
    from approvals import unlock_design
    pod = get_pod()
    return guard(lambda: unlock_design(pod, project_id))


@app.post("/api/projects/{project_id}/export")
def api_export(project_id: str, req: ExportReq):
    from export_repo import export_repo
    pod = get_pod()
    return guard(lambda: export_repo(
        pod, project_id, owner=req.owner, repo=req.repo, push=req.push
    ))


@app.post("/api/projects/{project_id}/digest")
def api_digest(project_id: str):
    from digest import build_digest
    pod = get_pod()
    return guard(lambda: build_digest(pod, project_id))


# ---------------------------------------------------------------- manual editing (persisted)
@app.post("/api/projects")
def api_create_project(req: CreateProjectReq):
    from _forge import retry
    pod = get_pod()

    def do():
        proj = retry(lambda: pod.records.create("projects", {
            "name": req.name or "Untitled", "prompt": req.prompt or "",
            "status": "active", "design_locked": False, "summary": "",
        }))
        return proj

    proj = guard(do)
    return {"project": {
        "id": proj.get("id"), "name": proj.get("name"), "status": proj.get("status"),
        "design_locked": proj.get("design_locked"), "created_at": proj.get("created_at"),
    }}


@app.post("/api/projects/{project_id}/nodes")
def api_create_node(project_id: str, req: CreateNodeReq):
    from _forge import list_all, retry
    pod = get_pod()

    def do():
        layer = (req.layer or "api").lower()
        if layer not in ARCH_LAYERS:
            layer = "api"
        existing = {n.get("slug") for n in list_all(pod, "nodes", project_id=project_id)}
        slug = _unique_slug(req.title or req.kind, existing)
        return retry(lambda: pod.records.create("nodes", {
            "project_id": project_id, "slug": slug, "layer": layer,
            "kind": req.kind or "component", "title": req.title or slug,
            "summary": req.summary or "", "status": "designed",
            "pos_x": req.pos_x, "pos_y": req.pos_y,
        }))

    row = guard(do)
    return {"node": rf_nodes([row])[0]}


@app.patch("/api/projects/{project_id}/nodes/{slug}")
def api_update_node(project_id: str, slug: str, req: UpdateNodeReq):
    from _forge import retry
    pod = get_pod()

    def do():
        rows = retry(lambda: pod.records.list("nodes", limit=1, filter=[
            {"field": "project_id", "op": "eq", "value": project_id},
            {"field": "slug", "op": "eq", "value": slug},
        ])).to_dict()["items"]
        if not rows:
            raise ValueError(f"node '{slug}' not found in project {project_id}")
        patch: dict[str, Any] = {}
        for f in ("title", "summary", "layer", "status", "pos_x", "pos_y"):
            v = getattr(req, f)
            if v is not None:
                patch[f] = v
        if patch.get("layer") and patch["layer"] not in ARCH_LAYERS:
            patch["layer"] = "api"
        if not patch:
            return rows[0]
        return retry(lambda: pod.records.update("nodes", rows[0]["id"], patch))

    row = guard(do)
    return {"node": rf_nodes([row])[0]}


@app.delete("/api/projects/{project_id}/nodes/{slug}")
def api_delete_node(project_id: str, slug: str):
    from _forge import list_all, retry
    pod = get_pod()

    def do():
        nodes = list_all(pod, "nodes", project_id=project_id)
        target = next((n for n in nodes if n.get("slug") == slug), None)
        if not target:
            raise ValueError(f"node '{slug}' not found in project {project_id}")
        edges = list_all(pod, "edges", project_id=project_id)
        edge_ids = [e["id"] for e in edges
                    if e.get("source") == slug or e.get("target") == slug]
        tasks = list_all(pod, "tasks", project_id=project_id)
        task_ids = [t["id"] for t in tasks if t.get("node_id") == slug]
        if edge_ids:
            retry(lambda: pod.records.bulk_delete("edges", edge_ids))
        if task_ids:
            retry(lambda: pod.records.bulk_delete("tasks", task_ids))
        retry(lambda: pod.records.delete("nodes", target["id"]))
        return {"deleted": slug, "edges_removed": len(edge_ids),
                "tasks_removed": len(task_ids)}

    return guard(do)


@app.post("/api/projects/{project_id}/edges")
def api_create_edge(project_id: str, req: CreateEdgeReq):
    from generate_architecture import is_dag
    from _forge import list_all, retry
    pod = get_pod()

    def do():
        s, t = (req.source or "").strip(), (req.target or "").strip()
        if not s or not t or s == t:
            raise ValueError("edge needs distinct source and target")
        slugs = {n.get("slug") for n in list_all(pod, "nodes", project_id=project_id)}
        if s not in slugs or t not in slugs:
            raise ValueError("both edge endpoints must be existing nodes")
        edges = list_all(pod, "edges", project_id=project_id)
        pairs = [(e.get("source"), e.get("target")) for e in edges]
        if (s, t) in pairs:
            raise ValueError("edge already exists")
        if not is_dag(slugs, pairs + [(s, t)]):
            raise ValueError("that connection would create a cycle")
        return retry(lambda: pod.records.create(
            "edges", {"project_id": project_id, "source": s, "target": t}))

    row = guard(do)
    return {"edge": rf_edges([row])[0]}


@app.delete("/api/projects/{project_id}/edges/{edge_id}")
def api_delete_edge(project_id: str, edge_id: str):
    from _forge import retry
    pod = get_pod()

    def do():
        retry(lambda: pod.records.delete("edges", edge_id))
        return {"deleted": edge_id}

    return guard(do)


@app.post("/api/projects/{project_id}/relayout")
def api_relayout(project_id: str):
    from generate_architecture import relayout_project
    pod = get_pod()
    guard(lambda: relayout_project(pod, project_id))
    return api_project(project_id)  # return the freshly-tidied graph


# ---------------------------------------------------------------- legacy DAG check
class Node(BaseModel):
    id: str
    data: dict[str, Any] = {}


class Edge(BaseModel):
    id: str
    source: str
    target: str


class Pipeline(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


def is_dag(nodes: list[Node], edges: list[Edge]) -> bool:
    node_ids = {n.id for n in nodes}
    adj: dict[str, list[str]] = {n.id: [] for n in nodes}
    in_degree: dict[str, int] = {n.id: 0 for n in nodes}
    for edge in edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            continue
        adj[edge.source].append(edge.target)
        in_degree[edge.target] += 1
    queue = [n for n, deg in in_degree.items() if deg == 0]
    visited = 0
    while queue:
        node = queue.pop()
        visited += 1
        for neighbour in adj[node]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)
    return visited == len(nodes)


@app.post("/pipelines/parse")
def parse_pipeline(pipeline: Pipeline):
    return {
        "num_nodes": len(pipeline.nodes),
        "num_edges": len(pipeline.edges),
        "is_dag": is_dag(pipeline.nodes, pipeline.edges),
    }
