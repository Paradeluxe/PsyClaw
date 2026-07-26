from tools.replication150.data_pack import audit_pack


def test_pack_missing_summary_fails(tmp_path):
    (tmp_path / "P_autopilot_s1_x.csv").write_text(
        "participant_id,session,trial,routine,response,corrAns,corr,rt\n",
        encoding="utf-8",
    )
    report = audit_pack(tmp_path, stem="P_autopilot_s1_x")
    assert report["ok"] is False
    assert "summary" in report["missing"]


def test_pack_requires_scored_factor_columns(complete_pack):
    report = audit_pack(
        complete_pack,
        stem="P_autopilot_s1_x",
        required_trial_columns={"congruency", "corrAns", "corr", "rt"},
    )
    assert report["ok"] is True
