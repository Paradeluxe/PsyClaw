from tools.replication150.open_gate import check_open_parity


def test_foreign_folder_fails_open_parity(tmp_path):
    project = tmp_path / "Foreign"
    project.mkdir()
    (project / "notes.txt").write_text("x", encoding="utf-8")
    report = check_open_parity(project)
    assert report["classify"] == "foreign"
    assert report["ok"] is False


def test_project_marker_roundtrips_through_store(valid_project):
    report = check_open_parity(valid_project)
    assert report["classify"] == "project"
    assert report["marker"] == f"{valid_project.name}.psyclaw"
    assert report["same_design"] is True
