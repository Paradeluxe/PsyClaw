from pathlib import Path


def test_replication_docs_name_canonical_marker_and_three_run_bar():
    text = Path("docs/replication150.md").read_text(encoding="utf-8")
    # resolve relative to monorepo root
    root = Path(__file__).resolve().parents[3]
    text = (root / "docs" / "replication150.md").read_text(encoding="utf-8")
    assert "<folderName>.psyclaw" in text
    assert "Autopilot ×3" in text
    assert "four-file" in text
    assert "design.psyexp" not in text


def test_acceptance_docs_forbid_human_effect_claim_from_autopilot():
    root = Path(__file__).resolve().parents[3]
    text = (root / "docs" / "replication150-acceptance.md").read_text(encoding="utf-8")
    assert "pipeline sanity" in text
    assert "not human effect reproduction" in text
