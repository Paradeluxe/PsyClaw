from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from runner.state import StateMachine  # noqa: E402


def _persisted_run(tmp_path: Path, status: str = "finished") -> tuple[Path, bytes, bytes]:
    run_dir = tmp_path / "20260101_deadbeef"
    (run_dir / "data").mkdir(parents=True)
    state = {
        "run_id": run_dir.name,
        "paradigm_id": "design",
        "status": status,
        "started_at": 123.5,
        "spec": {"mode": "autopilot"},
        "headless": True,
        "design": {"name": "persisted", "routines": [], "flow": []},
    }
    events = (
        json.dumps({"ts": 123.5, "state": "created", "from": "", "note": "run created"})
        + "\n"
        + json.dumps({"ts": 124.5, "state": status, "from": "running", "note": "done"})
        + "\n"
    ).encode("utf-8")
    state_bytes = json.dumps(state, indent=2).encode("utf-8")
    (run_dir / "state.json").write_bytes(state_bytes)
    (run_dir / "events.jsonl").write_bytes(events)
    return run_dir, state_bytes, events


def test_from_disk_restores_state_without_writing(tmp_path: Path) -> None:
    run_dir, state_before, events_before = _persisted_run(tmp_path)

    sm = StateMachine.from_disk(str(run_dir))

    assert sm.run_id == run_dir.name
    assert sm.state == "finished"
    assert sm.started_at == 123.5
    assert sm.spec == {"mode": "autopilot"}
    assert sm.headless is True
    assert sm.design["name"] == "persisted"
    assert (run_dir / "state.json").read_bytes() == state_before
    assert (run_dir / "events.jsonl").read_bytes() == events_before


def test_from_disk_rejects_unknown_state(tmp_path: Path) -> None:
    run_dir, _, _ = _persisted_run(tmp_path, status="mystery")

    with pytest.raises(ValueError, match="unknown persisted state"):
        StateMachine.from_disk(str(run_dir))
