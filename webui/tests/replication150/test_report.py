from tools.replication150.report import summarize


def test_summary_never_counts_blocked_as_pass():
    results = [
        {"paper_id": "a", "status": "smoke_pass", "replication_level": "faithful"},
        {"paper_id": "b", "status": "blocked", "replication_level": "blocked"},
    ]
    summary = summarize(results, expected_total=2)
    assert summary["fully_passed"] == 1
    assert summary["blocked"] == 1
    assert summary["fully_passed"] != summary["expected_total"]


def test_summary_requires_exact_150_records():
    results = [{"paper_id": f"p{i}", "status": "smoke_pass"} for i in range(149)]
    summary = summarize(results, expected_total=150)
    assert summary["complete"] is False
