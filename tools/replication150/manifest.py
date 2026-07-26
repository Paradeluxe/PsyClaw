"""Canonical 150-row corpus manifest validation."""
from __future__ import annotations

from collections import Counter
from typing import Any, Iterable, List


def validate_manifest(
    rows: Iterable[dict[str, Any]],
    *,
    require_counts: bool = True,
) -> List[str]:
    """Return human-readable validation errors for a paper manifest."""
    rows = list(rows)
    errors: List[str] = []

    ids = [r.get("paper_id") for r in rows]
    dois = [((r.get("citation") or {}).get("doi") or "").lower() for r in rows]

    for value, n in Counter(ids).items():
        if value and n > 1:
            errors.append(f"duplicate paper_id: {value}")

    for value, n in Counter(d for d in dois if d).items():
        if n > 1:
            errors.append(f"duplicate DOI: {value}")

    if require_counts:
        counts = Counter(r.get("category") for r in rows)
        for category in (1, 2, 3):
            if counts[category] != 50:
                errors.append(
                    f"category {category}: expected 50, got {counts[category]}"
                )

    return errors
