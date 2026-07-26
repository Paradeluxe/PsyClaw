from tools.replication150.batch import select_items


def test_resume_skips_completed_and_retries_failed():
    corpus = [
        {"paper_id": "cat1_passed", "category": 1},
        {"paper_id": "cat1_failed", "category": 1},
        {"paper_id": "cat1_pending", "category": 1},
    ]
    latest_state = {
        "cat1_passed": {"status": "smoke_pass"},
        "cat1_failed": {"status": "failed"},
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
