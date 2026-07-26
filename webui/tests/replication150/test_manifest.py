from tools.replication150.manifest import validate_manifest


def test_manifest_requires_exact_50_per_category():
    rows = [{"paper_id": "cat1_x", "category": 1}]
    errors = validate_manifest(rows)
    assert "category 1: expected 50, got 1" in errors


def test_manifest_rejects_duplicate_ids_and_dois():
    rows = [
        {"paper_id": "cat1_x", "category": 1, "citation": {"doi": "10/x"}},
        {"paper_id": "cat1_x", "category": 2, "citation": {"doi": "10/x"}},
    ]
    errors = validate_manifest(rows, require_counts=False)
    assert any("duplicate paper_id" in e for e in errors)
    assert any("duplicate DOI" in e for e in errors)
