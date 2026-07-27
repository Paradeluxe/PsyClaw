from tools.replication150.extract_method import extract_candidates_from_text


def test_extractor_finds_ms_values_with_page_numbers():
    result = extract_candidates_from_text(
        [
            (3, "Each stimulus remained on screen for 500 ms."),
            (4, "Participants completed 96 trials."),
        ]
    )
    assert any(c["value_ms"] == 500 and c["page"] == 3 for c in result["timing_candidates"])
    assert result["trial_count"] is None


def test_extractor_normalizes_seconds_to_value_ms():
    result = extract_candidates_from_text(
        [
            (2, "Stimulus duration was 1.5 s."),
            (3, "The mask appeared for 250 ms."),
        ]
    )
    assert [x["value_ms"] for x in result["timing_candidates"]] == [1500, 250]
    assert [x["unit"] for x in result["timing_candidates"]] == ["ms", "ms"]


def test_extractor_keeps_source_unit_and_quote():
    item = extract_candidates_from_text([(4, "shown for 0.25 seconds")])["timing_candidates"][0]
    assert item["value_ms"] == 250
    assert item["source_unit"] == "seconds"
    assert "0.25 seconds" in item["snippet"]
