# backend/lemma-map/export_repo.py — Step 5b: approval-gated repo scaffold (BYO token)
# Run: source .venv/bin/activate && python lemma-map/export_repo.py [project_id]            # dry-run, safe
#      GITHUB_TOKEN=ghp_xxx python lemma-map/export_repo.py [project_id] --push owner reponame
#
# The "outcome" half of the loop: turn the approved system map into a real repo
# scaffold (README + architecture doc + ordered backlog + per-layer stubs). There
# is NO Lemma GitHub connector, so we hit the GitHub REST API directly with the
# founder's own token. GATED on design-lock and DRY-RUN BY DEFAULT — it never
# touches GitHub unless you explicitly pass --push and a token.
#
# STATUS: built + compiles; dry-run manifest is pure-local. The --push path is
# UNVERIFIED (needs a real token + a live pod) — clearly fenced behind the flag.
import base64
import os
import sys

import httpx

from _forge import list_all, open_pod, retry
from approvals import require_design_lock

LAYER_ORDER = ("infra", "data", "integration", "api", "client")


def _slugify(name: str) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in name.strip()]
    out = "".join(keep)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "forge-project"


def build_scaffold(pod, project_id: str) -> list[dict]:
    """Return a list of {path, content} files — the repo scaffold, computed locally."""
    proj = retry(lambda: pod.records.get("projects", project_id))
    nodes = list_all(pod, "nodes", project_id=project_id)
    edges = list_all(pod, "edges", project_id=project_id)
    tasks = sorted(list_all(pod, "tasks", project_id=project_id),
                   key=lambda t: t.get("priority", 0))
    name = proj.get("name") or "Forge Project"
    by_slug = {n.get("slug"): n for n in nodes}

    readme = [f"# {name}\n", proj.get("summary") or proj.get("prompt") or "", "",
              "## Getting started", "1. Read `docs/ARCHITECTURE.md` for the system map.",
              "2. Work `BACKLOG.md` top-to-bottom — it's in dependency order.",
              "", "_Scaffolded by Forge._\n"]

    arch = [f"# Architecture — {name}\n"]
    for layer in LAYER_ORDER:
        layer_nodes = [n for n in nodes if n.get("layer") == layer]
        if not layer_nodes:
            continue
        arch.append(f"\n## {layer.capitalize()}\n")
        for n in layer_nodes:
            arch.append(f"- **{n.get('title')}** (`{n.get('slug')}`) — {n.get('summary') or ''}")
    arch.append("\n## Dependencies\n")
    for e in edges:
        s, t = by_slug.get(e.get("source")), by_slug.get(e.get("target"))
        if s and t:
            arch.append(f"- {t.get('title')} depends on {s.get('title')}")

    backlog = [f"# Backlog — {name}\n", "Ordered by build priority.\n"]
    for t in tasks:
        node = by_slug.get(t.get("node_id"))
        where = f" _(node: {node.get('title')})_" if node else ""
        backlog.append(f"- [ ] {t.get('title')}{where}")

    files = [
        {"path": "README.md", "content": "\n".join(readme)},
        {"path": "docs/ARCHITECTURE.md", "content": "\n".join(arch)},
        {"path": "BACKLOG.md", "content": "\n".join(backlog)},
        {"path": ".gitignore", "content": "node_modules/\n.venv/\n__pycache__/\n.env\n"},
    ]
    # one placeholder per layer that actually has nodes, so the tree mirrors the map
    for layer in LAYER_ORDER:
        if any(n.get("layer") == layer for n in nodes):
            members = [n.get("title") for n in nodes if n.get("layer") == layer]
            files.append({
                "path": f"src/{layer}/README.md",
                "content": f"# {layer.capitalize()}\n\nComponents:\n"
                           + "\n".join(f"- {m}" for m in members) + "\n",
            })
    return files


# ---------- GitHub REST (only reached behind --push + a token) ----------
def _gh(token: str) -> httpx.Client:
    return httpx.Client(
        base_url="https://api.github.com",
        headers={"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
        timeout=30.0,
    )


def push_to_github(files: list[dict], *, token: str, owner: str, repo: str,
                   private: bool = True, description: str = "") -> dict:
    """Create the repo and commit every scaffold file. Outward-facing — explicit only."""
    with _gh(token) as gh:
        r = gh.post("/user/repos", json={
            "name": repo, "private": private, "auto_init": False,
            "description": description[:300],
        })
        if r.status_code not in (201, 422):  # 422 == already exists; we proceed to write
            r.raise_for_status()
        for f in files:
            put = gh.put(f"/repos/{owner}/{repo}/contents/{f['path']}", json={
                "message": f"forge: add {f['path']}",
                "content": base64.b64encode(f["content"].encode()).decode(),
            })
            put.raise_for_status()
    return {"repo_url": f"https://github.com/{owner}/{repo}", "files_written": len(files)}


def export_repo(pod, project_id: str, *, token: str | None = None,
                owner: str | None = None, repo: str | None = None,
                private: bool = True, push: bool = False) -> dict:
    proj = require_design_lock(pod, project_id)  # GATE: design must be approved
    files = build_scaffold(pod, project_id)
    if not push:
        return {"pushed": False, "file_count": len(files),
                "files": [f["path"] for f in files],
                "manifest": files}
    token = token or os.getenv("GITHUB_TOKEN")
    if not (token and owner):
        raise ValueError("push requires a GITHUB_TOKEN and an owner")
    repo = repo or _slugify(proj.get("name") or project_id)
    result = push_to_github(files, token=token, owner=owner, repo=repo,
                            private=private, description=proj.get("name") or "")
    return {"pushed": True, **result}


def main() -> None:
    args = sys.argv[1:]
    push = "--push" in args
    if push:
        i = args.index("--push")
        owner = args[i + 1] if len(args) > i + 1 else None
        repo = args[i + 2] if len(args) > i + 2 else None
        args = args[:i]
    else:
        owner = repo = None
    project_id = args[0] if args else None

    with open_pod() as pod:
        if not project_id:
            projects = retry(lambda: pod.records.list(
                "projects", limit=1, sort=[{"field": "created_at", "direction": "desc"}]
            )).to_dict()["items"]
            if not projects:
                raise SystemExit("no projects yet — run generate_architecture.py first")
            project_id = projects[0]["id"]
            print(f"(no args) using newest project {project_id}\n")

        result = export_repo(pod, project_id, owner=owner, repo=repo, push=push)
        if result.get("pushed"):
            print("✓ pushed ->", result["repo_url"], f"({result['files_written']} files)")
        else:
            print(f"DRY-RUN scaffold ({result['file_count']} files):")
            for p in result["files"]:
                print("  -", p)
            print("\n(no GitHub calls made — pass `--push <owner> <repo>` with GITHUB_TOKEN to publish)")
        print("\n=== STEP 5b (export): module ready ✅ (verify live when Cloud is up) ===")


if __name__ == "__main__":
    main()
