"""Paper-specific protocol assertions against a marker."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence


def _loops(marker: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    def walk(nodes: Sequence[Dict[str, Any]]) -> None:
        for n in nodes or []:
            if n.get("kind") == "loop":
                out.append(n)
                walk(n.get("children") or [])
            elif n.get("kind") == "routine":
                continue
            else:
                walk(n.get("children") or [])

    walk(marker.get("flow") or [])
    return out


def _total_trials(marker: Dict[str, Any]) -> int:
    total = 0
    for loop in _loops(marker):
        rows = loop.get("conditions") or []
        n_reps = int(loop.get("nReps") or 1)
        total += max(1, len(rows)) * n_reps
    return total


def _factor_levels(marker: Dict[str, Any], field: str) -> List[str]:
    levels = []
    seen = set()
    for loop in _loops(marker):
        for row in loop.get("conditions") or []:
            if field in row:
                val = str(row[field])
                if val not in seen:
                    seen.add(val)
                    levels.append(val)
    return levels


def evaluate(
    marker: Dict[str, Any],
    assertions: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for assertion in assertions:
        kind = assertion.get("kind")
        if kind == "total_trials":
            actual = _total_trials(marker)
            expected = assertion.get("expected")
            results.append(
                {
                    "kind": kind,
                    "ok": actual == expected,
                    "expected": expected,
                    "actual": actual,
                }
            )
        elif kind == "factor_levels":
            field = assertion.get("field")
            expected = list(assertion.get("expected") or [])
            actual = _factor_levels(marker, field)
            results.append(
                {
                    "kind": kind,
                    "field": field,
                    "ok": set(actual) == set(map(str, expected)),
                    "expected": expected,
                    "actual": actual,
                }
            )
        else:
            results.append(
                {
                    "kind": kind,
                    "ok": False,
                    "error": f"unknown assertion kind: {kind}",
                }
            )
    return results
