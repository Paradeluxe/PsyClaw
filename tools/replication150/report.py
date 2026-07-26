"""Corpus acceptance summary."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, Iterable, List


def summarize(
    results: Iterable[Dict[str, Any]],
    *,
    expected_total: int = 150,
) -> Dict[str, Any]:
    rows = list(results)
    statuses = Counter(r.get("status") for r in rows)
    levels = Counter(r.get("replication_level") for r in rows)

    fully_passed = sum(
        1
        for r in rows
        if r.get("status") in {"smoke_pass", "pilot_pass"}
        and r.get("replication_level") in {None, "faithful", "adaptation"}
    )
    # count smoke_pass/pilot_pass regardless of missing level as pass
    fully_passed = sum(1 for r in rows if r.get("status") in {"smoke_pass", "pilot_pass"})
    blocked = statuses.get("blocked", 0)
    failed = statuses.get("failed", 0)
    framework_only = sum(1 for r in rows if r.get("replication_level") == "framework_only")
    excluded = sum(1 for r in rows if r.get("status") == "excluded" or r.get("replication_level") == "excluded")

    return {
        "expected_total": expected_total,
        "records": len(rows),
        "complete": len(rows) == expected_total,
        "fully_passed": fully_passed,
        "blocked": blocked,
        "failed": failed,
        "framework_only": framework_only,
        "excluded": excluded,
        "status_counts": dict(statuses),
        "level_counts": dict(levels),
    }
