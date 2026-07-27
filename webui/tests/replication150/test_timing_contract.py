import math

from tools.replication150.timing_contract import (
    TimingContractError,
    milliseconds_to_seconds,
    validate_method_timing,
)


def test_method_timing_requires_ms_suffix_and_unit():
    timing = {"stimulus": {"value": 1500, "unit": "ms", "status": "known"}}
    assert "timing.stimulus must use *_ms" in validate_method_timing(timing)


def test_method_timing_rejects_wrong_unit_negative_and_nonfinite():
    assert validate_method_timing({"stimulus_ms": {"value": 1500, "unit": "s", "status": "known"}})
    assert validate_method_timing({"stimulus_ms": {"value": -1, "unit": "ms", "status": "known"}})
    assert validate_method_timing({"stimulus_ms": {"value": math.inf, "unit": "ms", "status": "known"}})


def test_ms_to_seconds_is_explicit_and_exact():
    assert milliseconds_to_seconds(1500) == 1.5
    assert milliseconds_to_seconds(500) == 0.5
    assert milliseconds_to_seconds(0) == 0.0


def test_ms_to_seconds_rejects_bad_values():
    import pytest

    with pytest.raises(TimingContractError):
        milliseconds_to_seconds(-1)
    with pytest.raises(TimingContractError):
        milliseconds_to_seconds("x")
