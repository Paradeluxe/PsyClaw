"""Build vault catalog/papers.json from legacy category article lists."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.eligibility import classify
from tools.replication150.import_catalog import import_rows
from tools.replication150.manifest import validate_manifest


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Build papers.json catalog")
    p.add_argument("--vault", required=True, help="psyclaw-vault root")
    p.add_argument(
        "--out",
        default=None,
        help="output path (default: <vault>/catalog/papers.json)",
    )
    args = p.parse_args(argv)
    vault = Path(args.vault)
    papers = vault / "papers"
    sources = [
        (papers / "category1_articles.json", 1),
        (papers / "category2_articles.json", 2),
        (papers / "category3_articles.json", 3),
    ]
    for path, _cat in sources:
        if not path.is_file():
            print(f"missing: {path}", file=sys.stderr)
            return 2

    rows = []
    for path, cat in sources:
        rows.extend(import_rows(path, category=cat))

    for r in rows:
        decision = classify(r)
        r["eligibility"] = decision.status
        r["eligibility_reasons"] = list(decision.reasons)
        # defaults for pipeline fields
        r.setdefault("replication_level", "adaptation")
        r.setdefault("run_policy", "run")
        if decision.status == "replace":
            r["replication_level"] = "replace"
            r["run_policy"] = "do_not_run"
            r["blockers"] = list(dict.fromkeys((r.get("blockers") or []) + decision.reasons))
        elif decision.status == "excluded":
            r["replication_level"] = "excluded"
            r["run_policy"] = "do_not_run"
            r["blockers"] = list(dict.fromkeys((r.get("blockers") or []) + decision.reasons))
        if int(r.get("category") or 0) == 1:
            r.setdefault("material_status", "not_applicable")
        elif int(r.get("category") or 0) == 2:
            r.setdefault("material_status", "unknown")
        else:
            r.setdefault("material_status", "unknown")

    errors = validate_manifest(rows)
    out = Path(args.out) if args.out else vault / "catalog" / "papers.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "source": [str(s) for s, _ in sources],
        "n": len(rows),
        "validation_errors": errors,
        "papers": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} n={len(rows)} errors={len(errors)}")
    for e in errors[:30]:
        print(f"  - {e}")
    # summary
    from collections import Counter

    elig = Counter(r.get("eligibility") for r in rows)
    cats = Counter(r.get("category") for r in rows)
    print(f"by_category={dict(cats)} eligibility={dict(elig)}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
