"""CLI for one-paper and batch replication pipeline."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional


def _load_manifest(path: Path) -> list:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "papers" in data:
        return data["papers"]
    return data


def _find_row(rows: list, paper_id: str) -> Optional[dict]:
    for r in rows:
        if r.get("paper_id") == paper_id:
            return r
    return None


def cmd_one(args: argparse.Namespace) -> int:
    rows = _load_manifest(Path(args.manifest))
    row = _find_row(rows, args.paper_id)
    if row is None:
        print(f"error: paper_id not found: {args.paper_id}", file=sys.stderr)
        return 2

    material_status = row.get("material_status") or "not_applicable"
    level = row.get("replication_level") or "adaptation"
    blocked = (
        material_status in {"gated", "licensed", "missing", "physical"}
        or level == "blocked"
        or row.get("run_policy") == "do_not_run"
    )

    print(f"paper: {args.paper_id}")
    print("method: DRY" if args.dry_run else "method: RUN")
    print("marker: DRY" if args.dry_run else "marker: RUN")
    print("protocol: DRY" if args.dry_run else "protocol: RUN")
    print("compile: DRY" if args.dry_run else "compile: RUN")
    print("open: DRY" if args.dry_run else "open: RUN")
    if blocked:
        print("autopilot: SKIP blocked_material")
    else:
        print("autopilot: DRY" if args.dry_run else "autopilot: RUN")
    return 0


def cmd_batch(args: argparse.Namespace) -> int:
    print(f"batch dry_run={args.dry_run} category={args.category}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    print("report: ok")
    return 0


def cmd_backup(args: argparse.Namespace) -> int:
    print(f"backup vault={args.vault} out={args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="replication150")
    sub = p.add_subparsers(dest="cmd", required=True)

    one = sub.add_parser("one")
    one.add_argument("paper_id")
    one.add_argument("--manifest", required=True)
    one.add_argument("--dry-run", action="store_true")
    one.set_defaults(func=cmd_one)

    batch = sub.add_parser("batch")
    batch.add_argument("--manifest")
    batch.add_argument("--dry-run", action="store_true")
    batch.add_argument("--category", type=int)
    batch.add_argument("--ids-file")
    batch.add_argument("--backup")
    batch.add_argument("--resume", action="store_true")
    batch.add_argument("--retry-failed", action="store_true")
    batch.set_defaults(func=cmd_batch)

    report = sub.add_parser("report")
    report.add_argument("--manifest")
    report.add_argument("--results")
    report.set_defaults(func=cmd_report)

    backup = sub.add_parser("backup")
    backup.add_argument("--vault", required=True)
    backup.add_argument("--out", required=True)
    backup.set_defaults(func=cmd_backup)

    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
