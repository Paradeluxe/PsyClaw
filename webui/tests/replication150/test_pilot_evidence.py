from tools.replication150.pilot_evidence import validate_evidence


def complete_evidence(status="pass", material_status="not_applicable"):
    return {
        "paper_id": "cat1_x",
        "status": status,
        "material_status": material_status,
        "checks": {
            "instructions": "pass",
            "stimuli_layout": "pass",
            "response_mapping": "pass",
            "timing": "pass",
            "practice_main": "pass",
            "feedback_rest": "pass",
            "material_render": "pass",
            "normal_completion": "pass",
            "manual_abort": "pass",
            "data_write": "pass",
        },
    }


def test_pilot_evidence_requires_all_operator_checks():
    evidence = {"paper_id": "cat1_x", "checks": {"instructions": "pass"}}
    errors = validate_evidence(evidence)
    assert "missing check: response_mapping" in errors
    assert "missing check: normal_completion" in errors


def test_blocked_asset_evidence_cannot_be_marked_pass():
    evidence = complete_evidence(status="pass", material_status="gated")
    assert "gated material cannot be runnable pass" in validate_evidence(evidence)
