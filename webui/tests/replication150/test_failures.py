from tools.replication150.failures import classify_failure, retryable


def test_missing_material_is_blocked_not_retryable():
    failure = classify_failure("material", "dataset is gated")
    assert failure.code == "blocked_material"
    assert retryable(failure) is False


def test_webui_timeout_is_transient_once():
    failure = classify_failure("run", "connection timeout")
    assert failure.code == "transient_webui"
    assert retryable(failure, attempt=1) is True
    assert retryable(failure, attempt=3) is False
