# backend/setup_tables.py — Step 1+2: create Forge pod tables (idempotent)
# Run: source .venv/bin/activate && python setup_tables.py
from lemma_sdk import Pod

TABLES = {
    "projects": {
        "name": "projects", "enable_rls": False, "primary_key_column": "id",
        "columns": [
            {"name": "name", "type": "TEXT", "required": True},
            {"name": "prompt", "type": "TEXT"},
            {"name": "status", "type": "TEXT", "default": "active"},
            {"name": "design_locked", "type": "BOOLEAN", "default": False},
        ],
    },
    "nodes": {
        "name": "nodes", "enable_rls": False, "primary_key_column": "id",
        "columns": [
            {"name": "project_id", "type": "TEXT", "required": True},
            {"name": "kind", "type": "TEXT"},
            {"name": "layer", "type": "TEXT"},
            {"name": "title", "type": "TEXT", "required": True},
            {"name": "summary", "type": "TEXT"},
            {"name": "tech", "type": "JSON"},
            {"name": "parent", "type": "TEXT"},
            {"name": "status", "type": "TEXT", "default": "designed"},
            {"name": "owner", "type": "TEXT"},
            {"name": "pos_x", "type": "FLOAT"},
            {"name": "pos_y", "type": "FLOAT"},
        ],
    },
    "edges": {
        "name": "edges", "enable_rls": False, "primary_key_column": "id",
        "columns": [
            {"name": "project_id", "type": "TEXT", "required": True},
            {"name": "source", "type": "TEXT", "required": True},
            {"name": "target", "type": "TEXT", "required": True},
            {"name": "label", "type": "TEXT"},
        ],
    },
    "tasks": {
        "name": "tasks", "enable_rls": False, "primary_key_column": "id",
        "columns": [
            {"name": "project_id", "type": "TEXT", "required": True},
            {"name": "node_id", "type": "TEXT"},
            {"name": "title", "type": "TEXT", "required": True},
            {"name": "owner", "type": "TEXT"},
            {"name": "status", "type": "TEXT", "default": "todo"},
            {"name": "approval_state", "type": "TEXT", "default": "none"},
            {"name": "priority", "type": "INTEGER", "default": 0},
        ],
    },
    "node_threads": {
        "name": "node_threads", "enable_rls": False, "primary_key_column": "id",
        "columns": [
            {"name": "project_id", "type": "TEXT", "required": True},
            {"name": "node_id", "type": "TEXT", "required": True},
            {"name": "question", "type": "TEXT", "required": True},
            {"name": "answer", "type": "TEXT"},
            {"name": "sources", "type": "JSON"},
            {"name": "qhash", "type": "TEXT"},
        ],
    },
}


def main() -> None:
    with Pod.from_env() as pod:
        existing = {t["name"] for t in pod.tables.list().to_dict()["items"]}
        for name, spec in TABLES.items():
            if name in existing:
                print(f"• {name} exists — skip")
                continue
            pod.tables.create_from_dict(spec)
            print(f"✓ created {name}")

        # tidy: drop the Step-0 smoke artifact if present
        if "smoke_test" in existing:
            try:
                pod.tables.delete("smoke_test")
                print("✓ dropped smoke_test")
            except Exception as e:
                print(f"• could not drop smoke_test: {e}")

        final = sorted(t["name"] for t in pod.tables.list().to_dict()["items"])
        print("\nTables now in pod:", final)


if __name__ == "__main__":
    main()