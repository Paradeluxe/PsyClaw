"""design_preflight: Run-side design checklist."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from design_preflight import analyze_design  # noqa: E402


def test_no_design_blocks():
    r = analyze_design(None)
    assert r["level"] == "block"
    assert r["ok"] is False


def test_practice_warn_then_pass():
    base = {
        "name": "t",
        "routines": [
            {
                "name": "trial",
                "components": [
                    {"type": "keyboard", "name": "k", "start": 0, "duration": -1, "params": {}}
                ],
            }
        ],
        "flow": [
            {
                "kind": "loop",
                "name": "trials",
                "nReps": 2,
                "conditions": [{"word": "A"}],
                "children": [{"kind": "routine", "routine": "trial"}],
            }
        ],
    }
    r = analyze_design(base)
    assert any(c["id"] == "practice" and c["status"] == "warn" for c in r["checks"])
    base["flow"].insert(
        0,
        {
            "kind": "loop",
            "name": "practice_trials",
            "nReps": 1,
            "conditions": [{"word": "A", "corrAns": "f"}],
            "children": [{"kind": "routine", "routine": "trial"}],
        },
    )
    base["routines"].insert(0, {"name": "instructions", "components": []})
    base["flow"][1]["conditions"] = [{"word": "A", "corrAns": "f"}]
    r2 = analyze_design(base)
    assert any(c["id"] == "practice" and c["status"] == "pass" for c in r2["checks"])
    assert any(c["id"] == "scoring" and c["status"] == "pass" for c in r2["checks"])


def test_materials_from_replication(tmp_path):
    meta = {
        "material_status": "gated",
        "placeholder": True,
        "material_gap": {
            "placeholder_mode": True,
            "user_message": "框架可跑，材料未到位",
            "how_to_fill": "放入 assets",
            "drop_dir": "experiments/x/assets",
        },
    }
    (tmp_path / "replication.json").write_text(json.dumps(meta), encoding="utf-8")
    d = {
        "name": "g",
        "routines": [{"name": "trial", "components": []}],
        "flow": [{"kind": "routine", "routine": "trial"}],
    }
    r = analyze_design(d, str(tmp_path))
    mats = [c for c in r["checks"] if c["id"] == "materials"]
    assert mats and mats[0]["status"] == "warn"
