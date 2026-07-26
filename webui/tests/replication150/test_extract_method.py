from tools.replication150.extract_method import (
    extract_candidates,
    extract_candidates_from_text,
)


def test_extract_candidates_keeps_page_numbers(monkeypatch):
    monkeypatch.setattr(
        "tools.replication150.extract_method.pages",
        lambda _: [(3, "Stimuli appeared for 500 ms. Participants pressed F or J.")],
    )
    result = extract_candidates("paper.pdf")
    assert result["timing_candidates"][0]["page"] == 3
    assert result["response_candidates"][0]["page"] == 3


def test_extractor_does_not_promote_unconfirmed_candidate():
    result = extract_candidates_from_text([(1, "approximately several trials")])
    assert result["trial_count"] is None
