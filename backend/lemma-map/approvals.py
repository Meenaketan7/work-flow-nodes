# backend/lemma-map/approvals.py — Step 5a: the approval spine (design-lock + gate)
# Run: source .venv/bin/activate && python lemma-map/approvals.py [project_id] [lock|unlock|status]
#
# The brief's "the unlock is approvals." We model approval as FIRST-CLASS RECORD
# STATE, not an agent-tool approval: a human gating a project lifecycle transition
# (input -> state -> action -> APPROVAL -> outcome). Locking the design flips every
# node designed->building and every seed task none->approved, and is the gate the
# export/outcome step requires.
#
# STATUS: built + compiles; UNVERIFIED end-to-end (Cloud was down at build time).
import sys

from _forge import list_all, open_pod, retry

NODE_STATUSES = {"designed", "building", "blocked", "done"}


def _project(pod, project_id: str) -> dict:
    proj = retry(lambda: pod.records.get("projects", project_id))
    if not proj:
        raise ValueError(f"project {project_id} not found")
    return proj


def lock_design(pod, project_id: str, approver: str = "founder") -> dict:
    """Approve the design: lock it, move designed nodes into building, approve seed tasks."""
    proj = _project(pod, project_id)
    if proj.get("design_locked"):
        return {"already_locked": True, "project_id": project_id}

    nodes = list_all(pod, "nodes", project_id=project_id)
    to_build = [{"id": n["id"], "status": "building"}
                for n in nodes if n.get("status") == "designed"]
    tasks = list_all(pod, "tasks", project_id=project_id)
    to_approve = [{"id": t["id"], "approval_state": "approved"}
                  for t in tasks if t.get("approval_state") in (None, "none")]

    if to_build:
        retry(lambda: pod.records.bulk_update("nodes", to_build))
    if to_approve:
        retry(lambda: pod.records.bulk_update("tasks", to_approve))
    retry(lambda: pod.records.update("projects", project_id, {"design_locked": True}))

    return {
        "project_id": project_id,
        "design_locked": True,
        "approved_by": approver,
        "nodes_moved_to_building": len(to_build),
        "tasks_approved": len(to_approve),
    }


def unlock_design(pod, project_id: str) -> dict:
    """Reverse a lock (for demo re-runs): building->designed, approved->none."""
    _project(pod, project_id)
    nodes = list_all(pod, "nodes", project_id=project_id)
    revert_nodes = [{"id": n["id"], "status": "designed"}
                    for n in nodes if n.get("status") == "building"]
    tasks = list_all(pod, "tasks", project_id=project_id)
    revert_tasks = [{"id": t["id"], "approval_state": "none"}
                    for t in tasks if t.get("approval_state") == "approved"]
    if revert_nodes:
        retry(lambda: pod.records.bulk_update("nodes", revert_nodes))
    if revert_tasks:
        retry(lambda: pod.records.bulk_update("tasks", revert_tasks))
    retry(lambda: pod.records.update("projects", project_id, {"design_locked": False}))
    return {"project_id": project_id, "design_locked": False,
            "nodes_reverted": len(revert_nodes), "tasks_reverted": len(revert_tasks)}


def require_design_lock(pod, project_id: str) -> dict:
    """Gate used by outcomes (export/digest-send). Raises if design isn't approved."""
    proj = _project(pod, project_id)
    if not proj.get("design_locked"):
        raise PermissionError(
            "design not locked — approve the design (lock_design) before this action"
        )
    return proj


def set_node_status(pod, project_id: str, slug: str, status: str) -> dict:
    """Move one node along designed->building->blocked->done."""
    status = (status or "").strip().lower()
    if status not in NODE_STATUSES:
        raise ValueError(f"status must be one of {sorted(NODE_STATUSES)}")
    rows = retry(lambda: pod.records.list("nodes", limit=1, filter=[
        {"field": "project_id", "op": "eq", "value": project_id},
        {"field": "slug", "op": "eq", "value": slug},
    ])).to_dict()["items"]
    if not rows:
        raise ValueError(f"node '{slug}' not found in project {project_id}")
    updated = retry(lambda: pod.records.update("nodes", rows[0]["id"], {"status": status}))
    return {"node_id": slug, "status": updated.get("status", status)}


def main() -> None:
    args = sys.argv[1:]
    action = args[1] if len(args) > 1 else "status"
    with open_pod() as pod:
        if args:
            project_id = args[0]
        else:  # convenience: newest project
            projects = retry(lambda: pod.records.list(
                "projects", limit=1, sort=[{"field": "created_at", "direction": "desc"}]
            )).to_dict()["items"]
            if not projects:
                raise SystemExit("no projects yet — run generate_architecture.py first")
            project_id = projects[0]["id"]
            print(f"(no args) using newest project {project_id}\n")

        if action == "lock":
            print("lock_design ->", lock_design(pod, project_id))
        elif action == "unlock":
            print("unlock_design ->", unlock_design(pod, project_id))
        else:
            proj = _project(pod, project_id)
            nodes = list_all(pod, "nodes", project_id=project_id)
            by_status: dict[str, int] = {}
            for n in nodes:
                by_status[n.get("status", "?")] = by_status.get(n.get("status", "?"), 0) + 1
            print(f"project {project_id}: design_locked={proj.get('design_locked')}")
            print("nodes by status:", by_status)
        print("\n=== STEP 5a (approvals): module ready ✅ (verify live when Cloud is up) ===")


if __name__ == "__main__":
    main()
