import json
from pathlib import Path

from tools.replication150.audit_timing import audit_paths, audit_templates
from tools.replication150.paradigm_templates import TEMPLATES


def test_audit_reports_raw_ms_without_mutating(tmp_path):
    proj = tmp_path / "bad"
    proj.mkdir()
    marker = proj / "bad.psyclaw"
    marker.write_text(
        json.dumps(
            {
                "name": "bad",
                "design_notes": {"source": "replication150"},
                "routines": [
                    {
                        "name": "trial",
                        "components": [
                            {"type": "text", "name": "stim", "duration": 1500, "params": {"text": "X"}},
                            {"type": "keyboard", "name": "kb", "duration": 1500, "params": {"keys": "space"}},
                        ],
                    }
                ],
                "flow": [
                    {
                        "kind": "loop",
                        "name": "main",
                        "nReps": 1,
                        "children": [{"kind": "routine", "routine": "trial"}],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    before = marker.read_bytes()
    report = audit_paths([tmp_path])
    assert report["hard_count"] >= 1
    assert any(i.get("value") == 1500 for i in report["issues"])
    assert marker.read_bytes() == before


def test_audit_templates_covers_all_registered_templates():
    report = audit_templates()
    assert report["template_count"] == len(TEMPLATES)
    assert report["hard_count"] == 0
