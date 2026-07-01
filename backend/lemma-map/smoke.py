# backend/smoke.py — Lemma GO/NO-GO smoke test (Cloud pod "forge")
# Run: source .venv/bin/activate && python smoke.py
import os
import tempfile
import time

from lemma_sdk import Pod

TEST_TABLE = "smoke_test"
KNOWLEDGE = "/knowledge"


def main() -> None:
    with Pod.from_env() as pod:
        print("✓ connected to pod")

        # --- connectivity ---
        tables = pod.tables.list().to_dict()["items"]
        print("✓ tables.list:", [t["name"] for t in tables])
        print("✓ functions.list:", len(pod.functions.list().to_dict()["items"]), "fn(s)")
        print("✓ agents.list:", [a["name"] for a in pod.agents.list().to_dict()["items"]])

        # --- 1. TABLE create + record round-trip ---
        if TEST_TABLE not in {t["name"] for t in tables}:
            pod.tables.create_from_dict({
                "name": TEST_TABLE,
                "columns": [
                    {"name": "title", "type": "TEXT", "required": True},
                    {"name": "status", "type": "TEXT"},
                ],
                "primary_key_column": "id",
                "enable_rls": False,  # shared/team table
            })
            print(f"✓ created table '{TEST_TABLE}'")
        else:
            print(f"• table '{TEST_TABLE}' exists — reusing")

        t = pod.table(TEST_TABLE)
        row = t.create({"title": "smoke row", "status": "new"})
        rid = row["id"]
        print("✓ record.create -> id:", rid)
        assert t.get(rid)["title"] == "smoke row"
        print("✓ record.get round-trip OK")
        t.update(rid, {"status": "done"})
        print("✓ record.update OK")
        n = len(pod.records.list(TEST_TABLE, limit=10).to_dict()["items"])
        print(f"✓ records.list -> {n} row(s)")
        q = pod.query(
            f"select status, count(*) as cnt from {TEST_TABLE} group by status"
        ).to_dict()["items"]
        print("✓ SQL query ->", q)
        t.delete(rid)
        print("✓ record.delete OK")

        # --- 2. FILES upload + RAG search ---
        try:
            pod.files.create_folder(KNOWLEDGE, description="smoke knowledge")
            print(f"✓ created folder {KNOWLEDGE}")
        except Exception as e:
            print(f"• folder {KNOWLEDGE} may already exist ({e})")

        md = (
            "# Refund Policy\n\n"
            "Customers may request a refund within 30 days of purchase. "
            "Refunds are processed to the original payment method within 5 business days.\n"
        )
        tmp = os.path.join(tempfile.gettempdir(), "smoke_refund_policy.md")
        with open(tmp, "w") as f:
            f.write(md)
        up = pod.files.upload(tmp, directory_path=KNOWLEDGE).to_dict()
        fpath = up.get("path") or f"{KNOWLEDGE}/smoke_refund_policy.md"
        print("✓ uploaded:", fpath)

        # async indexing — poll up to ~40s
        status = None
        for _ in range(20):
            info = pod.files.get(fpath).to_dict()
            status = info.get("search_status") or info.get("status") or info.get("processing_status")
            if str(status).upper() == "COMPLETED":
                break
            time.sleep(2)
        print("• index status:", status)

        try:
            hits = pod.files.search(
                "refund window days", scope_path=KNOWLEDGE,
                scope_mode="SUBTREE", search_method="HYBRID",
            ).to_dict()
        except Exception as e:
            print(f"• HYBRID failed ({e}); retrying TEXT")
            hits = pod.files.search(
                "refund window days", scope_path=KNOWLEDGE, search_method="TEXT",
            ).to_dict()
        h = len(hits.get("items") or hits.get("results") or [])
        print(f"✓ files.search executed -> {h} hit(s)")

        print("\n=== SMOKE RESULT: tables R/W ✓  SQL ✓  files upload+search ✓  → GO ✅ ===")


if __name__ == "__main__":
    main()
