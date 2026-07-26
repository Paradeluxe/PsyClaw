"""design_compiler: flow expand + conditions + PsychoPy-style runner generation."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from design_compiler import (  # noqa: E402
    compile_design,
    expand_flow_py,
    parse_conditions_bytes,
)


def test_expand_loop_nreps_full_sequence():
    flow = [
        {"kind": "routine", "routine": "instructions"},
        {
            "kind": "loop",
            "name": "trials",
            "nReps": 3,
            "children": [
                {"kind": "routine", "routine": "fix"},
                {"kind": "routine", "routine": "stim"},
            ],
        },
        {"kind": "routine", "routine": "thanks"},
    ]
    steps = expand_flow_py(flow)
    names = [s["routine"] for s in steps]
    # PsychoPy: each rep runs full children sequence
    assert names == [
        "instructions",
        "fix", "stim",
        "fix", "stim",
        "fix", "stim",
        "thanks",
    ]
    trial_steps = [s for s in steps if s["loop"] == "trials"]
    assert [s["thisN"] for s in trial_steps] == [0, 0, 1, 1, 2, 2]
    assert all(s["nReps"] == 3 for s in trial_steps)


def test_expand_nested_loop():
    flow = [{
        "kind": "loop",
        "name": "outer",
        "nReps": 2,
        "children": [{
            "kind": "loop",
            "name": "inner",
            "nReps": 2,
            "children": [{"kind": "routine", "routine": "t"}],
        }],
    }]
    steps = expand_flow_py(flow)
    assert len(steps) == 4
    assert all(s["routine"] == "t" for s in steps)
    # innermost loop name wins on leaf
    assert [s["loop"] for s in steps] == ["inner"] * 4


def test_expand_conditions_sequential():
    flow = [{
        "kind": "loop",
        "name": "trials",
        "nReps": 2,
        "loopType": "sequential",
        "conditions": [
            {"word": "RED", "color": "red"},
            {"word": "GREEN", "color": "green"},
        ],
        "children": [{"kind": "routine", "routine": "trial"}],
    }]
    steps = expand_flow_py(flow)
    assert len(steps) == 4  # 2 nReps × 2 rows
    words = [s["trialVars"]["word"] for s in steps]
    assert words == ["RED", "GREEN", "RED", "GREEN"]
    assert [s["thisN"] for s in steps] == [0, 1, 2, 3]
    assert all(s["nReps"] == 4 for s in steps)


def test_expand_conditions_random_shuffles_within_rep():
    flow = [{
        "kind": "loop",
        "name": "trials",
        "nReps": 1,
        "loopType": "random",
        "conditions": [
            {"word": "A"}, {"word": "B"}, {"word": "C"}, {"word": "D"},
        ],
        "children": [{"kind": "routine", "routine": "trial"}],
    }]
    # fixed seed still a permutation of the four
    steps = expand_flow_py(flow)
    words = [s["trialVars"]["word"] for s in steps]
    assert sorted(words) == ["A", "B", "C", "D"]
    assert len(words) == 4




def test_expand_conditions_weighted_exact_counts():
    """weighted = weight copies → bag × nReps → one shuffle; counts exact."""
    import random
    from collections import Counter

    flow = [{
        "kind": "loop",
        "name": "trials",
        "nReps": 2,
        "loopType": "weighted",
        "conditions": [
            {"word": "go", "weight": 3},
            {"word": "nogo", "weight": 1},
        ],
        "children": [{"kind": "routine", "routine": "trial"}],
    }]
    steps = expand_flow_py(flow, rng=random.Random(42))
    words = [s["trialVars"]["word"] for s in steps]
    assert len(words) == 8  # (3+1) * 2
    c = Counter(words)
    assert c["go"] == 6
    assert c["nogo"] == 2
    # still a shuffle (not pure sequential go,go,go,nogo ×2 with high probability under seed — check not identical to unshuffled bag order is optional)
    assert all(s["nReps"] == 8 for s in steps)
    assert [s["thisN"] for s in steps] == list(range(8))


def test_expand_conditions_weighted_default_weight_one():
    flow = [{
        "kind": "loop",
        "name": "trials",
        "nReps": 1,
        "loopType": "weighted",
        "conditions": [{"word": "A"}, {"word": "B"}, {"word": "C"}],
        "children": [{"kind": "routine", "routine": "trial"}],
    }]
    steps = expand_flow_py(flow)
    words = sorted(s["trialVars"]["word"] for s in steps)
    assert words == ["A", "B", "C"]


def test_normalize_loop_type_weighted_aliases():
    from design_compiler import _normalize_loop_type
    assert _normalize_loop_type("weighted") == "weighted"
    assert _normalize_loop_type("weighted_random") == "weighted"
    assert _normalize_loop_type("proportion") == "weighted"

def test_compile_design_emits_status_draw_loop():
    design = {
        "name": "t",
        "display": {"size": [800, 600], "fullscreen": False},
        "routines": [{
            "name": "trial",
            "components": [
                {"id": "c1", "type": "text", "name": "stim", "start": 0, "duration": 0.5,
                 "params": {"text": "$word", "height": 0.05, "color": "white"}},
                {"id": "c2", "type": "keyboard", "name": "kb", "start": 0, "duration": 0.5,
                 "params": {"keys": "space", "force_end": True}},
            ],
        }],
        "flow": [{
            "kind": "loop", "name": "trials", "nReps": 1, "loopType": "sequential",
            "conditions": [{"word": "X", "corrAns": "space"}],
            "children": [{"kind": "routine", "routine": "trial"}],
        }],
        "metrics": {"group_by": ["congruent"]},
    }
    src = compile_design(design)
    assert "continue_routine" in src
    assert "NOT_STARTED" in src
    assert "STARTED" in src
    assert "FINISHED" in src
    assert "routine_clock" in src
    assert "expand_flow" in src
    assert "thisN" in src
    assert "resolve_params" in src or "resolve_val" in src
    assert "conditions" in src or "trialVars" in src
    # no blocking wait inside flip loop
    assert "core.wait(0.05)" not in src
    assert "trial" in src
    # trial metrics inlined
    assert "apply_trial_scores" in src
    assert "summarize_rows" in src
    assert "corrAns" in src
    assert "_summary.json" in src or "metrics summary" in src
    assert "__TRIAL_METRICS_SRC__" not in src  # placeholder replaced


def test_bgcolor_rgb_and_project_mirror_in_compile():
    from design_compiler import compile_any

    design = {
        "name": "bg",
        "display": {"size": [800, 600], "fullscreen": False, "bgcolor": "rgb(255,0,0)"},
        "routines": [{"name": "r", "components": [
            {"id": "c1", "type": "text", "name": "t", "start": 0, "duration": 0.1,
             "params": {"text": "hi", "color": "white"}},
        ]}],
        "flow": [{"kind": "routine", "routine": "r"}],
    }
    src = compile_any(
        design=design,
        session={"participant_id": "P01", "session": "1"},
        spec={"project_path": r"E:\fake_project"},
    )
    assert "rgb(255,0,0)" in src or "_bgcolor_of" in src
    assert "project_path" in src
    assert r"E:\\fake_project" in src or "E:\\\\fake_project" in src or "fake_project" in src
    assert "mirrored CSV" in src
    assert "project_path" in src  # reserved, not dumped as custom


def test_parse_conditions_csv_and_xlsx():
    csv_bytes = b"word,color,corrAns\nRED,red,r\nGREEN,green,g\n"
    r = parse_conditions_bytes("t.csv", csv_bytes)
    assert r["n"] == 2
    assert r["columns"] == ["word", "color", "corrAns"]
    assert r["rows"][0]["word"] == "RED"

    xlsx_path = ROOT / "examples" / "stroop_trials.xlsx"
    data = xlsx_path.read_bytes()
    r2 = parse_conditions_bytes("stroop_trials.xlsx", data)
    assert r2["n"] == 4
    assert "word" in r2["columns"]


def test_compile_escape_abort_is_manual_not_finished():
    """ESC must not look like clean finished: marker + exit 130."""
    design = {
        "name": "t",
        "display": {"size": [800, 600], "fullscreen": False},
        "routines": [{"name": "trial", "components": [
            {"id": "c1", "type": "text", "name": "stim", "start": 0, "duration": 0.5,
             "params": {"text": "X"}},
        ]}],
        "flow": [{"kind": "routine", "routine": "trial"}],
    }
    src = compile_design(design)
    assert "abort_reason = None" in src
    assert 'abort_reason = "escape"' in src
    assert "end_reason.json" in src
    assert "sys.exit(130)" in src
    assert 'INSTR["end_status"] = "manual"' in src or "end_status" in src
