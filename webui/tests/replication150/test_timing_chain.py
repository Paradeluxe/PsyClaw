import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from design_compiler import compile_any  # noqa: E402
from tools.replication150.generate_marker import build_marker
from tools.replication150.paradigm_templates import TEMPLATES, get_method
from tools.replication150.project_writer import write_project
from tools.replication150.static_gate import validate_project


def test_1500ms_reaches_compiler_as_1_5_seconds(tmp_path):
    project = tmp_path / "cat1_picture_naming"
    method = get_method("cat1_picture_naming")
    assert method["timing"]["stimulus_ms"]["value"] == 1500

    marker = build_marker(method, project_name=project.name)
    write_project(
        project,
        marker,
        {
            "generated_files": [f"{project.name}.psyclaw", "replication.json", "method-extract.md"],
            "timing_contract_version": 2,
        },
    )

    disk = json.loads((project / f"{project.name}.psyclaw").read_text(encoding="utf-8"))
    stim = next(
        c
        for r in disk["routines"]
        if r["name"] == "trial"
        for c in r["components"]
        if c.get("name") == "stim"
    )
    assert stim["duration"] == 1.5
    assert validate_project(project, compile_marker=True)["ok"] is True
    source = compile_any(design=disk)
    # design is double-encoded JSON inside the script
    assert "1.5" in source
    assert "1500" not in source or '"duration": 1500' not in source.replace("\\", "")
    assert '\\"duration\\": 1.5' in source or '"duration": 1.5' in source


def test_all_templates_chain_to_seconds(tmp_path):
    for paper_id in sorted(TEMPLATES):
        project = tmp_path / paper_id
        method = TEMPLATES[paper_id]()
        marker = build_marker(method, project_name=paper_id)
        write_project(
            project,
            marker,
            {
                "generated_files": [f"{paper_id}.psyclaw", "replication.json", "method-extract.md"],
                "timing_contract_version": 2,
            },
        )
        disk = json.loads((project / f"{paper_id}.psyclaw").read_text(encoding="utf-8"))
        expected = float(method["timing"]["stimulus_ms"]["value"]) / 1000.0
        stim = next(
            c
            for r in disk["routines"]
            if r["name"] == "trial"
            for c in r["components"]
            if c.get("name") == "stim"
        )
        assert stim["duration"] == expected
        src = compile_any(design=disk)
        assert "1500" not in src or expected == 1.5  # 1.5 is fine; raw 1500 is not
        # raw integer ms dump would appear as duration\": 1500 without decimal
        assert '\\"duration\\": 1500' not in src and '"duration": 1500' not in src
        assert str(expected) in src or f"{expected:g}" in src
