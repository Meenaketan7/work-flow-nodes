# backend/lemma-map/guide_node.py — Step 4: per-node, RAG-grounded build guidance
# Run: source .venv/bin/activate && python lemma-map/guide_node.py [project_id] [node_slug] [question...]
#
# {project_id, node_id(=slug), question?} -> Guidance. Grounded by /knowledge,
# appended to node_threads, cached by qhash so re-asking the same question is a
# free read (the brief's "work that picks up again tomorrow").
#
# STATUS: built + compiles; UNVERIFIED end-to-end (Cloud was down at build time).
import hashlib
import sys

from _forge import (
    ask,
    find_node,
    list_all,
    open_pod,
    retry,
    search_knowledge,
    split_reply,
)

DEFAULT_QUESTION = "How do I build this node? Give concrete, ordered first steps."


def _qhash(node_id: str, question: str) -> str:
    norm = " ".join(question.split()).lower()
    return hashlib.sha256(f"{node_id}|{norm}".encode()).hexdigest()[:16]


def _upstream(pod, project_id: str, slug: str) -> list[str]:
    """Titles of the nodes this node depends on (inbound edges target==slug)."""
    edges = list_all(pod, "edges", project_id=project_id)
    sources = [e["source"] for e in edges if e.get("target") == slug]
    if not sources:
        return []
    nodes = list_all(pod, "nodes", project_id=project_id)
    by_slug = {n.get("slug"): n for n in nodes}
    return [by_slug[s]["title"] for s in sources if s in by_slug]


def _cached_thread(pod, project_id: str, slug: str, qhash: str):
    rows = retry(lambda: pod.records.list("node_threads", limit=200, filter=[
        {"field": "project_id", "op": "eq", "value": project_id},
        {"field": "node_id", "op": "eq", "value": slug},
        {"field": "qhash", "op": "eq", "value": qhash},
    ])).to_dict()["items"]
    return rows[0] if rows else None


def guide_node(pod, project_id: str, node_id: str, question: str | None = None,
               *, refresh: bool = False) -> dict:
    question = (question or DEFAULT_QUESTION).strip()
    qhash = _qhash(node_id, question)

    if not refresh:
        hit = _cached_thread(pod, project_id, node_id, qhash)
        if hit:
            sources = hit.get("sources") or {}
            return {
                "cached": True,
                "thread_id": hit.get("id"),
                "node_id": node_id,
                "question": question,
                "guidance_md": hit.get("answer") or "",
                "structured": (sources or {}).get("structured", {}),
                "sources": (sources or {}).get("paths", []),
            }

    node = find_node(pod, project_id, node_id)
    if not node:
        raise ValueError(f"node '{node_id}' not found in project {project_id}")
    title = node.get("title") or node_id
    layer = node.get("layer") or "api"
    summary = node.get("summary") or ""
    deps = _upstream(pod, project_id, node_id)

    context, paths = search_knowledge(pod, [
        f"how to build {title} in the {layer} layer",
        question,
        f"best practices, steps and tech for a {layer} component",
    ], budget=1600)

    reply = ask(pod, (
        "You are a senior build coach for a solo founder. Give concrete, grounded, "
        "buildable guidance for ONE node of their system — not a lecture. Use the "
        "GUIDANCE excerpts where relevant; do not invent facts about their stack.\n"
        "Output EXACTLY two parts and nothing else:\n"
        "1) a ```json fenced block of shape:\n"
        '{"steps":["ordered, imperative build steps"],'
        '"checklist":["done-when checks"],'
        '"watch_out":["common mistakes / blockers"],'
        '"tech":["concrete tools or libraries to use"]}\n'
        "   Keep each item one short line; include as many as the node genuinely needs.\n"
        "2) a markdown section starting with `## How to build " + title + "`: a one-line "
        "framing, then the steps as a numbered list, then a short `Done when:` line.\n\n"
        f"NODE: {title} (layer: {layer})\n"
        f"WHAT IT IS: {summary}\n"
        f"DEPENDS ON (must exist first): {', '.join(deps) or 'nothing — this is a foundation node'}\n"
        f"FOUNDER ASKS: {question}\n\n"
        f"GUIDANCE:\n{context}"
    ), title=f"guide-{node_id}")

    structured, guidance_md = split_reply(reply)

    thread = retry(lambda: pod.records.create("node_threads", {
        "project_id": project_id,
        "node_id": node_id,
        "question": question,
        "answer": guidance_md,
        "sources": {"paths": paths, "structured": structured},
        "qhash": qhash,
    }))

    return {
        "cached": False,
        "thread_id": thread.get("id"),
        "node_id": node_id,
        "question": question,
        "guidance_md": guidance_md,
        "structured": structured,
        "sources": paths,
    }


def _pick_demo_target(pod):
    """For the no-arg CLI: newest project + a sensible 'build-first' node."""
    projects = retry(lambda: pod.records.list(
        "projects", limit=50, sort=[{"field": "created_at", "direction": "desc"}]
    )).to_dict()["items"]
    if not projects:
        raise SystemExit("no projects yet — run generate_architecture.py first")
    pid = projects[0]["id"]
    nodes = list_all(pod, "nodes", project_id=pid)
    if not nodes:
        raise SystemExit(f"project {pid} has no nodes")
    edges = list_all(pod, "edges", project_id=pid)
    has_upstream = {e.get("target") for e in edges}
    foundation = next((n for n in nodes if n.get("slug") not in has_upstream), nodes[0])
    return pid, foundation.get("slug")


def main() -> None:
    args = sys.argv[1:]
    with open_pod() as pod:
        if len(args) >= 2:
            project_id, node_id = args[0], args[1]
            question = " ".join(args[2:]) or None
        else:
            project_id, node_id = _pick_demo_target(pod)
            question = None
            print(f"(no args) demoing newest project {project_id}, node '{node_id}'\n")

        result = guide_node(pod, project_id, node_id, question)
        tag = "CACHE HIT" if result["cached"] else "fresh"
        print(f"• {tag} — node '{result['node_id']}' — sources: {result['sources'] or '(none)'}")
        s = result["structured"]
        print(f"• structured: {len(s.get('steps', []))} steps, "
              f"{len(s.get('checklist', []))} checks, {len(s.get('tech', []))} tech")
        print("\n--- Guidance (human view) ---")
        print(result["guidance_md"][:1400] or "(none)")

        # prove the cache: ask the same thing again -> should be a read, not a call
        again = guide_node(pod, project_id, node_id, question)
        print(f"\n=== STEP 4: {'GO ✅ (cache hit on repeat)' if again['cached'] else 'persisted, but repeat was not cached — investigate'} ===")


if __name__ == "__main__":
    main()
