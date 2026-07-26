"""Pilot/visual evidence checklist validation."""
from __future__ import annotations

from typing import Any, Dict, List


REQUIRED_CHECKS = (
    "instructions",
    "stimuli_layout",
    "response_mapping",
    "timing",
    "practice_main",
    "feedback_rest",
    "material_render",
    "normal_completion",
    "manual_abort",
    "data_write",
)


def validate_evidence(evidence: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not evidence.get("paper_id"):
        errors.append("missing paper_id")
    checks = evidence.get("checks") or {}
    for name in REQUIRED_CHECKS:
        if name not in checks:
            errors.append(f"missing check: {name}")

    material_status = evidence.get("material_status") or "not_applicable"
    status = (evidence.get("status") or "").lower()
    if material_status in {"gated", "licensed", "missing", "physical"} and status == "pass":
        errors.append("gated material cannot be runnable pass")
    return errors
