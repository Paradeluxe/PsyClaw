"""Generate Category-1 pilot product projects into vault/experiments."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.generate_marker import build_marker
from tools.replication150.open_gate import check_open_parity
from tools.replication150.project_writer import write_project
from tools.replication150.static_gate import validate_project


def _method_stroop():
    return {
        "design": {
            "assignment": "within",
            "factors": [{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {"stimulus_ms": {"value": 2000, "status": "known", "source": {"page": 1, "quote": "pilot default"}}},
        "responses": [{"device": "keyboard", "keys": ["f", "j"]}],
        "trial_count": {"value": 48, "status": "known"},
        "conditions": [
            {"congruency": "congruent", "corrAns": "f", "text": "RED", "color": "red"},
            {"congruency": "congruent", "corrAns": "j", "text": "GREEN", "color": "green"},
            {"congruency": "incongruent", "corrAns": "f", "text": "GREEN", "color": "red"},
            {"congruency": "incongruent", "corrAns": "j", "text": "RED", "color": "green"},
        ],
        "metrics": {"group_by": ["congruency"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
    }


def _method_gonogo():
    return {
        "design": {
            "assignment": "within",
            "factors": [{"name": "trialType", "levels": ["go", "nogo"]}],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {"stimulus_ms": {"value": 1000, "status": "known"}},
        "responses": [{"device": "keyboard", "keys": ["space"]}],
        "trial_count": {"value": 40, "status": "known"},
        "conditions": [
            {"trialType": "go", "corrAns": "space", "text": "GO"},
            {"trialType": "go", "corrAns": "space", "text": "GO"},
            {"trialType": "go", "corrAns": "space", "text": "GO"},
            {"trialType": "nogo", "corrAns": "", "text": "X"},
        ],
        "metrics": {"group_by": ["trialType"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
        "task_kind": "gonogo",
    }


def _method_flanker():
    return {
        "design": {
            "assignment": "within",
            "factors": [{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {"stimulus_ms": {"value": 1500, "status": "known"}},
        "responses": [{"device": "keyboard", "keys": ["left", "right"]}],
        "trial_count": {"value": 48, "status": "known"},
        "conditions": [
            {"congruency": "congruent", "corrAns": "left", "text": "<<<<<"},
            {"congruency": "congruent", "corrAns": "right", "text": ">>>>>"},
            {"congruency": "incongruent", "corrAns": "left", "text": ">><>>"},
            {"congruency": "incongruent", "corrAns": "right", "text": "<<><<"},
        ],
        "metrics": {"group_by": ["congruency"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
    }


def _method_simon():
    return {
        "design": {
            "assignment": "within",
            "factors": [
                {"name": "congruency", "levels": ["congruent", "incongruent"]},
                {"name": "side", "levels": ["left", "right"]},
            ],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {"stimulus_ms": {"value": 1500, "status": "known"}},
        "responses": [{"device": "keyboard", "keys": ["z", "m"]}],
        "trial_count": {"value": 48, "status": "known"},
        "conditions": [
            {"congruency": "congruent", "side": "left", "corrAns": "z", "text": "BLUE"},
            {"congruency": "congruent", "side": "right", "corrAns": "m", "text": "RED"},
            {"congruency": "incongruent", "side": "left", "corrAns": "m", "text": "RED"},
            {"congruency": "incongruent", "side": "right", "corrAns": "z", "text": "BLUE"},
        ],
        "metrics": {"group_by": ["congruency"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
    }


def _method_posner():
    return {
        "design": {
            "assignment": "within",
            "factors": [{"name": "validity", "levels": ["valid", "invalid", "neutral"]}],
        },
        "trial_flow": ["fixation", "cue", "target", "response"],
        "timing": {"stimulus_ms": {"value": 1000, "status": "known"}},
        "responses": [{"device": "keyboard", "keys": ["f", "j"]}],
        "trial_count": {"value": 60, "status": "known"},
        "conditions": [
            {"validity": "valid", "corrAns": "f", "text": "L"},
            {"validity": "valid", "corrAns": "j", "text": "R"},
            {"validity": "invalid", "corrAns": "f", "text": "L"},
            {"validity": "invalid", "corrAns": "j", "text": "R"},
            {"validity": "neutral", "corrAns": "f", "text": "L"},
            {"validity": "neutral", "corrAns": "j", "text": "R"},
        ],
        "metrics": {"group_by": ["validity"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
    }


PILOTS = {
    "cat1_stroop": _method_stroop,
    "cat1_go_no_go": _method_gonogo,
    "cat1_flanker": _method_flanker,
    "cat1_simon": _method_simon,
    "cat1_posner_cueing": _method_posner,
}


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
            "static_hard": static.get("hard"),
            "open": open_r,
        }
        results.append(row)
        print(json.dumps(row, ensure_ascii=False))

    out = vault / "catalog" / "pilot_cat1_static_open.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}")
    ok = all(r["static_ok"] and r["open_ok"] for r in results)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
