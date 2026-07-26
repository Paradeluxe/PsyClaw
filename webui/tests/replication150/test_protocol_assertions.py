from tools.replication150.protocol_assertions import evaluate


def marker_fixture(total_trials=96, factor_rows=None):
    rows = factor_rows or [
        {"congruency": "congruent", "corrAns": "f"},
        {"congruency": "incongruent", "corrAns": "j"},
    ]
    n_reps = max(1, total_trials // max(1, len(rows)))
    return {
        "name": "demo",
        "routines": [
            {
                "name": "trial",
                "components": [
                    {"type": "text", "name": "stim"},
                    {"type": "keyboard", "name": "resp"},
                ],
            }
        ],
        "flow": [
            {
                "kind": "loop",
                "name": "loop_main",
                "nReps": n_reps,
                "conditions": rows,
                "children": [{"kind": "routine", "routine": "trial"}],
            }
        ],
    }


def test_assertion_detects_wrong_trial_count():
    marker = marker_fixture(total_trials=8)
    assertions = [{"kind": "total_trials", "expected": 96}]
    result = evaluate(marker, assertions)
    assert result[0]["ok"] is False
    assert result[0]["actual"] == 8


def test_assertion_detects_missing_factor_level():
    marker = marker_fixture(factor_rows=[{"congruency": "congruent"}])
    assertions = [
        {
            "kind": "factor_levels",
            "field": "congruency",
            "expected": ["congruent", "incongruent"],
        }
    ]
    assert evaluate(marker, assertions)[0]["ok"] is False
