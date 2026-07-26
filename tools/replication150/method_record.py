"""Method extraction record completeness gate."""
from __future__ import annotations

from typing import Any, Dict, List


_REQUIRED_TOP = ("design", "trial_flow", "timing", "responses", "trial_count", "evidence")


def _is_unknown_field(value: Any) -> bool:
    return isinstance(value, dict) and value.get("status") == "unknown"


def _check_timed_value(key: str, value: Any, errors: List[str]) -> None:
    path = f"timing.{key}"
    if _is_unknown_field(value):
        return
    if isinstance(value, dict):
        if value.get("value") is None and value.get("status") != "unknown":
            errors.append(f"{path} lacks page evidence")
            return
        if value.get("value") is not None and not value.get("page") and value.get("status") != "unknown":
            # allow known with page OR explicit known with evidence list handled separately
            if "page" not in value and value.get("status") == "known" and value.get("page") is None:
                # still need page for non-unknown numeric
                if "page" not in value:
                    errors.append(f"{path} lacks page evidence")
        if value.get("value") is not None and "page" not in value and value.get("status") != "unknown":
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
        for key, value in timing.items():
            _check_timed_value(key, value, errors)

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
