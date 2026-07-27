from tools.replication150.batch import select_items, should_reprocess_timing
from tools.replication150.timing_contract import TIMING_CONTRACT_VERSION


def test_resume_skips_completed_and_retries_failed():
    corpus = [
        {"paper_id": "cat1_passed", "category": 1},
        {"paper_id": "cat1_failed", "category": 1},
        {"paper_id": "cat1_pending", "category": 1},
    ]
    latest_state = {
        "cat1_passed": {"status": "smoke_pass", "timing_contract_version": TIMING_CONTRACT_VERSION},
        "cat1_failed": {"status": "failed", "timing_contract_version": TIMING_CONTRACT_VERSION},
    }
    selected = select_items(corpus, latest_state, resume=True, retry_failed=True)
    ids = [r["paper_id"] for r in selected]
    assert "cat1_passed" not in ids
    assert "cat1_failed" in ids
    assert "cat1_pending" in ids


def test_category_filter_is_exact():
    corpus = [
        {"paper_id": "a", "category": 1},
        {"paper_id": "b", "category": 2},
        {"paper_id": "c", "category": 3},
    ]
    selected = select_items(corpus, {}, categories={2})
    assert selected and all(r["category"] == 2 for r in selected)


def test_resume_reprocesses_old_timing_contract():
    previous = {"status": "smoke_pass", "timing_contract_version": 1}
    assert should_reprocess_timing(previous, marker_report={"ok": True}) is True


def test_resume_keeps_current_clean_marker():
    previous = {
        "status": "smoke_pass",
        "timing_contract_version": TIMING_CONTRACT_VERSION,
    }
    assert should_reprocess_timing(previous, marker_report={"ok": True}) is False
