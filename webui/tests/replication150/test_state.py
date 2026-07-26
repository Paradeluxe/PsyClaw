from tools.replication150.state import ResultStore


def test_result_store_preserves_prior_records_on_resume(tmp_path):
    store = ResultStore(tmp_path)
    store.append({"paper_id": "cat1_a", "status": "static_pass"})
    resumed = ResultStore(tmp_path)
    resumed.append({"paper_id": "cat1_b", "status": "static_pass"})
    assert [r["paper_id"] for r in resumed.read_all()] == ["cat1_a", "cat1_b"]


def test_latest_state_replaces_logically_without_truncating_history(tmp_path):
    store = ResultStore(tmp_path)
    store.append({"paper_id": "cat1_a", "status": "failed"})
    store.append({"paper_id": "cat1_a", "status": "smoke_pass"})
    assert store.latest()["cat1_a"]["status"] == "smoke_pass"
    assert len(store.read_all()) == 2
