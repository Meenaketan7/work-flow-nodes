# backend/smoke_infer.py — prove agent inference + dual JSON/markdown output
# Run: source .venv/bin/activate && python smoke_infer.py
import json
import re
import time
from lemma_sdk import Pod

# Two-part contract: compact JSON graph (-> tables/canvas) + markdown summary (-> user).
# Schema inlined so the agent doesn't guess; "be terse" + node cap keep tokens low.
PROMPT = (
    "You are a senior software architect. Decompose the product idea into a COMPLETE, "
    "production-quality system map: include every component the system genuinely needs "
    "across all relevant layers (client, api, data, integration, infra). Do not truncate "
    "and do not cap the node count — but no filler either; every node must earn its place. "
    "Then summarize it.\n"
    "Output EXACTLY two parts and nothing else:\n"
    "1) a ```json fenced block of shape:\n"
    '{"nodes":[{"id":"kebab-slug","layer":"client|api|data|integration|infra",'
    '"title":"short name","summary":"one clear sentence"}],'
    '"edges":[{"source":"id","target":"id"}]}\n'
    "   Rules: an edge means target depends on source; ids unique kebab-case; the graph "
    "MUST be a DAG (no cycles) and fully connected (no orphan nodes).\n"
    "2) a markdown section starting with `## Build Summary`: a one-line overview, then one "
    "bullet per node `- **title** (layer) — what it does`, then a `Build first:` line.\n"
    "Idea: a simple shared to-do app with login."
)

TERMINAL = {"COMPLETED", "FAILED", "STOPPED"}


def split_reply(text: str):
    """Return (graph_dict, summary_md) from a two-part reply, tolerating fences/order."""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        graph = json.loads(m.group(1))
        summary_md = (text[: m.start()] + text[m.end() :]).strip()
    else:  # no fence — grab the outermost {...}, rest is markdown
        start, end = text.find("{"), text.rfind("}")
        graph = json.loads(text[start : end + 1])
        summary_md = (text[:start] + text[end + 1 :]).strip()
    return graph, summary_md


def main() -> None:
    with Pod.from_env() as pod:
        agents = pod.agents.list().to_dict()["items"]
        names = [a["name"] for a in agents]
        print("agents in pod:", names or "(none)")
        if not names:
            print("✗ no agents — can't test inference. Stop and report this.")
            return
        agent = next((n for n in names if n in ("hello", "assistant")), names[0])
        print(f"using agent: {agent}\n")

        conv = pod.agents.run(agent, PROMPT, title="infer-smoke")
        cid = str(conv.id)
        print(f"conversation {cid} — waiting for reply", end="", flush=True)

        reply, status = None, None
        deadline = time.time() + 180
        while time.time() < deadline:
            status = pod.conversations.get(cid).to_dict().get("status")
            msgs = pod.conversations.messages(cid).to_dict()["items"]
            answers = [
                m for m in msgs
                if m.get("role") != "user" and m.get("kind") == "TEXT" and m.get("text")
            ]
            if answers:
                reply = sorted(answers, key=lambda m: m["sequence"])[-1]["text"]
                break
            if status in TERMINAL:
                break
            print(".", end="", flush=True)
            time.sleep(3)
        print(f"\nfinal status: {status}\n")

        if not reply:
            print("✗ no text reply. Likely no model wired to the org runtime. Report this.")
            return

        print("--- raw reply ---")
        print(reply)
        print("\n--- parse test ---")
        try:
            graph, summary_md = split_reply(reply)
            n, e = len(graph.get("nodes", [])), len(graph.get("edges", []))
            print(f"✓ JSON parsed: {n} nodes, {e} edges")
            print("  layers:", sorted({x.get('layer') for x in graph.get('nodes', [])}))
            print(f"✓ markdown summary: {len(summary_md)} chars")
            print("\n--- summary (human view) ---")
            print(summary_md or "(empty — agent skipped the markdown part)")
            ok = n > 0 and bool(summary_md)
            print("\n=== INFER SMOKE: GO ✅ ===" if ok else "=== partial — investigate ===")
        except Exception as ex:
            print(f"✗ could not parse JSON: {ex}")
            print("=== agent works but output is messy — we'll tighten the prompt ===")


if __name__ == "__main__":
    main()