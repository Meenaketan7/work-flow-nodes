# backend/lemma-map/digest.py — Step 5c: the recurring build digest (outcome)
# Run: source .venv/bin/activate && python lemma-map/digest.py [project_id]
#
# Closes the loop with a standing signal: "what shipped, what's blocked, what's
# next." Primary path is ON-DEMAND (compute state -> agent writes the digest).
# Sending it (Slack/Gmail connector) and a daily Lemma schedule are optional and
# degrade gracefully per the plan — dry-run by default, nothing is sent or
# scheduled unless asked.
#
# STATUS: built + compiles; on-demand digest UNVERIFIED end-to-end (Cloud down at
# build time). The schedule payload shape is a best-effort guess — confirm against
# the live /scalar docs before relying on it.
import sys

from _forge import ask, list_all, open_pod, retry, split_reply


def compute_state(pod, project_id: str) -> dict:
    """Pure record read -> operating state. No LLM; this is the ground truth."""
    nodes = list_all(pod, "nodes", project_id=project_id)
    edges = list_all(pod, "edges", project_id=project_id)
    tasks = list_all(pod, "tasks", project_id=project_id)
    by_slug = {n.get("slug"): n for n in nodes}
    done = {s for s, n in by_slug.items() if n.get("status") == "done"}
    upstreams: dict[str, list[str]] = {}
    for e in edges:
        upstreams.setdefault(e.get("target"), []).append(e.get("source"))

    def title(slug):
        return (by_slug.get(slug) or {}).get("title", slug)

    shipped, in_progress, blocked, ready = [], [], [], []
    for slug, n in by_slug.items():
        st = n.get("status")
        ups = upstreams.get(slug, [])
        ups_done = all(u in done for u in ups)
        if st == "done":
            shipped.append(title(slug))
        elif st == "blocked" or (st in ("designed", "building") and not ups_done):
            missing = [title(u) for u in ups if u not in done]
            blocked.append({"node": title(slug),
                            "waiting_on": missing or ["(marked blocked)"]})
        elif st == "building":
            in_progress.append(title(slug))
        elif st == "designed" and ups_done:
            ready.append(title(slug))

    return {
        "node_count": len(nodes),
        "shipped": shipped,
        "in_progress": in_progress,
        "blocked": blocked,
        "ready_next": ready,
        "open_tasks": sum(1 for t in tasks if t.get("status") != "done"),
    }


def build_digest(pod, project_id: str) -> dict:
    proj = retry(lambda: pod.records.get("projects", project_id))
    state = compute_state(pod, project_id)
    reply = ask(pod, (
        "You are a build operations assistant. Write a SHORT daily build digest for a "
        "solo founder from the STATE below — encouraging but honest, no fluff.\n"
        "Output EXACTLY two parts and nothing else:\n"
        "1) a ```json fenced block: "
        '{"shipped":[...],"in_progress":[...],"blocked":[{"node":"...","waiting_on":"..."}],'
        '"build_next":[...],"headline":"one line"}\n'
        "2) a markdown section `## Daily Build Digest` — headline, then short "
        "**Shipped / In progress / Blocked / Build next** subsections (omit empty ones).\n\n"
        f"PROJECT: {proj.get('name')}\n"
        f"STATE: {state}"
    ), title="build-digest")
    structured, digest_md = split_reply(reply)
    return {"project_id": project_id, "state": state,
            "structured": structured, "digest_md": digest_md}


def send_digest(pod, project_id: str, *, auth_config: str | None = None,
                operation: str | None = None, payload: dict | None = None,
                account_id: str | None = None, dry_run: bool = True) -> dict:
    """Build the digest and (optionally) send it through a Slack/Gmail connector.

    dry_run=True (default) returns the digest without sending — the graceful
    fallback the plan calls for if connectors are immature.
    """
    digest = build_digest(pod, project_id)
    if dry_run or not (auth_config and operation):
        return {"sent": False, **digest}
    body = dict(payload or {})
    body.setdefault("text", digest["digest_md"])
    result = retry(lambda: pod.connectors.execute(
        auth_config, operation, body, account_id=account_id
    ))
    return {"sent": True, "delivery": getattr(result, "to_dict", lambda: result)(), **digest}


def register_daily_schedule(pod, project_id: str, *, cron: str = "0 13 * * *",
                            agent: str = "hello") -> dict:
    """OPTIONAL: ask Lemma to run the digest daily. UNVERIFIED payload shape —
    confirm CreateScheduleRequest fields against the live /scalar docs first."""
    from lemma_sdk.openapi_client.models.create_schedule_request import (
        CreateScheduleRequest,
    )
    payload = {
        "name": f"forge-digest-{project_id[:8]}",
        "schedule_type": "CRON",
        "cron_expression": cron,
        "agent_name": agent,
        "is_active": True,
        "message": f"Write today's Forge build digest for project {project_id}.",
    }
    created = retry(lambda: pod.schedules.create(CreateScheduleRequest.from_dict(payload)))
    return {"scheduled": True, "id": str(getattr(created, "id", "?")), "cron": cron}


def main() -> None:
    args = sys.argv[1:]
    with open_pod() as pod:
        project_id = args[0] if args else None
        if not project_id:
            projects = retry(lambda: pod.records.list(
                "projects", limit=1, sort=[{"field": "created_at", "direction": "desc"}]
            )).to_dict()["items"]
            if not projects:
                raise SystemExit("no projects yet — run generate_architecture.py first")
            project_id = projects[0]["id"]
            print(f"(no args) using newest project {project_id}\n")

        result = build_digest(pod, project_id)
        st = result["state"]
        print(f"• state: {len(st['shipped'])} shipped, {len(st['in_progress'])} in progress, "
              f"{len(st['blocked'])} blocked, {len(st['ready_next'])} ready next")
        print("\n--- Digest (human view) ---")
        print(result["digest_md"][:1200] or "(none)")
        print("\n=== STEP 5c (digest): module ready ✅ (verify live when Cloud is up) ===")


if __name__ == "__main__":
    main()
