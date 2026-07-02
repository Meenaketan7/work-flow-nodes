# backend/lemma-map/_forge.py — shared Forge core (one source of truth)
#
# Every step script (generate_architecture, guide_node, approvals, export_repo,
# digest) and the FastAPI BFF import from here so the proven agent/RAG/retry
# patterns live in exactly one place. Importable as a sibling module:
#   - run a step script with `python lemma-map/<file>.py` (its dir is on sys.path)
#   - the BFF adds `lemma-map/` to sys.path then `import _forge`
#
# NOTE (2026-06-30): the agent + RAG helpers below were proven live in
# smoke_infer.py and one earlier generate_architecture run. Everything that calls
# the Lemma server is UNVERIFIED against the new step modules only because Cloud
# was mid-outage during the build — the code paths are identical to what passed.
from __future__ import annotations

import json
import re
import time
from contextlib import contextmanager

import httpx
from lemma_sdk import Pod
from lemma_sdk.errors import (
    LemmaConnectionError,
    LemmaRateLimitError,
    LemmaServerError,
)
from lemma_sdk.openapi_client.models.create_conversation_request import (
    CreateConversationRequest,
)

# Lemma Cloud intermittently returns nginx 503 / rate-limits / drops a connection;
# these are transient and safe to retry (the agent keeps running server-side).
TRANSIENT = (LemmaServerError, LemmaRateLimitError, LemmaConnectionError)

AGENT = "hello"           # starter agent wired to the org runtime (no personal key)
MODEL = "deepseek-v4-flash"  # flash model — much faster than the default minimax-m3
RUNTIME_PROFILE = "system:lemma"
KNOWLEDGE = "/knowledge"  # RAG corpus seeded by seed_knowledge.py
LAYERS = ("client", "api", "data", "integration", "infra")
# left -> right column order on the canvas: foundations left, user-facing right
LAYER_X = {"infra": 0, "data": 1, "integration": 2, "api": 3, "client": 4}
TERMINAL = {"COMPLETED", "FAILED", "STOPPED"}

# the SDK's default HTTP read timeout is 30s with no env override; agent
# generation routinely exceeds it, so we bump the live client to 5 min.
AGENT_TIMEOUT = 300.0


# ---------- pod lifecycle ----------
@contextmanager
def open_pod():
    """Yield a Pod from env config with the long agent timeout already applied.

    Use as `with open_pod() as pod:` in every script/endpoint so nobody forgets
    the 300s bump that the default 30s timeout would otherwise break.
    """
    with Pod.from_env() as pod:
        configure_timeout(pod)
        yield pod


def configure_timeout(pod: Pod, seconds: float = AGENT_TIMEOUT) -> None:
    pod.generated.get_httpx_client().timeout = httpx.Timeout(seconds)


# ---------- retry around transient Cloud blips ----------
def retry(fn, *, tries: int = 6, base: float = 3.0):
    last = None
    for i in range(tries):
        try:
            return fn()
        except TRANSIENT as exc:
            last = exc
            wait = base * (i + 1)
            print(f"  ⟳ transient ({type(exc).__name__}); retry in {wait:.0f}s")
            time.sleep(wait)
    raise last


# backwards-compatible alias (generate_architecture used the name `_retry`)
_retry = retry


# ---------- agent inference (single message -> text reply, async poll) ----------
def ask(pod: Pod, message: str, *, timeout: int = 300, title: str = "forge") -> str:
    """Send one message to the agent and return its final TEXT reply.

    Agents reply asynchronously: open a conversation, then poll messages until a
    non-user TEXT message appears (or the conversation reaches a terminal state).
    Tolerates transient blips during polling — the agent keeps running.
    """
    req = CreateConversationRequest.from_dict({
        "agent_name": AGENT,
        "title": title,
        "agent_runtime": {"model_name": MODEL, "profile_id": RUNTIME_PROFILE},
    })
    conv = retry(lambda: pod.conversations.create(req))
    cid = str(conv.id)
    retry(lambda: pod.conversations.send(cid, message))
    deadline = time.time() + timeout
    status = None
    while time.time() < deadline:
        try:
            status = pod.conversations.get(cid).to_dict().get("status")
            msgs = pod.conversations.messages(cid).to_dict()["items"]
        except TRANSIENT:
            time.sleep(4)  # blip during polling — agent still running, keep waiting
            continue
        answers = [
            m for m in msgs
            if m.get("role") != "user" and m.get("kind") == "TEXT" and m.get("text")
        ]
        if answers:
            return sorted(answers, key=lambda m: m["sequence"])[-1]["text"]
        if status in TERMINAL:
            break
        time.sleep(2)  # poll a touch faster so the reply is picked up sooner
    raise RuntimeError(f"agent gave no reply (last status={status})")


def split_reply(text: str):
    """Return (json_dict, summary_md) from a two-part reply, tolerating fences/order.

    The contract every Forge prompt uses: a ```json fenced object plus free-prose
    markdown around it. Keeping JSON parse-safe and prose separate avoids escaping
    bugs and keeps tokens low.
    """
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        data = json.loads(m.group(1))
        summary_md = (text[: m.start()] + text[m.end():]).strip()
    else:  # no fence — grab the outermost {...}, rest is markdown
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start: end + 1])
        summary_md = (text[:start] + text[end + 1:]).strip()
    return data, summary_md


# ---------- grounding via files RAG ----------
def search_knowledge(pod: Pod, queries: list[str], *, budget: int = 1800, per_query: int = 2):
    """Run scoped HYBRID searches over /knowledge, dedupe, and cap to `budget` chars.

    Returns (context_text, source_paths). Shared by generate (architecture queries)
    and guide_node (node-specific queries).
    """
    seen: set = set()
    chunks: list[str] = []
    paths: list[str] = []
    used = 0
    for q in queries:
        hits = retry(lambda q=q: pod.files.search(
            q, scope_path=KNOWLEDGE, scope_mode="SUBTREE", search_method="HYBRID"
        )).to_dict()["items"]
        for h in hits[:per_query]:
            key = (h["path"], h.get("chunk_index"))
            if key in seen:
                continue
            seen.add(key)
            text = " ".join(h["content"].split())
            if used + len(text) > budget:
                text = text[: budget - used]
            chunks.append(f"[{h['path']}] {text}")
            if h["path"] not in paths:
                paths.append(h["path"])
            used += len(text)
            if used >= budget:
                break
        if used >= budget:
            break
    return "\n".join(chunks), paths


def ground(pod: Pod, prompt: str, *, budget: int = 900) -> str:
    """Architecture-time grounding — kept lean (fewer/smaller searches) for speed."""
    queries = [
        f"architecture, components, layers and tech stack for: {prompt}",
        "how to sequence an MVP build and write the backlog",
    ]
    context, _ = search_knowledge(pod, queries, budget=budget, per_query=1)
    return context


# ---------- records helpers (used across steps + BFF) ----------
def list_all(pod: Pod, table: str, *, project_id: str | None = None, limit: int = 500):
    """List records, optionally scoped to a project, with retry. Returns a list."""
    flt = [{"field": "project_id", "op": "eq", "value": project_id}] if project_id else None
    return retry(lambda: pod.records.list(table, limit=limit, filter=flt)).to_dict()["items"]


def find_node(pod: Pod, project_id: str, slug: str):
    """Return the node row for a slug within a project, or None."""
    rows = retry(lambda: pod.records.list("nodes", limit=500, filter=[
        {"field": "project_id", "op": "eq", "value": project_id},
        {"field": "slug", "op": "eq", "value": slug},
    ])).to_dict()["items"]
    return rows[0] if rows else None
