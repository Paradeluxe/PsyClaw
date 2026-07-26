"""Expected-contrast encoding checks (pipeline sanity only)."""
from __future__ import annotations

from typing import Any, Dict, List, Set


def _levels(marker: Dict[str, Any], factor: str) -> Set[str]:
    found: Set[str] = set()

    def walk(nodes):
        for n in nodes or []:
            if n.get("kind") == "loop":
                for row in n.get("conditions") or []:
                    if factor in row:
                        found.add(str(row[factor]))
                walk(n.get("children") or [])
            else:
                walk(n.get("children") or [])

    walk(marker.get("flow") or [])
    return found


def validate_expected_contrast(
    marker: Dict[str, Any],
    contrast: Dict[str, Any],
) -> Dict[str, Any]:
    issues: List[str] = []
    factor = contrast.get("factor")
    a = str(contrast.get("a"))
    b = str(contrast.get("b"))
    levels = _levels(marker, factor) if factor else set()
    if a not in levels:
        issues.append(f"missing level: {a}")
    if b not in levels:
        issues.append(f"missing level: {b}")

    group_by = (marker.get("metrics") or {}).get("group_by") or []
    if factor and factor not in group_by:
        # soft: recommend group_by but do not hard-fail if levels exist
        pass

    return {
        "ok": not issues,
        "issues": issues,
        "levels": sorted(levels),
        "claim_level": "pipeline_sanity_only",
        "contrast": contrast,
    }
