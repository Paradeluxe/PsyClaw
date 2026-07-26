"""Corpus eligibility rules for PsyClaw replication."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class EligibilityResult:
    status: str  # eligible | replace | excluded
    reasons: List[str] = field(default_factory=list)
    manual_review: bool = False


_DB_TYPES = {
    "database introduction",
    "stimulus set",
    "norming database",
    "face database",
    "image database",
}
_PHYSICAL_MARKERS = (
    "physical cliff",
    "visual cliff",
    "mri only",
    "fmri only",
    "pet only",
    "animal only",
    "rodent",
    "nonhuman",
)
_CLINICAL_MARKERS = (
    "clinical scale",
    "diagnostic interview",
    "symptom checklist",
    "meta-analysis",
    "systematic review",
)


def classify(
    row: Dict[str, Any],
    extracted: Optional[Dict[str, Any]] = None,
) -> EligibilityResult:
    extracted = extracted or {}
    reasons: List[str] = []
    label = (row.get("paradigm_label") or "").lower()
    notes = " ".join(str(n) for n in (row.get("source_notes") or [])).lower()
    paper_type = (extracted.get("paper_type") or "").lower()
    apparatus = [str(a).lower() for a in (extracted.get("apparatus") or [])]

    if paper_type in _DB_TYPES or "database introduction" in paper_type:
        reasons.append("database_introduction")

    joined_app = " ".join(apparatus)
    blob = f"{label} {notes} {joined_app}"
    if any(m in blob for m in _PHYSICAL_MARKERS):
        reasons.append("physical_or_nonbehavioral")
    if any(m in blob for m in _CLINICAL_MARKERS):
        reasons.append("clinical_or_review")

    if "physical cliff" in joined_app or "visual cliff" in label:
        if "physical_or_nonbehavioral" not in reasons:
            reasons.append("physical_or_nonbehavioral")

    if reasons:
        status = "replace"
        if "clinical_or_review" in reasons and "database_introduction" not in reasons:
            # reviews/meta are excluded rather than replaceable targets
            if "meta-analysis" in blob or "systematic review" in blob:
                status = "excluded"
        return EligibilityResult(status=status, reasons=reasons, manual_review=False)

    return EligibilityResult(status="eligible", reasons=[], manual_review=False)
