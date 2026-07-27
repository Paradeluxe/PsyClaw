"""Timing unit contract: Method *_ms → marker seconds."""
from __future__ import annotations

import math
from typing import Any, List

TIMING_CONTRACT_VERSION = 2


class TimingContractError(ValueError):
    pass


def milliseconds_to_seconds(value: Any) -> float:
    try:
        ms = float(value)
    except (TypeError, ValueError) as exc:
        raise TimingContractError(f"milliseconds must be numeric: {value!r}") from exc
    if not math.isfinite(ms) or ms < 0:
        raise TimingContractError(f"milliseconds must be finite and >= 0: {value!r}")
    return ms / 1000.0


def validate_method_timing(timing: Any) -> List[str]:
    if not isinstance(timing, dict):
        return ["timing must be an object"]
    errors: List[str] = []
    for key, field in timing.items():
        path = f"timing.{key}"
        if not key.endswith("_ms"):
            errors.append(f"{path} must use *_ms")
        if not isinstance(field, dict):
            errors.append(f"{path} must be an object")
            continue
        if field.get("status") == "unknown":
            if field.get("value") not in (None, ""):
                errors.append(f"{path} unknown must not carry a value")
            continue
        if field.get("unit") != "ms":
            errors.append(f"{path}.unit must be 'ms'")
        try:
            milliseconds_to_seconds(field.get("value"))
        except TimingContractError as exc:
            errors.append(f"{path}: {exc}")
    return errors


def validate_marker_component_timing(
    *,
    start: Any,
    duration: Any,
    path: str,
    generated: bool = False,
) -> List[dict]:
    """Return issue dicts: {severity, path, field, value, message}."""
    issues: List[dict] = []

    def _hard(field: str, value: Any, message: str) -> None:
        issues.append(
            {
                "severity": "hard",
                "path": path,
                "field": field,
                "value": value,
                "message": message,
            }
        )

    def _warn(field: str, value: Any, message: str) -> None:
        issues.append(
            {
                "severity": "warn",
                "path": path,
                "field": field,
                "value": value,
                "message": message,
            }
        )

    if start is not None:
        try:
            s = float(start)
        except (TypeError, ValueError):
            _hard("start", start, f"{path}.start must be a number (seconds)")
        else:
            if not math.isfinite(s) or s < 0:
                _hard("start", start, f"{path}.start must be finite and >= 0 (seconds)")

    if duration is None:
        return issues

    try:
        d = float(duration)
    except (TypeError, ValueError):
        _hard("duration", duration, f"{path}.duration must be a number (seconds) or -1")
        return issues

    if d == -1:
        return issues

    if not math.isfinite(d) or d < 0:
        _hard("duration", duration, f"{path}.duration must be finite >= 0 or -1 (seconds)")
        return issues

    # Generated replication markers should never carry multi-minute accidental ms dumps.
    if generated and d > 30:
        _hard(
            "duration",
            duration,
            f"{path}.duration={d} looks like raw ms; marker duration is seconds (e.g. 1500ms→1.5)",
        )
    elif d >= 300:
        _hard(
            "duration",
            duration,
            f"{path}.duration={d}s is implausibly long; check ms/s unit mixup",
        )
    elif d > 30:
        _warn(
            "duration",
            duration,
            f"{path}.duration={d}s is long; confirm intentional seconds not ms",
        )
    return issues
