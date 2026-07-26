from tools.replication150.preflight import plan_actions, validate_backup


def test_preflight_never_schedules_delete_for_unknown_files(tmp_path):
    project = tmp_path / "cat1_x"
    project.mkdir()
    (project / "human-note.txt").write_text("keep", encoding="utf-8")
    actions = plan_actions(project, generated_files={"cat1_x.psyclaw"})
    assert not any(a["action"] == "delete" for a in actions)


def test_real_run_requires_verified_backup(tmp_path):
    errors = validate_backup(tmp_path / "missing-backup")
    assert "backup missing" in errors
