from tools.replication150.cli import main


def test_one_paper_dry_run_prints_all_gates(capsys, tmp_path):
    manifest = tmp_path / "papers.json"
    manifest.write_text(
        '[{"paper_id":"cat1_stroop","category":1,"paradigm_label":"Stroop",'
        '"eligibility":"eligible","material_status":"not_applicable",'
        '"replication_level":"adaptation","blockers":[]}]',
        encoding="utf-8",
    )
    rc = main(["one", "cat1_stroop", "--manifest", str(manifest), "--dry-run"])
    out = capsys.readouterr().out
    assert rc == 0
    for gate in ("method", "marker", "protocol", "compile", "open", "autopilot"):
        assert gate in out


def test_blocked_material_skips_autopilot(capsys, tmp_path):
    manifest = tmp_path / "papers.json"
    manifest.write_text(
        '[{"paper_id":"cat3_kdef","category":3,"paradigm_label":"KDEF",'
        '"eligibility":"eligible","material_status":"gated",'
        '"replication_level":"blocked","blockers":["gated"],"run_policy":"do_not_run"}]',
        encoding="utf-8",
    )
    rc = main(["one", "cat3_kdef", "--manifest", str(manifest), "--dry-run"])
    assert rc == 0
    assert "autopilot: SKIP blocked_material" in capsys.readouterr().out
