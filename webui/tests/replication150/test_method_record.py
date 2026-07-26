from tools.replication150.method_record import validate_method_record


def complete_method_fixture():
    return {
        "design": {
            "assignment": "within",
            "factors": [{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        },
        "trial_flow": ["fixation", "stimulus", "response"],
        "timing": {
            "stimulus_ms": {"value": 500, "page": 3, "status": "known"},
        },
        "responses": [{"device": "keyboard", "keys": ["f", "j"]}],
        "trial_count": {"value": 96, "page": 4, "status": "known"},
        "evidence": [{"page": 3, "snippet": "500 ms"}],
    }


def test_method_record_requires_source_for_timing():
    record = {
        "design": {"assignment": "within", "factors": []},
        "trial_flow": [],
        "timing": {"stimulus_ms": 500},
        "responses": [],
        "trial_count": None,
        "evidence": [],
    }
    errors = validate_method_record(record)
    assert "timing.stimulus_ms lacks page evidence" in errors


def test_unknown_is_allowed_but_not_silent_default():
    record = complete_method_fixture()
    record["timing"]["stimulus_ms"] = {"value": None, "status": "unknown"}
    assert validate_method_record(record) == []
