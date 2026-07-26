"""Failure taxonomy and retry policy."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Failure:
    code: str
    stage: str
    message: str


def classify_failure(stage: str, message: str) -> Failure:
    msg = (message or "").lower()
    stage_l = (stage or "").lower()
    if stage_l == "material" or "gated" in msg or "missing material" in msg:
        return Failure(code="blocked_material", stage=stage_l, message=message)
    if "timeout" in msg or "connection" in msg:
        return Failure(code="transient_webui", stage=stage_l, message=message)
    if stage_l == "compile":
        return Failure(code="compile_error", stage=stage_l, message=message)
    if stage_l == "open":
        return Failure(code="open_error", stage=stage_l, message=message)
    if stage_l == "run":
        return Failure(code="run_failed", stage=stage_l, message=message)
    return Failure(code="failed", stage=stage_l, message=message)


def retryable(failure: Failure, attempt: int = 1) -> bool:
    if failure.code != "transient_webui":
        return False
    return attempt < 3
