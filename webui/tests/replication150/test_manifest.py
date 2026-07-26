from tools.replication150.import_catalog import import_rows, make_paper_id
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


def test_make_paper_id_is_stable_and_filesystem_safe():
    assert make_paper_id(1, "Fitts' Law") == "cat1_fitts_law"
    assert make_paper_id(1, "Go/No-Go") == "cat1_go_no_go"


def test_import_does_not_assign_pdf_by_list_position(tmp_path):
    src = tmp_path / "category1_articles.json"
    src.write_text(
        '[{"paradigm":"Stroop","author":"S","year":1935,"doi":"10/x"}]',
        encoding="utf-8",
    )
    rows = import_rows(src, category=1)
    assert rows[0]["pdf_relpath"] is None
    assert "pdf_unresolved" in rows[0]["blockers"]
