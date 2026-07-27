"""Method extraction record completeness gate."""
from __future__ import annotations

from typing import Any, Dict, List

from tools.replication150.timing_contract import validate_method_timing


_REQUIRED_TOP = ("design", "trial_flow", "timing", "responses", "trial_count", "evidence")


def _is_unknown_field(value: Any) -> bool:
    return isinstance(value, dict) and value.get("status") == "unknown"


def _has_page(value: Dict[str, Any]) -> bool:
    if "page" in value:
        return True
    src = value.get("source")
    return isinstance(src, dict) and "page" in src


def _check_timed_value(key: str, value: Any, errors: List[str]) -> None:
    path = f"timing.{key}"
    if _is_unknown_field(value):
        return
    if isinstance(value, dict):
        if value.get("value") is not None and not _has_page(value) and value.get("status") != "unknown":
            errors.append(f"{path} lacks page evidence")
        return
    # bare number/string without provenance
    errors.append(f"{path} lacks page evidence")


def validate_method_record(record: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not isinstance(record, dict):
        return ["method record must be an object"]

    for key in _REQUIRED_TOP:
        if key not in record:
            errors.append(f"missing section: {key}")

    timing = record.get("timing") or {}
    if isinstance(timing, dict):
        errors.extend(validate_method_timing(timing))
        for key, value in timing.items():
            _check_timed_value(key, value, errors)
    else:
        errors.append("timing must be an object")

    trial_count = record.get("trial_count")
    if trial_count is not None and not _is_unknown_field(trial_count):
        if isinstance(trial_count, dict):
            if trial_count.get("value") is not None and "page" not in trial_count:
                errors.append("trial_count lacks page evidence")
        else:
            errors.append("trial_count lacks page evidence")

    design = record.get("design")
    if design is not None and not isinstance(design, dict):
        errors.append("design must be an object")

    return errors
