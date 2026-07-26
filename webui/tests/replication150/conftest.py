"""Put monorepo root on sys.path so `tools.replication150` imports resolve."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.replication150.generate_marker import build_marker  # noqa: E402


@pytest.fixture
def valid_project(tmp_path):
    method = {
        "design": {
            "assignment": "within",
            "factors": [{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {"stimulus_ms": {"value": 500, "status": "known"}},
        "responses": [{"device": "keyboard", "keys": ["f", "j"]}],
        "trial_count": {"value": 4, "status": "known"},
        "conditions": [
            {"congruency": "congruent", "corrAns": "f", "text": "RED"},
            {"congruency": "incongruent", "corrAns": "j", "text": "GREEN"},
        ],
        "metrics": {"group_by": ["congruency"]},
        "material_status": "not_applicable",
        "stimulus_kind": "text",
    }
    name = "DemoProj"
    project = tmp_path / name
    project.mkdir()
    marker = build_marker(method, project_name=name)
    (project / f"{name}.psyclaw").write_text(
        json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return project


@pytest.fixture
def complete_pack(tmp_path):
    stem = "P_autopilot_s1_x"
    (tmp_path / f"{stem}.csv").write_text(
        "participant_id,session,trial,routine,response,corrAns,corr,rt,congruency\n"
        "P_autopilot,1,1,trial,f,f,1,0.5,congruent\n",
        encoding="utf-8",
    )
    (tmp_path / f"{stem}_summary.json").write_text(
        json.dumps({"n": 1, "accuracy": 1.0, "mean_rt": 0.5}), encoding="utf-8"
    )
    (tmp_path / f"{stem}_by_condition.csv").write_text(
        "scope,congruency,n,accuracy,mean_rt\noverall,,1,1.0,0.5\n",
        encoding="utf-8",
    )
    (tmp_path / f"{stem}_metrics_long.csv").write_text(
        "scope,metric,value\noverall,n,1\n",
        encoding="utf-8",
    )
    return tmp_path
