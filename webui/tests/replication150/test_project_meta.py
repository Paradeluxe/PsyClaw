from tools.replication150.project_meta import validate_project_meta


def replication_meta_fixture(level="faithful"):
    return {
        "paper_id": "cat1_x",
        "replication_level": level,
        "material_status": "not_applicable",
        "unknowns": [],
        "run_policy": "do_not_run" if level == "blocked" else "run",
        "generated_files": ["cat1_x.psyclaw", "replication.json"],
        "protocol_assertions": [],
    }


def test_faithful_project_cannot_have_unknown_required_timing():
    meta = replication_meta_fixture(level="faithful")
    meta["unknowns"] = ["stimulus_duration"]
    errors = validate_project_meta(meta)
    assert "faithful project has unresolved required fields" in errors


def test_blocked_material_project_is_not_runnable():
    meta = replication_meta_fixture(level="blocked")
    meta["material_status"] = "gated"
    assert meta["run_policy"] == "do_not_run"
    assert validate_project_meta(meta) == []
