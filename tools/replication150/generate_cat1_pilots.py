"""Generate Category-1 pilot product projects into vault/experiments."""
from __future__ import annotations

import argparse
import json
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.generate_marker import build_marker
from tools.replication150.open_gate import check_open_parity
from tools.replication150.paradigm_templates import get_method
from tools.replication150.project_writer import write_project
from tools.replication150.static_gate import validate_project
from tools.replication150.timing_contract import TIMING_CONTRACT_VERSION


PILOT_STIMULUS_MS = {
    "cat1_stroop": 2000,
    "cat1_go_no_go": 1000,
    "cat1_flanker": 1500,
    "cat1_simon": 1500,
    "cat1_posner_cueing": 1000,
}


def _pilot_method(paper_id: str) -> dict:
    method = get_method(paper_id)
    method["timing"]["stimulus_ms"] = {
        "value": PILOT_STIMULUS_MS[paper_id],
        "unit": "ms",
        "status": "known",
        "source": {"page": 0, "quote": "pilot override"},
    }
    return method


PILOTS = {paper_id: partial(_pilot_method, paper_id) for paper_id in PILOT_STIMULUS_MS}


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--vault", required=True)
    p.add_argument("--only", default=None)
    args = p.parse_args(argv)
    vault = Path(args.vault)
    exp = vault / "experiments"
    exp.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(",")) if args.only else None

    results = []
    for paper_id, factory in PILOTS.items():
        if only and paper_id not in only:
            continue
        method = factory()
        project = exp / paper_id
        marker = build_marker(method, project_name=paper_id)
        meta = {
            "paper_id": paper_id,
            "replication_level": "adaptation",
            "pilot": True,
            "generated_files": [f"{paper_id}.psyclaw", "replication.json", "method-extract.md"],
            "run_policy": "run",
            "timing_contract_version": TIMING_CONTRACT_VERSION,
            "notes": "Category-1 pilot scaffold from classic paradigm defaults; replace timings with PDF-sourced values when Method extract lands.",
        }
        write_project(
            project,
            marker,
            meta,
            method_extract=f"# {paper_id}\n\nPilot scaffold. PDF Method extraction not yet applied.\n",
        )
        static = validate_project(project, compile_marker=True)
        open_r = check_open_parity(project)
        row = {
            "paper_id": paper_id,
            "static_ok": static.get("ok"),
            "open_ok": open_r.get("ok"),
            "compiled_sha256": static.get("compiled_sha256"),
        }
        results.append(row)
        print(json.dumps(row, ensure_ascii=False))

    out = vault / "catalog" / "cat1_pilot_results.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return 0 if all(r.get("static_ok") and r.get("open_ok") for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
