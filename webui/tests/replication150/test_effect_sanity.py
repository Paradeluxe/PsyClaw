from tools.replication150.effect_sanity import validate_expected_contrast


def marker_fixture(factor_rows=None):
    rows = factor_rows or [
        {"congruency": "congruent", "corrAns": "f"},
        {"congruency": "incongruent", "corrAns": "j"},
    ]
    return {
        "flow": [
            {
                "kind": "loop",
                "nReps": 1,
                "conditions": rows,
                "children": [],
            }
        ],
        "metrics": {"group_by": ["congruency"]},
    }


def contrast_fixture():
    return {
        "metric": "mean_rt",
        "factor": "congruency",
        "a": "incongruent",
        "b": "congruent",
        "direction": ">",
    }


def test_expected_contrast_requires_both_levels():
    marker = marker_fixture(factor_rows=[{"congruency": "congruent"}])
    contrast = contrast_fixture()
    report = validate_expected_contrast(marker, contrast)
    assert report["ok"] is False
    assert "missing level: incongruent" in report["issues"]


def test_report_label_for_autopilot_is_pipeline_sanity():
    report = validate_expected_contrast(marker_fixture(), contrast_fixture())
    assert report["claim_level"] == "pipeline_sanity_only"
