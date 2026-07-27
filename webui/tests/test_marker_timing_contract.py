from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]  # monorepo root
VALIDATE = ROOT / "skills" / "psyclaw" / "scripts" / "validate_marker.py"

import importlib.util
import sys

spec = importlib.util.spec_from_file_location("validate_marker_script", VALIDATE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["validate_marker_script"] = mod
spec.loader.exec_module(mod)


class MarkerProject:
    def __init__(self, tmp_path: Path, duration=1.5, source="replication150"):
        self.project = tmp_path / "demo"
        self.project.mkdir()
        self.path = self.project / "demo.psyclaw"
        self.duration = duration
        self.source = source
        self._write()

    def _write(self):
        design = {
            "name": "demo",
            "design_notes": {"source": self.source},
            "routines": [
                {
                    "name": "trial",
                    "components": [
                        {
                            "type": "text",
                            "name": "stim",
                            "start": 0,
                            "duration": self.duration,
                            "params": {"text": "X"},
                        },
                        {
                            "type": "keyboard",
                            "name": "kb",
                            "start": 0,
                            "duration": self.duration if self.duration != -1 else -1,
                            "params": {"keys": "space"},
                        },
                    ],
                }
            ],
            "flow": [
                {
                    "kind": "loop",
                    "name": "main",
                    "nReps": 1,
                    "children": [{"kind": "routine", "routine": "trial"}],
                    "conditions": [{"corrAns": "space"}],
                }
            ],
        }
        self.path.write_text(json.dumps(design), encoding="utf-8")

    def set_component(self, duration):
        self.duration = duration
        self._write()

    def validate(self):
        return mod.validate(self.path)


@pytest.fixture
def marker_project(tmp_path):
    return MarkerProject(tmp_path)


def test_validator_rejects_raw_ms_duration(marker_project):
    marker_project.set_component(duration=1500)
    report = marker_project.validate()
    assert report["ok"] is False
    assert any(h["id"] == "T1" for h in report["hard"])


def test_validator_accepts_seconds_and_open_ended(marker_project):
    marker_project.set_component(duration=1.5)
    assert marker_project.validate()["ok"] is True
    marker_project.set_component(duration=-1)
    assert marker_project.validate()["ok"] is True


def test_validator_reports_exact_component_path(marker_project):
    marker_project.set_component(duration=float("nan"))
    report = marker_project.validate()
    assert report["ok"] is False
    assert "routines[0].components[0].duration" in str(report["hard"])
