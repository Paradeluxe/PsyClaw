from tools.replication150.eligibility import classify


def test_database_introduction_requires_replacement():
    row = {"paradigm_label": "Emotion Recognition (CFD)", "source_notes": []}
    result = classify(row, extracted={"paper_type": "database introduction"})
    assert result.status == "replace"
    assert "database_introduction" in result.reasons


def test_physical_only_task_is_not_runtime_passable():
    row = {"paradigm_label": "Visual Cliff"}
    result = classify(row, extracted={"apparatus": ["physical cliff"]})
    assert result.status == "replace"
