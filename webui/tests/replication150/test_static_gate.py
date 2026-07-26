from tools.replication150.static_gate import validate_project


def test_static_gate_rejects_wrong_marker_name(tmp_path):
    project = tmp_path / "Demo"
    project.mkdir()
    (project / "design.psyclaw").write_text("{}", encoding="utf-8")
    report = validate_project(project)
    assert report["ok"] is False
    assert report["marker_name_ok"] is False


def test_static_gate_records_compile_hash(valid_project):
    report = validate_project(valid_project, compile_marker=True)
    assert report["ok"] is True
    assert len(report["compiled_sha256"]) == 64
