from tools.replication150.scoring_gate import audit_scoring


def test_nogo_autopilot_does_not_create_false_alarm():
    rows = [
        {"trialType": "go", "corrAns": "space", "response": "space", "corr": 1, "rt": 0.4},
        {"trialType": "nogo", "corrAns": "", "response": "", "corr": 1, "rt": ""},
    ]
    report = audit_scoring(rows, task_kind="gonogo")
    assert report["ok"] is True
    assert report["metrics"]["fa_rate"] == 0.0


def test_instruction_rt_is_not_in_mean_rt():
    rows = [
        {"routine": "instructions", "corr": "", "rt": 0.2},
        {"routine": "trial", "corr": 1, "rt": 0.6, "corrAns": "f", "response": "f"},
    ]
    assert audit_scoring(rows)["metrics"]["mean_rt"] == 0.6
